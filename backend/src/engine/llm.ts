import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  BankRecord,
  getDatePart,
  getRazorpayNetAmount,
  LedgerRecord,
  MatchResult,
  ReconciliationPassResult,
  RzpRecord,
  toMoney,
} from './deterministic';

type LlmDecision = {
  matched: boolean;
  payment_id: string;
  bank_txn_ids: string[];
  ledger_entry_id: string | null;
  confidence: number;
  reasoning: string;
  suggested_action: string;
};

export type LlmPassResult = ReconciliationPassResult & {
  enabled: boolean;
  notes: string[];
  decisions: LlmDecision[];
};

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const MIN_CONFIDENCE = 0.7;
const MAX_RECORDS = Number(process.env.LLM_MAX_RECORDS ?? 50);

export async function runLlmPass(
  unmatchedRzp: RzpRecord[],
  unmatchedBank: BankRecord[],
  unmatchedLedger: LedgerRecord[]
): Promise<LlmPassResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      enabled: false,
      notes: ['GEMINI_API_KEY is not set; Pass 3 skipped.'],
      decisions: [],
      matches: [],
      unmatched: {
        razorpay: unmatchedRzp,
        bank: unmatchedBank,
        ledger: unmatchedLedger,
      },
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const matches: MatchResult[] = [];
  const decisions: LlmDecision[] = [];
  const notes: string[] = [];
  const usedBankIds = new Set<string>();
  const usedLedgerIds = new Set<string>();
  const stillUnmatchedRzp: RzpRecord[] = [];

  for (const rzp of unmatchedRzp.slice(0, MAX_RECORDS)) {
    const candidateBanks = pickBankCandidates(rzp, unmatchedBank).filter((bank) => !usedBankIds.has(bank.txn_id));
    const candidateLedgers = pickLedgerCandidates(rzp, unmatchedLedger).filter(
      (ledger) => !usedLedgerIds.has(ledger.entry_id)
    );

    if (candidateBanks.length === 0 || candidateLedgers.length === 0) {
      stillUnmatchedRzp.push(rzp);
      continue;
    }

    try {
      const result = await model.generateContent(buildPrompt(rzp, candidateBanks, candidateLedgers));
      const decision = parseDecision(result.response.text(), rzp.payment_id);
      decisions.push(decision);

      const validBankIds = decision.bank_txn_ids.filter((id) => candidateBanks.some((bank) => bank.txn_id === id));
      const validLedger = candidateLedgers.find((ledger) => ledger.entry_id === decision.ledger_entry_id);

      if (decision.matched && decision.confidence >= MIN_CONFIDENCE && validBankIds.length > 0 && validLedger) {
        matches.push({
          payment_id: rzp.payment_id,
          bank_txn_id: validBankIds.join(','),
          ledger_entry_id: validLedger.entry_id,
          match_pass: 3,
          confidence: clampConfidence(decision.confidence),
          notes: decision.reasoning,
        });

        validBankIds.forEach((id) => usedBankIds.add(id));
        usedLedgerIds.add(validLedger.entry_id);
      } else {
        stillUnmatchedRzp.push(rzp);
      }
    } catch (error) {
      notes.push(`Pass 3 failed for ${rzp.payment_id}: ${error instanceof Error ? error.message : 'unknown error'}`);
      stillUnmatchedRzp.push(rzp);
    }
  }

  if (unmatchedRzp.length > MAX_RECORDS) {
    stillUnmatchedRzp.push(...unmatchedRzp.slice(MAX_RECORDS));
    notes.push(`Pass 3 reviewed ${MAX_RECORDS} of ${unmatchedRzp.length} unmatched Razorpay records.`);
  }

  return {
    enabled: true,
    notes,
    decisions,
    matches,
    unmatched: {
      razorpay: stillUnmatchedRzp,
      bank: unmatchedBank.filter((bank) => !usedBankIds.has(bank.txn_id)),
      ledger: unmatchedLedger.filter((ledger) => !usedLedgerIds.has(ledger.entry_id)),
    },
  };
}

