import http from 'http';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: [path.join(__dirname, '../.env'), path.join(__dirname, '../../.env')] });

async function postJson(url: string, body: Record<string, any>): Promise<any> {
  const urlObj = new URL(url);
  const data = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error(`Failed parsing JSON: ${raw}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getJson(url: string): Promise<any> {
  const urlObj = new URL(url);
  return new Promise((resolve, reject) => {
    http.get(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error(`Failed parsing JSON: ${raw}`));
          }
        });
      }
    ).on('error', reject);
  });
}

async function testChatRoundtrip() {
  console.log('💬 Testing Chat Persistence Multi-Turn Round-Trip via REST Endpoints...\n');

  // 1. Get latest completed run
  const runsRes = await getJson('http://localhost:3001/api/runs/a1753489-3966-4b1c-91cf-1f7f6d219ece');
  const runId = runsRes.run_id;
  console.log(`🎯 Targeting Run ID: ${runId}`);

  // 2. Send Message 1
  console.log('\n--- Sending Message 1: "What was the overall match rate for this run?" ---');
  const res1 = await postJson(`http://localhost:3001/api/runs/${runId}/chat`, {
    message: 'What was the overall match rate for this run?',
  });
  console.log('Assistant Answer 1 Snippet:', res1.answer.slice(0, 150) + '...');
  console.log(`Tool Calls in Turn 1: ${res1.toolCalls.map((t: any) => t.tool).join(', ')}`);

  // 3. Send Message 2 (Contextual follow-up)
  console.log('\n--- Sending Message 2: "And how many matches came specifically from Pass 1?" ---');
  const res2 = await postJson(`http://localhost:3001/api/runs/${runId}/chat`, {
    message: 'And how many matches came specifically from Pass 1?',
  });
  console.log('Assistant Answer 2 Snippet:', res2.answer.slice(0, 150) + '...');
  console.log(`Tool Calls in Turn 2: ${res2.toolCalls.map((t: any) => t.tool).join(', ')}`);

  // 4. Reload full chat conversation history from GET /api/runs/:runId/chat
  console.log('\n--- Fetching Full Persisted Conversation via GET /api/runs/:runId/chat ---');
  const historyRes = await getJson(`http://localhost:3001/api/runs/${runId}/chat`);
  console.log(`Found ${historyRes.messages.length} persisted messages in DB for run ${runId}.\n`);

  console.log('📜 Latest 4 Chronological Chat Messages from DB:');
  const recent = historyRes.messages.slice(-4);
  for (const m of recent) {
    const roleEmoji = m.role === 'user' ? '👤 User' : '🤖 Assistant';
    console.log(`[${m.created_at}] ${roleEmoji}:`);
    console.log(`  ${m.content.slice(0, 180).replace(/\n/g, ' ')}...`);
    if (m.tool_calls) {
      console.log(`  🛠️ Stored Tool Calls: ${m.tool_calls.map((t: any) => t.tool).join(', ')}`);
    }
    console.log();
  }
}

testChatRoundtrip().catch(console.error);
