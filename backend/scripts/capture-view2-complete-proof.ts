import puppeteer from 'puppeteer';
import path from 'path';

async function captureView2CompleteProof() {
  console.log('📸 Capturing View 2 Replay & Completion Banner...\n');

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

  // 1. Open Past Runs drawer
  console.log('1️⃣ Opening Past Runs Drawer...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const pastBtn = btns.find((b) => b.textContent?.includes('Past Runs'));
    if (pastBtn) pastBtn.click();
  });

  await page.waitForFunction(() => document.querySelectorAll('button').length > 5, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1200));

  // 2. Click "Inspect Run" on the latest completed run
  console.log('2️⃣ Clicking "Inspect Run" on latest completed run...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const inspectBtn = btns.find((b) => b.textContent?.includes('Inspect Run'));
    if (inspectBtn) inspectBtn.click();
  });

  // 3. Wait 2 seconds for SSE replay to populate View 2
  console.log('3️⃣ Waiting for SSE replay & Completion Banner to render...');
  await page.waitForFunction(
    () => {
      return document.body.innerText.includes('Reconciliation Complete') &&
        document.body.innerText.includes('Explore Dashboard & Audit Trail');
    },
    { timeout: 10000 }
  );

  await new Promise((r) => setTimeout(r, 1000));

  const completedPath = path.join(artifactDir, 'view2_reconcile_complete_banner.png');
  await page.screenshot({ path: completedPath, fullPage: false });
  console.log(`✅ Saved View 2 completion banner screenshot: ${completedPath}`);

  await browser.close();
}

captureView2CompleteProof().catch(console.error);
