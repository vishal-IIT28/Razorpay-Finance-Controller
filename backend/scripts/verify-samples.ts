import http from 'http';
import { app } from '../src/index';

const server = app.listen(0, async () => {
  const addr: any = server.address();
  const port = addr.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const testCases = [
    { name: '1. GET /api/samples/holdout/razorpay_payments.csv', path: '/api/samples/holdout/razorpay_payments.csv' },
    { name: '2. GET /api/samples/holdout/ground_truth.json', path: '/api/samples/holdout/ground_truth.json' },
    { name: '3. GET /api/samples/holdout/..%2F..%2F.env', path: '/api/samples/holdout/..%2F..%2F.env' },
    { name: '4. GET /api/samples/holdout/../../.env', path: '/api/samples/holdout/../../.env' },
    { name: '5. GET /api/samples/../../etc/passwd', path: '/api/samples/../../etc/passwd' },
    { name: '6. GET /api/samples/default/bank_statement.csv', path: '/api/samples/default/bank_statement.csv' },
    { name: '7. GET /api/samples/production/anything.csv', path: '/api/samples/production/anything.csv' }
  ];

  for (const tc of testCases) {
    console.log(`\n========================================`);
    console.log(`TEST: ${tc.name}`);
    console.log(`REQUEST: GET ${tc.path}`);
    
    await new Promise<void>((resolve) => {
      const req = http.request({
        host: '127.0.0.1',
        port: port,
        path: tc.path,
        method: 'GET'
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          console.log(`STATUS: ${res.statusCode} ${res.statusMessage}`);
          console.log(`CONTENT-TYPE: ${res.headers['content-type']}`);
          const snippet = data.length > 200 ? `${data.slice(0, 160)}... [${data.length} bytes total]` : data;
          console.log(`BODY: ${snippet}`);
          resolve();
        });
      });
      req.on('error', (err) => {
        console.log(`ERROR: ${err.message}`);
        resolve();
      });
      req.end();
    });
  }

  server.close(() => process.exit(0));
});
