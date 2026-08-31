import fs from 'fs';
import path from 'path';
import { detectFileSchema, validateAndNormalizeUploads } from '../src/engine/schema-detector';

async function testSchemaIntake() {
  console.log('🔍 Testing Schema Detection & Intake on data/ & data/holdout/...\n');

  const testSets = [
    {
      name: 'Tuned Dataset (Standard names)',
      dir: path.join(__dirname, '../../data'),
      files: ['razorpay_payments.csv', 'bank_statement.csv', 'internal_ledger.csv'],
    },
    {
      name: 'Holdout Dataset (Standard names)',
      dir: path.join(__dirname, '../../data/holdout'),
      files: ['razorpay_payments.csv', 'bank_statement.csv', 'internal_ledger.csv'],
    },
    {
      name: 'Arbitrary Filenames & Out-of-Order Uploads',
      dir: path.join(__dirname, '../../data'),
      filesMapping: [
        { filename: 'random_export_august_2026.csv', source: 'bank_statement.csv' },
        { filename: 'erp_journal_dump_final.csv', source: 'internal_ledger.csv' },
        { filename: 'gateway_transactions_v2.csv', source: 'razorpay_payments.csv' },
      ],
    },
    {
      name: 'Incomplete Dataset (Missing Bank Statement)',
      dir: path.join(__dirname, '../../data'),
      files: ['razorpay_payments.csv', 'internal_ledger.csv'],
    },
  ];

  for (const set of testSets) {
    console.log(`================================================================================`);
    console.log(`📁 Test Case: ${set.name}`);

    let fileList: Array<{ filename: string; content: string }> = [];

    if (set.filesMapping) {
      fileList = set.filesMapping.map((f) => ({
        filename: f.filename,
        content: fs.readFileSync(path.join(set.dir, f.source), 'utf-8'),
      }));
    } else if (set.files) {
      fileList = set.files.map((f) => ({
        filename: f,
        content: fs.readFileSync(path.join(set.dir, f), 'utf-8'),
      }));
    }

    const validation = await validateAndNormalizeUploads(fileList);

    console.log(`Validation Valid: ${validation.valid ? '✅ Valid' : '❌ Invalid'}`);
    if (validation.missingRoles.length > 0) {
      console.log(`Missing Roles: ${validation.missingRoles.join(', ')}`);
      console.log(`Error Message: ${validation.errorMessage}`);
    }

    console.log(`Detected Roles:`);
    for (const d of validation.detected) {
      console.log(`  - ${d.filename.padEnd(32)} -> Role: \x1b[32m${d.role.padEnd(10)}\x1b[0m | Conf: ${d.confidence} | Method: ${d.detectedVia}`);
    }

    if (validation.valid && validation.normalizedData) {
      console.log(`Normalized Records: Razorpay: ${validation.normalizedData.razorpay.length}, Bank: ${validation.normalizedData.bank.length}, Ledger: ${validation.normalizedData.ledger.length}`);
    }
    console.log();
  }
}

testSchemaIntake().catch(console.error);
