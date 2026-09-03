import fs from 'fs';
import path from 'path';
import http from 'http';
import { app } from '../src/index';
import { executeTool } from '../src/engine/chat-agent';

async function main() {
  const server = app.listen(0);
  const addr: any = server.address();
  const port = addr.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`Server started on ${baseUrl}`);

  const holdoutDir = path.resolve(__dirname, '../../data/holdout');
  const rzpCsv = fs.readFileSync(path.join(holdoutDir, 'razorpay_payments.csv'));
  const bankCsv = fs.readFileSync(path.join(holdoutDir, 'bank_statement.csv'));
  const ledgerCsv = fs.readFileSync(path.join(holdoutDir, 'internal_ledger.csv'));

  // Helper for multipart/form-data upload
  async function uploadReconcile(datasetLabel?: string) {
    const boundary = `----WebKitFormBoundary${Date.now().toString(36)}`;
    const chunks: Buffer[] = [];

    function addFile(fieldname: string, filename: string, content: Buffer) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldname}"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`));
      chunks.push(content);
      chunks.push(Buffer.from('\r\n'));
    }

    addFile('razorpay', 'razorpay_payments.csv', rzpCsv);
    addFile('bank', 'bank_statement.csv', bankCsv);
    addFile('ledger', 'internal_ledger.csv', ledgerCsv);

    if (datasetLabel) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="dataset_label"\r\n\r\n${datasetLabel}\r\n`));
    }

    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    const bodyBuffer = Buffer.concat(chunks);

    const res = await fetch(`${baseUrl}/api/reconcile?sync=true`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyBuffer,
    });

    return res.json();
  }

  // --- Step A: Run WITH dataset_label = 'holdout' ---
  console.log('\n======================================================');
  console.log('STEP A: Triggering Reconciliation WITH dataset_label = "holdout"...');
  const resultA = await uploadReconcile('holdout');
  const runAId = resultA.run_id;
  console.log(`Run A ID: ${runAId}`);

  console.log('\nFetching GET /api/runs/' + runAId + ' ...');
  const runADetailsRes = await fetch(`${baseUrl}/api/runs/${runAId}`);
  const runADetails = await runADetailsRes.json();
  console.log('Run A Details Response:');
  console.log(JSON.stringify(runADetails, null, 2));

  // --- Step B: Run WITHOUT dataset_label ---
  console.log('\n======================================================');
  console.log('STEP B: Triggering Reconciliation WITHOUT dataset_label (Unlabeled user upload)...');
  const resultB = await uploadReconcile();
  const runBId = resultB.run_id;
  console.log(`Run B ID: ${runBId}`);

  console.log('\nFetching GET /api/runs/' + runBId + ' ...');
  const runBDetailsRes = await fetch(`${baseUrl}/api/runs/${runBId}`);
  const runBDetails = await runBDetailsRes.json();
  console.log('Run B Details Response:');
  console.log(JSON.stringify(runBDetails, null, 2));

  console.log('\nChecking executeTool("getRunSummary") for Run B:');
  const summaryToolB = await executeTool('getRunSummary', { runId: runBId });
  console.log(JSON.stringify(summaryToolB, null, 2));

  // --- Step C: Chat Agent Query for Run A ---
  console.log('\n======================================================');
  console.log('STEP D1: Asking Chat Agent for precision on Labeled Run A (' + runAId + ')...');
  const chatResA = await fetch(`${baseUrl}/api/runs/${runAId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: "What is the precision and recall on this reconciliation run?" }),
  });
  const chatDataA = await chatResA.json();
  console.log('\n💬 Agent Response for Run A:');
  console.log(chatDataA.answer);
  console.log('Tools Invoked:', JSON.stringify(chatDataA.toolCalls?.map((t: any) => ({ tool: t.tool, args: t.args }))));

  // --- Step D: Chat Agent Query for Run B ---
  console.log('\n======================================================');
  console.log('STEP D2: Asking Chat Agent for precision on Unlabeled Run B (' + runBId + ')...');
  const chatResB = await fetch(`${baseUrl}/api/runs/${runBId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: "What is the precision and recall on this reconciliation run?" }),
  });
  const chatDataB = await chatResB.json();
  console.log('\n💬 Agent Response for Run B:');
  console.log(chatDataB.answer);
  console.log('Tools Invoked:', JSON.stringify(chatDataB.toolCalls?.map((t: any) => ({ tool: t.tool, args: t.args }))));

  server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Error in verification:', err);
  process.exit(1);
});
