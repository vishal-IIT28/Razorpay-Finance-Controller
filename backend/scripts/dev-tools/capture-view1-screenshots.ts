import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

async function captureScreenshots() {
  console.log('📸 Launching Puppeteer to capture View 1 rendered states...\n');

  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();

  // 1. Capture Initial Empty Upload View
  console.log('🖼️ Capturing View 1 Initial State...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  const initialPath = path.join(artifactDir, 'view1_initial_state.png');
  await page.screenshot({ path: initialPath, fullPage: false });
  console.log(`✅ Saved: ${initialPath}`);

  // 2. Click "Load Holdout Dataset" and capture Classified AI Cards state
  console.log('🖼️ Clicking "Load Holdout Dataset" and waiting for AI Schema Classifier...');
  // Find button containing "Load Holdout Dataset"
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const text = await page.evaluate((el) => el.textContent, b);
    if (text && text.includes('Load Holdout Dataset')) {
      await b.click();
      break;
    }
  }

  // Wait for AI Schema Detection to complete
  await page.waitForFunction(
    () => {
      const cards = document.querySelectorAll('select');
      return cards.length >= 3;
    },
    { timeout: 15000 }
  );

  // Short wait for animations
  await new Promise((r) => setTimeout(r, 1000));

  const classifiedPath = path.join(artifactDir, 'view1_classified_benchmark.png');
  await page.screenshot({ path: classifiedPath, fullPage: false });
  console.log(`✅ Saved: ${classifiedPath}`);

  await browser.close();
  console.log('\n🎉 Screenshots successfully captured in artifact directory!');
}

captureScreenshots().catch(console.error);
