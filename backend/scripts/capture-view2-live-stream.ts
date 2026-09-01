import puppeteer from 'puppeteer';
import path from 'path';

async function captureView2LiveStream() {
  console.log('📸 Launching Puppeteer to capture View 2 Live SSE Stream rendered states...\n');

  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 1050, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Load benchmark dataset
  console.log('1️⃣ Loading benchmark dataset into UI...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const holdoutBtn = btns.find((b) => b.textContent?.includes('Load Holdout Dataset'));
    if (holdoutBtn) holdoutBtn.click();
  });

  await page.waitForFunction(() => document.querySelectorAll('select').length >= 3, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1000));

  // 2. Click Execute 3-Pass Reconciliation
  console.log('2️⃣ Triggering reconciliation execution (transition to View 2)...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const execBtn = btns.find((b) => b.textContent?.includes('Execute 3-Pass Reconciliation'));
    if (execBtn) execBtn.click();
  });

  // 3. Wait for View 2 live ticker to receive at least 3 Pass 3 progress events
  console.log('3️⃣ Waiting for live SSE Pass 3 progress ticker items to stream in...');
  await page.waitForFunction(
    () => {
      const tickerEntries = document.querySelectorAll('.font-mono-numbers');
      return tickerEntries.length > 5;
    },
    { timeout: 30000 }
  );

  // Wait 10 seconds into the LLM stream to capture active ticker items
  await new Promise((r) => setTimeout(r, 10000));

  const streamingPath = path.join(artifactDir, 'view2_live_streaming_ticker.png');
  await page.screenshot({ path: streamingPath, fullPage: false });
  console.log(`✅ Saved mid-stream ticker screenshot: ${streamingPath}`);

  // 4. Wait for reconciliation completion
  console.log('4️⃣ Waiting for pipeline completion (reconcile_complete event)...');
  await page.waitForFunction(
    () => {
      const completeBanner = document.body.innerText.includes('Reconciliation Complete');
      return completeBanner;
    },
    { timeout: 180000 }
  );

  const completedPath = path.join(artifactDir, 'view2_reconcile_complete_banner.png');
  await page.screenshot({ path: completedPath, fullPage: false });
  console.log(`✅ Saved completed pipeline screenshot: ${completedPath}`);

  await browser.close();
}

captureView2LiveStream().catch(console.error);
