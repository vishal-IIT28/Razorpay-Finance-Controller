import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { PrismaClient } from '@prisma/client';
import { runDeterministicPass, RzpRecord, BankRecord, LedgerRecord, MatchResult, toMoney } from '../src/engine/deterministic';
import { runFuzzyPass } from '../src/engine/fuzzy';
import { runLlmPass } from '../src/engine/llm';

dotenv.config({ path: [path.join(__dirname, '../.env'), path.join(__dirname, '../../.env')] });

const prisma = new PrismaClient();

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function nullableText(value: unknown): string | null {
  const normalized = text(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeRazorpayRecord(row: Record<string, unknown>): RzpRecord {
  return {
    payment_id: text(row.payment_id),
    order_id: text(row.order_id),
    amount: toMoney(row.amount as string),
    currency: text(row.currency),
    status: text(row.status),
    method: text(row.method),
    description: text(row.description),
    created_at: text(row.created_at),
    settled_at: text(row.settled_at),
    fee: toMoney(row.fee as string),
    tax: toMoney(row.tax as string),
    settlement_id: text(row.settlement_id),
  };
}

function normalizeBankRecord(row: Record<string, unknown>): BankRecord {
  return {
    txn_id: text(row.txn_id),
    date: text(row.date),
    narration: text(row.narration),
    credit: toMoney(row.credit as string),
    debit: toMoney(row.debit as string),
    balance: toMoney(row.balance as string),
    utr: text(row.utr),
    mode: text(row.mode),
  };
}

function normalizeLedgerRecord(row: Record<string, unknown>): LedgerRecord {
  return {
    entry_id: text(row.entry_id),
    invoice_id: text(row.invoice_id),
    expected_amount: toMoney(row.expected_amount as string),
    received_amount: nullableText(row.received_amount),
    customer_name: text(row.customer_name),
    due_date: text(row.due_date),
    status: text(row.status),
    payment_ref: nullableText(row.payment_ref),
  };
}

function parseCsvFile<T>(filePath: string, normalize: (row: Record<string, unknown>) => T): T[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const parsed = Papa.parse<Record<string, unknown>>(fileContent, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    const firstError = parsed.errors[0];
    throw new Error(`CSV parse failed for ${filePath}: ${firstError?.message ?? 'unknown parse error'}`);
  }

  return parsed.data.map(normalize);
}

type ExceptionPayload = {
  source_system: string;
  source_id: string;
  reasoning: string;
  suggested_action: string;
};

function buildExceptionLogs(
  unmatched: {
    razorpay: RzpRecord[];
    bank: BankRecord[];
    ledger: LedgerRecord[];
  },
  llmDecisions: Array<{
    payment_id: string;
    matched: boolean;
    reasoning: string;
    suggested_action: string;
  }> = []
): ExceptionPayload[] {
  const decisionByPayment = new Map(llmDecisions.map((decision) => [decision.payment_id, decision]));

  return [
    ...unmatched.razorpay.map((record) => ({
      source_system: 'Razorpay',
      source_id: record.payment_id,
      reasoning:
        decisionByPayment.get(record.payment_id)?.reasoning ??
        'No deterministic, fuzzy, or LLM match found across bank and ledger sources.',
      suggested_action:
        decisionByPayment.get(record.payment_id)?.suggested_action ??
        'Escalate to manual finance-ops investigation.',
    })),
    ...unmatched.bank.map((record) => ({
      source_system: 'Bank',
      source_id: record.txn_id,
      reasoning: 'Bank credit remained unmatched after deterministic and fuzzy passes.',
      suggested_action: 'Check for missing Razorpay payment, split settlement, or narration-only reference.',
    })),
    ...unmatched.ledger.map((record) => ({
      source_system: 'Ledger',
      source_id: record.entry_id,
      reasoning: 'Ledger entry remained unmatched after deterministic and fuzzy passes.',
      suggested_action: 'Verify invoice status, expected amount, and payment reference.',
    })),
  ];
}

async function persistRun(
  totalRecords: number,
  matches: MatchResult[],
  exceptions: ExceptionPayload[],
  durationMs?: number
) {
  return prisma.reconciliationRun.create({
    data: {
      status: 'completed',
      totalRecords,
      matchedRecords: matches.length,
      exceptions: exceptions.length,
      durationMs: durationMs ?? null,
      matchResults: {
        create: matches.map((match) => ({
          paymentId: match.payment_id,
          bankTxnId: match.bank_txn_id,
          ledgerEntryId: match.ledger_entry_id,
          matchPass: match.match_pass,
          confidenceScore: match.confidence,
          notes: match.notes,
        })),
      },
      exceptionLogs: {
        create: exceptions.map((exception) => ({
          sourceSystem: exception.source_system,
          sourceId: exception.source_id,
          reasoning: exception.reasoning,
          suggestedAction: exception.suggested_action,
        })),
      },
    },
  });
}

export async function runReconciliation(dataset: 'default' | 'holdout' = 'default') {
  const datasetDir = dataset === 'holdout'
    ? path.join(__dirname, '../../data/holdout')
    : path.join(__dirname, '../../data');

  console.log(`\n🚀 Starting reconciliation pipeline for dataset: ${dataset} (${datasetDir})...`);

  const razorpayPath = path.join(datasetDir, 'razorpay_payments.csv');
  const bankPath = path.join(datasetDir, 'bank_statement.csv');
  const ledgerPath = path.join(datasetDir, 'internal_ledger.csv');

  const totalStart = performance.now();

  const razorpayData = parseCsvFile(razorpayPath, normalizeRazorpayRecord);
  const bankData = parseCsvFile(bankPath, normalizeBankRecord);
  const ledgerData = parseCsvFile(ledgerPath, normalizeLedgerRecord);

  console.log(`Loaded ${razorpayData.length} Razorpay, ${bankData.length} Bank, ${ledgerData.length} Ledger records.`);

  const p1Start = performance.now();
  const pass1Result = runDeterministicPass(razorpayData, bankData, ledgerData);
  const pass1_ms = Math.round(performance.now() - p1Start);
  console.log(`[Pass 1: Deterministic] Matched: ${pass1Result.matches.length}, Unmatched remaining: ${pass1Result.unmatched.razorpay.length} (${pass1_ms}ms)`);

  const p2Start = performance.now();
  const pass2Result = runFuzzyPass(pass1Result.unmatched.razorpay, pass1Result.unmatched.bank, pass1Result.unmatched.ledger);
  const pass2_ms = Math.round(performance.now() - p2Start);
  console.log(`[Pass 2: Fuzzy] Matched: ${pass2Result.matches.length}, Unmatched remaining: ${pass2Result.unmatched.razorpay.length} (${pass2_ms}ms)`);

  const p3Start = performance.now();
  const pass3Result = await runLlmPass(
    pass2Result.unmatched.razorpay,
    pass2Result.unmatched.bank,
    pass2Result.unmatched.ledger
  );
  const pass3_ms = Math.round(performance.now() - p3Start);
  console.log(`[Pass 3: LLM] Matched: ${pass3Result.matches.length}, Unmatched remaining: ${pass3Result.unmatched.razorpay.length} (${pass3_ms}ms)`);

  const total_ms = Math.round(performance.now() - totalStart);
  const records_per_second = total_ms > 0 ? Number(((razorpayData.length / (total_ms / 1000))).toFixed(2)) : 0;

  const allMatches = [...pass1Result.matches, ...pass2Result.matches, ...pass3Result.matches];
  const exceptionLogs = buildExceptionLogs(pass3Result.unmatched, pass3Result.decisions);
  const run = await persistRun(razorpayData.length, allMatches, exceptionLogs, total_ms);
  const matchRate = razorpayData.length === 0 ? 0 : Number(((allMatches.length / razorpayData.length) * 100).toFixed(1));

  console.log(`\n✅ Pipeline Completed!`);
  console.log(`Run ID: ${run.id}`);
  console.log(`Timing: Total: ${total_ms}ms | Pass 1: ${pass1_ms}ms | Pass 2: ${pass2_ms}ms | Pass 3: ${pass3_ms}ms`);
  console.log(`Throughput: ${records_per_second} records/sec`);
  console.log(`Match Rate: ${matchRate}% (${allMatches.length}/${razorpayData.length} records)`);
  console.log(`Exceptions Logged: ${exceptionLogs.length}`);

  return run.id;
}

if (require.main === module || process.argv[1]?.includes('run-pipeline.ts')) {
  const args = process.argv.slice(2);
  const isHoldout = args.includes('--dataset=holdout') || args.includes('holdout');
  runReconciliation(isHoldout ? 'holdout' : 'default')
    .then((runId) => {
      console.log(`\nRun complete: ${runId}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Run failed:', err);
      process.exit(1);
    });
}
