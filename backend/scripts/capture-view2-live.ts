import puppeteer from 'puppeteer';
import path from 'path';

async function captureView2() {
  console.log('📸 Capturing View 2 Live Stream Telemetry & Ticker...\n');

  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 1100, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[PAGE LOG]:', msg.text()));
  page.on('pageerror', (err) => console.log('[PAGE ERROR]:', err));
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle0' });

  // 1. Load benchmark dataset
  console.log('1️⃣ Loading holdout benchmark in UI...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const holdoutBtn = btns.find((b) => b.textContent?.includes('Load Holdout Dataset'));
    if (holdoutBtn) holdoutBtn.click();
  });

  await page.waitForFunction(() => document.querySelectorAll('select').length >= 3, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1000));

  // 2. Click Execute 3-Pass Reconciliation
  console.log('2️⃣ Triggering 3-Pass Reconciliation execution...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const execBtn = btns.find((b) => b.textContent?.includes('Execute 3-Pass Reconciliation'));
    if (execBtn) execBtn.click();
  });

  // 3. Wait 15 seconds for Pass 1, Pass 2, and initial Pass 3 ticker items to populate
  console.log('3️⃣ Waiting 15s for Pass 3 AI resolution events to populate ticker...');
  await new Promise((r) => setTimeout(r, 15000));

  const streamingPath = path.join(artifactDir, 'view2_live_streaming_ticker.png');
  await page.screenshot({ path: streamingPath, fullPage: false });
  console.log(`✅ Saved live streaming ticker screenshot: ${streamingPath}`);

  await browser.close();
}

captureView2().catch(console.error);
