import puppeteer from 'puppeteer';
import path from 'path';

async function captureView2Completed() {
  console.log('📸 Capturing View 2 Completion Banner...\n');

  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 1100, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle0' });

  // Open Past Runs modal, click on the most recent completed run
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const pastBtn = btns.find((b) => b.textContent?.includes('Past Runs'));
    if (pastBtn) pastBtn.click();
  });

  await new Promise((r) => setTimeout(r, 1200));

  // Get the most recent run ID
  const recentRunId = await page.evaluate(() => {
    const runRows = document.querySelectorAll('.hover\\:border-slate-700');
    if (runRows.length > 0) {
      const idEl = runRows[0].querySelector('.font-mono-numbers');
      return idEl?.textContent?.trim() || null;
    }
    return null;
  });

  console.log(`Replaying SSE stream for completed run: ${recentRunId}...`);

  // Close modal and set active run to stream
  await page.evaluate((rId) => {
    // Inject LiveRunView via DOM state or directly trigger
    const closeBtn = document.querySelector('.bg-black\\/70 button');
    if (closeBtn) (closeBtn as HTMLElement).click();
  }, recentRunId);

  // Directly navigate or trigger execution if needed
  // Instead, let's load tuned dataset (which is fast: only 16 LLM records) and capture completion banner
  console.log('Loading tuned dataset and executing to capture completion banner...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const tunedBtn = btns.find((b) => b.textContent?.includes('Load Tuned Dataset'));
    if (tunedBtn) tunedBtn.click();
  });

  await page.waitForFunction(() => document.querySelectorAll('select').length >= 3, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1000));

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const execBtn = btns.find((b) => b.textContent?.includes('Execute 3-Pass Reconciliation'));
    if (execBtn) execBtn.click();
  });

  // Wait for completion banner
  console.log('Waiting for completion banner...');
  await page.waitForFunction(
    () => {
      return document.body.innerText.includes('Reconciliation Complete') &&
        document.body.innerText.includes('Explore Dashboard & Audit Trail');
    },
    { timeout: 120000 }
  );

  await new Promise((r) => setTimeout(r, 1000));

  const completedPath = path.join(artifactDir, 'view2_reconcile_complete_banner.png');
  await page.screenshot({ path: completedPath, fullPage: false });
  console.log(`✅ Saved View 2 completion banner screenshot: ${completedPath}`);

  await browser.close();
}

captureView2Completed().catch(console.error);
