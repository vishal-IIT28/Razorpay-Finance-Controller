import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { executeTool, handleChatMessage } from '../src/engine/chat-agent';

const prisma = new PrismaClient();

describe('Agentic Q&A Chat & Database Tools Engine', () => {
  let activeRunId = '';

  before(async () => {
    // Find the latest completed reconciliation run in PostgreSQL for testing
    const latestRun = await prisma.reconciliationRun.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });

    if (latestRun) {
      activeRunId = latestRun.id;
    }
  });

  it('should execute getRunSummary tool and return comprehensive metrics', async () => {
    if (!activeRunId) return;

    const summary = await executeTool('getRunSummary', { runId: activeRunId });
    assert.ok(!summary.error, 'Summary should not have an error');
    assert.equal(summary.run_id, activeRunId);
    assert.equal(summary.status, 'COMPLETED');
    assert.ok(typeof summary.total_records === 'number');
    assert.ok(typeof summary.matched_records === 'number');
    assert.ok(typeof summary.overall_match_rate_pct === 'number');
    assert.ok(summary.pass_breakdown, 'Pass breakdown must be present');
    assert.ok(summary.exception_breakdown, 'Exception breakdown must be present');
  });

  it('should execute getRecordDetails for unmatched exception pay_qupuVNka3rkAeZ', async () => {
    if (!activeRunId) return;

    const details = await executeTool('getRecordDetails', {
      runId: activeRunId,
      paymentId: 'pay_qupuVNka3rkAeZ',
    });

    assert.equal(details.matched, false);
    assert.ok(details.exceptions.length > 0, 'Should return recorded exceptions');
    assert.equal(details.exceptions[0].source_id, 'pay_qupuVNka3rkAeZ');
    assert.ok(details.exceptions[0].reasoning, 'Exception must contain diagnostic reasoning');
    assert.ok(details.exceptions[0].suggested_action, 'Exception must contain suggested action');
  });

  it('should execute listExceptions tool with sourceSystem filter', async () => {
    if (!activeRunId) return;

    const rzpExceptions = await executeTool('listExceptions', {
      runId: activeRunId,
      sourceSystem: 'Razorpay',
      limit: 10,
    });

    assert.ok(rzpExceptions.count >= 0);
    assert.equal(rzpExceptions.filter.sourceSystem, 'Razorpay');

    for (const ex of rzpExceptions.exceptions) {
      assert.equal(ex.source_system, 'Razorpay');
      assert.ok(ex.source_id);
    }
  });

  it('should execute listMatchesByPass tool for Pass 1 Exact Matches', async () => {
    if (!activeRunId) return;

    const pass1Matches = await executeTool('listMatchesByPass', {
      runId: activeRunId,
      pass: 1,
      limit: 10,
    });

    assert.ok(pass1Matches.count >= 0);
    assert.equal(pass1Matches.pass_number, 1);
    for (const match of pass1Matches.matches) {
      assert.equal(match.match_pass, 1);
      assert.equal(match.confidence, 1.0);
      assert.ok(match.payment_id);
      assert.ok(match.bank_txn_id);
      assert.ok(match.ledger_entry_id);
    }
  });

  it('should gracefully decline queries for non-existent runId without throwing', async () => {
    const fakeRunId = '00000000-0000-0000-0000-000000000000';
    const result = await handleChatMessage(fakeRunId, 'Summarize this run');

    assert.ok(result.answer, 'Answer must be present');
    assert.match(result.answer, /does not exist in the database|Unable to find any data/i);
    assert.equal(result.toolCalls.length, 0);
  });

  it('should isolate conversation histories by conversationId in database', async () => {
    if (!activeRunId) return;

    const convA = `test-conv-a-${Date.now()}`;
    const convB = `test-conv-b-${Date.now()}`;

    // Seed dummy messages in DB for convA
    await prisma.chatMessage.create({
      data: {
        runId: activeRunId,
        conversationId: convA,
        role: 'user',
        content: 'Conversation A User Message',
      },
    });

    // Seed dummy messages in DB for convB
    await prisma.chatMessage.create({
      data: {
        runId: activeRunId,
        conversationId: convB,
        role: 'user',
        content: 'Conversation B User Message',
      },
    });

    const messagesA = await prisma.chatMessage.findMany({
      where: { runId: activeRunId, conversationId: convA },
    });
    const messagesB = await prisma.chatMessage.findMany({
      where: { runId: activeRunId, conversationId: convB },
    });

    assert.equal(messagesA.length, 1);
    assert.equal(messagesA[0].content, 'Conversation A User Message');

    assert.equal(messagesB.length, 1);
    assert.equal(messagesB[0].content, 'Conversation B User Message');

    // Clean up test rows
    await prisma.chatMessage.deleteMany({
      where: { conversationId: { in: [convA, convB] } },
    });
  });
});
