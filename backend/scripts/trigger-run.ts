import fs from 'fs';
import path from 'path';

async function run() {
  const formData = new FormData();
  
  const addFile = (name: string, filePath: string) => {
    const content = fs.readFileSync(filePath);
    const blob = new Blob([content], { type: 'text/csv' });
    formData.append(name, blob, path.basename(filePath));
  };

  const dataDir = path.join(__dirname, '../../data');
  addFile('razorpay', path.join(dataDir, 'razorpay_payments.csv'));
  addFile('bank', path.join(dataDir, 'bank_statement.csv'));
  addFile('ledger', path.join(dataDir, 'internal_ledger.csv'));

  console.log('Sending request to http://localhost:3001/api/reconcile...');
  const res = await fetch('http://localhost:3001/api/reconcile', {
    method: 'POST',
    body: formData as any,
  });

  const json = await res.json();
  console.log('Response:', JSON.stringify(json, null, 2));
}
run();
