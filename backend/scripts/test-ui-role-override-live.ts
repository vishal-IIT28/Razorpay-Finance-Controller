import puppeteer from 'puppeteer';

async function testUiRoleOverrideLive() {
  console.log('🧪 Testing Real UI Dropdown Override -> Live Execution & Backend Log...\n');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 1000, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();

  let reconcileApiResponse: any = null;

  page.on('response', async (res) => {
    if (res.url().includes('/api/reconcile') && res.request().method() === 'POST') {
      try {
        reconcileApiResponse = await res.json();
      } catch (e) {}
    }
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Click "Load Holdout Dataset"
  console.log('1️⃣ Loading Holdout Dataset into UI...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const holdoutBtn = btns.find((b) => b.textContent?.includes('Load Holdout Dataset'));
    if (holdoutBtn) holdoutBtn.click();
  });

  // Wait for 3 select elements
  await page.waitForFunction(() => document.querySelectorAll('select').length >= 3, { timeout: 10000 });

  // 2. Selectively change dropdowns in UI using Puppeteer's native select method
  console.log('2️⃣ In UI: Changing bank_statement.csv dropdown to "ledger" and internal_ledger.csv dropdown to "bank"...');
  const selects = await page.$$('select');
  if (selects[1]) await selects[1].select('ledger');
  if (selects[2]) await selects[2].select('bank');

  await new Promise((r) => setTimeout(r, 600));

  // 3. Click Execute CTA
  console.log('3️⃣ Clicking "Execute 3-Pass Reconciliation" in UI...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const execBtn = btns.find((b) => b.textContent?.includes('Execute 3-Pass Reconciliation'));
    if (execBtn) execBtn.click();
  });

  // Wait for response
  for (let i = 0; i < 20; i++) {
    if (reconcileApiResponse) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log('\n🎯 Response received by browser from POST /api/reconcile:');
  console.log(`   - Status: ${reconcileApiResponse?.status}`);
  console.log(`   - Run ID: ${reconcileApiResponse?.run_id}`);
  console.log(`   - Backend Assigned Roles:`);
  for (const item of reconcileApiResponse?.detected_roles || []) {
    console.log(`       ${item.filename.padEnd(28)} -> \x1b[32m${item.role}\x1b[0m (Reasoning: ${item.reasoning || 'Heuristic'})`);
  }

  const bankRole = reconcileApiResponse?.detected_roles?.find((r: any) => r.filename === 'bank_statement.csv')?.role;
  const ledgerRole = reconcileApiResponse?.detected_roles?.find((r: any) => r.filename === 'internal_ledger.csv')?.role;

  console.log(`\n📋 Verification:`);
  console.log(`   - bank_statement.csv was submitted & processed as: \x1b[33m${bankRole}\x1b[0m (Expected: ledger)`);
  console.log(`   - internal_ledger.csv was submitted & processed as: \x1b[33m${ledgerRole}\x1b[0m (Expected: bank)`);

  const passed = bankRole === 'ledger' && ledgerRole === 'bank';
  console.log(`\n${passed ? '✅ SUCCESS: The UI dropdown selection directly governed backend role processing!' : '❌ FAILED'}`);

  await browser.close();
}

testUiRoleOverrideLive().catch(console.error);
