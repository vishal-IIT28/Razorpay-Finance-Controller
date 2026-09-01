import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenerativeAI(apiKey);

async function main() {
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b', 'gemini-3.5-flash-lite'];
  for (const name of models) {
    try {
      const m = ai.getGenerativeModel({ model: name });
      const start = Date.now();
      const res = await m.generateContent('ping');
      console.log(`✅ SUCCESS [${name}] in ${Date.now() - start}ms: "${res.response.text().trim()}"`);
    } catch (e: any) {
      console.log(`❌ FAILED [${name}]:`, e.message?.slice(0, 100));
    }
  }
}

main();
