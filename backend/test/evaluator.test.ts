import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatchesAgainstGroundTruth, GroundTruthEntry, MatchItem } from '../src/engine/evaluator';

describe('Evaluator Engine & Metric Scoring', () => {
  it('should accurately compute TP, FP, FN, precision, recall, and F1 with hand-verified fixture', () => {
    const groundTruth: Record<string, GroundTruthEntry> = {
      pay_001: {
        bank_txn_ids: ['TXN_001'],
        ledger_entry_id: 'LED_001',
        anomaly_type: 'exact',
      },
      pay_002: {
        bank_txn_ids: ['TXN_002'],
        ledger_entry_id: 'LED_002',
        anomaly_type: 'date_drift',
      },
      pay_003: {
        bank_txn_ids: ['TXN_003A', 'TXN_003B'],
        ledger_entry_id: 'LED_003',
        anomaly_type: 'split',
      },
      pay_004: {
        bank_txn_ids: ['TXN_004'],
        ledger_entry_id: 'LED_004',
        anomaly_type: 'amount_mismatch',
      },
      pay_005: {
        bank_txn_ids: ['TXN_005'],
        ledger_entry_id: 'LED_005',
        anomaly_type: 'exact',
      },
      pay_006: {
        bank_txn_ids: [],
        ledger_entry_id: 'LED_006',
        anomaly_type: 'missing',
      },
      pay_007: {
        bank_txn_ids: [],
        ledger_entry_id: 'LED_007',
        anomaly_type: 'missing',
      },
    };

    const matches: MatchItem[] = [
      // TP: exact match
      {
        payment_id: 'pay_001',
        bank_txn_id: 'TXN_001',
        ledger_entry_id: 'LED_001',
        match_pass: 1,
        confidence: 1.0,
      },
      // TP: fuzzy date_drift match
      {
        payment_id: 'pay_002',
        bank_txn_id: 'TXN_002',
        ledger_entry_id: 'LED_002',
        match_pass: 2,
        confidence: 0.95,
      },
      // TP: split multi-bank match
      {
        payment_id: 'pay_003',
        bank_txn_id: 'TXN_003B, TXN_003A',
        ledger_entry_id: 'LED_003',
        match_pass: 3,
        confidence: 0.9,
      },
      // FP: wrong bank txn ID
      {
        payment_id: 'pay_004',
        bank_txn_id: 'TXN_WRONG',
        ledger_entry_id: 'LED_004',
        match_pass: 2,
        confidence: 0.7,
      },
      // pay_005 is omitted -> FN
      // pay_006 is omitted and bank_txn_ids is empty -> correctly left unmatched (no TP, FP, FN)
      // FP: engine matched pay_007 when bank_txn_ids is empty
      {
        payment_id: 'pay_007',
        bank_txn_id: 'TXN_007',
        ledger_entry_id: 'LED_007',
        match_pass: 2,
        confidence: 0.6,
      },
    ];

    const result = scoreMatchesAgainstGroundTruth(matches, groundTruth);

    assert.equal(result.tp, 3, 'True Positives must equal 3');
    assert.equal(result.fp, 2, 'False Positives must equal 2');
    assert.equal(result.fn, 1, 'False Negatives must equal 1');

    // Hand-calculated: 3 / (3 + 2) = 0.6
    assert.equal(result.precision, 0.6, 'Precision must be 0.6 (60%)');
    // Hand-calculated: 3 / (3 + 1) = 0.75
    assert.equal(result.recall, 0.75, 'Recall must be 0.75 (75%)');
    // Hand-calculated: 2 * (0.6 * 0.75) / (0.6 + 0.75) = 2/3 ≈ 0.6667
    assert.ok(Math.abs(result.f1 - 2 / 3) < 1e-6, 'F1 score must be 2/3');

    // Check anomaly breakdown
    assert.deepEqual(result.anomalyBreakdown.exact, { tp: 1, fp: 0, fn: 1 });
    assert.deepEqual(result.anomalyBreakdown.date_drift, { tp: 1, fp: 0, fn: 0 });
    assert.deepEqual(result.anomalyBreakdown.split, { tp: 1, fp: 0, fn: 0 });
    assert.deepEqual(result.anomalyBreakdown.amount_mismatch, { tp: 0, fp: 1, fn: 0 });
    assert.deepEqual(result.anomalyBreakdown.missing, { tp: 0, fp: 1, fn: 0 });
  });

  it('should support Prisma camelCase properties (paymentId, bankTxnId, ledgerEntryId)', () => {
    const groundTruth: Record<string, GroundTruthEntry> = {
      pay_100: {
        bank_txn_ids: ['TXN_100'],
        ledger_entry_id: 'LED_100',
        anomaly_type: 'exact',
      },
    };

    const prismaMatches = [
      {
        paymentId: 'pay_100',
        bankTxnId: 'TXN_100',
        ledgerEntryId: 'LED_100',
      },
    ];

    const result = scoreMatchesAgainstGroundTruth(prismaMatches, groundTruth);
    assert.equal(result.tp, 1);
    assert.equal(result.fp, 0);
    assert.equal(result.fn, 0);
    assert.equal(result.precision, 1.0);
    assert.equal(result.recall, 1.0);
  });
});
