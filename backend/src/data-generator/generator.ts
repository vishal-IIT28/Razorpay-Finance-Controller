import { faker } from '@faker-js/faker';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

// Types
type RazorpayRecord = {
  payment_id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  description: string;
  created_at: string;
  settled_at: string;
  fee: number;
  tax: number;
  settlement_id: string;
};

type BankRecord = {
  txn_id: string;
  date: string;
  narration: string;
  credit: number;
  debit: number;
  balance: number;
  utr: string;
  mode: string;
};

type LedgerRecord = {
  entry_id: string;
  invoice_id: string;
  expected_amount: number;
  received_amount: number | null;
  customer_name: string;
  due_date: string;
  status: string;
  payment_ref: string | null;
};

const NUM_RECORDS = 150;

function dateOnly(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

type GroundTruth = {
  bank_txn_ids: string[];
  ledger_entry_id: string | null;
  anomaly_type: string;
};

export function generateData(customSeed?: number, customOutputDir?: string) {
  const seed = customSeed ?? (process.env.GENERATOR_SEED ? Number(process.env.GENERATOR_SEED) : 20260905);
  faker.seed(seed);

  const razorpayRecords: RazorpayRecord[] = [];
  const bankRecords: BankRecord[] = [];
  const ledgerRecords: LedgerRecord[] = [];
  const groundTruth: Record<string, GroundTruth> = {};
  
  let currentBalance = 100000;

  for (let i = 0; i < NUM_RECORDS; i++) {
    // Generate a base transaction
    const baseAmount = parseFloat(faker.commerce.price({ min: 100, max: 5000, dec: 2 }));
    const rzpFeeRate = 0.02; // 2% gateway fee
    const fee = parseFloat((baseAmount * rzpFeeRate).toFixed(2));
    const tax = parseFloat((fee * 0.18).toFixed(2)); // 18% GST on fee
    const netAmount = parseFloat((baseAmount - fee - tax).toFixed(2));

    const paymentId = `pay_${faker.string.alphanumeric(14)}`;
    const orderId = `order_${faker.string.alphanumeric(14)}`;
    const invoiceId = `INV-${2026}-${faker.string.numeric(4)}`;
    const utr = `UTR${faker.string.numeric(12)}`;
    const date = faker.date.recent({ days: 30 });
    const dateString = dateOnly(date);
    
    // Determine the type of record to simulate real-world anomalies (seeded float)
    const rand = faker.number.float({ min: 0, max: 1 });
    
    // 1. Exact Match (40%)
    if (rand < 0.40) {
      razorpayRecords.push({
        payment_id: paymentId, order_id: orderId, amount: baseAmount, currency: 'INR',
        status: 'captured', method: 'upi', description: `Payment for ${invoiceId}`,
        created_at: date.toISOString(), settled_at: date.toISOString(), fee, tax,
        settlement_id: `setl_${faker.string.alphanumeric(14)}`
      });

      currentBalance += netAmount;
      const bankId = `TXN${faker.string.numeric(10)}`;
      bankRecords.push({
        txn_id: bankId, date: dateString,
        narration: `NEFT-RAZORPAY-${paymentId}`, credit: netAmount, debit: 0,
        balance: currentBalance, utr, mode: 'NEFT'
      });

      const ledgerId = `LED-${faker.string.numeric(6)}`;
      ledgerRecords.push({
        entry_id: ledgerId, invoice_id: invoiceId,
        expected_amount: baseAmount, received_amount: null, customer_name: faker.company.name(),
        due_date: dateString, status: 'pending', payment_ref: paymentId
      });
      
      groundTruth[paymentId] = { bank_txn_ids: [bankId], ledger_entry_id: ledgerId, anomaly_type: 'exact' };
    } 
    // 2. Amount Mismatch (Bank deducted extra fee or manual partial payment) (15%)
    else if (rand < 0.55) {
       razorpayRecords.push({
        payment_id: paymentId, order_id: orderId, amount: baseAmount, currency: 'INR',
        status: 'captured', method: 'card', description: `Payment for ${invoiceId}`,
        created_at: date.toISOString(), settled_at: date.toISOString(), fee, tax,
        settlement_id: `setl_${faker.string.alphanumeric(14)}`
      });

      const randomBankFee = parseFloat(faker.commerce.price({ min: 10, max: 50, dec: 2 }));
      const bankCredit = parseFloat((netAmount - randomBankFee).toFixed(2));
      currentBalance += bankCredit;
      const bankId = `TXN${faker.string.numeric(10)}`;

      bankRecords.push({
        txn_id: bankId, date: dateString,
        narration: `IMPS-RAZORPAY-${paymentId}`, credit: bankCredit, debit: 0,
        balance: currentBalance, utr, mode: 'IMPS'
      });

      const ledgerId = `LED-${faker.string.numeric(6)}`;
      ledgerRecords.push({
        entry_id: ledgerId, invoice_id: invoiceId,
        expected_amount: baseAmount, received_amount: null, customer_name: faker.company.name(),
        due_date: dateString, status: 'pending', payment_ref: paymentId
      });
      
      groundTruth[paymentId] = { bank_txn_ids: [bankId], ledger_entry_id: ledgerId, anomaly_type: 'amount_mismatch' };
    }
    // 3. Date Drift (15%)
    else if (rand < 0.70) {
      const settledDate = new Date(date);
      settledDate.setDate(settledDate.getDate() + faker.number.int({ min: 1, max: 4 })); // 1-4 days delay

      razorpayRecords.push({
        payment_id: paymentId, order_id: orderId, amount: baseAmount, currency: 'INR',
        status: 'captured', method: 'netbanking', description: `Payment for ${invoiceId}`,
        created_at: date.toISOString(), settled_at: settledDate.toISOString(), fee, tax,
        settlement_id: `setl_${faker.string.alphanumeric(14)}`
      });

      currentBalance += netAmount;
      const bankId = `TXN${faker.string.numeric(10)}`;
      bankRecords.push({
        txn_id: bankId, date: dateOnly(settledDate),
        narration: `RTGS-RAZORPAY-${paymentId}`, credit: netAmount, debit: 0,
        balance: currentBalance, utr, mode: 'RTGS'
      });

      const ledgerId = `LED-${faker.string.numeric(6)}`;
      ledgerRecords.push({
        entry_id: ledgerId, invoice_id: invoiceId,
        expected_amount: baseAmount, received_amount: null, customer_name: faker.company.name(),
        due_date: dateString, status: 'pending', payment_ref: paymentId
      });
      
      groundTruth[paymentId] = { bank_txn_ids: [bankId], ledger_entry_id: ledgerId, anomaly_type: 'date_drift' };
    }
    // 4. Narration Variance (Fuzzy Match needed) (10%)
    else if (rand < 0.80) {
      razorpayRecords.push({
        payment_id: paymentId, order_id: orderId, amount: baseAmount, currency: 'INR',
        status: 'captured', method: 'upi', description: `Payment for ${invoiceId}`,
        created_at: date.toISOString(), settled_at: date.toISOString(), fee, tax,
        settlement_id: `setl_${faker.string.alphanumeric(14)}`
      });

      currentBalance += netAmount;
      // Intentionally mangled narration
      const mangledNarration = `UPI/RZP*/${faker.string.alphanumeric(6)}/${paymentId.substring(4, 10)}...`;
      const bankId = `TXN${faker.string.numeric(10)}`;
      
      bankRecords.push({
        txn_id: bankId, date: dateString,
        narration: mangledNarration, credit: netAmount, debit: 0,
        balance: currentBalance, utr, mode: 'UPI'
      });

      const ledgerId = `LED-${faker.string.numeric(6)}`;
      ledgerRecords.push({
        entry_id: ledgerId, invoice_id: invoiceId,
        expected_amount: baseAmount, received_amount: null, customer_name: faker.company.name(),
        due_date: dateString, status: 'pending', payment_ref: null // Missing ref in ledger
      });
      
      groundTruth[paymentId] = { bank_txn_ids: [bankId], ledger_entry_id: ledgerId, anomaly_type: 'narration_variance' };
    }
    // 5. Missing Records / Drops (10%)
    else if (rand < 0.90) {
       razorpayRecords.push({
        payment_id: paymentId, order_id: orderId, amount: baseAmount, currency: 'INR',
        status: 'failed', method: 'upi', description: `Payment for ${invoiceId}`,
        created_at: date.toISOString(), settled_at: "", fee: 0, tax: 0,
        settlement_id: ""
      });

      // No bank record (failed transaction)
      const ledgerId = `LED-${faker.string.numeric(6)}`;
      ledgerRecords.push({
        entry_id: ledgerId, invoice_id: invoiceId,
        expected_amount: baseAmount, received_amount: null, customer_name: faker.company.name(),
        due_date: dateString, status: 'pending', payment_ref: null
      });
      
      // Since it's failed, it shouldn't match anything in the bank
      groundTruth[paymentId] = { bank_txn_ids: [], ledger_entry_id: ledgerId, anomaly_type: 'missing' };
    }
    // 6. Split Transactions (10%)
    else {
      razorpayRecords.push({
        payment_id: paymentId, order_id: orderId, amount: baseAmount, currency: 'INR',
        status: 'captured', method: 'card', description: `Payment for ${invoiceId}`,
        created_at: date.toISOString(), settled_at: date.toISOString(), fee, tax,
        settlement_id: `setl_${faker.string.alphanumeric(14)}`
      });

      const split1 = parseFloat((netAmount * 0.6).toFixed(2));
      const split2 = parseFloat((netAmount - split1).toFixed(2));

      const bankId1 = `TXN${faker.string.numeric(10)}`;
      currentBalance += split1;
      bankRecords.push({
        txn_id: bankId1, date: dateString,
        narration: `PART1-RAZORPAY-${paymentId}`, credit: split1, debit: 0,
        balance: currentBalance, utr: `UTR${faker.string.numeric(12)}`, mode: 'NEFT'
      });

      const bankId2 = `TXN${faker.string.numeric(10)}`;
      currentBalance += split2;
      bankRecords.push({
        txn_id: bankId2, date: dateString,
        narration: `PART2-RAZORPAY-${paymentId}`, credit: split2, debit: 0,
        balance: currentBalance, utr: `UTR${faker.string.numeric(12)}`, mode: 'NEFT'
      });

      const ledgerId = `LED-${faker.string.numeric(6)}`;
      ledgerRecords.push({
        entry_id: ledgerId, invoice_id: invoiceId,
        expected_amount: baseAmount, received_amount: null, customer_name: faker.company.name(),
        due_date: dateString, status: 'pending', payment_ref: paymentId
      });
      
      groundTruth[paymentId] = { bank_txn_ids: [bankId1, bankId2], ledger_entry_id: ledgerId, anomaly_type: 'split' };
    }
  }

  // Determine output directory
  const dataDir = customOutputDir
    ? path.resolve(process.cwd(), customOutputDir)
    : path.join(__dirname, '../../../data');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Write to CSV format using PapaParse
  fs.writeFileSync(path.join(dataDir, 'razorpay_payments.csv'), Papa.unparse(razorpayRecords));
  fs.writeFileSync(path.join(dataDir, 'bank_statement.csv'), Papa.unparse(bankRecords));
  fs.writeFileSync(path.join(dataDir, 'internal_ledger.csv'), Papa.unparse(ledgerRecords));
  
  // Write ground truth mapping
  fs.writeFileSync(path.join(dataDir, 'ground_truth.json'), JSON.stringify(groundTruth, null, 2));

  console.log(`✅ Generated synthetic financial records and ground truth mapping in ${dataDir} (seed: ${seed}).`);
}

// CLI Execution handler
if (require.main === module || process.argv[1]?.includes('generator.ts')) {
  const args = process.argv.slice(2);
  let parsedOutputDir: string | undefined;
  let parsedSeed: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === '--output-dir' || arg === '--out') {
      parsedOutputDir = args[++i];
    } else if (arg.startsWith('--output-dir=')) {
      parsedOutputDir = arg.split('=')[1];
    } else if (arg.startsWith('--out=')) {
      parsedOutputDir = arg.split('=')[1];
    } else if (arg === '--seed') {
      parsedSeed = Number(args[++i]);
    } else if (arg.startsWith('--seed=')) {
      parsedSeed = Number(arg.split('=')[1]);
    } else if (!arg.startsWith('-') && !parsedOutputDir) {
      parsedOutputDir = arg;
    }
  }

  generateData(parsedSeed, parsedOutputDir);
}
