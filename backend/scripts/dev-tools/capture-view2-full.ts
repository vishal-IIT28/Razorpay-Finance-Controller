import puppeteer from 'puppeteer';
import path from 'path';

async function captureView2Full() {
  console.log('📸 Capturing View 2 Live Stream Ticker with per-record events & Completion Banner...\n');

  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 1100, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 2000));

  // 1. Load benchmark dataset
  console.log('1️⃣ Loading holdout benchmark in UI...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const holdoutBtn = btns.find((b) => b.textContent?.includes('Load Holdout Dataset'));
    if (holdoutBtn) holdoutBtn.click();
  });

  await page.waitForFunction(() => document.querySelectorAll('select').length >= 3, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1000));

  // 2. Click Execute
  console.log('2️⃣ Executing 3-Pass Reconciliation...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const execBtn = btns.find((b) => b.textContent?.includes('Execute 3-Pass Reconciliation'));
    if (execBtn) execBtn.click();
  });

  // 3. Wait 45 seconds for several Pass 3 records to resolve
  console.log('3️⃣ Waiting 45s for Pass 3 AI per-record events to populate the ticker...');
  await new Promise((r) => setTimeout(r, 45000));

  const streamingPath = path.join(artifactDir, 'view2_live_streaming_ticker.png');
  await page.screenshot({ path: streamingPath, fullPage: false });
  console.log(`✅ Saved live streaming ticker screenshot: ${streamingPath}`);

  // 4. Wait for completion banner
  console.log('4️⃣ Waiting for pipeline completion (reconcile_complete)...');
  await page.waitForFunction(
    () => {
      return document.body.innerText.includes('Reconciliation Complete') ||
        document.body.innerText.includes('Explore Dashboard & Audit Trail');
    },
    { timeout: 120000 }
  );

  const completedPath = path.join(artifactDir, 'view2_reconcile_complete_banner.png');
  await page.screenshot({ path: completedPath, fullPage: false });
  console.log(`✅ Saved completed pipeline screenshot: ${completedPath}`);

  await browser.close();
}

captureView2Full().catch(console.error);
