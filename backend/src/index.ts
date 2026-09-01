import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { handleChatMessage } from './engine/chat-agent';
import { pipelineManager } from './engine/pipeline-runner';
import {
  detectFileSchema,
  validateAndNormalizeUploads,
} from './engine/schema-detector';

dotenv.config({ path: ['.env', '../.env'] });

const app = express();
const port = process.env.PORT || 3001;
const prisma = new PrismaClient();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

function getParam(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

// Healthcheck
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'FinReconcile AI API is running' });
});

// Sample Datasets for 1-Click UI Demo & Evaluation
app.get('/api/samples/:dataset/:filename', (req: Request, res: Response): void => {
  const datasetParam = getParam(req.params.dataset);
  const filenameParam = getParam(req.params.filename);
  const dataset = datasetParam === 'holdout' ? 'holdout' : '';
  const filename = filenameParam || '';
  const repoRoot = path.resolve(__dirname, '../..');
  const filePath = path.resolve(repoRoot, 'data', dataset, filename);
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'text/csv');
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: `Sample file not found: ${filePath}` });
  }
});

// Schema Detection Endpoint (inspect detected roles without executing pipeline)
app.post('/api/detect-schema', upload.any(), async (req: Request, res: Response): Promise<void> => {
  const uploadedFiles = (req.files as Express.Multer.File[]) || [];
  try {
    if (uploadedFiles.length === 0) {
      res.status(400).json({ error: 'No files uploaded. Please upload 1 or more CSV files.' });
      return;
    }

    const filePayloads = uploadedFiles.map((file) => ({
      filename: file.originalname || file.filename,
      content: fs.readFileSync(file.path, 'utf-8'),
    }));

    const results = await Promise.all(
      filePayloads.map((f) => detectFileSchema(f.filename, f.content))
    );

    const requiredRoles = ['razorpay', 'bank', 'ledger'];
    const detectedRoles = results.map((r) => r.role);
    const missingRoles = requiredRoles.filter((r) => !detectedRoles.includes(r as any));

    res.json({
      files: results,
      all_required_present: missingRoles.length === 0,
      missing_roles: missingRoles,
    });
  } catch (error) {
    console.error('[detect-schema error]', error);
    res.status(500).json({ error: 'Failed to inspect file schemas.' });
  } finally {
    for (const f of uploadedFiles) {
      fs.rmSync(f.path, { force: true });
    }
  }
});

// Flexible Reconciliation Intake Endpoint (Supports 1-N arbitrary CSV files & async execution)
app.post('/api/reconcile', upload.any(), async (req: Request, res: Response): Promise<void> => {
  const uploadedFiles = (req.files as Express.Multer.File[]) || [];
  console.log('[API /api/reconcile RECEIVED]:', uploadedFiles.map((f) => ({ filename: f.originalname, fieldname: f.fieldname })));

  try {
    if (uploadedFiles.length === 0) {
      res.status(400).json({
        error: 'No files provided. Please upload financial dataset CSV files (Razorpay gateway export, Bank statement, Internal ledger).',
      });
      return;
    }

    const validRoles: Array<'razorpay' | 'bank' | 'ledger'> = ['razorpay', 'bank', 'ledger'];
    const filePayloads = uploadedFiles.map((file) => ({
      filename: file.originalname || file.filename,
      content: fs.readFileSync(file.path, 'utf-8'),
      explicitRole: validRoles.includes(file.fieldname as any) ? (file.fieldname as 'razorpay' | 'bank' | 'ledger') : undefined,
    }));

    // Step 1: Validate roles & normalize datasets
    const validation = await validateAndNormalizeUploads(filePayloads);

    if (!validation.valid || !validation.normalizedData) {
      res.status(400).json({
        error: validation.errorMessage || 'Uploaded files do not fulfill required reconciliation datasets.',
        missing_roles: validation.missingRoles,
        detected_roles: validation.detected,
      });
      return;
    }

    const { razorpay, bank, ledger } = validation.normalizedData;

    // Step 2: Create initial ReconciliationRun in DB with status "processing"
    const run = await prisma.reconciliationRun.create({
      data: {
        status: 'processing',
        totalRecords: razorpay.length,
        matchedRecords: 0,
        exceptions: 0,
      },
    });

    const isSync = req.query.sync === 'true';

    // Step 3: Trigger pipeline execution
    if (isSync) {
      const summaryPayload = await pipelineManager.executePipeline(run.id, razorpay, bank, ledger);
      res.json({
        message: 'Reconciliation pipeline completed (sync mode).',
        detected_roles: validation.detected,
        ...summaryPayload,
      });
    } else {
      // Background execution
      pipelineManager.executePipeline(run.id, razorpay, bank, ledger).catch((err) => {
        console.error(`[Background pipeline failure for run ${run.id}]`, err);
      });

      res.status(202).json({
        message: 'Reconciliation pipeline started in background.',
        run_id: run.id,
        status: 'processing',
        stream_url: `/api/reconcile/${run.id}/stream`,
        detected_roles: validation.detected,
        summary: {
          razorpay_records: razorpay.length,
          bank_records: bank.length,
          ledger_records: ledger.length,
        },
      });
    }
  } catch (error) {
    console.error('[reconcile error]', error);
    res.status(500).json({ error: 'Internal server error during reconciliation intake' });
  } finally {
    for (const f of uploadedFiles) {
      fs.rmSync(f.path, { force: true });
    }
  }
});

