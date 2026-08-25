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

export function runDeterministicPass(
  razorpay: RzpRecord[],
  bank: BankRecord[],
  ledger: LedgerRecord[]
) {
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

    // Find exactly matching bank record (narration contains payment_id AND exact net amount)
    const expectedNetAmount = parseFloat((rzp.amount - rzp.fee - rzp.tax).toFixed(2));
    
    // Convert RZP created_at to YYYY-MM-DD
    const rzpDate = rzp.created_at.split('T')[0];

    const matchedBank = bank.find(
      (b) =>
        unmatchedBank.has(b.txn_id) &&
        b.narration.includes(rzp.payment_id) &&
        Number(b.credit) === expectedNetAmount &&
        b.date === rzpDate
    );

    // Find exactly matching ledger record (payment_ref == payment_id AND expected_amount == amount)
    const matchedLedger = ledger.find(
      (l) =>
        unmatchedLedger.has(l.entry_id) &&
        l.payment_ref === rzp.payment_id &&
        Number(l.expected_amount) === Number(rzp.amount)
    );

    if (matchedBank && matchedLedger) {
      matches.push({
        payment_id: rzp.payment_id,
        bank_txn_id: matchedBank.txn_id,
        ledger_entry_id: matchedLedger.entry_id,
        match_pass: 1, // Pass 1: Deterministic
        confidence: 1.0,
        notes: 'Exact match across all three systems.',
      });
      unmatchedBank.delete(matchedBank.txn_id);
      unmatchedLedger.delete(matchedLedger.entry_id);
    } else {
      unmatchedRzp.push(rzp);
    }
  }

  // Convert Set back to arrays
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
