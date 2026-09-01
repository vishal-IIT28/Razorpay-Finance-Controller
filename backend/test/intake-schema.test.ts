import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectFileSchema,
  detectSchemaHeuristic,
  validateAndNormalizeIntake,
  DetectedRole,
} from '../src/engine/schema-detector';

describe('Intake & Schema Detection Engine', () => {
  const sampleRazorpayCsv = `payment_id,order_id,amount,currency,status,method,description,created_at,settled_at,fee,tax,settlement_id
pay_Test123,order_999,500.00,INR,captured,card,Invoice payment,2026-08-01,2026-08-01,10.00,1.80,set_001
pay_Test456,order_888,1200.00,INR,captured,upi,Subscription,2026-08-02,2026-08-02,24.00,4.32,set_002`;

  const sampleBankCsv = `txn_id,date,narration,credit,debit,balance,utr,mode
TXN10001,2026-08-01,RAZORPAY pay_Test123,488.20,0,50000.00,UTR99001,IMPS
TXN10002,2026-08-02,UPI-pay_Test456-TRANSFER,1171.68,0,51171.68,UTR99002,UPI`;

  const sampleLedgerCsv = `entry_id,invoice_id,expected_amount,received_amount,customer_name,due_date,status,payment_ref
LED-1001,INV-2026-001,500.00,488.20,Acme Corp,2026-08-01,settled,pay_Test123
LED-1002,INV-2026-002,1200.00,1171.68,Beta LLC,2026-08-02,settled,pay_Test456`;

  it('should accurately detect Razorpay schema with high confidence via heuristics', async () => {
    const result = await detectFileSchema('razorpay_export.csv', sampleRazorpayCsv);
    assert.equal(result.role, 'razorpay');
    assert.equal(result.detectedVia, 'heuristic');
    assert.ok(result.confidence >= 0.8, 'Confidence should be >= 0.8');
    assert.ok(result.rawHeaders.includes('payment_id'));
    assert.equal(result.mapping.payment_id, 'payment_id');
  });

  it('should accurately detect Bank Statement schema with high confidence via heuristics', async () => {
    const result = await detectFileSchema('hdfc_bank_statement.csv', sampleBankCsv);
    assert.equal(result.role, 'bank');
    assert.equal(result.detectedVia, 'heuristic');
    assert.ok(result.confidence >= 0.8, 'Confidence should be >= 0.8');
    assert.ok(result.rawHeaders.includes('narration'));
    assert.equal(result.mapping.txn_id, 'txn_id');
  });

  it('should accurately detect ERP Ledger schema with high confidence via heuristics', async () => {
    const result = await detectFileSchema('erp_general_ledger.csv', sampleLedgerCsv);
    assert.equal(result.role, 'ledger');
    assert.equal(result.detectedVia, 'heuristic');
    assert.ok(result.confidence >= 0.8, 'Confidence should be >= 0.8');
    assert.ok(result.rawHeaders.includes('invoice_id'));
    assert.equal(result.mapping.entry_id, 'entry_id');
  });

  it('should validate complete 3-role intake and produce normalized data records', async () => {
    const files = [
      { filename: 'file_a.csv', content: sampleRazorpayCsv },
      { filename: 'file_b.csv', content: sampleBankCsv },
      { filename: 'file_c.csv', content: sampleLedgerCsv },
    ];

    const validation = await validateAndNormalizeIntake(files);
    assert.equal(validation.valid, true);
    assert.equal(validation.missingRoles.length, 0);
    assert.ok(validation.normalizedData, 'Normalized data must be present');
    assert.equal(validation.normalizedData.razorpay.length, 2);
    assert.equal(validation.normalizedData.bank.length, 2);
    assert.equal(validation.normalizedData.ledger.length, 2);

    // Verify canonical fields
    assert.equal(validation.normalizedData.razorpay[0].payment_id, 'pay_Test123');
    assert.equal(validation.normalizedData.bank[0].credit, 488.2);
    assert.equal(validation.normalizedData.ledger[0].entry_id, 'LED-1001');
  });

  it('should flag missing roles when only 2 of 3 source systems are supplied', async () => {
    const files = [
      { filename: 'file_a.csv', content: sampleRazorpayCsv },
      { filename: 'file_b.csv', content: sampleBankCsv },
    ];

    const validation = await validateAndNormalizeIntake(files);
    assert.equal(validation.valid, false);
    assert.ok(validation.missingRoles.includes('ledger'));
    assert.match(validation.errorMessage || '', /Missing required financial dataset role\(s\): ledger/);
  });

  it('should support manual role overrides over automated heuristic detection', async () => {
    const files = [
      { filename: 'custom_file_1.csv', content: sampleBankCsv, explicitRole: 'bank' as DetectedRole },
      { filename: 'custom_file_2.csv', content: sampleRazorpayCsv, explicitRole: 'razorpay' as DetectedRole },
      { filename: 'custom_file_3.csv', content: sampleLedgerCsv, explicitRole: 'ledger' as DetectedRole },
    ];

    const validation = await validateAndNormalizeIntake(files);
    assert.equal(validation.valid, true);
    assert.equal(validation.detected[0].role, 'bank');
    assert.equal(validation.detected[1].role, 'razorpay');
    assert.equal(validation.detected[2].role, 'ledger');
  });

  it('should return unknown for non-financial or empty CSV headers', () => {
    const unknownHeaders = ['user_id', 'favorite_color', 'signup_timestamp'];
    const result = detectSchemaHeuristic('users.csv', unknownHeaders, [{ user_id: '1', favorite_color: 'blue' }]);
    assert.equal(result.role, 'unknown');
    assert.ok(result.confidence <= 0.2);
  });
});
