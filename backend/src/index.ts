import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import Papa from 'papaparse';
import { PrismaClient } from '@prisma/client';
import { runDeterministicPass, RzpRecord, BankRecord, LedgerRecord, MatchResult, toMoney } from './engine/deterministic';
import { runFuzzyPass } from './engine/fuzzy';
import { runLlmPass } from './engine/llm';

// dotenv.config();
dotenv.config({ path: ['.env', '../.env'] });

const app = express();
const port = process.env.PORT || 3001;
const prisma = new PrismaClient();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'FinReconcile API is running' });
});

app.post(
  '/api/reconcile',
  upload.fields([
    { name: 'razorpay', maxCount: 1 },
    { name: 'bank', maxCount: 1 },
    { name: 'ledger', maxCount: 1 },
  ]),
  async (req: Request, res: Response): Promise<void> => {
    const uploadedFiles: Express.Multer.File[] = [];

    try {
      const files = req.files as Partial<Record<'razorpay' | 'bank' | 'ledger', Express.Multer.File[]>>;
      const razorpayFile = files.razorpay?.[0];
      const bankFile = files.bank?.[0];
      const ledgerFile = files.ledger?.[0];

      if (!razorpayFile || !bankFile || !ledgerFile) {
        res.status(400).json({ error: 'Missing one or more required files: razorpay, bank, ledger' });
        return;
      }

      uploadedFiles.push(razorpayFile, bankFile, ledgerFile);

      const razorpayData = parseCsvFile(razorpayFile.path, normalizeRazorpayRecord);
      const bankData = parseCsvFile(bankFile.path, normalizeBankRecord);
      const ledgerData = parseCsvFile(ledgerFile.path, normalizeLedgerRecord);

      const pass1Result = runDeterministicPass(razorpayData, bankData, ledgerData);
      const pass2Result = runFuzzyPass(pass1Result.unmatched.razorpay, pass1Result.unmatched.bank, pass1Result.unmatched.ledger);
      const pass3Result = await runLlmPass(
        pass2Result.unmatched.razorpay,
        pass2Result.unmatched.bank,
        pass2Result.unmatched.ledger
      );

      const allMatches = [...pass1Result.matches, ...pass2Result.matches, ...pass3Result.matches];
      const exceptionLogs = buildExceptionLogs(pass3Result.unmatched, pass3Result.decisions);
      const run = await persistRun(razorpayData.length, allMatches, exceptionLogs);
      const matchRate = razorpayData.length === 0 ? 0 : Number(((allMatches.length / razorpayData.length) * 100).toFixed(1));

      res.json({
        message: 'Reconciliation pipeline completed.',
        run_id: run.id,
        summary: {
          total_records: razorpayData.length,
          total_matched: allMatches.length,
          match_rate_pct: matchRate,
          exceptions: exceptionLogs.length,
        },
        pass1: {
          matched: pass1Result.matches.length,
        },
        pass2: {
          matched: pass2Result.matches.length,
          unmatched_remaining: pass2Result.unmatched.razorpay.length,
        },
        pass3: {
          enabled: pass3Result.enabled,
          matched: pass3Result.matches.length,
          unmatched_remaining: pass3Result.unmatched.razorpay.length,
          notes: pass3Result.notes,
        },
        matches: allMatches,
        exceptions: exceptionLogs,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error during reconciliation' });
    } finally {
      for (const file of uploadedFiles) {
        fs.rmSync(file.path, { force: true });
      }
    }
  }
);

async function persistRun(totalRecords: number, matches: MatchResult[], exceptions: ExceptionPayload[]) {
  return prisma.reconciliationRun.create({
    data: {
      status: 'completed',
      totalRecords,
      matchedRecords: matches.length,
      exceptions: exceptions.length,
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

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function nullableText(value: unknown): string | null {
  const normalized = text(value);
  return normalized.length > 0 ? normalized : null;
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
