import puppeteer from 'puppeteer';

async function debugView2() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 1050, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[PAGE LOG]:', msg.text()));
  page.on('pageerror', (err) => console.log('[PAGE ERROR]:', err));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // 1. Load benchmark
  console.log('1. Loading holdout benchmark...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const holdoutBtn = btns.find((b) => b.textContent?.includes('Load Holdout Dataset'));
    if (holdoutBtn) holdoutBtn.click();
  });

  await page.waitForFunction(() => document.querySelectorAll('select').length >= 3, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1000));

  // 2. Click Execute
  console.log('2. Clicking Execute 3-Pass Reconciliation...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const execBtn = btns.find((b) => b.textContent?.includes('Execute 3-Pass Reconciliation'));
    if (execBtn) execBtn.click();
  });

  // Monitor for 10 seconds
  for (let i = 1; i <= 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const info = await page.evaluate(() => {
      return {
        bodyText: document.body.innerText.slice(0, 300),
      };
    });
    console.log(`[Second ${i}]:`, info.bodyText.replace(/\n+/g, ' '));
  }

  await browser.close();
}

debugView2().catch(console.error);
