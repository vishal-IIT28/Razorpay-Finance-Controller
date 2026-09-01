import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = ai.getGenerativeModel({
  model: 'gemini-3.5-flash-lite',
  generationConfig: {
    temperature: 0,
    responseMimeType: 'application/json',
  },
});

async function run() {
  try {
    const prompt = 'Return a JSON object: {"matched": false, "reasoning": "test"}';
    const res = await model.generateContent(prompt);
    console.log('SUCCESS:', res.response.text());
  } catch (err: any) {
    console.log('ERROR STATUS:', err.status);
    console.log('ERROR MESSAGE:', err.message);
  }
}

run();
