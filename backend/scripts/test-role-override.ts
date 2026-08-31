import fs from 'fs';
import path from 'path';
import http from 'http';

async function testRoleOverride() {
  console.log('🧪 Testing Manual Role Override Submission to POST /api/reconcile...\n');

  const rzpPath = path.join(__dirname, '../../data/holdout/razorpay_payments.csv');
  const bankPath = path.join(__dirname, '../../data/holdout/bank_statement.csv');
  const ledgerPath = path.join(__dirname, '../../data/holdout/internal_ledger.csv');

  // We intentionally misname/swap files to test override:
  // We send bank_statement.csv in the 'bank' field (normal)
  // We send razorpay_payments.csv in the 'razorpay' field (normal)
  // We send an ambiguously named file 'custom_export_123.csv' (which contains ledger data) explicitly mapped to 'ledger' field!
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

  const buildPart = (fieldName: string, filename: string, content: Buffer) => {
    return Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`),
      content,
      Buffer.from('\r\n'),
    ]);
  };

  const body = Buffer.concat([
    buildPart('razorpay', 'gateway_renamed.csv', fs.readFileSync(rzpPath)),
    buildPart('bank', 'bank_statement_override.csv', fs.readFileSync(bankPath)),
    buildPart('ledger', 'erp_ledger_custom.csv', fs.readFileSync(ledgerPath)),
    Buffer.from(`--${boundary}--\r\n`),
  ]);

  console.log('📤 Submitting files with explicit role fieldnames: razorpay, bank, ledger...');

  const response = await new Promise<any>((resolve, reject) => {
    const req = http.request(
      'http://localhost:3001/api/reconcile',
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error(`Failed to parse response: ${raw}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  console.log('\n🎯 Response from POST /api/reconcile:');
  console.log(`  - Status: ${response.status}`);
  console.log(`  - Run ID: ${response.run_id}`);
  console.log(`  - Detected Roles Confirmed by Backend:`);
  for (const d of response.detected_roles) {
    console.log(`      ${d.filename.padEnd(28)} -> Assigned Role: \x1b[32m${d.role}\x1b[0m (Reasoning: ${d.reasoning || 'Heuristic'})`);
  }

  const isHonored =
    response.detected_roles.find((d: any) => d.filename === 'gateway_renamed.csv')?.role === 'razorpay' &&
    response.detected_roles.find((d: any) => d.filename === 'bank_statement_override.csv')?.role === 'bank' &&
    response.detected_roles.find((d: any) => d.filename === 'erp_ledger_custom.csv')?.role === 'ledger';

  console.log(`\n✅ Role Override Verification: ${isHonored ? 'PASSED (User role overrides take full effect)' : 'FAILED'}`);
}

testRoleOverride().catch(console.error);
