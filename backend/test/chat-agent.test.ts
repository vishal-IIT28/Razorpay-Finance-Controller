import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { executeTool, handleChatMessage } from '../src/engine/chat-agent';

dotenv.config({ path: [path.join(__dirname, '../.env'), path.join(__dirname, '../../.env')] });

const prisma = new PrismaClient();

describe('Agentic Q&A Chat & Database Tools Engine', () => {
  let activeRunId = '';

  before(async () => {
    // Find the latest completed reconciliation run in PostgreSQL for testing
    let latestRun = await prisma.reconciliationRun.findFirst({
      where: { status: 'completed' },
      orderBy: { createdAt: 'desc' },
      include: {
        matchResults: true,
        exceptionLogs: true,
      },
    });

    // If no run exists or existing run doesn't have the test exception pay_qupuVNka3rkAeZ, seed one
    const hasTargetException = latestRun?.exceptionLogs.some((e) => e.sourceId === 'pay_qupuVNka3rkAeZ');
    if (!latestRun || !hasTargetException) {
      latestRun = await prisma.reconciliationRun.create({
        data: {
          status: 'completed',
          totalRecords: 150,
          matchedRecords: 127,
          exceptions: 23,
          durationMs: 3500,
          matchResults: {
            create: [
              {
                paymentId: 'pay_ExactMatch1001',
                bankTxnId: 'TXN1000000001',
                ledgerEntryId: 'LED-000001',
                matchPass: 1,
                confidenceScore: 1.0,
                notes: 'Exact match on payment_id and net settlement amount.',
              },
              {
                paymentId: 'pay_FuzzyMatch2002',
                bankTxnId: 'TXN2000000002',
                ledgerEntryId: 'LED-000002',
                matchPass: 2,
                confidenceScore: 0.95,
                notes: 'Fuzzy match within date drift tolerance.',
              },
            ],
          },
          exceptionLogs: {
            create: [
              {
                sourceSystem: 'Razorpay',
                sourceId: 'pay_qupuVNka3rkAeZ',
                reasoning: 'Bank credit amount discrepancy due to undisclosed bank processing charges.',
                suggestedAction: 'Verify fee breakdown and confirm net credit with settlement bank.',
              },
              {
                sourceSystem: 'Bank',
                sourceId: 'TXN9999999999',
                reasoning: 'Unmatched bank credit without matching gateway transaction.',
                suggestedAction: 'Check manual wire transfer or refund reversal.',
              },
              {
                sourceSystem: 'Ledger',
                sourceId: 'LED-999999',
                reasoning: 'Ledger invoice unpaid with missing payment reference.',
                suggestedAction: 'Follow up with customer billing operations.',
              },
            ],
          },
        },
        include: {
          matchResults: true,
          exceptionLogs: true,
        },
      });
    }

    if (latestRun) {
      activeRunId = latestRun.id;
    }

    assert.ok(activeRunId, 'No completed reconciliation run found in DB — seed one before running tests');
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('should execute getRunSummary tool and return comprehensive metrics', async () => {
    assert.ok(activeRunId, 'No completed reconciliation run found in DB — seed one before running tests');

    const summary = await executeTool('getRunSummary', { runId: activeRunId });
    assert.ok(!summary.error, 'Summary should not have an error');
    assert.equal(summary.run_id, activeRunId);
    assert.equal(summary.status, 'completed');
    assert.ok(typeof summary.total_records === 'number');
    assert.ok(typeof summary.matched_records === 'number');
    assert.ok(typeof summary.match_rate_pct === 'number');
    assert.ok(summary.pass_breakdown, 'Pass breakdown must be present');
    assert.ok(summary.exception_breakdown, 'Exception breakdown must be present');
  });

  it('should execute getRecordDetails for unmatched exception pay_qupuVNka3rkAeZ', async () => {
    assert.ok(activeRunId, 'No completed reconciliation run found in DB — seed one before running tests');

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
    assert.ok(activeRunId, 'No completed reconciliation run found in DB — seed one before running tests');

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
    assert.ok(activeRunId, 'No completed reconciliation run found in DB — seed one before running tests');

    const pass1Matches = await executeTool('listMatchesByPass', {
      runId: activeRunId,
      matchPass: 1,
      limit: 10,
    });

    assert.ok(pass1Matches.count >= 0);
    assert.equal(pass1Matches.pass, 1);
    for (const match of pass1Matches.matches) {
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
    assert.ok(activeRunId, 'No completed reconciliation run found in DB — seed one before running tests');

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
