import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

type GroundTruth = {
  bank_txn_ids: string[];
  ledger_entry_id: string | null;
  anomaly_type: string;
};

async function evaluateRun(runId?: string) {
  try {
    // 1. Fetch the run
    let run;
    if (runId) {
      run = await prisma.reconciliationRun.findUnique({ where: { id: runId } });
    } else {
      run = await prisma.reconciliationRun.findFirst({ orderBy: { createdAt: 'desc' } });
    }

    if (!run) {
      console.error('❌ No reconciliation run found in database.');
      return;
    }

    // 2. Load ground truth
    const gtPath = path.join(__dirname, '../../data/ground_truth.json');
    if (!fs.existsSync(gtPath)) {
      console.error('❌ Ground truth file not found at:', gtPath);
      return;
    }
    const groundTruth: Record<string, GroundTruth> = JSON.parse(fs.readFileSync(gtPath, 'utf8'));

    // 3. Load Match Results
    const matches = await prisma.matchResult.findMany({ where: { runId: run.id } });
    const matchMap = new Map<string, any>();
    for (const m of matches) {
      if (m.paymentId) {
        matchMap.set(m.paymentId, m);
      }
    }

    let tp = 0;
    let fp = 0;
    let fn = 0;

    const anomalyStats: Record<string, { tp: 0, fp: 0, fn: 0 }> = {
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
      
      if (!anomalyStats[anomalyType]) {
        anomalyStats[anomalyType] = { tp: 0, fp: 0, fn: 0 };
      }

      // 'missing' anomalies shouldn't be fully matched because they have no bank record.
      const shouldMatch = truth.bank_txn_ids.length > 0 && truth.ledger_entry_id !== null;

      if (match) {
        // Engine made a match. Is it correct?
        const engineBankIds = match.bankTxnId ? match.bankTxnId.split(',').map((id: string) => id.trim()).sort() : [];
        const truthBankIds = [...truth.bank_txn_ids].sort();
        
        const bankExactMatch = engineBankIds.length === truthBankIds.length && 
                               engineBankIds.every((id: string, idx: number) => id === truthBankIds[idx]);
        
        const ledgerExactMatch = match.ledgerEntryId === truth.ledger_entry_id;

        if (shouldMatch && bankExactMatch && ledgerExactMatch) {
          tp++;
          anomalyStats[anomalyType].tp++;
        } else {
          // Matched incorrectly (mismatch)
          fp++;
          anomalyStats[anomalyType].fp++;
        }
      } else {
        // Engine didn't make a match.
        if (shouldMatch) {
          fn++;
          anomalyStats[anomalyType].fn++;
        } else {
          // True Negative (correctly didn't match), not usually tracked in precision/recall for this,
          // but we can just ignore it.
        }
      }
    }

    const calcPrecision = (t: number, f: number) => (t + f === 0 ? 0 : t / (t + f));
    const calcRecall = (t: number, f: number) => (t + f === 0 ? 0 : t / (t + f));
    const calcF1 = (p: number, r: number) => (p + r === 0 ? 0 : (2 * p * r) / (p + r));

    const overallPrecision = calcPrecision(tp, fp);
    const overallRecall = calcRecall(tp, fn);
    const overallF1 = calcF1(overallPrecision, overallRecall);

    console.log(`\n=== Evaluator Results (Run: ${run.id}) ===`);
    console.log(`Overall Precision: ${(overallPrecision * 100).toFixed(2)}%`);
    console.log(`Overall Recall:    ${(overallRecall * 100).toFixed(2)}%`);
    console.log(`Overall F1 Score:  ${(overallF1 * 100).toFixed(2)}%`);
    console.log(`Total Mismatches (FP): ${fp}\n`);
    
    console.log(`--- Breakdown by Anomaly Type ---`);
    for (const [type, stats] of Object.entries(anomalyStats)) {
      const p = calcPrecision(stats.tp, stats.fp);
      const r = calcRecall(stats.tp, stats.fn);
      const f1 = calcF1(p, r);
      console.log(`${type.padEnd(20)} | P: ${(p * 100).toFixed(1)}% | R: ${(r * 100).toFixed(1)}% | F1: ${(f1 * 100).toFixed(1)}% | TP: ${stats.tp}, FP: ${stats.fp}, FN: ${stats.fn}`);
    }

    // Persist to database
    await prisma.reconciliationRun.update({
      where: { id: run.id },
      data: {
        precision: overallPrecision,
        recall: overallRecall
      }
    });
    console.log(`\n✅ Persisted precision and recall to database for run ${run.id}`);
    
  } catch (error) {
    console.error('Error during evaluation:', error);
  } finally {
    await prisma.$disconnect();
  }
}

const runIdArg = process.argv[2];
evaluateRun(runIdArg);
