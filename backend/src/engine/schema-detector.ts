import { GoogleGenerativeAI } from '@google/generative-ai';
import Papa from 'papaparse';
import { RzpRecord, BankRecord, LedgerRecord, toMoney } from './deterministic';

export type DetectedRole = 'razorpay' | 'bank' | 'ledger' | 'unknown';

export type ColumnMapping = Record<string, string>; // canonicalField -> csvHeader

export type SchemaDetectionResult = {
  filename: string;
  role: DetectedRole;
  confidence: number;
  mapping: ColumnMapping;
  detectedVia: 'heuristic' | 'llm';
  sampleRowCount: number;
  rawHeaders: string[];
  reasoning?: string;
};

export type IntakeValidationResult = {
  valid: boolean;
  missingRoles: DetectedRole[];
  detected: SchemaDetectionResult[];
  errorMessage?: string;
  normalizedData?: {
    razorpay: RzpRecord[];
    bank: BankRecord[];
    ledger: LedgerRecord[];
  };
};

// Canonical field definitions & common synonyms
const ROLE_FIELD_SYNONYMS: Record<DetectedRole, Record<string, string[]>> = {
  razorpay: {
    payment_id: ['payment_id', 'paymentid', 'pay_id', 'rzp_payment_id', 'razorpay_payment_id', 'txn_id', 'payment_reference'],
    order_id: ['order_id', 'orderid', 'rzp_order_id', 'order_reference', 'merchant_order_id'],
    amount: ['amount', 'payment_amount', 'gross_amount', 'total_amount', 'transaction_amount'],
    currency: ['currency', 'curr', 'currency_code'],
    status: ['status', 'payment_status', 'state'],
    method: ['method', 'payment_method', 'channel', 'mode'],
    description: ['description', 'notes', 'remark', 'desc', 'item_description'],
    created_at: ['created_at', 'created_date', 'timestamp', 'date_created', 'date'],
    settled_at: ['settled_at', 'settled_date', 'settlement_date', 'date_settled', 'settle_time'],
    fee: ['fee', 'gateway_fee', 'rzp_fee', 'processing_fee', 'charges', 'service_fee'],
    tax: ['tax', 'gst', 'service_tax', 'vat'],
    settlement_id: ['settlement_id', 'settleid', 'payout_id', 'batch_id'],
  },
  bank: {
    txn_id: ['txn_id', 'transaction_id', 'bank_txn_id', 'trans_id', 'reference_no', 'ref_id', 'id'],
    date: ['date', 'txn_date', 'transaction_date', 'value_date', 'posting_date'],
    narration: ['narration', 'description', 'remarks', 'particulars', 'transaction_details', 'memo'],
    credit: ['credit', 'deposit', 'cr_amount', 'credit_amount', 'inflow'],
    debit: ['debit', 'withdrawal', 'dr_amount', 'debit_amount', 'outflow'],
    balance: ['balance', 'running_balance', 'closing_balance', 'account_balance'],
    utr: ['utr', 'utr_number', 'utr_no', 'rrn', 'bank_ref', 'reference_number'],
    mode: ['mode', 'type', 'channel', 'payment_mode', 'txn_type', 'transfer_type'],
  },
  ledger: {
    entry_id: ['entry_id', 'ledger_entry_id', 'ledger_id', 'journal_id', 'record_id', 'id'],
    invoice_id: ['invoice_id', 'inv_id', 'invoice_no', 'bill_no', 'bill_number', 'invoice_number'],
    expected_amount: ['expected_amount', 'invoice_amount', 'bill_amount', 'amount_due', 'amount'],
    received_amount: ['received_amount', 'paid_amount', 'amount_received', 'settled_amount'],
    customer_name: ['customer_name', 'customer', 'client_name', 'client', 'payer_name', 'account_name'],
    due_date: ['due_date', 'payment_due_date', 'invoice_date', 'date'],
    status: ['status', 'payment_status', 'invoice_status', 'state'],
    payment_ref: ['payment_ref', 'payment_id', 'rzp_id', 'reference', 'payment_reference'],
  },
  unknown: {},
};

