import http from 'http';
import crypto from 'crypto';

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
        path: `${urlObj.pathname}${urlObj.search}`,
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

async function testIsolatedConversations() {
  console.log('🔒 Testing Scoped Conversation Isolation & Distinct Refusal Paths...\n');

  const runId = 'a1753489-3966-4b1c-91cf-1f7f6d219ece';
  const convA = crypto.randomUUID();
  const convB = crypto.randomUUID();

  console.log(`🎯 Run ID: ${runId}`);
  console.log(`💬 Conversation A ID: ${convA}`);
  console.log(`💬 Conversation B ID: ${convB}\n`);

  // ==========================================
  // CONVERSATION A (2 turns)
  // ==========================================
  console.log('--- Conversation A, Turn 1: "What was the overall match rate for this run?" ---');
  const resA1 = await postJson(`http://localhost:3001/api/runs/${runId}/chat`, {
    message: 'What was the overall match rate for this run?',
    conversationId: convA,
  });
  console.log(`Conversation A Turn 1 returned: conversationId = ${resA1.conversationId}`);
  console.log(`Answer Snippet: ${resA1.answer.slice(0, 140)}...\n`);

  console.log('--- Conversation A, Turn 2: "And how many matches came specifically from Pass 1?" ---');
  const resA2 = await postJson(`http://localhost:3001/api/runs/${runId}/chat`, {
    message: 'And how many matches came specifically from Pass 1?',
    conversationId: convA,
  });
  console.log(`Conversation A Turn 2 returned: conversationId = ${resA2.conversationId}`);
  console.log(`Answer Snippet: ${resA2.answer.slice(0, 140)}...\n`);

  // ==========================================
  // CONVERSATION B (1 turn, completely different topic)
  // ==========================================
  console.log('--- Conversation B, Turn 1: "List the bank exceptions in this run." ---');
  const resB1 = await postJson(`http://localhost:3001/api/runs/${runId}/chat`, {
    message: 'List the bank exceptions in this run.',
    conversationId: convB,
  });
  console.log(`Conversation B Turn 1 returned: conversationId = ${resB1.conversationId}`);
  console.log(`Answer Snippet: ${resB1.answer.slice(0, 140)}...\n`);

  // ==========================================
  // VERIFY ISOLATION VIA GET /api/runs/:runId/chat
  // ==========================================
  console.log('================================================================================');
  console.log('🔍 VERIFYING CHAT ISOLATION VIA REST GET ENDPOINTS:');

  const historyA = await getJson(`http://localhost:3001/api/runs/${runId}/chat?conversationId=${convA}`);
  console.log(`\n📂 Conversation A Retrieved Count: ${historyA.messages.length} messages (Expected: 4)`);
  historyA.messages.forEach((m: any, idx: number) => {
    console.log(`  [${idx + 1}] (${m.role}): ${m.content.slice(0, 90).replace(/\n/g, ' ')}...`);
  });

  const historyB = await getJson(`http://localhost:3001/api/runs/${runId}/chat?conversationId=${convB}`);
  console.log(`\n📂 Conversation B Retrieved Count: ${historyB.messages.length} messages (Expected: 2)`);
  historyB.messages.forEach((m: any, idx: number) => {
    console.log(`  [${idx + 1}] (${m.role}): ${m.content.slice(0, 90).replace(/\n/g, ' ')}...`);
  });

  const isStrictlyIsolated =
    historyA.messages.length === 4 &&
    historyB.messages.length === 2 &&
    !historyA.messages.some((m: any) => m.content.includes('List the bank exceptions')) &&
    !historyB.messages.some((m: any) => m.content.includes('overall match rate'));

  console.log(`\n✅ Isolation Verification: ${isStrictlyIsolated ? 'PASSED (100% Isolated)' : 'FAILED'}\n`);

  // ==========================================
  // SINGLE-CONDITION REFUSAL TEST: NONEXISTENT RUN ID ALONE
  // ==========================================
  console.log('================================================================================');
  console.log('🚫 SINGLE-CONDITION REFUSAL TEST: Nonexistent runId alone (asking a standard valid question)');
  const fakeRunId = '00000000-0000-0000-0000-000000000000';
  const refusalRes = await postJson(`http://localhost:3001/api/runs/${fakeRunId}/chat`, {
    message: 'What was the overall match rate for this run?',
  });

  console.log(`Target Run ID: ${fakeRunId}`);
  console.log(`Tools Invoked: ${refusalRes.toolCalls.length}`);
  console.log(`Agent Refusal Response:\n"${refusalRes.answer}"\n`);
}

testIsolatedConversations().catch(console.error);