function pickBankCandidates(rzp: RzpRecord, bankRecords: BankRecord[]): BankRecord[] {
  const settlementDate = getDatePart(rzp.settled_at) || getDatePart(rzp.created_at);
  const expectedNet = getRazorpayNetAmount(rzp);
  const idFragment = rzp.payment_id.replace('pay_', '').slice(0, 6).toLowerCase();

  return bankRecords
    .map((bank) => ({
      bank,
      score:
        (bank.narration.toLowerCase().includes(idFragment) ? 0 : 4) +
        Math.min(Math.abs(toMoney(bank.credit) - expectedNet) / Math.max(expectedNet, 1), 1) +
        Math.min(dateDistance(bank.date, settlementDate) / 5, 1),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 8)
    .map((item) => item.bank);
}

function pickLedgerCandidates(rzp: RzpRecord, ledgerRecords: LedgerRecord[]): LedgerRecord[] {
  const invoiceId = rzp.description.match(/INV-\d{4}-\d{4}/)?.[0];

  return ledgerRecords
    .map((ledger) => ({
      ledger,
      score:
        (ledger.payment_ref === rzp.payment_id ? 0 : 3) +
        (invoiceId && ledger.invoice_id === invoiceId ? 0 : 2) +
        Math.min(Math.abs(toMoney(ledger.expected_amount) - toMoney(rzp.amount)) / Math.max(toMoney(rzp.amount), 1), 1),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((item) => item.ledger);
}

function buildPrompt(rzp: RzpRecord, bankRecords: BankRecord[], ledgerRecords: LedgerRecord[]): string {
  return JSON.stringify({
    role: 'finance reconciliation analyst',
    task:
      'Decide whether one Razorpay payment can be reconciled to one ledger entry and one or more bank credits. Consider gateway fees, bank fee deductions, date drift, narration variance, and split settlements. Do not invent IDs.',
    output_contract: {
      matched: 'boolean',
      payment_id: rzp.payment_id,
      bank_txn_ids: 'array of txn_id strings from candidate_bank_records only',
      ledger_entry_id: 'entry_id string from candidate_ledger_records only, or null',
      confidence: 'number from 0 to 1',
      reasoning: 'short audit-ready explanation',
      suggested_action: 'short next step if not matched, or confirm posting if matched',
    },
    razorpay_record: {
      payment_id: rzp.payment_id,
      amount: rzp.amount,
      net_settlement_amount: getRazorpayNetAmount(rzp),
      fee: rzp.fee,
      tax: rzp.tax,
      status: rzp.status,
      method: rzp.method,
      description: rzp.description,
      created_at: rzp.created_at,
      settled_at: rzp.settled_at,
    },
    candidate_bank_records: bankRecords.map((bank) => ({
      txn_id: bank.txn_id,
      date: bank.date,
      narration: bank.narration,
      credit: bank.credit,
      utr: bank.utr,
      mode: bank.mode,
    })),
    candidate_ledger_records: ledgerRecords.map((ledger) => ({
      entry_id: ledger.entry_id,
      invoice_id: ledger.invoice_id,
      expected_amount: ledger.expected_amount,
      status: ledger.status,
      due_date: ledger.due_date,
      payment_ref: ledger.payment_ref,
    })),
  });
}

function parseDecision(rawText: string, paymentId: string): LlmDecision {
  const parsed = JSON.parse(rawText) as Partial<LlmDecision>;
  return {
    matched: Boolean(parsed.matched),
    payment_id: typeof parsed.payment_id === 'string' ? parsed.payment_id : paymentId,
    bank_txn_ids: Array.isArray(parsed.bank_txn_ids)
      ? parsed.bank_txn_ids.filter((id): id is string => typeof id === 'string')
      : [],
    ledger_entry_id: typeof parsed.ledger_entry_id === 'string' ? parsed.ledger_entry_id : null,
    confidence: clampConfidence(Number(parsed.confidence ?? 0)),
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No model reasoning returned.',
    suggested_action:
      typeof parsed.suggested_action === 'string'
        ? parsed.suggested_action
        : 'Review this exception manually before posting.',
  };
}

function dateDistance(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 99;
  return Math.abs((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function clampConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.max(0, Math.min(1, Number(confidence.toFixed(3))));
}
