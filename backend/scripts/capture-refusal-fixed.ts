import puppeteer from 'puppeteer';
import path from 'path';

async function captureRefusalFixed() {
  console.log('📸 Capturing Refusal Card Fix Verification Screenshot...\n');

  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1400, height: 1100, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[PAGE LOG]:', msg.text()));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Open Past Runs drawer and open Dashboard for the latest run
  console.log('1️⃣ Opening Past Runs Drawer -> Dashboard...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const pastBtn = btns.find((b) => b.textContent?.includes('Past Runs'));
    if (pastBtn) pastBtn.click();
  });

  await page.waitForFunction(() => document.querySelectorAll('button').length > 5, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1000));

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const dashBtn = btns.find((b) => b.textContent?.trim() === 'Dashboard');
    if (dashBtn) dashBtn.click();
  });

  // 2. Wait for Dashboard to render
  console.log('2️⃣ Waiting for Dashboard to render...');
  await page.waitForFunction(() => document.body.innerText.includes('Overall Match Rate'), { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1000));

  // 3. Click "Settlement Q&A Agent" button to open chat panel
  console.log('3️⃣ Opening Settlement Q&A Agent Panel...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const chatBtn = btns.find((b) => b.textContent?.includes('Settlement Q&A Agent'));
    if (chatBtn) chatBtn.click();
  });

  await page.waitForFunction(() => document.body.innerText.includes('Financial Operations & Audit Assistant'), {
    timeout: 10000,
  });
  await new Promise((r) => setTimeout(r, 800));

  // 4. Send weather inquiry
  console.log('4️⃣ Sending Out-of-Scope Question: "What is the weather today?"...');
  const inputSelector = 'input[placeholder*="Ask Q&A Agent"]';
  await page.type(inputSelector, 'What is the weather today in Bangalore?');
  await page.keyboard.press('Enter');

  // 5. Wait for refusal card to render with amber shield
  console.log('5️⃣ Waiting for Agent Policy Refusal Card to render...');
  await page.waitForFunction(
    () => document.body.innerText.includes('Agent Policy: Request Declined / Out of Scope') || document.body.innerText.includes('AGENT POLICY: REQUEST DECLINED'),
    { timeout: 90000 }
  );
  await new Promise((r) => setTimeout(r, 1500));

  // 6. Screenshot Chat Panel with amber refusal card
  const screenshotPath = path.join(artifactDir, 'view4_chat_refusal_card_fixed.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`✅ Saved screenshot to: ${screenshotPath}`);

  await browser.close();
  console.log('\n🎉 Refusal Card test complete!');
}

captureRefusalFixed().catch(console.error);
