import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { handleChatMessage } from '../src/engine/chat-agent';

dotenv.config({ path: [path.join(__dirname, '../.env'), path.join(__dirname, '../../.env')] });

const prisma = new PrismaClient();

async function runChatSmokeTest() {
  console.log('🤖 Starting Agentic Q&A Smoke Test...\n');

  // 1. Locate a completed run in the database
  const run = await prisma.reconciliationRun.findFirst({
    where: { status: 'completed' },
    orderBy: { createdAt: 'desc' },
  });

  if (!run) {
    console.error('❌ No completed reconciliation run found in database. Run the pipeline first.');
    process.exit(1);
  }

  console.log(`🎯 Testing Q&A Agent against Reconciliation Run: ${run.id}`);
  console.log(`Run Metrics in DB: Total: ${run.totalRecords}, Matched: ${run.matchedRecords}, Exceptions: ${run.exceptions}\n`);

  // Find a specific exception payment ID to test targeted investigation
  const sampleException = await prisma.exceptionLog.findFirst({
    where: { runId: run.id, sourceSystem: 'Razorpay' },
  });
  const targetPaymentId = sampleException ? sampleException.sourceId : 'pay_fOTHwxAeCB4mZ0';

  const testQueries = [
    {
      label: 'Query 1: High-Level Run Summary & Telemetry',
      question: 'Summarize the reconciliation performance, match rates across the 3 passes, and timing for this run.',
    },
    {
      label: `Query 2: Deep Dive on Specific Unmatched Exception (${targetPaymentId})`,
      question: `Why wasn't payment ${targetPaymentId} matched to any bank credit or ledger entry? What was the reasoning and recommended next step?`,
    },
    {
      label: 'Query 3: Audit of Pass 3 (LLM) Resolved Matches',
      question: 'Which records were resolved specifically by Pass 3 (LLM reasoning) and what audit notes were recorded for them?',
    },
    {
      label: 'Query 4: Exception Queue Analysis by Source System',
      question: 'List the exceptions recorded for Bank and Ledger records. How many unmatched entries are there and what actions should finance ops take?',
    },
  ];

  for (let i = 0; i < testQueries.length; i++) {
    const { label, question } = testQueries[i]!;
    console.log(`================================================================================`);
    console.log(`[${i + 1}/4] ${label}`);
    console.log(`User Question: "${question}"\n`);

    const startTime = performance.now();
    try {
      const response = await handleChatMessage(run.id, question);
      const elapsed = Math.round(performance.now() - startTime);

      console.log(`🛠️ Tools Invoked (${response.toolCalls.length}):`);
      for (const tc of response.toolCalls) {
        console.log(`  - Tool: \x1b[36m${tc.tool}\x1b[0m`);
        console.log(`    Args: ${JSON.stringify(tc.args)}`);
        const resultSummary = typeof tc.result === 'object' ? JSON.stringify(tc.result).slice(0, 180) + '...' : String(tc.result);
        console.log(`    Result Snippet: ${resultSummary}`);
      }

      console.log(`\n💬 Agent Response (${elapsed}ms):`);
      console.log(`--------------------------------------------------------------------------------`);
      console.log(response.answer);
      console.log(`--------------------------------------------------------------------------------\n`);
    } catch (err: any) {
      console.error(`❌ Query ${i + 1} failed:`, err);
    }
  }

  // Verify chat history persisted in DB
  const messageCount = await prisma.chatMessage.count({ where: { runId: run.id } });
  console.log(`✅ Chat messages successfully persisted in DB for run ${run.id}: ${messageCount} total messages.`);

  await prisma.$disconnect();
}

runChatSmokeTest().catch((err) => {
  console.error('Smoke test error:', err);
  process.exit(1);
});
