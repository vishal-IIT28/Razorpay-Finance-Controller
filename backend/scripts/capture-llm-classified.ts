import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

async function captureLlmClassification() {
  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 1050, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // Create temporary ambiguous file
  const ambiguousCsv = `tx_seq,event_timestamp,memo_details,funds_in,funds_out,running_bal
TXN-90812,2026-08-15,SETTLEMENT RZP-9912048,4500.00,0.00,120500.00
TXN-90813,2026-08-16,MONTHLY REBATE,120.00,0.00,120620.00`;

  const tempCsvPath = path.join(__dirname, 'unlabeled_finance_statement.csv');
  fs.writeFileSync(tempCsvPath, ambiguousCsv);

  console.log('Uploading ambiguous file to trigger Gemini LLM schema classifier...');
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.uploadFile(tempCsvPath);
  }

  // Wait 6 seconds for LLM schema detection to return
  await new Promise((r) => setTimeout(r, 6000));

  const llmCardPath = path.join(artifactDir, 'view1_llm_reasoning_card.png');
  await page.screenshot({ path: llmCardPath, fullPage: false });
  console.log(`✅ Saved: ${llmCardPath}`);

  fs.unlinkSync(tempCsvPath);
  await browser.close();
}

captureLlmClassification().catch(console.error);
