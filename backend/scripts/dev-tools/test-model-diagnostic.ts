import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const apiKey = process.env.GEMINI_API_KEY || '';
console.log('API Key present:', apiKey ? `${apiKey.slice(0, 6)}... (length ${apiKey.length})` : 'NO');

const ai = new GoogleGenerativeAI(apiKey);

async function testModel(name: string) {
  console.log(`\nTesting model "${name}"...`);
  const startTime = Date.now();
  try {
    const model = ai.getGenerativeModel({ model: name });
    const res = await model.generateContent('Say "pong" and nothing else');
    const elapsed = Date.now() - startTime;
    console.log(`[SUCCESS] "${name}" in ${elapsed}ms:`, JSON.stringify(res.response.text()));
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    console.log(`[FAILED] "${name}" in ${elapsed}ms:`);
    console.log('  Status:', err.status);
    console.log('  Message:', err.message);
    if (err.errorDetails) {
      console.log('  Details:', JSON.stringify(err.errorDetails, null, 2));
    }
  }
}

async function run() {
  await testModel('gemini-2.5-flash');
  await testModel('gemini-3.5-flash-lite');
  await testModel('gemini-1.5-flash');
  await testModel('gemini-2.0-flash');
}

run();