// Key identifying markers unique to each source
const ROLE_UNIQUE_INDICATORS: Record<DetectedRole, string[]> = {
  razorpay: ['settlement_id', 'gateway_fee', 'order_id', 'payment_id', 'rzp_fee', 'settled_at'],
  bank: ['utr', 'narration', 'credit', 'debit', 'balance', 'particulars'],
  ledger: ['invoice_id', 'customer_name', 'entry_id', 'expected_amount', 'due_date', 'invoice_no'],
  unknown: [],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s\-_#]+/g, '_').trim();
}

export function detectSchemaHeuristic(
  filename: string,
  rawHeaders: string[],
  sampleRows: Record<string, unknown>[] = []
): SchemaDetectionResult {
  const normHeaders = rawHeaders.map(normalizeHeader);

  const scores: Record<'razorpay' | 'bank' | 'ledger', { score: number; matches: ColumnMapping }> = {
    razorpay: { score: 0, matches: {} },
    bank: { score: 0, matches: {} },
    ledger: { score: 0, matches: {} },
  };

  for (const role of ['razorpay', 'bank', 'ledger'] as const) {
    const roleSynonyms = ROLE_FIELD_SYNONYMS[role];
    const uniqueIndicators = ROLE_UNIQUE_INDICATORS[role];
    let matchedFieldCount = 0;

    for (const [canonicalField, synonyms] of Object.entries(roleSynonyms)) {
      for (let i = 0; i < normHeaders.length; i++) {
        const hNorm = normHeaders[i]!;
        const rawH = rawHeaders[i]!;

        if (synonyms.includes(hNorm) || synonyms.some((s) => hNorm.includes(s) || s.includes(hNorm))) {
          scores[role].matches[canonicalField] = rawH;
          matchedFieldCount++;

          // Bonus weight if it matches a highly unique indicator
          if (uniqueIndicators.includes(hNorm) || uniqueIndicators.includes(canonicalField)) {
            scores[role].score += 2.0;
          } else {
            scores[role].score += 1.0;
          }
          break;
        }
      }
    }

    // Filename hints
    const lowerFilename = filename.toLowerCase();
    if (role === 'razorpay' && (lowerFilename.includes('razorpay') || lowerFilename.includes('rzp') || lowerFilename.includes('payment'))) {
      scores[role].score += 1.5;
    } else if (role === 'bank' && (lowerFilename.includes('bank') || lowerFilename.includes('statement') || lowerFilename.includes('passbook'))) {
      scores[role].score += 1.5;
    } else if (role === 'ledger' && (lowerFilename.includes('ledger') || lowerFilename.includes('internal') || lowerFilename.includes('invoice') || lowerFilename.includes('erp'))) {
      scores[role].score += 1.5;
    }
  }

  // Determine winning role
  const roleList: Array<'razorpay' | 'bank' | 'ledger'> = ['razorpay', 'bank', 'ledger'];
  const sortedRoles = roleList.sort((a, b) => scores[b].score - scores[a].score);

  const topRole = sortedRoles[0] || 'razorpay';
  const topScore = scores[topRole].score;
  const runnerUpRole = sortedRoles[1] || 'bank';
  const runnerUpScore = scores[runnerUpRole].score;

  // Max potential score ~ 10-15
  const confidence = Math.min(1.0, Number((topScore / 8).toFixed(2)));

  if (topScore >= 2.5 && topScore > runnerUpScore + 0.5) {
    return {
      filename,
      role: topRole,
      confidence,
      mapping: scores[topRole].matches,
      detectedVia: 'heuristic',
      sampleRowCount: sampleRows.length,
      rawHeaders,
    };
  }

  return {
    filename,
    role: topScore >= 2.0 ? topRole : 'unknown',
    confidence: Math.max(0.2, confidence),
    mapping: scores[topRole].matches,
    detectedVia: 'heuristic',
    sampleRowCount: sampleRows.length,
    rawHeaders,
  };
}

