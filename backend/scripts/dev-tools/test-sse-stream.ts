import fs from 'fs';
import path from 'path';
import http from 'http';

async function testSseStream() {
  console.log('📡 Testing SSE Live Progress Streaming against http://localhost:3001 ...\n');

  const razorpayPath = path.join(__dirname, '../../data/holdout/razorpay_payments.csv');
  const bankPath = path.join(__dirname, '../../data/holdout/bank_statement.csv');
  const ledgerPath = path.join(__dirname, '../../data/holdout/internal_ledger.csv');

  // Prepare multipart form data
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
  const rzpBuf = fs.readFileSync(razorpayPath);
  const bankBuf = fs.readFileSync(bankPath);
  const ledgerBuf = fs.readFileSync(ledgerPath);

  const buildPart = (name: string, filename: string, content: Buffer) => {
    return Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`),
      content,
      Buffer.from('\r\n'),
    ]);
  };

  const body = Buffer.concat([
    buildPart('razorpay', 'razorpay_payments.csv', rzpBuf),
    buildPart('bank', 'bank_statement.csv', bankBuf),
    buildPart('ledger', 'internal_ledger.csv', ledgerBuf),
    Buffer.from(`--${boundary}--\r\n`),
  ]);

  console.log('📤 Submitting 3 CSVs to POST /api/reconcile (Background mode)...');

  const intakeRes = await new Promise<{ run_id: string; stream_url: string }>((resolve, reject) => {
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
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (res.statusCode !== 202 && res.statusCode !== 200) {
              reject(new Error(`Intake failed (${res.statusCode}): ${raw}`));
            } else {
              resolve(parsed);
            }
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

  const runId = intakeRes.run_id;
  console.log(`✅ Pipeline initiated! Run ID: ${runId}`);
  console.log(`📡 Connecting to SSE Stream: http://localhost:3001/api/reconcile/${runId}/stream\n`);
  console.log('=== REAL-TIME SSE STREAM TRANSCRIPT ===');

  await new Promise<void>((resolve, reject) => {
    const sseReq = http.request(
      `http://localhost:3001/api/reconcile/${runId}/stream`,
      {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      },
      (res) => {
        let buffer = '';
        res.on('data', (chunk) => {
          const text = chunk.toString();
          process.stdout.write(text);
          buffer += text;
          if (text.includes('reconcile_complete') || text.includes('event: error')) {
            // Done
          }
        });
        res.on('end', () => {
          console.log('\n=== SSE STREAM FINISHED ===');
          resolve();
        });
      }
    );
    sseReq.on('error', reject);
    sseReq.end();
  });
}

testSseStream().catch(console.error);
