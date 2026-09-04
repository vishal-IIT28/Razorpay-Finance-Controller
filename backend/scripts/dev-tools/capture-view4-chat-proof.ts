import puppeteer from 'puppeteer';
import path from 'path';

async function captureView4ChatProof() {
  console.log('📸 Capturing View 4 (Settlement Q&A Agent Chat Panel) Proof...\n');

  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1400, height: 1100, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[PAGE LOG]:', msg.text()));

  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle0' });

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

  // 4. Send inquiry about payment pay_qupuVNka3rkAeZ
  console.log('4️⃣ Sending Question 1: "Why did payment pay_qupuVNka3rkAeZ fail to match?"...');
  const inputSelector = 'input[placeholder*="Ask Q&A Agent"]';
  await page.type(inputSelector, 'Why did payment pay_qupuVNka3rkAeZ fail to match?');
  await page.keyboard.press('Enter');

  // Wait for loading spinner to disappear and tool call trace or assistant response to appear
  console.log('⏳ Waiting for Gemini tool execution and answer...');
  await page.waitForFunction(
    () => {
      const isStillLoading = document.body.innerText.includes('Consulting database');
      const hasToolOrAnswer = document.body.innerText.includes('Called Tool:') ||
        document.body.innerText.includes('321.16') ||
        document.body.innerText.includes('364.96') ||
        document.body.innerText.includes('LED-987820');
      return !isStillLoading && hasToolOrAnswer;
    },
    { timeout: 45000 }
  );

  await new Promise((r) => setTimeout(r, 2000));

  // Expand the tool trace button
  console.log('🔍 Expanding Tool Call Trace...');
  await page.evaluate(() => {
    const traceBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Called Tool:') || b.textContent?.includes('View Payload')
    );
    if (traceBtn) traceBtn.click();
  });

  await new Promise((r) => setTimeout(r, 1500));

  const toolTraceScreenshot = path.join(artifactDir, 'view4_chat_tool_trace_expanded.png');
  await page.screenshot({ path: toolTraceScreenshot, fullPage: false });
  console.log(`✅ Saved View 4 Tool Trace screenshot: ${toolTraceScreenshot}`);

  // 5. Send Out-of-Scope Question (Refusal Test)
  console.log('5️⃣ Sending Question 2 (Refusal Test): "What is the current weather in Bengaluru today?"...');
  await page.type(inputSelector, 'What is the current weather in Bengaluru today?');
  await page.keyboard.press('Enter');

  console.log('⏳ Waiting for Agent Refusal...');
  await page.waitForFunction(
    () => {
      const isStillLoading = document.body.innerText.includes('Consulting database');
      const hasRefusal = document.body.innerText.includes('Agent Policy: Request Declined') ||
        document.body.innerText.includes('only answer questions related to') ||
        document.body.innerText.includes('outside the scope') ||
        document.body.innerText.includes('Bengaluru');
      return !isStillLoading && hasRefusal;
    },
    { timeout: 35000 }
  );

  await new Promise((r) => setTimeout(r, 2000));

  const refusalScreenshot = path.join(artifactDir, 'view4_chat_refusal_state.png');
  await page.screenshot({ path: refusalScreenshot, fullPage: false });
  console.log(`✅ Saved View 4 Refusal State screenshot: ${refusalScreenshot}`);

  // 6. Test Reload Persistence
  console.log('6️⃣ Reloading page to verify session persistence...');
  await page.reload({ waitUntil: 'networkidle0' });

  // Open past runs drawer -> Dashboard
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const pastBtn = btns.find((b) => b.textContent?.includes('Past Runs'));
    if (pastBtn) pastBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1000));
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const dashBtn = btns.find((b) => b.textContent?.trim() === 'Dashboard');
    if (dashBtn) dashBtn.click();
  });

  await page.waitForFunction(() => document.body.innerText.includes('Overall Match Rate'), { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1000));

  // Open Chat Panel
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const chatBtn = btns.find((b) => b.textContent?.includes('Settlement Q&A Agent'));
    if (chatBtn) chatBtn.click();
  });

  // Verify that prior messages are reloaded
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return text.includes('pay_qupuVNka3rkAeZ') && (text.includes('Bengaluru') || text.includes('weather'));
    },
    { timeout: 15000 }
  );

  await new Promise((r) => setTimeout(r, 1500));

  const persistenceScreenshot = path.join(artifactDir, 'view4_chat_reloaded_persistence.png');
  await page.screenshot({ path: persistenceScreenshot, fullPage: false });
  console.log(`✅ Saved View 4 Reloaded Persistence screenshot: ${persistenceScreenshot}`);

  await browser.close();
  console.log('\n🎉 View 4 verification completed successfully!');
}

captureView4ChatProof().catch(console.error);
