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

    const calcPrecision = (t: number, f: number) => (t + f === 0 ? 'N/A' : (t / (t + f) * 100).toFixed(1) + '%');
    const calcRecall = (t: number, f: number) => (t + f === 0 ? 'N/A' : (t / (t + f) * 100).toFixed(1) + '%');
    const calcF1 = (t: number, fp: number, fn: number) => {
      if (t === 0) return (fp + fn === 0) ? 'N/A' : '0.0%';
      const p = t / (t + fp);
      const r = t / (t + fn);
      return ((2 * p * r) / (p + r) * 100).toFixed(1) + '%';
    };

    const overallPrecision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const overallRecall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const overallF1 = tp + fp + fn === 0 ? 0 : (2 * overallPrecision * overallRecall) / (overallPrecision + overallRecall || 1);

    console.log(`\n=== Evaluator Results (Run: ${run.id}) ===`);
    console.log(`Overall Precision: ${(overallPrecision * 100).toFixed(2)}%`);
    console.log(`Overall Recall:    ${(overallRecall * 100).toFixed(2)}%`);
    console.log(`Overall F1 Score:  ${(overallF1 * 100).toFixed(2)}%`);
    console.log(`Total Mismatches (FP): ${fp}\n`);
    
    console.log(`--- Breakdown by Anomaly Type ---`);
    for (const [type, stats] of Object.entries(anomalyStats)) {
      const p = calcPrecision(stats.tp, stats.fp);
      const r = calcRecall(stats.tp, stats.fn);
      const f1 = calcF1(stats.tp, stats.fp, stats.fn);
      console.log(`${type.padEnd(20)} | P: ${p.padEnd(6)} | R: ${r.padEnd(6)} | F1: ${f1.padEnd(6)} | TP: ${stats.tp}, FP: ${stats.fp}, FN: ${stats.fn}`);
    }
    
    // Find amount_mismatch FNs and log their gap percentages
    const amountMismatchDetails: { paymentId: string, amount: number, gap: number, percent: number }[] = [];
    
    const rzpPath = path.join(__dirname, '../../data/razorpay_payments.csv');
    const rzpCsv = fs.readFileSync(rzpPath, 'utf-8');
    const Papa = require('papaparse');
    const parsedRzp = Papa.parse(rzpCsv, { header: true }).data;
    
    // Also read bank csv to find the actual credit
    const bankPath = path.join(__dirname, '../../data/bank_statement.csv');
    const bankCsv = fs.readFileSync(bankPath, 'utf-8');
    const parsedBank = Papa.parse(bankCsv, { header: true }).data;
    
    const rzpMap = new Map();
    for (const row of parsedRzp) {
      if (row.payment_id) rzpMap.set(row.payment_id, row);
    }

    for (const [paymentId, truth] of Object.entries(groundTruth)) {
      const match = matchMap.get(paymentId);
      const shouldMatch = truth.bank_txn_ids.length > 0 && truth.ledger_entry_id !== null;
      if (truth.anomaly_type === 'amount_mismatch' && shouldMatch && !match) {
        const rzpRow = rzpMap.get(paymentId);
        if (rzpRow) {
          const amount = Number(rzpRow.amount);
          const fee = Number(rzpRow.fee);
          const tax = Number(rzpRow.tax);
          const netAmount = amount - fee - tax;
          
          // Find the corresponding bank row for this ground truth
          const bankTxnId = truth.bank_txn_ids[0];
          const bankRow = parsedBank.find((b: any) => b.txn_id === bankTxnId);
          const credit = bankRow ? Number(bankRow.credit) : netAmount;
          
          const gap = netAmount - credit;
          const percent = (gap / amount) * 100;
          amountMismatchDetails.push({ paymentId, amount, gap, percent });
        }
      }
    }

    if (amountMismatchDetails.length > 0) {
      amountMismatchDetails.sort((a, b) => b.percent - a.percent);
      console.log(`\nFN amounts for amount_mismatch (Bank Fee Gap %):`);
      for (const d of amountMismatchDetails) {
        console.log(`  [${d.paymentId}] Amount: ${d.amount.toFixed(2)}, Gap: ${d.gap.toFixed(2)}, Gap %: ${d.percent.toFixed(2)}%`);
      }
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
