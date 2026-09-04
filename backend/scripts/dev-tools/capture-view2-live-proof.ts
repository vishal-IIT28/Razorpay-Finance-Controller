import puppeteer from 'puppeteer';
import path from 'path';

async function captureView2LiveProof() {
  console.log('📸 Starting Live Capture of View 2 (Live SSE Progress & Ticker)...\n');

  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 1100, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[PAGE LOG]:', msg.text()));

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
  console.log('2️⃣ Executing 3-Pass Reconciliation...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const execBtn = btns.find((b) => b.textContent?.includes('Execute 3-Pass Reconciliation'));
    if (execBtn) execBtn.click();
  });

  // 3. Poll for Pass 3 ticker items
  console.log('3️⃣ Polling for real-time Pass 3 ticker entries...');
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const count = await page.evaluate(() => {
      // Return count of rendered ticker rows
      return document.querySelectorAll('.font-mono-numbers .flex-wrap').length;
    });
    console.log(`   [Second ${(i + 1) * 3}]: Ticker entries rendered = ${count}`);
    if (count >= 2) {
      console.log('🎯 Ticker populated with live Pass 3 AI events!');
      break;
    }
  }

  const streamingPath = path.join(artifactDir, 'view2_live_streaming_ticker.png');
  await page.screenshot({ path: streamingPath, fullPage: false });
  console.log(`✅ Saved View 2 live streaming ticker: ${streamingPath}`);

  // 4. Wait for completion banner
  console.log('4️⃣ Waiting for pipeline completion...');
  for (let j = 0; j < 30; j++) {
    await new Promise((r) => setTimeout(r, 4000));
    const isDone = await page.evaluate(() => {
      return document.body.innerText.includes('Reconciliation Complete') ||
        document.body.innerText.includes('Explore Dashboard & Audit Trail');
    });
    if (isDone) {
      console.log('🎯 Reconcile complete detected!');
      break;
    }
  }

  const completedPath = path.join(artifactDir, 'view2_reconcile_complete_banner.png');
  await page.screenshot({ path: completedPath, fullPage: false });
  console.log(`✅ Saved completed pipeline screenshot: ${completedPath}`);

  await browser.close();
}

captureView2LiveProof().catch(console.error);
