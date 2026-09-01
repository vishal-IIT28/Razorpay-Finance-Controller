import puppeteer from 'puppeteer';
import path from 'path';

async function captureSavedRefusalCard() {
  console.log('📸 Capturing Saved Conversation Refusal Card...\n');

  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';
  const runId = '0f376348-ba00-4c04-99a6-f09c35a4967d';
  const conversationId = 'eecd6db9-3376-4fed-b9c3-b45d50b7964b';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1400, height: 1100, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[PAGE LOG]:', msg.text()));

  // 1. Seed sessionStorage before navigation so the panel immediately restores this session
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.evaluate((rId, cId) => {
    sessionStorage.setItem(`finreconcile_chat_${rId}`, cId);
  }, runId, conversationId);

  // 2. Open Past Runs drawer and open Dashboard for run 0f376348-ba00-4c04-99a6-f09c35a4967d
  console.log('1️⃣ Opening Past Runs Drawer -> Dashboard...');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent?.includes('Past Runs')), { timeout: 15000 });
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const pastBtn = btns.find((b) => b.textContent?.includes('Past Runs'));
    if (pastBtn) pastBtn.click();
  });

  await page.waitForFunction(() => document.body.innerText.includes('Historical Execution Runs') || document.body.innerText.includes('Dashboard'), { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1000));

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const dashBtn = btns.find((b) => b.textContent?.trim() === 'Dashboard');
    if (dashBtn) dashBtn.click();
  });

  // 3. Wait for Dashboard to render
  console.log('2️⃣ Waiting for Dashboard to render...');
  await page.waitForFunction(() => document.body.innerText.includes('Overall Match Rate'), { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1000));

  // 4. Click "Settlement Q&A Agent" button to open chat panel
  console.log('3️⃣ Opening Settlement Q&A Agent Panel...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const chatBtn = btns.find((b) => b.textContent?.includes('Settlement Q&A Agent'));
    if (chatBtn) chatBtn.click();
  });

  // 5. Wait for the refusal card to render
  console.log('4️⃣ Waiting for Agent Policy Refusal Card to render...');
  await page.waitForFunction(
    () => document.body.innerText.includes('Agent Policy: Request Declined / Out of Scope') || document.body.innerText.includes('AGENT POLICY: REQUEST DECLINED'),
    { timeout: 15000 }
  );
  await new Promise((r) => setTimeout(r, 1500));

  // 6. Screenshot Chat Panel with amber refusal card
  const screenshotPath = path.join(artifactDir, 'view4_chat_refusal_card_fixed.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`✅ Saved screenshot to: ${screenshotPath}`);

  await browser.close();
  console.log('\n🎉 Verified Refusal Card render successfully captured!');
}

captureSavedRefusalCard().catch(console.error);
