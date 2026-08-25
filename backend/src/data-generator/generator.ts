import { faker } from '@faker-js/faker';
import fs from 'fs';
import path from 'path';

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

function generateData() {
  const razorpayRecords: RazorpayRecord[] = [];
  const bankRecords: BankRecord[] = [];
  const ledgerRecords: LedgerRecord[] = [];
  
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
    const dateString = date.toISOString().split('T')[0];
    
    // Determine the type of record to simulate real-world anomalies
    const rand = Math.random();
    
    // 1. Exact Match (40%)
    if (rand < 0.40) {
      razorpayRecords.push({
        payment_id: paymentId, order_id: orderId, amount: baseAmount, currency: 'INR',
        status: 'captured', method: 'upi', description: `Payment for ${invoiceId}`,
        created_at: date.toISOString(), settled_at: date.toISOString(), fee, tax,
        settlement_id: `setl_${faker.string.alphanumeric(14)}`
      });

      currentBalance += netAmount;
      bankRecords.push({
        txn_id: `TXN${faker.string.numeric(10)}`, date: dateString,
        narration: `NEFT-RAZORPAY-${paymentId}`, credit: netAmount, debit: 0,
        balance: currentBalance, utr, mode: 'NEFT'
      });

      ledgerRecords.push({
        entry_id: `LED-${faker.string.numeric(6)}`, invoice_id: invoiceId,
        expected_amount: baseAmount, received_amount: null, customer_name: faker.company.name(),
        due_date: dateString, status: 'pending', payment_ref: paymentId
      });
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

      bankRecords.push({
        txn_id: `TXN${faker.string.numeric(10)}`, date: dateString,
        narration: `IMPS-RAZORPAY-${paymentId}`, credit: bankCredit, debit: 0,
        balance: currentBalance, utr, mode: 'IMPS'
      });

      ledgerRecords.push({
        entry_id: `LED-${faker.string.numeric(6)}`, invoice_id: invoiceId,
        expected_amount: baseAmount, received_amount: null, customer_name: faker.company.name(),
        due_date: dateString, status: 'pending', payment_ref: paymentId
      });
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
      bankRecords.push({
        txn_id: `TXN${faker.string.numeric(10)}`, date: settledDate.toISOString().split('T')[0],
        narration: `RTGS-RAZORPAY-${paymentId}`, credit: netAmount, debit: 0,
        balance: currentBalance, utr, mode: 'RTGS'
      });

      ledgerRecords.push({
        entry_id: `LED-${faker.string.numeric(6)}`, invoice_id: invoiceId,
        expected_amount: baseAmount, received_amount: null, customer_name: faker.company.name(),
        due_date: dateString, status: 'pending', payment_ref: paymentId
      });
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
      
      bankRecords.push({
        txn_id: `TXN${faker.string.numeric(10)}`, date: dateString,
        narration: mangledNarration, credit: netAmount, debit: 0,
        balance: currentBalance, utr, mode: 'UPI'
      });

      ledgerRecords.push({
        entry_id: `LED-${faker.string.numeric(6)}`, invoice_id: invoiceId,
        expected_amount: baseAmount, received_amount: null, customer_name: faker.company.name(),
        due_date: dateString, status: 'pending', payment_ref: null // Missing ref in ledger
      });
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

      ledgerRecords.push({
        entry_id: `LED-${faker.string.numeric(6)}`, invoice_id: invoiceId,
        expected_amount: baseAmount, received_amount: null, customer_name: faker.company.name(),
        due_date: dateString, status: 'pending', payment_ref: null
      });
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

      currentBalance += split1;
      bankRecords.push({
        txn_id: `TXN${faker.string.numeric(10)}`, date: dateString,
        narration: `PART1-RAZORPAY-${paymentId}`, credit: split1, debit: 0,
        balance: currentBalance, utr: `UTR${faker.string.numeric(12)}`, mode: 'NEFT'
      });

      currentBalance += split2;
      bankRecords.push({
        txn_id: `TXN${faker.string.numeric(10)}`, date: dateString,
        narration: `PART2-RAZORPAY-${paymentId}`, credit: split2, debit: 0,
        balance: currentBalance, utr: `UTR${faker.string.numeric(12)}`, mode: 'NEFT'
      });

      ledgerRecords.push({
        entry_id: `LED-${faker.string.numeric(6)}`, invoice_id: invoiceId,
        expected_amount: baseAmount, received_amount: null, customer_name: faker.company.name(),
        due_date: dateString, status: 'pending', payment_ref: paymentId
      });
    }
  }

  // Ensure data directory exists
  const dataDir = path.join(__dirname, '../../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Write to CSV format using PapaParse
  const Papa = require('papaparse');
  
  fs.writeFileSync(path.join(dataDir, 'razorpay_payments.csv'), Papa.unparse(razorpayRecords));
  fs.writeFileSync(path.join(dataDir, 'bank_statement.csv'), Papa.unparse(bankRecords));
  fs.writeFileSync(path.join(dataDir, 'internal_ledger.csv'), Papa.unparse(ledgerRecords));

  console.log('✅ Generated synthetic financial records.');
}

generateData();
