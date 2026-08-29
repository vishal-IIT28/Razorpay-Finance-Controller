import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runDeterministicPass, RzpRecord, BankRecord, LedgerRecord } from '../src/engine/deterministic';
import { runFuzzyPass } from '../src/engine/fuzzy';

function createMockRzp(overrides?: Partial<RzpRecord>): RzpRecord {
  return {
    payment_id: 'pay_ABC123XYZ456',
    order_id: 'order_12345',
    amount: 1000.00,
    currency: 'INR',
    status: 'captured',
    method: 'card',
    description: 'Payment for INV-2026-0001',
    created_at: '2026-08-15T10:00:00.000Z',
    settled_at: '2026-08-15T10:00:00.000Z',
    fee: 20.00,
    tax: 3.60,
    settlement_id: 'set_123',
    ...overrides,
  };
}

function createMockBank(overrides?: Partial<BankRecord>): BankRecord {
  return {
    txn_id: 'TXN1000000001',
    date: '2026-08-15',
    narration: 'IMPS-RAZORPAY-pay_ABC123XYZ456',
    credit: 976.40, // 1000 - 20 - 3.60
    debit: 0,
    balance: 50000.00,
    utr: 'UTR100000000001',
    mode: 'IMPS',
    ...overrides,
  };
}

function createMockLedger(overrides?: Partial<LedgerRecord>): LedgerRecord {
  return {
    entry_id: 'LED-000001',
    invoice_id: 'INV-2026-0001',
    expected_amount: 1000.00,
    received_amount: null,
    customer_name: 'Acme Corp',
    due_date: '2026-08-15',
    status: 'pending',
    payment_ref: 'pay_ABC123XYZ456',
    ...overrides,
  };
}

describe('Pass 1: Deterministic Engine', () => {
  it('should match exact payment reference, net amount, and settlement date', () => {
    const rzp = [createMockRzp()];
    const bank = [createMockBank()];
    const ledger = [createMockLedger()];

    const res = runDeterministicPass(rzp, bank, ledger);

    assert.equal(res.matches.length, 1);
    assert.equal(res.matches[0].payment_id, 'pay_ABC123XYZ456');
    assert.equal(res.matches[0].bank_txn_id, 'TXN1000000001');
    assert.equal(res.matches[0].ledger_entry_id, 'LED-000001');
    assert.equal(res.matches[0].match_pass, 1);
    assert.equal(res.matches[0].confidence, 1.0);
    assert.equal(res.unmatched.razorpay.length, 0);
  });

  it('should reject uncaptured/failed payments', () => {
    const rzp = [createMockRzp({ status: 'failed' })];
    const bank = [createMockBank()];
    const ledger = [createMockLedger()];

    const res = runDeterministicPass(rzp, bank, ledger);

    assert.equal(res.matches.length, 0);
    assert.equal(res.unmatched.razorpay.length, 1);
  });

  it('should route date drift or narration variance to unmatched for Pass 2', () => {
    const rzp = [createMockRzp()];
    const bank = [createMockBank({ date: '2026-08-17' })]; // 2 days drift
    const ledger = [createMockLedger()];

    const res = runDeterministicPass(rzp, bank, ledger);

    assert.equal(res.matches.length, 0);
    assert.equal(res.unmatched.razorpay.length, 1);
    assert.equal(res.unmatched.bank.length, 1);
    assert.equal(res.unmatched.ledger.length, 1);
  });
});

describe('Pass 2: Fuzzy Matching Engine', () => {
  it('should match payments with date drift within 3 days tolerance', () => {
    const rzp = [createMockRzp()];
    const bank = [createMockBank({ date: '2026-08-17' })]; // 2 days drift
    const ledger = [createMockLedger()];

    const res = runFuzzyPass(rzp, bank, ledger);

    assert.equal(res.matches.length, 1);
    assert.equal(res.matches[0].payment_id, 'pay_ABC123XYZ456');
    assert.equal(res.matches[0].match_pass, 2);
    assert.match(res.matches[0].notes, /Date drift: 2 day\(s\)/);
  });

  it('should reject payments with date drift exceeding 3 days', () => {
    const rzp = [createMockRzp()];
    const bank = [createMockBank({ date: '2026-08-20' })]; // 5 days drift
    const ledger = [createMockLedger()];

    const res = runFuzzyPass(rzp, bank, ledger);

    assert.equal(res.matches.length, 0);
    assert.equal(res.unmatched.razorpay.length, 1);
  });

  it('should match narration variance using 6-character ID fragment with calibrated 0.6 threshold', () => {
    // payment_id is pay_ABC123XYZ456 -> substring fragment is 'ABC123'
    const rzp = [createMockRzp({ payment_id: 'pay_NlqehDgGwLrMfp' })];
    const bank = [createMockBank({
      txn_id: 'TXN99999',
      narration: 'IMPS-RZP-NlqehD-MANGLED',
      credit: 976.40,
    })];
    const ledger = [createMockLedger({ payment_ref: 'pay_NlqehDgGwLrMfp' })];

    const res = runFuzzyPass(rzp, bank, ledger);

    assert.equal(res.matches.length, 1);
    assert.equal(res.matches[0].payment_id, 'pay_NlqehDgGwLrMfp');
    assert.equal(res.matches[0].bank_txn_id, 'TXN99999');
    assert.equal(res.matches[0].match_pass, 2);
  });

  it('should respect 2% amount tolerance and reject larger fee variances (>2%)', () => {
    const rzp = [createMockRzp({ amount: 1000.00, fee: 20.00, tax: 3.60 })]; // expected net: 976.40
    // 1% variance: 976.40 * 0.99 = 966.64 -> within 2%
    const bankClose = [createMockBank({ credit: 967.00 })];
    const ledger = [createMockLedger()];

    const resClose = runFuzzyPass(rzp, bankClose, ledger);
    assert.equal(resClose.matches.length, 1, 'Should match within 2% tolerance');

    // 5% variance: 976.40 * 0.95 = 927.58 -> exceeds 2%
    const bankFar = [createMockBank({ credit: 920.00 })];
    const resFar = runFuzzyPass(rzp, bankFar, ledger);
    assert.equal(resFar.matches.length, 0, 'Should reject outside 2% tolerance');
  });

  it('should NOT greedily consume unrelated records without ID/narration evidence (Greedy Fallback Bug Protection)', () => {
    const rzp = [createMockRzp({ payment_id: 'pay_AAA111BBB222' })];
    // Bank record has completely unrelated narration and no ID match, but identical amount and date
    const unrelatedBank = [createMockBank({
      txn_id: 'TXN_UNRELATED_99',
      narration: 'SALARY-DISBURSEMENT-CORP-XYZ',
      credit: 976.40,
    })];
    const ledger = [createMockLedger({ payment_ref: 'pay_AAA111BBB222' })];

    const res = runFuzzyPass(rzp, unrelatedBank, ledger);

    // Must NOT match because there is zero fuzzy evidence in the bank narration
    assert.equal(res.matches.length, 0);
    assert.equal(res.unmatched.razorpay.length, 1);
    assert.equal(res.unmatched.bank.length, 1);
  });
});
