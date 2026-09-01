import puppeteer from 'puppeteer';
import path from 'path';

async function captureView2VerifiedBanner() {
  console.log('📸 Capturing View 2 Verified Completion Banner...\n');

  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1366, height: 1150, deviceScaleFactor: 2 },
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
  await new Promise((r) => setTimeout(r, 1000));

  // 2. Click "Telemetry" on the latest completed run
  console.log('2️⃣ Clicking "Telemetry" button on latest run...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const telemBtn = btns.find((b) => b.textContent?.trim() === 'Telemetry');
    if (telemBtn) telemBtn.click();
  });

  // 3. Wait for LiveRunView completion banner & header timer to render
  console.log('3️⃣ Waiting for LiveRunView banner & real duration...');
  await page.waitForFunction(
    () => {
      return document.body.innerText.includes('Reconciliation Complete') &&
        document.body.innerText.includes('406.7s') &&
        document.body.innerText.includes('06:47');
    },
    { timeout: 15000 }
  );

  await new Promise((r) => setTimeout(r, 1200));

  const verifiedPath = path.join(artifactDir, 'view2_verified_completion_banner.png');
  const standardPath = path.join(artifactDir, 'view2_reconcile_complete_banner.png');

  await page.screenshot({ path: verifiedPath, fullPage: false });
  await page.screenshot({ path: standardPath, fullPage: false });

  console.log(`✅ Saved View 2 verified completion banner screenshot to:\n   - ${verifiedPath}\n   - ${standardPath}`);

  await browser.close();
}

captureView2VerifiedBanner().catch(console.error);
