import Fuse from 'fuse.js';
import { RzpRecord, BankRecord, LedgerRecord, MatchResult } from './deterministic';

const AMOUNT_TOLERANCE_PERCENT = 0.03; // 3% tolerance (covers gateway fees)
const DATE_TOLERANCE_DAYS = 4;         // 4-day window for settlement lag

function daysDiff(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.abs((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function isAmountClose(amountA: number, amountB: number): boolean {
  if (amountA === 0 && amountB === 0) return true;
  const diff = Math.abs(amountA - amountB);
  const tolerance = Math.max(amountA, amountB) * AMOUNT_TOLERANCE_PERCENT;
  return diff <= tolerance;
}

export function runFuzzyPass(
  unmatchedRzp: RzpRecord[],
  unmatchedBank: BankRecord[],
  unmatchedLedger: LedgerRecord[]
) {
  const matches: MatchResult[] = [];
  const stillUnmatchedRzp: RzpRecord[] = [];
  const usedBankIds = new Set<string>();
  const usedLedgerIds = new Set<string>();

  // ── Build Fuse indexes ──────────────────────────────────────────────────────
  // For bank: search on narration (to fuzzy-match payment_id fragments)
  const bankFuse = new Fuse(unmatchedBank, {
    keys: ['narration', 'utr'],
    includeScore: true,
    threshold: 0.5,   // Lower = stricter
    ignoreLocation: true,
  });

  // For ledger: search on payment_ref and invoice_id
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

    const rzpDate = rzp.created_at.split('T')[0];
    const settledDate = rzp.settled_at ? rzp.settled_at.split('T')[0] : rzpDate;
    const expectedNet = parseFloat((rzp.amount - rzp.fee - rzp.tax).toFixed(2));

    // ── Step 1: Fuzzy search bank records by payment_id in narration ──────────
    const bankResults = bankFuse.search(rzp.payment_id.replace('pay_', ''));
    const matchedBank = bankResults.find((r) => {
      const b = r.item;
      if (usedBankIds.has(b.txn_id)) return false;
      const amountOk = isAmountClose(Number(b.credit), expectedNet);
      const dateOk = daysDiff(b.date, settledDate) <= DATE_TOLERANCE_DAYS;
      return amountOk && dateOk;
    });

    // ── Step 2: Fuzzy search ledger records by payment_ref or invoice ─────────
    const ledgerResults = ledgerFuse.search(rzp.payment_id);
    const matchedLedger = ledgerResults.find((r) => {
      const l = r.item;
      if (usedLedgerIds.has(l.entry_id)) return false;
      const amountOk = isAmountClose(Number(l.expected_amount), Number(rzp.amount));
      return amountOk;
    });

    // ── Step 3: Also try amount+date match as fallback (no ID match) ──────────
    let bankFallback = undefined;
    if (!matchedBank) {
      bankFallback = unmatchedBank.find((b) => {
        if (usedBankIds.has(b.txn_id)) return false;
        const amountOk = isAmountClose(Number(b.credit), expectedNet);
        const dateOk = daysDiff(b.date, settledDate) <= DATE_TOLERANCE_DAYS;
        return amountOk && dateOk;
      });
    }

    const chosenBank = matchedBank?.item ?? bankFallback;
    const chosenLedger = matchedLedger?.item;

    if (chosenBank && chosenLedger) {
      const bankScore = matchedBank?.score ?? 0.5;  // lower fuse score = better
      const confidence = parseFloat((0.85 - bankScore * 0.2).toFixed(3));

      const notes = buildNotes(rzp, chosenBank, chosenLedger);

      matches.push({
        payment_id: rzp.payment_id,
        bank_txn_id: chosenBank.txn_id,
        ledger_entry_id: chosenLedger.entry_id,
        match_pass: 2,
        confidence,
        notes,
      });
      usedBankIds.add(chosenBank.txn_id);
      usedLedgerIds.add(chosenLedger.entry_id);
    } else {
      stillUnmatchedRzp.push(rzp);
    }
  }

  const remainingBank = unmatchedBank.filter((b) => !usedBankIds.has(b.txn_id));
  const remainingLedger = unmatchedLedger.filter((l) => !usedLedgerIds.has(l.entry_id));

  return {
    matches,
    unmatched: {
      razorpay: stillUnmatchedRzp,
      bank: remainingBank,
      ledger: remainingLedger,
    },
  };
}

function buildNotes(rzp: RzpRecord, bank: BankRecord, ledger: LedgerRecord): string {
  const notes: string[] = [];

  const expectedNet = parseFloat((rzp.amount - rzp.fee - rzp.tax).toFixed(2));
  const bankCredit = Number(bank.credit);
  const amountDiff = Math.abs(bankCredit - expectedNet);

  if (amountDiff > 0.01) {
    notes.push(
      `Amount variance ₹${amountDiff.toFixed(2)}: Razorpay net ₹${expectedNet} vs bank credit ₹${bankCredit}. Likely gateway or correspondent bank fee.`
    );
  }

  const rzpDate = rzp.settled_at ? rzp.settled_at.split('T')[0] : rzp.created_at.split('T')[0];
  const bankDate = bank.date;
  const days = daysDiff(rzpDate, bankDate);
  if (days > 0) {
    notes.push(`Date drift: ${days} day(s) between settlement and bank credit (normal for ${bank.mode} mode).`);
  }

  if (!bank.narration.includes(rzp.payment_id)) {
    notes.push(`Narration mismatch: bank shows "${bank.narration}" — fuzzy matched via ID fragment.`);
  }

  if (notes.length === 0) notes.push('Fuzzy match — all fields within tolerance.');

  return notes.join(' | ');
}
