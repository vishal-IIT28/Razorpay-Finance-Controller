import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

async function captureNetworkFailureScreenshot() {
  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 950, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();

  // Intercept backend API requests and abort to simulate backend being offline / network drop
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().includes(':3001/api/detect-schema')) {
      console.log('🛑 Aborting request to /api/detect-schema (simulating backend offline/connection refused)...');
      req.abort('failed');
    } else {
      req.continue();
    }
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // Create temporary test CSV file
  const testCsvPath = path.join(__dirname, 'test_statement_sample.csv');
  fs.writeFileSync(testCsvPath, 'id,date,amount,narration\n1,2026-08-01,100,Test\n');

  console.log('📤 Uploading CSV with backend unreachable...');
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.uploadFile(testCsvPath);
  }

  // Wait 2 seconds for UI to catch error and render error banner
  await new Promise((r) => setTimeout(r, 2000));

  const savePath = path.join(artifactDir, 'view1_network_failure.png');
  await page.screenshot({ path: savePath, fullPage: false });
  console.log(`✅ Saved: ${savePath}`);

  fs.unlinkSync(testCsvPath);
  await browser.close();
}

captureNetworkFailureScreenshot().catch(console.error);