export async function detectSchemaWithLlm(
  filename: string,
  rawHeaders: string[],
  sampleRows: Record<string, unknown>[]
): Promise<SchemaDetectionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return detectSchemaHeuristic(filename, rawHeaders, sampleRows);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    });

    const prompt = JSON.stringify({
      task: 'Classify financial CSV file into one of 3 roles: razorpay (payment gateway export), bank (bank statement), or ledger (internal ERP ledger). Also map its columns to canonical fields.',
      filename,
      csv_headers: rawHeaders,
      sample_rows: sampleRows.slice(0, 3),
      roles: {
        razorpay: ['payment_id', 'order_id', 'amount', 'currency', 'status', 'method', 'description', 'created_at', 'settled_at', 'fee', 'tax', 'settlement_id'],
        bank: ['txn_id', 'date', 'narration', 'credit', 'debit', 'balance', 'utr', 'mode'],
        ledger: ['entry_id', 'invoice_id', 'expected_amount', 'received_amount', 'customer_name', 'due_date', 'status', 'payment_ref'],
      },
      output_format: {
        role: 'razorpay | bank | ledger | unknown',
        confidence: 'number between 0 and 1',
        column_mapping: 'object mapping canonical_field -> original_csv_header',
        reasoning: 'short explanation',
      },
    });

    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());

    const role = (['razorpay', 'bank', 'ledger'].includes(parsed.role) ? parsed.role : 'unknown') as DetectedRole;

    return {
      filename,
      role,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
      mapping: parsed.column_mapping || {},
      detectedVia: 'llm',
      sampleRowCount: sampleRows.length,
      rawHeaders,
      reasoning: parsed.reasoning || `LLM classified as ${role} based on column structures and sample data.`,
    };
  } catch (error) {
    console.warn(`[Schema Detector] LLM fallback error for ${filename}, reverting to heuristic:`, error);
    return detectSchemaHeuristic(filename, rawHeaders, sampleRows);
  }
}

export async function detectFileSchema(
  filename: string,
  csvContent: string
): Promise<SchemaDetectionResult> {
  const parsed = Papa.parse<Record<string, unknown>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    preview: 10,
  });

  const rawHeaders = parsed.meta.fields || [];
  const sampleRows = parsed.data || [];

  const heuristic = detectSchemaHeuristic(filename, rawHeaders, sampleRows);
  if (heuristic.role !== 'unknown' && heuristic.confidence >= 0.6) {
    return heuristic;
  }

  // Ambiguous: call LLM classifier
  return detectSchemaWithLlm(filename, rawHeaders, sampleRows);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function nullableText(value: unknown): string | null {
  const normalized = text(value);
  return normalized.length > 0 ? normalized : null;
}

