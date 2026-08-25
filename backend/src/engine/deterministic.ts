export interface RzpRecord {
  payment_id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  description: string;
  created_at: string;
  settled_at: string;
  fee: number;
  tax: number;
  settlement_id: string;
}

export interface BankRecord {
  txn_id: string;
  date: string;
  narration: string;
  credit: number;
  debit: number;
  balance: number;
  utr: string;
  mode: string;
}

export interface LedgerRecord {
  entry_id: string;
  invoice_id: string;
  expected_amount: number;
  received_amount: string | null;
  customer_name: string;
  due_date: string;
  status: string;
  payment_ref: string | null;
}

export interface MatchResult {
  payment_id: string | null;
  bank_txn_id: string | null;
  ledger_entry_id: string | null;
  match_pass: number;
  confidence: number;
  notes: string;
}

export interface ReconciliationPassResult {
  matches: MatchResult[];
  unmatched: {
    razorpay: RzpRecord[];
    bank: BankRecord[];
    ledger: LedgerRecord[];
  };
}

export function toMoney(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

export function getDatePart(value: string | null | undefined): string {
  return value?.split('T')[0] ?? '';
}

export function getRazorpayNetAmount(rzp: RzpRecord): number {
  return toMoney(toMoney(rzp.amount) - toMoney(rzp.fee) - toMoney(rzp.tax));
}

export function runDeterministicPass(
  razorpay: RzpRecord[],
  bank: BankRecord[],
  ledger: LedgerRecord[]
): ReconciliationPassResult {
  const matches: MatchResult[] = [];
  const unmatchedRzp: RzpRecord[] = [];
  const unmatchedBank = new Set(bank.map((b) => b.txn_id));
  const unmatchedLedger = new Set(ledger.map((l) => l.entry_id));

  const bankMap = new Map<string, BankRecord>();
  for (const b of bank) bankMap.set(b.txn_id, b);

  const ledgerMap = new Map<string, LedgerRecord>();
  for (const l of ledger) ledgerMap.set(l.entry_id, l);

  for (const rzp of razorpay) {
    if (rzp.status !== 'captured') {
      unmatchedRzp.push(rzp);
      continue;
    }

    const expectedNetAmount = getRazorpayNetAmount(rzp);
    const settlementDate = getDatePart(rzp.settled_at) || getDatePart(rzp.created_at);

    const matchedBank = bank.find(
      (b) =>
        unmatchedBank.has(b.txn_id) &&
        (b.narration.includes(rzp.payment_id) || b.utr === rzp.payment_id) &&
        toMoney(b.credit) === expectedNetAmount &&
        b.date === settlementDate
    );

    const matchedLedger = ledger.find(
      (l) =>
        unmatchedLedger.has(l.entry_id) &&
        l.payment_ref === rzp.payment_id &&
        toMoney(l.expected_amount) === toMoney(rzp.amount)
    );

    if (matchedBank && matchedLedger) {
      matches.push({
        payment_id: rzp.payment_id,
        bank_txn_id: matchedBank.txn_id,
        ledger_entry_id: matchedLedger.entry_id,
        match_pass: 1, // Pass 1: Deterministic
        confidence: 1.0,
        notes: 'Exact payment reference, amount, and settlement date across all three systems.',
      });
      unmatchedBank.delete(matchedBank.txn_id);
      unmatchedLedger.delete(matchedLedger.entry_id);
    } else {
      unmatchedRzp.push(rzp);
    }
  }

  const remainingBank = Array.from(unmatchedBank).map((id) => bankMap.get(id)!);
  const remainingLedger = Array.from(unmatchedLedger).map((id) => ledgerMap.get(id)!);

  return {
    matches,
    unmatched: {
      razorpay: unmatchedRzp,
      bank: remainingBank,
      ledger: remainingLedger,
    },
  };
}
