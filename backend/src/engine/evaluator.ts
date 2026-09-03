import { MatchResult } from './deterministic';

export type GroundTruthEntry = {
  bank_txn_ids: string[];
  ledger_entry_id: string | null;
  anomaly_type: string;
};

export type MatchItem =
  | MatchResult
  | {
      paymentId?: string | null;
      payment_id?: string | null;
      bankTxnId?: string | null;
      bank_txn_id?: string | null;
      ledgerEntryId?: string | null;
      ledger_entry_id?: string | null;
      matchPass?: number;
      match_pass?: number;
      confidenceScore?: number;
      confidence?: number;
      notes?: string | null;
    };

export function scoreMatchesAgainstGroundTruth(
  matches: MatchItem[],
  groundTruth: Record<string, GroundTruthEntry>
): {
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
  anomalyBreakdown: Record<string, { tp: number; fp: number; fn: number }>;
} {
  const matchMap = new Map<string, MatchItem>();
  for (const m of matches) {
    const pId = (m as any).paymentId ?? (m as any).payment_id;
    if (pId) {
      matchMap.set(pId, m);
    }
  }

  let tp = 0;
  let fp = 0;
  let fn = 0;

  const anomalyBreakdown: Record<string, { tp: number; fp: number; fn: number }> = {
    exact: { tp: 0, fp: 0, fn: 0 },
    amount_mismatch: { tp: 0, fp: 0, fn: 0 },
    date_drift: { tp: 0, fp: 0, fn: 0 },
    narration_variance: { tp: 0, fp: 0, fn: 0 },
    missing: { tp: 0, fp: 0, fn: 0 },
    split: { tp: 0, fp: 0, fn: 0 },
  };

  for (const [paymentId, truth] of Object.entries(groundTruth)) {
    const match = matchMap.get(paymentId);
    const anomalyType = truth.anomaly_type;

    if (!anomalyBreakdown[anomalyType]) {
      anomalyBreakdown[anomalyType] = { tp: 0, fp: 0, fn: 0 };
    }

    // 'missing' anomalies shouldn't be fully matched because they have no bank record.
    const shouldMatch = truth.bank_txn_ids.length > 0 && truth.ledger_entry_id !== null;

    if (match) {
      // Engine made a match. Is it correct?
      const rawBankTxnId = (match as any).bankTxnId ?? (match as any).bank_txn_id;
      const engineBankIds = rawBankTxnId
        ? String(rawBankTxnId)
            .split(',')
            .map((id: string) => id.trim())
            .sort()
        : [];
      const truthBankIds = [...truth.bank_txn_ids].sort();

      const bankExactMatch =
        engineBankIds.length === truthBankIds.length &&
        engineBankIds.every((id: string, idx: number) => id === truthBankIds[idx]);

      const matchLedgerId = (match as any).ledgerEntryId ?? (match as any).ledger_entry_id ?? null;
      const ledgerExactMatch = matchLedgerId === truth.ledger_entry_id;

      if (shouldMatch && bankExactMatch && ledgerExactMatch) {
        tp++;
        anomalyBreakdown[anomalyType].tp++;
      } else {
        // Matched incorrectly (mismatch)
        fp++;
        anomalyBreakdown[anomalyType].fp++;
      }
    } else {
      // Engine didn't make a match.
      if (shouldMatch) {
        fn++;
        anomalyBreakdown[anomalyType].fn++;
      }
    }
  }

  const overallPrecision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const overallRecall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const overallF1 =
    tp + fp + fn === 0 ? 0 : (2 * overallPrecision * overallRecall) / (overallPrecision + overallRecall || 1);

  return {
    precision: overallPrecision,
    recall: overallRecall,
    f1: overallF1,
    tp,
    fp,
    fn,
    anomalyBreakdown,
  };
}
