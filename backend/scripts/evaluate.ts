import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { scoreMatchesAgainstGroundTruth, GroundTruthEntry } from '../src/engine/evaluator';

const prisma = new PrismaClient();

async function evaluateRun(runId?: string, isLatest?: boolean, dataset: 'default' | 'holdout' = 'default') {
  try {
    // 1. Fetch the run
    let run;
    if (runId) {
      run = await prisma.reconciliationRun.findUnique({ where: { id: runId } });
    } else if (isLatest) {
      run = await prisma.reconciliationRun.findFirst({ orderBy: { createdAt: 'desc' } });
    }

    if (!run) {
      console.error(
        runId
          ? `❌ Reconciliation run not found with ID: ${runId}`
          : '❌ No reconciliation run found in database.'
      );
      process.exit(1);
    }

    // 2. Load ground truth from specified dataset
    const datasetDir = dataset === 'holdout'
      ? path.join(__dirname, '../../data/holdout')
      : path.join(__dirname, '../../data');

    const gtPath = path.join(datasetDir, 'ground_truth.json');
    if (!fs.existsSync(gtPath)) {
      console.error(`❌ Ground truth file not found at: ${gtPath}`);
      process.exit(1);
    }
    const groundTruth: Record<string, GroundTruthEntry> = JSON.parse(fs.readFileSync(gtPath, 'utf8'));

    // 3. Load Match Results & Score
    const matches = await prisma.matchResult.findMany({ where: { runId: run.id } });
    const matchMap = new Map<string, any>();
    for (const m of matches) {
      if (m.paymentId) matchMap.set(m.paymentId, m);
    }
    const scoreResult = scoreMatchesAgainstGroundTruth(matches, groundTruth);
    const {
      precision: overallPrecision,
      recall: overallRecall,
      f1: overallF1,
      tp,
      fp,
      fn,
      anomalyBreakdown: anomalyStats,
    } = scoreResult;

    const calcPrecision = (t: number, f: number) => (t + f === 0 ? 'N/A' : (t / (t + f) * 100).toFixed(1) + '%');
    const calcRecall = (t: number, f: number) => (t + f === 0 ? 'N/A' : (t / (t + f) * 100).toFixed(1) + '%');
    const calcF1 = (t: number, fpVal: number, fnVal: number) => {
      if (t === 0) return (fpVal + fnVal === 0) ? 'N/A' : '0.0%';
      const p = t / (t + fpVal);
      const r = t / (t + fnVal);
      return ((2 * p * r) / (p + r) * 100).toFixed(1) + '%';
    };

    console.log(`\n=== Evaluator Results (Run: ${run.id}) [Dataset: ${dataset}] ===`);
    console.log(`Overall Precision: ${(overallPrecision * 100).toFixed(2)}%`);
    console.log(`Overall Recall:    ${(overallRecall * 100).toFixed(2)}%`);
    console.log(`Overall F1 Score:  ${(overallF1 * 100).toFixed(2)}%`);
    console.log(`Total Matches:     ${matches.length}`);
    console.log(`True Positives:    ${tp}`);
    console.log(`Total Mismatches (FP): ${fp}`);
    console.log(`False Negatives (FN):  ${fn}\n`);
    
    console.log(`--- Breakdown by Anomaly Type ---`);
    for (const [type, stats] of Object.entries(anomalyStats)) {
      const p = calcPrecision(stats.tp, stats.fp);
      const r = calcRecall(stats.tp, stats.fn);
      const f1 = calcF1(stats.tp, stats.fp, stats.fn);
      console.log(`${type.padEnd(20)} | P: ${p.padEnd(6)} | R: ${r.padEnd(6)} | F1: ${f1.padEnd(6)} | TP: ${stats.tp}, FP: ${stats.fp}, FN: ${stats.fn}`);
    }
    
    // Find amount_mismatch FNs and log their gap percentages
    const amountMismatchDetails: { paymentId: string; amount: number; gap: number; percent: number }[] = [];
    
    const rzpPath = path.join(datasetDir, 'razorpay_payments.csv');
    const bankPath = path.join(datasetDir, 'bank_statement.csv');

    if (fs.existsSync(rzpPath) && fs.existsSync(bankPath)) {
      const rzpCsv = fs.readFileSync(rzpPath, 'utf-8');
      const parsedRzp = Papa.parse<Record<string, unknown>>(rzpCsv, { header: true }).data;
      
      const bankCsv = fs.readFileSync(bankPath, 'utf-8');
      const parsedBank = Papa.parse<Record<string, unknown>>(bankCsv, { header: true }).data;
      
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
    }

    // Persist to database
    await prisma.reconciliationRun.update({
      where: { id: run.id },
      data: {
        precision: overallPrecision,
        recall: overallRecall,
      },
    });
    console.log(`\n✅ Persisted precision and recall to database for run ${run.id}`);
    
  } catch (error) {
    console.error('Error during evaluation:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Argument parsing
const args = process.argv.slice(2);
let runId: string | undefined;
let isLatest = false;
let dataset: 'default' | 'holdout' = 'default';

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--latest') {
    isLatest = true;
  } else if (arg === '--dataset=holdout' || (arg === '--dataset' && args[i + 1] === 'holdout')) {
    dataset = 'holdout';
    if (arg === '--dataset') i++;
  } else if (arg === '--dataset=default' || (arg === '--dataset' && args[i + 1] === 'default')) {
    dataset = 'default';
    if (arg === '--dataset') i++;
  } else if (!arg.startsWith('-')) {
    runId = arg;
  }
}

if (!runId && !isLatest) {
  console.error('❌ Error: You must specify a Run ID or provide the --latest flag.');
  console.error('Usage:');
  console.error('  npx tsx scripts/evaluate.ts <run_id> [--dataset=holdout|default]');
  console.error('  npx tsx scripts/evaluate.ts --latest [--dataset=holdout|default]');
  process.exit(1);
}

evaluateRun(runId, isLatest, dataset);
