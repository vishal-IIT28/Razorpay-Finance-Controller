import puppeteer from 'puppeteer';
import path from 'path';

async function testUiRoleOverride() {
  console.log('🧪 Testing Browser UI Role Override Dropdown -> Network Submission...\n');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 1000, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();

  let capturedFormData: { filename: string; assignedRoleField: string }[] = [];

  // Intercept the browser's outgoing POST /api/reconcile request
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().includes('/api/reconcile') && req.method() === 'POST') {
      const postData = req.postData() || '';
      console.log('📡 Browser outgoing POST /api/reconcile detected!');

      // Parse multipart postData to extract fieldnames and filenames
      const parts = postData.split(/------WebKitFormBoundary|------formdata/);
      for (const part of parts) {
        const fieldMatch = part.match(/name="([^"]+)"(?:;\s*filename="([^"]+)")?/);
        if (fieldMatch) {
          const fieldName = fieldMatch[1];
          const filename = fieldMatch[2] || '';
          if (filename) {
            capturedFormData.push({ filename, assignedRoleField: fieldName });
          }
        }
      }
    }
    req.continue();
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Click "Load Holdout Dataset" to populate 3 files
  console.log('1️⃣ Loading Holdout Dataset into UI...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const holdoutBtn = btns.find((b) => b.textContent?.includes('Load Holdout Dataset'));
    if (holdoutBtn) holdoutBtn.click();
  });

  // Wait for 3 cards with dropdowns to appear
  await page.waitForFunction(() => document.querySelectorAll('select').length >= 3, {
    timeout: 10000,
  });

  console.log('2️⃣ Changing Dropdown in UI: swapping roles between bank_statement and internal_ledger...');

  // Change the dropdown values in the DOM
  await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    // Select 0: razorpay_payments.csv (leave as razorpay)
    // Select 1: bank_statement.csv (change to 'ledger')
    // Select 2: internal_ledger.csv (change to 'bank')
    if (selects[1]) {
      selects[1].value = 'ledger';
      selects[1].dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (selects[2]) {
      selects[2].value = 'bank';
      selects[2].dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  await new Promise((r) => setTimeout(r, 500));

  console.log('3️⃣ Clicking "Execute 3-Pass Reconciliation" CTA in UI...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const execBtn = btns.find((b) => b.textContent?.includes('Execute 3-Pass Reconciliation'));
    if (execBtn) execBtn.click();
  });

  // Wait 2 seconds for request to fire
  await new Promise((r) => setTimeout(r, 2000));

  console.log('\n📦 Inspecting Multipart Form Payload Dispatched by Browser:');
  for (const item of capturedFormData) {
    console.log(`   File: ${item.filename.padEnd(25)} -> Submitted under Form Field: \x1b[33m"${item.assignedRoleField}"\x1b[0m`);
  }

  const bankStatementSubmittedAsLedger = capturedFormData.some(
    (item) => item.filename.includes('bank_statement') && item.assignedRoleField === 'ledger'
  );
  const ledgerSubmittedAsBank = capturedFormData.some(
    (item) => item.filename.includes('internal_ledger') && item.assignedRoleField === 'bank'
  );

  console.log('\n🎯 Verification:');
  console.log(`   - bank_statement.csv submitted as "ledger": ${bankStatementSubmittedAsLedger ? '✅ YES' : '❌ NO'}`);
  console.log(`   - internal_ledger.csv submitted as "bank":   ${ledgerSubmittedAsBank ? '✅ YES' : '❌ NO'}`);

  const passed = bankStatementSubmittedAsLedger && ledgerSubmittedAsBank;
  console.log(`\n${passed ? '✅ SUCCESS: Browser dropdown React state directly controls the submitted multipart role fields!' : '❌ FAILURE'}`);

  await browser.close();
}

testUiRoleOverride().catch(console.error);
