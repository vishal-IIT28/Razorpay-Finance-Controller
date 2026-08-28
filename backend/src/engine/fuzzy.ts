import Fuse from 'fuse.js';
import {
  BankRecord,
  getDatePart,
  getRazorpayNetAmount,
  LedgerRecord,
  MatchResult,
  ReconciliationPassResult,
  RzpRecord,
  toMoney,
} from './deterministic';

const AMOUNT_TOLERANCE_PERCENT = 0.02;
const DATE_TOLERANCE_DAYS = 3;

function daysDiff(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Number.POSITIVE_INFINITY;
  return Math.abs((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function isAmountClose(amountA: number, amountB: number): boolean {
  if (amountA === 0 && amountB === 0) return true;
  const diff = Math.abs(amountA - amountB);
  const tolerance = Math.max(amountA, amountB) * AMOUNT_TOLERANCE_PERCENT;
  return diff <= tolerance;
}

function extractInvoiceId(description: string): string | undefined {
  return description.match(/INV-\d{4}-\d{4}/)?.[0];
}

export function runFuzzyPass(
  unmatchedRzp: RzpRecord[],
  unmatchedBank: BankRecord[],
  unmatchedLedger: LedgerRecord[]
): ReconciliationPassResult {
  const matches: MatchResult[] = [];
  const stillUnmatchedRzp: RzpRecord[] = [];
  const usedBankIds = new Set<string>();
  const usedLedgerIds = new Set<string>();

  const bankFuse = new Fuse(unmatchedBank, {
    keys: ['narration', 'utr'],
    includeScore: true,
    threshold: 0.6,
    ignoreLocation: true,
  });

  const ledgerFuse = new Fuse(unmatchedLedger, {
    keys: ['payment_ref', 'invoice_id'],
    includeScore: true,
    threshold: 0.5,
    ignoreLocation: true,
  });

  for (const rzp of unmatchedRzp) {
    if (rzp.status !== 'captured') {
      stillUnmatchedRzp.push(rzp);
      continue;
    }

    const createdDate = getDatePart(rzp.created_at);
    const settledDate = getDatePart(rzp.settled_at) || createdDate;
    const expectedNet = getRazorpayNetAmount(rzp);
    const invoiceId = extractInvoiceId(rzp.description);

    const bankResults = bankFuse.search(rzp.payment_id.replace('pay_', ''));

    const matchedBank = bankResults.find((result) => {
      const bank = result.item;
      if (usedBankIds.has(bank.txn_id)) return false;
      const amountOk = isAmountClose(toMoney(bank.credit), expectedNet);
      const dateOk = daysDiff(bank.date, settledDate) <= DATE_TOLERANCE_DAYS;
      return amountOk && dateOk;
    });

    const ledgerResults = ledgerFuse.search(invoiceId ?? rzp.payment_id);
    const matchedLedger = ledgerResults.find((result) => {
      const ledger = result.item;
      if (usedLedgerIds.has(ledger.entry_id)) return false;
      return isAmountClose(toMoney(ledger.expected_amount), toMoney(rzp.amount));
    });

    const chosenBank = matchedBank?.item;
    const chosenLedger = matchedLedger?.item;

    if (chosenBank && chosenLedger) {
      const bankScore = matchedBank?.score ?? 0.5;
      const confidence = Number((0.85 - bankScore * 0.2).toFixed(3));

      matches.push({
        payment_id: rzp.payment_id,
        bank_txn_id: chosenBank.txn_id,
        ledger_entry_id: chosenLedger.entry_id,
        match_pass: 2,
        confidence,
        notes: buildNotes(rzp, chosenBank, chosenLedger),
      });

      usedBankIds.add(chosenBank.txn_id);
      usedLedgerIds.add(chosenLedger.entry_id);
    } else {
      stillUnmatchedRzp.push(rzp);
    }
  }

  return {
    matches,
    unmatched: {
      razorpay: stillUnmatchedRzp,
      bank: unmatchedBank.filter((bank) => !usedBankIds.has(bank.txn_id)),
      ledger: unmatchedLedger.filter((ledger) => !usedLedgerIds.has(ledger.entry_id)),
    },
  };
}

function buildNotes(rzp: RzpRecord, bank: BankRecord, ledger: LedgerRecord): string {
  const notes: string[] = [];
  const expectedNet = getRazorpayNetAmount(rzp);
  const bankCredit = toMoney(bank.credit);
  const amountDiff = Math.abs(bankCredit - expectedNet);

  if (amountDiff > 0.01) {
    notes.push(
      `Amount variance INR ${amountDiff.toFixed(2)}: Razorpay net INR ${expectedNet} vs bank credit INR ${bankCredit}. Likely gateway or bank fee.`
    );
  }

  const rzpDate = getDatePart(rzp.settled_at) || getDatePart(rzp.created_at);
  const dayDrift = daysDiff(rzpDate, bank.date);
  if (dayDrift > 0 && Number.isFinite(dayDrift)) {
    notes.push(`Date drift: ${dayDrift} day(s) between settlement and bank credit.`);
  }

  if (!bank.narration.includes(rzp.payment_id)) {
    notes.push(`Narration mismatch: bank shows "${bank.narration}" - fuzzy matched via ID fragment.`);
  }

  if (ledger.payment_ref !== rzp.payment_id) {
    notes.push(`Ledger reference mismatch: ledger ${ledger.entry_id} matched through invoice/amount evidence.`);
  }

  if (notes.length === 0) notes.push('Fuzzy match - all fields within tolerance.');
  return notes.join(' | ');
}
