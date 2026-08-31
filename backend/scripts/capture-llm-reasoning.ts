import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

async function captureLlmReasoningScreenshot() {
  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 1050, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  const ambiguousRzp = `col_seq,created_time,detail_desc,gross_val,net_val,platform_tax,fee_cut,ref_num
1,2026-08-10 10:14:00,Order payment for subscription,1000.00,976.40,3.60,20.00,pay_random101
2,2026-08-10 11:20:00,E-commerce purchase checkout,2500.00,2441.00,9.00,50.00,pay_random102`;

  const tempPath = path.join(__dirname, 'unlabeled_finance_export_1.csv');
  fs.writeFileSync(tempPath, ambiguousRzp);

  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.uploadFile(tempPath);
  }

  // Wait 7 seconds for LLM schema detection to complete
  await new Promise((r) => setTimeout(r, 7000));

  const savePath = path.join(artifactDir, 'view1_llm_reasoning_card.png');
  await page.screenshot({ path: savePath, fullPage: false });
  console.log(`✅ Saved: ${savePath}`);

  fs.unlinkSync(tempPath);
  await browser.close();
}

captureLlmReasoningScreenshot().catch(console.error);
