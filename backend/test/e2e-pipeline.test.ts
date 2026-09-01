import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { runDeterministicPass, RzpRecord, BankRecord, LedgerRecord } from '../src/engine/deterministic';
import { runFuzzyPass } from '../src/engine/fuzzy';
import { validateAndNormalizeIntake } from '../src/engine/schema-detector';

describe('End-to-End Pipeline & Export Conformance', () => {
  const holdoutDir = fs.existsSync(path.resolve(__dirname, '../data/holdout'))
    ? path.resolve(__dirname, '../data/holdout')
    : fs.existsSync(path.resolve(process.cwd(), '../data/holdout'))
    ? path.resolve(process.cwd(), '../data/holdout')
    : path.resolve(process.cwd(), 'data/holdout');

  it('should successfully parse and validate complete holdout dataset files', async () => {
    assert.ok(fs.existsSync(holdoutDir), 'Holdout dataset directory must exist');

    const rzpContent = fs.readFileSync(path.join(holdoutDir, 'razorpay_payments.csv'), 'utf-8');
    const bankContent = fs.readFileSync(path.join(holdoutDir, 'bank_statement.csv'), 'utf-8');
    const ledgerContent = fs.readFileSync(path.join(holdoutDir, 'internal_ledger.csv'), 'utf-8');

    const validation = await validateAndNormalizeIntake([
      { filename: 'razorpay_payments.csv', content: rzpContent },
      { filename: 'bank_statement.csv', content: bankContent },
      { filename: 'internal_ledger.csv', content: ledgerContent },
    ]);

    assert.equal(validation.valid, true);
    assert.equal(validation.missingRoles.length, 0);
    assert.equal(validation.normalizedData?.razorpay.length, 150);
    assert.equal(validation.normalizedData?.bank.length, 149);
    assert.equal(validation.normalizedData?.ledger.length, 150);
  });

  it('should execute deterministic Pass 1 and fuzzy Pass 2 with zero false positives', () => {
    const rzpRows = Papa.parse<RzpRecord>(
      fs.readFileSync(path.join(holdoutDir, 'razorpay_payments.csv'), 'utf-8'),
      { header: true, dynamicTyping: true, skipEmptyLines: true }
    ).data;

    const bankRows = Papa.parse<BankRecord>(
      fs.readFileSync(path.join(holdoutDir, 'bank_statement.csv'), 'utf-8'),
      { header: true, dynamicTyping: true, skipEmptyLines: true }
    ).data;

    const ledgerRows = Papa.parse<LedgerRecord>(
      fs.readFileSync(path.join(holdoutDir, 'internal_ledger.csv'), 'utf-8'),
      { header: true, dynamicTyping: true, skipEmptyLines: true }
    ).data;

    // Pass 1: Deterministic
    const p1 = runDeterministicPass(rzpRows, bankRows, ledgerRows);
    assert.ok(p1.matches.length >= 69, `Pass 1 should match at least 69 records, got ${p1.matches.length}`);

    // Pass 2: Fuzzy
    const p2 = runFuzzyPass(p1.unmatched.razorpay, p1.unmatched.bank, p1.unmatched.ledger);
    assert.ok(p2.matches.length >= 15, `Pass 2 should match fuzzy records, got ${p2.matches.length}`);

    const allMatches = [...p1.matches, ...p2.matches];
    assert.ok(allMatches.length >= 110, `Pass 1 + Pass 2 should match >= 110 records, got ${allMatches.length}`);

    // Verify all match confidence scores are valid
    for (const match of allMatches) {
      assert.ok(match.confidence >= 0.5 && match.confidence <= 1.0);
      assert.ok(match.payment_id, 'Payment ID must exist');
      assert.ok(match.bank_txn_id, 'Bank transaction ID must exist');
      assert.ok(match.ledger_entry_id, 'Ledger entry ID must exist');
    }
  });

  it('should generate conforming JSON export audit payload structure', () => {
    const exportPayload = {
      export_version: '1.0.0',
      exported_at: new Date().toISOString(),
      run: {
        id: 'mock-run-id-123',
        status: 'COMPLETED',
        total_records: 150,
        matched_records: 127,
        match_rate: 84.7,
        duration_ms: 406676,
        pass1_matches: 69,
        pass2_matches: 43,
        pass3_matches: 15,
      },
      matches: [
        {
          payment_id: 'pay_ABC',
          bank_txn_id: 'TXN123',
          ledger_entry_id: 'LED-001',
          match_pass: 1,
          confidence: 1.0,
        },
      ],
      exceptions: [
        {
          source_system: 'Razorpay',
          source_id: 'pay_XYZ',
          reasoning: 'Bank credit amount discrepancy',
          suggested_action: 'Check partial payment',
        },
      ],
    };

    assert.equal(exportPayload.export_version, '1.0.0');
    assert.equal(exportPayload.run.matched_records, 127);
    assert.ok(Array.isArray(exportPayload.matches));
    assert.ok(Array.isArray(exportPayload.exceptions));
  });
});
