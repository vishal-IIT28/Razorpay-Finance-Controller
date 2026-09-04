import puppeteer from 'puppeteer';
import path from 'path';

async function captureReplay() {
  const artifactDir = 'C:\\Users\\visha\\.gemini\\antigravity\\brain\\073bdb71-62ee-40a0-adbe-6217adbc1df8';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 1100, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  page.on('console', (m) => console.log('[LOG]:', m.text()));
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle0' });

  // 1. Fetch the latest completed run ID from GET /api/runs
  const latestRunId = await page.evaluate(async () => {
    const res = await fetch('http://127.0.0.1:3001/api/runs');
    const data = await res.json();
    const completed = data.find((r: any) => r.status === 'completed');
    return completed?.id || null;
  });

  console.log(`Latest completed run ID: ${latestRunId}`);

  // 2. Open EventSource directly to test replay events in page
  await page.evaluate(async (rId) => {
    const sse = new EventSource(`http://127.0.0.1:3001/api/reconcile/${rId}/stream`);
    sse.addEventListener('reconcile_complete', (e) => {
      console.log('SSE REPLAY RECEIVED reconcile_complete:', e.data);
    });
  }, latestRunId);

  await new Promise((r) => setTimeout(r, 2000));
  await browser.close();
}

captureReplay().catch(console.error);
