import puppeteer from 'puppeteer';
import path from 'path';

async function captureView2Ticker() {
  console.log('📸 Capturing View 2 live ticker with per-record items...\n');

  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 1100, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
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

  // 3. Poll every 3 seconds for ticker items to appear
  console.log('3️⃣ Polling for Pass 3 AI per-record events in ticker...');
  let hasItems = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    hasItems = await page.evaluate(() => {
      // Look for reasoning quotes or matched badges inside ticker
      return document.querySelectorAll('.font-mono-numbers').length > 5 &&
        (document.body.innerText.includes('MATCHED') || document.body.innerText.includes('EXCEPTION'));
    });
    console.log(`   [Poll ${i + 1}]: Has Pass 3 items in ticker: ${hasItems}`);
    if (hasItems) {
      // Wait another 4 seconds for a few more records to stream in
      await new Promise((r) => setTimeout(r, 4000));
      break;
    }
  }

  const streamingPath = path.join(artifactDir, 'view2_live_streaming_ticker.png');
  await page.screenshot({ path: streamingPath, fullPage: false });
  console.log(`✅ Saved live streaming ticker screenshot: ${streamingPath}`);

  // 4. Wait for completion banner
  console.log('4️⃣ Waiting for pipeline completion banner...');
  for (let j = 0; j < 30; j++) {
    await new Promise((r) => setTimeout(r, 4000));
    const isDone = await page.evaluate(() => {
      return document.body.innerText.includes('Reconciliation Complete') ||
        document.body.innerText.includes('Explore Dashboard & Audit Trail');
    });
    if (isDone) {
      console.log('   Pipeline complete detected!');
      break;
    }
  }

  const completedPath = path.join(artifactDir, 'view2_reconcile_complete_banner.png');
  await page.screenshot({ path: completedPath, fullPage: false });
  console.log(`✅ Saved completed pipeline screenshot: ${completedPath}`);

  await browser.close();
}

captureView2Ticker().catch(console.error);