export function parseAndNormalizeData(
  role: 'razorpay' | 'bank' | 'ledger',
  csvContent: string,
  mapping: ColumnMapping
): any[] {
  const parsed = Papa.parse<Record<string, unknown>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const rows = parsed.data;

  const getCol = (row: Record<string, unknown>, canonical: string): unknown => {
    const mappedHeader = mapping[canonical];
    if (mappedHeader && row[mappedHeader] !== undefined) {
      return row[mappedHeader];
    }
    // Fallback direct match
    if (row[canonical] !== undefined) return row[canonical];
    // Fallback lowercase match
    const lowerKey = Object.keys(row).find((k) => normalizeHeader(k) === normalizeHeader(canonical));
    return lowerKey ? row[lowerKey] : undefined;
  };

  if (role === 'razorpay') {
    return rows.map((row): RzpRecord => ({
      payment_id: text(getCol(row, 'payment_id')),
      order_id: text(getCol(row, 'order_id')),
      amount: toMoney(getCol(row, 'amount') as string),
      currency: text(getCol(row, 'currency') || 'INR'),
      status: text(getCol(row, 'status') || 'captured'),
      method: text(getCol(row, 'method') || 'upi'),
      description: text(getCol(row, 'description')),
      created_at: text(getCol(row, 'created_at')),
      settled_at: text(getCol(row, 'settled_at')),
      fee: toMoney(getCol(row, 'fee') as string),
      tax: toMoney(getCol(row, 'tax') as string),
      settlement_id: text(getCol(row, 'settlement_id')),
    }));
  }

  if (role === 'bank') {
    return rows.map((row): BankRecord => ({
      txn_id: text(getCol(row, 'txn_id')),
      date: text(getCol(row, 'date')),
      narration: text(getCol(row, 'narration')),
      credit: toMoney(getCol(row, 'credit') as string),
      debit: toMoney(getCol(row, 'debit') as string),
      balance: toMoney(getCol(row, 'balance') as string),
      utr: text(getCol(row, 'utr')),
      mode: text(getCol(row, 'mode') || 'NEFT'),
    }));
  }

  // ledger
  return rows.map((row): LedgerRecord => ({
    entry_id: text(getCol(row, 'entry_id')),
    invoice_id: text(getCol(row, 'invoice_id')),
    expected_amount: toMoney(getCol(row, 'expected_amount') as string),
    received_amount: nullableText(getCol(row, 'received_amount')),
    customer_name: text(getCol(row, 'customer_name')),
    due_date: text(getCol(row, 'due_date')),
    status: text(getCol(row, 'status') || 'pending'),
    payment_ref: nullableText(getCol(row, 'payment_ref')),
  }));
}

export async function validateAndNormalizeUploads(
  files: Array<{ filename: string; content: string }>
): Promise<IntakeValidationResult> {
  const detected: SchemaDetectionResult[] = [];
  const filesByRole: Partial<Record<'razorpay' | 'bank' | 'ledger', { filename: string; content: string; mapping: ColumnMapping }>> = {};

  for (const file of files) {
    const detection = await detectFileSchema(file.filename, file.content);
    detected.push(detection);

    if (detection.role !== 'unknown' && !filesByRole[detection.role]) {
      filesByRole[detection.role] = {
        filename: file.filename,
        content: file.content,
        mapping: detection.mapping,
      };
    }
  }

  const requiredRoles: Array<'razorpay' | 'bank' | 'ledger'> = ['razorpay', 'bank', 'ledger'];
  const missingRoles = requiredRoles.filter((r) => !filesByRole[r]);

  if (missingRoles.length > 0) {
    const roleLabels = {
      razorpay: 'Payment Gateway export (e.g. Razorpay)',
      bank: 'Bank Statement (e.g. Bank credits/debits)',
      ledger: 'Internal Ledger / ERP records',
    };
    const missingDesc = missingRoles.map((r) => `${r} (${roleLabels[r]})`).join(', ');
    return {
      valid: false,
      missingRoles,
      detected,
      errorMessage: `Missing required financial dataset role(s): ${missingDesc}. Please upload CSV files fulfilling all 3 roles.`,
    };
  }

  const razorpay = parseAndNormalizeData('razorpay', filesByRole.razorpay!.content, filesByRole.razorpay!.mapping) as RzpRecord[];
  const bank = parseAndNormalizeData('bank', filesByRole.bank!.content, filesByRole.bank!.mapping) as BankRecord[];
  const ledger = parseAndNormalizeData('ledger', filesByRole.ledger!.content, filesByRole.ledger!.mapping) as LedgerRecord[];

  return {
    valid: true,
    missingRoles: [],
    detected,
    normalizedData: {
      razorpay,
      bank,
      ledger,
    },
  };
}
