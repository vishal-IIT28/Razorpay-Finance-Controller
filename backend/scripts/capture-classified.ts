import puppeteer from 'puppeteer';
import path from 'path';

async function captureClassifiedScreenshot() {
  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 1000, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  console.log('Clicking "Load Holdout Dataset" button...');
  // Click button containing "Load Holdout Dataset"
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const holdoutBtn = btns.find((b) => b.textContent?.includes('Load Holdout Dataset'));
    if (holdoutBtn) holdoutBtn.click();
  });

  // Wait 4 seconds for API fetch and schema classification
  await new Promise((r) => setTimeout(r, 4000));

  const classifiedPath = path.join(artifactDir, 'view1_classified_benchmark.png');
  await page.screenshot({ path: classifiedPath, fullPage: false });
  console.log(`✅ Saved: ${classifiedPath}`);

  await browser.close();
}

captureClassifiedScreenshot().catch(console.error);
