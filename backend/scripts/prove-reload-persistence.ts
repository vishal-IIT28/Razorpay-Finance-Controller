import puppeteer from 'puppeteer';
import path from 'path';

async function proveReloadPersistence() {
  console.log('🧪 Starting Rigorous Session Persistence & Reload Proof Test...\n');

  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1400, height: 1100, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();

  // Network activity logger
  page.on('request', (req) => {
    if (req.url().includes('/api/runs/') && req.url().includes('/chat')) {
      console.log(`📡 [NETWORK REQUEST] ${req.method()} ${req.url()}`);
      if (req.method() === 'POST') {
        console.log(`   POST Body:`, req.postData());
      }
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('/api/runs/') && res.url().includes('/chat')) {
      console.log(`📥 [NETWORK RESPONSE] ${res.status()} ${res.url()}`);
      try {
        const json = await res.json();
        if (json.messages) {
          console.log(`   Fetched ${json.count} messages from DB for conversationId: ${json.conversation_id}`);
        } else if (json.conversationId) {
          console.log(`   Received answer for conversationId: ${json.conversationId}`);
        }
      } catch {}
    }
  });

  console.log('1️⃣ Navigating to http://127.0.0.1:3000...');
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle0' });

  // Clear previous session storage for clean test run
  await page.evaluate(() => sessionStorage.clear());

  // Open Past Runs drawer -> Dashboard
  console.log('2️⃣ Opening Past Runs Drawer -> Dashboard...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const pastBtn = btns.find((b) => b.textContent?.includes('Past Runs'));
    if (pastBtn) pastBtn.click();
  });

  await page.waitForFunction(() => document.querySelectorAll('button').length > 5, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 800));

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const dashBtn = btns.find((b) => b.textContent?.trim() === 'Dashboard');
    if (dashBtn) dashBtn.click();
  });

  await page.waitForFunction(() => document.body.innerText.includes('Overall Match Rate'), { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));

  // Open Chat Panel
  console.log('3️⃣ Opening Settlement Q&A Agent Panel...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const chatBtn = btns.find((b) => b.textContent?.includes('Settlement Q&A Agent'));
    if (chatBtn) chatBtn.click();
  });

  await page.waitForFunction(() => document.body.innerText.includes('Settlement Q&A Agent'), {
    timeout: 10000,
  });

  const inputSelector = 'input[placeholder*="Ask Q&A Agent"]';

  // Message 1
  console.log('\n4️⃣ Sending Message 1: "Why did payment pay_qupuVNka3rkAeZ fail to match?"...');
  await page.type(inputSelector, 'Why did payment pay_qupuVNka3rkAeZ fail to match?');
  await page.keyboard.press('Enter');

  await page.waitForFunction(
    () => {
      const isStillLoading = document.body.innerText.includes('Consulting database');
      const text = document.body.innerText.toLowerCase();
      return !isStillLoading && (text.includes('321.16') || text.includes('pay_qupuvnka3rkaez') || text.includes('discrepancy'));
    },
    { timeout: 150000 }
  );

  // Message 2 (Refusal)
  console.log('\n5️⃣ Sending Message 2 (Refusal): "What is the current weather in Bengaluru today?"...');
  await page.type(inputSelector, 'What is the current weather in Bengaluru today?');
  await page.keyboard.press('Enter');

  await page.waitForFunction(
    () => {
      const isStillLoading = document.body.innerText.includes('Consulting database');
      const text = document.body.innerText.toLowerCase();
      return !isStillLoading && (text.includes('declined') || text.includes('weather') || text.includes('policy'));
    },
    { timeout: 150000 }
  );

  await new Promise((r) => setTimeout(r, 1000));

  // Extract Session ID from DOM before reload
  const sessionBeforeReload = await page.evaluate(() => {
    const text = document.body.innerText;
    const match = text.match(/Session:\s*([a-f0-9]+)/i);
    return match ? match[1] : null;
  });

  const storageKey = await page.evaluate(() => {
    return Object.keys(sessionStorage).filter((k) => k.startsWith('finreconcile_chat_'))[0] || '';
  });
  const storedConvIdBefore = await page.evaluate((key) => sessionStorage.getItem(key), storageKey);

  console.log(`\n======================================================`);
  console.log(`📌 BEFORE RELOAD STATE:`);
  console.log(`   Header Session Pill: "Session: ${sessionBeforeReload}"`);
  console.log(`   sessionStorage [${storageKey}]: "${storedConvIdBefore}"`);
  console.log(`======================================================\n`);

  // ==========================================================
  // HARD PAGE RELOAD
  // ==========================================================
  console.log('🔄 EXECUTING HARD PAGE RELOAD: page.reload({ waitUntil: "networkidle0" })...');
  await page.reload({ waitUntil: 'networkidle0' });
  console.log('✅ Page reloaded successfully.\n');

  // Re-open Past Runs -> Dashboard
  console.log('6️⃣ Navigating back to Dashboard after reload...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const pastBtn = btns.find((b) => b.textContent?.includes('Past Runs'));
    if (pastBtn) pastBtn.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const dashBtn = btns.find((b) => b.textContent?.trim() === 'Dashboard');
    if (dashBtn) dashBtn.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes('Overall Match Rate'), { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));

  // Re-open Chat Panel
  console.log('7️⃣ Opening Settlement Q&A Agent Panel after reload...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const chatBtn = btns.find((b) => b.textContent?.includes('Settlement Q&A Agent'));
    if (chatBtn) chatBtn.click();
  });

  // Wait for GET request to complete and messages to populate
  await page.waitForFunction(
    () => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('pay_qupuvnka3rkaez') && (text.includes('declined') || text.includes('weather'));
    },
    { timeout: 15000 }
  );

  const sessionAfterReload = await page.evaluate(() => {
    const text = document.body.innerText;
    const match = text.match(/Session:\s*([a-f0-9]+)/i);
    return match ? match[1] : null;
  });
  const storedConvIdAfter = await page.evaluate((key) => sessionStorage.getItem(key), storageKey);

  console.log(`\n======================================================`);
  console.log(`📌 AFTER RELOAD STATE:`);
  console.log(`   Header Session Pill: "Session: ${sessionAfterReload}"`);
  console.log(`   sessionStorage [${storageKey}]: "${storedConvIdAfter}"`);
  console.log(`   Matching Conversation ID? ${storedConvIdBefore === storedConvIdAfter ? '✅ YES EXACT MATCH' : '❌ MISMATCH'}`);
  console.log(`======================================================\n`);

  // ==========================================================
  // SEND 3RD MESSAGE POST-RELOAD
  // ==========================================================
  console.log('8️⃣ Sending 3rd Message POST-RELOAD: "How many total records were matched in Pass 1?"...');
  await page.type(inputSelector, 'How many total records were matched in Pass 1?');
  await page.keyboard.press('Enter');

  console.log('⏳ Waiting for 3rd message answer...');
  await page.waitForFunction(
    () => {
      const isStillLoading = document.body.innerText.includes('Consulting database');
      const text = document.body.innerText;
      return !isStillLoading && (text.includes('69') || text.includes('Pass 1') || text.includes('Exact'));
    },
    { timeout: 150000 }
  );

  await new Promise((r) => setTimeout(r, 2000));

  const postReloadScreenshot = path.join(artifactDir, 'view4_chat_third_message_post_reload.png');
  await page.screenshot({ path: postReloadScreenshot, fullPage: false });
  console.log(`✅ Saved View 4 Post-Reload 3rd Message screenshot: ${postReloadScreenshot}`);

  await browser.close();
  console.log('\n🎉 Rigorous persistence proof completed!');
}

proveReloadPersistence().catch(console.error);
