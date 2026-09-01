import puppeteer from 'puppeteer';
import path from 'path';

async function captureView3Screenshots() {
  console.log('📸 Capturing View 3 (Results Dashboard & Audit Trail) Screenshots...\n');

  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1366, height: 1150, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[BROWSER LOG]:', msg.text()));

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

  // 2. Click "Dashboard" on the latest completed run
  console.log('2️⃣ Clicking "Dashboard" button on latest run...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const dashBtn = btns.find((b) => b.textContent?.trim() === 'Dashboard');
    if (dashBtn) dashBtn.click();
  });

  // 3. Wait for Dashboard to render KPI cards and Matches table
  console.log('3️⃣ Waiting for DashboardView to render...');
  await page.waitForFunction(
    () => {
      return document.body.innerText.includes('Overall Match Rate') &&
        document.body.innerText.includes('Matched Records');
    },
    { timeout: 15000 }
  );

  await new Promise((r) => setTimeout(r, 1500));

  const matchesPath = path.join(artifactDir, 'view3_dashboard_kpis_and_matches.png');
  await page.screenshot({ path: matchesPath, fullPage: false });
  console.log(`✅ Saved View 3 Matches & KPIs screenshot: ${matchesPath}`);

  // 4. Click on Exceptions tab
  console.log('4️⃣ Switching to Exceptions & Discrepancies Tab...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const exTab = btns.find((b) => b.textContent?.includes('Exceptions & Discrepancies'));
    if (exTab) exTab.click();
  });

  await page.waitForFunction(
    () => {
      return document.body.innerText.includes('Discrepancy Reasoning / Diagnostic') &&
        document.body.innerText.includes('Recommended Finance-Ops Action');
    },
    { timeout: 10000 }
  );

  await new Promise((r) => setTimeout(r, 1500));

  const exceptionsPath = path.join(artifactDir, 'view3_dashboard_exceptions.png');
  await page.screenshot({ path: exceptionsPath, fullPage: false });
  console.log(`✅ Saved View 3 Exceptions screenshot: ${exceptionsPath}`);

  await browser.close();
}

captureView3Screenshots().catch(console.error);
