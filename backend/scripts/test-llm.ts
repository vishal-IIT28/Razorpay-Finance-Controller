import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env explicitly for testing if it exists
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY is not set in environment or .env file');
    process.exit(1);
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  console.log(`Testing Gemini API connectivity with model: ${modelName}...`);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent('Return the exact word "OK" if you can hear me.');
    const text = result.response.text();
    console.log(`✅ Success! Model responded with: "${text.trim()}"`);
  } catch (err: any) {
    console.error(`❌ API call failed: ${err.message}`);
    process.exit(1);
  }
}

run();