// Server-Sent Events (SSE) Live Progress Streaming
app.get('/api/reconcile/:runId/stream', async (req: Request, res: Response): Promise<void> => {
  const runId = getParam(req.params.runId);

  if (!runId) {
    res.status(400).json({ error: 'runId parameter is required' });
    return;
  }

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendEvent = (event: { type: string; timestamp: string; data: any }) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify({ runId, timestamp: event.timestamp, ...event.data })}\n\n`);
  };

  // 1. Replay historical buffered events
  const history = pipelineManager.getEventHistory(runId);
  for (const historicalEvent of history) {
    sendEvent(historicalEvent);
  }

  // Check if run is already done in DB
  const existingRun = await prisma.reconciliationRun.findUnique({
    where: { id: runId },
    include: { matchResults: true, exceptionLogs: true },
  });

  if (existingRun && existingRun.status === 'completed') {
    const p1Matches = existingRun.matchResults.filter((m) => m.matchPass === 1).length;
    const p2Matches = existingRun.matchResults.filter((m) => m.matchPass === 2).length;
    const p3MatchesList = existingRun.matchResults.filter((m) => m.matchPass === 3);
    const p3MatchesCount = p3MatchesList.length;
    const ratePct = existingRun.totalRecords > 0 ? Number(((existingRun.matchedRecords / existingRun.totalRecords) * 100).toFixed(1)) : 0;

    if (!history.some((e) => e.type === 'pipeline_init')) {
      sendEvent({
        type: 'pipeline_init',
        timestamp: existingRun.createdAt.toISOString(),
        data: { total_records: existingRun.totalRecords, status: 'completed' },
      });
    }

    if (!history.some((e) => e.type === 'pass1_complete')) {
      sendEvent({
        type: 'pass1_complete',
        timestamp: existingRun.createdAt.toISOString(),
        data: { matched: p1Matches, duration_ms: 10 },
      });
    }

    if (!history.some((e) => e.type === 'pass2_complete')) {
      sendEvent({
        type: 'pass2_complete',
        timestamp: existingRun.createdAt.toISOString(),
        data: { matched: p2Matches, duration_ms: 100 },
      });
    }

    if (!history.some((e) => e.type === 'pass3_progress')) {
      const rzpExceptions = existingRun.exceptionLogs.filter((e) => e.sourceSystem === 'Razorpay');
      let runningP3Matched = p1Matches + p2Matches;
      let currIdx = 0;
      const totalP3Items = p3MatchesCount + rzpExceptions.length;

      for (const m of p3MatchesList) {
        currIdx++;
        runningP3Matched++;
        sendEvent({
          type: 'pass3_progress',
          timestamp: existingRun.createdAt.toISOString(),
          data: {
            current_index: currIdx,
            total_records: totalP3Items,
            payment_id: m.paymentId,
            matched: true,
            running_match_count: runningP3Matched,
            reasoning: m.notes || 'Matched via Gemini 3.5 AI Discrepancy Resolution.',
            status: 'success',
          },
        });
      }

      for (const ex of rzpExceptions) {
        currIdx++;
        sendEvent({
          type: 'pass3_progress',
          timestamp: existingRun.createdAt.toISOString(),
          data: {
            current_index: currIdx,
            total_records: totalP3Items,
            payment_id: ex.sourceId,
            matched: false,
            running_match_count: runningP3Matched,
            reasoning: ex.reasoning || 'Unresolved exception logged after multi-pass evaluation.',
            status: 'exception',
          },
        });
      }
    }

    if (!history.some((e) => e.type === 'pass3_complete')) {
      sendEvent({
        type: 'pass3_complete',
        timestamp: existingRun.createdAt.toISOString(),
        data: { matched: p3MatchesCount, duration_ms: Math.max(0, (existingRun.durationMs || 0) - 110) },
      });
    }

    if (!history.some((e) => e.type === 'reconcile_complete')) {
      sendEvent({
        type: 'reconcile_complete',
        timestamp: existingRun.createdAt.toISOString(),
        data: {
          run_id: existingRun.id,
          status: 'completed',
          summary: {
            total_records: existingRun.totalRecords,
            total_matched: existingRun.matchedRecords,
            match_rate_pct: ratePct,
            exceptions: existingRun.exceptions,
          },
          timing: {
            total_ms: existingRun.durationMs || 0,
          },
          duration_ms: existingRun.durationMs || 0,
        },
      });
    }
    res.end();
    return;
  }

  // 2. Subscribe to real-time events
  const eventListener = (event: any) => {
    sendEvent(event);
    if (event.type === 'reconcile_complete' || event.type === 'error') {
      pipelineManager.removeListener(`run:${runId}`, eventListener);
      res.end();
    }
  };

  pipelineManager.on(`run:${runId}`, eventListener);

  req.on('close', () => {
    pipelineManager.removeListener(`run:${runId}`, eventListener);
  });
});

// Fetch List of Past Reconciliation Runs
app.get('/api/runs', async (_req: Request, res: Response): Promise<void> => {
  try {
    const runs = await prisma.reconciliationRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        status: true,
        totalRecords: true,
        matchedRecords: true,
        exceptions: true,
        durationMs: true,
        precision: true,
        recall: true,
      },
    });

    res.json({
      runs: runs.map((r) => ({
        run_id: r.id,
        created_at: r.createdAt,
        status: r.status,
        total_records: r.totalRecords,
        total_matched: r.matchedRecords,
        match_rate_pct: r.totalRecords > 0 ? Number(((r.matchedRecords / r.totalRecords) * 100).toFixed(1)) : 0,
        exceptions: r.exceptions,
        duration_ms: r.durationMs,
        precision: r.precision,
        recall: r.recall,
      })),
    });
  } catch (error) {
    console.error('[list-runs error]', error);
    res.status(500).json({ error: 'Failed to retrieve reconciliation runs list' });
  }
});

// Fetch Completed Run Details & Audit Trail
app.get('/api/runs/:runId', async (req: Request, res: Response): Promise<void> => {
  const runId = getParam(req.params.runId);

  try {
    const run = await prisma.reconciliationRun.findUnique({
      where: { id: runId },
      include: {
        matchResults: true,
        exceptionLogs: true,
      },
    });

    if (!run) {
      res.status(404).json({ error: `Reconciliation run not found with ID: ${runId}` });
      return;
    }

    const pass1 = run.matchResults.filter((m) => m.matchPass === 1).length;
    const pass2 = run.matchResults.filter((m) => m.matchPass === 2).length;
    const pass3 = run.matchResults.filter((m) => m.matchPass === 3).length;
    const matchRate = run.totalRecords > 0 ? Number(((run.matchedRecords / run.totalRecords) * 100).toFixed(1)) : 0;

    res.json({
      run_id: run.id,
      created_at: run.createdAt,
      status: run.status,
      summary: {
        total_records: run.totalRecords,
        total_matched: run.matchedRecords,
        match_rate_pct: matchRate,
        exceptions: run.exceptions,
      },
      timing: {
        total_ms: run.durationMs,
      },
      passes: {
        pass1_matched: pass1,
        pass2_matched: pass2,
        pass3_matched: pass3,
      },
      matches: run.matchResults.map((m) => ({
        payment_id: m.paymentId,
        bank_txn_id: m.bankTxnId,
        ledger_entry_id: m.ledgerEntryId,
        match_pass: m.matchPass,
        confidence: m.confidenceScore,
        notes: m.notes,
      })),
      exceptions: run.exceptionLogs.map((e) => ({
        source_system: e.sourceSystem,
        source_id: e.sourceId,
        reasoning: e.reasoning,
        suggested_action: e.suggestedAction,
      })),
    });
  } catch (error) {
    console.error('[get-run error]', error);
    res.status(500).json({ error: 'Failed to retrieve run details' });
  }
});

// Agentic Q&A Endpoints
app.post(['/api/chat', '/api/runs/:runId/chat'], async (req: Request, res: Response): Promise<void> => {
  const runId = getParam(req.params.runId) || String(req.body.runId || '');
  const { message, conversationId } = req.body;

  if (!runId || !message) {
    res.status(400).json({ error: 'Both "runId" and "message" are required.' });
    return;
  }

  try {
    const result = await handleChatMessage(
      runId,
      String(message).trim(),
      conversationId ? String(conversationId) : undefined
    );
    res.json(result);
  } catch (error: any) {
    console.error('[chat error]', error);
    res.status(500).json({ error: error?.message || 'Failed to process chat query' });
  }
});

// Chat Conversation History Retrieval
app.get(['/api/chat/:runId', '/api/runs/:runId/chat'], async (req: Request, res: Response): Promise<void> => {
  const runId = getParam(req.params.runId);
  const conversationId = req.query.conversationId ? String(req.query.conversationId) : undefined;

  try {
    const whereClause: any = { runId };
    if (conversationId) {
      whereClause.conversationId = conversationId;
    }

    const messages = await prisma.chatMessage.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      run_id: runId,
      conversation_id: conversationId || null,
      count: messages.length,
      messages: messages.map((m) => ({
        id: m.id,
        conversation_id: m.conversationId,
        role: m.role,
        content: m.content,
        tool_calls: m.toolCalls,
        created_at: m.createdAt,
      })),
    });
  } catch (error) {
    console.error('[get-chat error]', error);
    res.status(500).json({ error: 'Failed to retrieve chat messages' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
