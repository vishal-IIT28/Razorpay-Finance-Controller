import { FunctionDeclaration, GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_GEMINI_MODEL } from '../config';

const prisma = new PrismaClient();
const MODEL_NAME = DEFAULT_GEMINI_MODEL;

export type ToolCallRecord = {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
};

export type ChatAgentResponse = {
  answer: string;
  toolCalls: ToolCallRecord[];
  runId: string;
  conversationId: string;
  messageId: string;
};

// 1. Define Tool Declarations for Gemini Function Calling
const toolDeclarations: FunctionDeclaration[] = [
  {
    name: 'getRunSummary',
    description: 'Get high-level reconciliation summary metrics for a run, including total records, match counts per pass, match rate, exception counts, precision, recall, and execution duration.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        runId: {
          type: SchemaType.STRING,
          description: 'The unique ID of the reconciliation run.',
        },
      },
      required: ['runId'],
    },
  },
  {
    name: 'getRecordDetails',
    description: 'Retrieve detailed match or exception records for a specific payment ID, bank transaction ID, or ledger entry ID in a given run.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        runId: {
          type: SchemaType.STRING,
          description: 'The unique ID of the reconciliation run.',
        },
        paymentId: {
          type: SchemaType.STRING,
          description: 'Optional Razorpay payment ID (e.g. pay_XXXXX).',
        },
        bankTxnId: {
          type: SchemaType.STRING,
          description: 'Optional Bank transaction ID (e.g. TXNXXXXX).',
        },
        ledgerEntryId: {
          type: SchemaType.STRING,
          description: 'Optional Ledger entry ID (e.g. LED-XXXXXX).',
        },
      },
      required: ['runId'],
    },
  },
  {
    name: 'listExceptions',
    description: 'List unmatched exceptions for a run, optionally filtered by source system (Razorpay, Bank, Ledger). Returns exception IDs, reasoning, and suggested actions.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        runId: {
          type: SchemaType.STRING,
          description: 'The unique ID of the reconciliation run.',
        },
        sourceSystem: {
          type: SchemaType.STRING,
          description: 'Optional filter: "Razorpay", "Bank", or "Ledger".',
        },
        limit: {
          type: SchemaType.NUMBER,
          description: 'Maximum number of exceptions to return (default: 20).',
        },
      },
      required: ['runId'],
    },
  },
  {
    name: 'listMatchesByPass',
    description: 'List matched records resolved by a specific pass: 1 (Deterministic/Exact), 2 (Fuzzy matching), or 3 (LLM AI reasoning).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        runId: {
          type: SchemaType.STRING,
          description: 'The unique ID of the reconciliation run.',
        },
        matchPass: {
          type: SchemaType.NUMBER,
          description: '1 for Deterministic, 2 for Fuzzy, 3 for LLM.',
        },
        limit: {
          type: SchemaType.NUMBER,
          description: 'Maximum number of matches to return (default: 20).',
        },
      },
      required: ['runId', 'matchPass'],
    },
  },
  {
    name: 'searchRunData',
    description: 'Search across all matches and exceptions in a run using a keyword or ID snippet (e.g. invoice ID, payment ID, bank narration, customer name, or reasoning note).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        runId: {
          type: SchemaType.STRING,
          description: 'The unique ID of the reconciliation run.',
        },
        query: {
          type: SchemaType.STRING,
          description: 'Search keyword, ID fragment, or phrase.',
        },
        limit: {
          type: SchemaType.NUMBER,
          description: 'Maximum number of items to return (default: 20).',
        },
      },
      required: ['runId', 'query'],
    },
  },
];

// 2. Real Database Tool Implementations
export async function executeTool(name: string, args: Record<string, any>): Promise<any> {
  const { runId } = args;

  switch (name) {
    case 'getRunSummary': {
      const run = await prisma.reconciliationRun.findUnique({
        where: { id: runId },
        include: {
          matchResults: {
            select: { matchPass: true },
          },
          exceptionLogs: {
            select: { sourceSystem: true },
          },
        },
      });

      if (!run) {
        return { error: `Reconciliation run not found with ID: ${runId}` };
      }

      const pass1 = run.matchResults.filter((m) => m.matchPass === 1).length;
      const pass2 = run.matchResults.filter((m) => m.matchPass === 2).length;
      const pass3 = run.matchResults.filter((m) => m.matchPass === 3).length;
      const matchRate = run.totalRecords > 0 ? Number(((run.matchedRecords / run.totalRecords) * 100).toFixed(1)) : 0;

      const rzpExceptions = run.exceptionLogs.filter((e) => e.sourceSystem === 'Razorpay').length;
      const bankExceptions = run.exceptionLogs.filter((e) => e.sourceSystem === 'Bank').length;
      const ledgerExceptions = run.exceptionLogs.filter((e) => e.sourceSystem === 'Ledger').length;

      return {
        run_id: run.id,
        created_at: run.createdAt,
        status: run.status,
        total_records: run.totalRecords,
        matched_records: run.matchedRecords,
        match_rate_pct: matchRate,
        total_exceptions: run.exceptions,
        duration_ms: run.durationMs,
        precision_pct: run.precision !== null ? Number((run.precision * 100).toFixed(2)) : null,
        recall_pct: run.recall !== null ? Number((run.recall * 100).toFixed(2)) : null,
        pass_breakdown: {
          pass1_deterministic: pass1,
          pass2_fuzzy: pass2,
          pass3_llm: pass3,
        },
        exception_breakdown: {
          razorpay_unmatched: rzpExceptions,
          bank_unmatched: bankExceptions,
          ledger_unmatched: ledgerExceptions,
        },
      };
    }

    case 'getRecordDetails': {
      const { paymentId, bankTxnId, ledgerEntryId } = args;

      const whereMatch: any = { runId };
      if (paymentId) whereMatch.paymentId = paymentId;
      if (bankTxnId) whereMatch.bankTxnId = { contains: bankTxnId };
      if (ledgerEntryId) whereMatch.ledgerEntryId = ledgerEntryId;

      const matches = await prisma.matchResult.findMany({
        where: whereMatch,
      });

      const whereException: any = { runId };
      const orConditions: any[] = [];
      if (paymentId) orConditions.push({ sourceId: paymentId });
      if (bankTxnId) orConditions.push({ sourceId: bankTxnId });
      if (ledgerEntryId) orConditions.push({ sourceId: ledgerEntryId });

      if (orConditions.length > 0) {
        whereException.OR = orConditions;
      }

      const exceptions = await prisma.exceptionLog.findMany({
        where: whereException,
      });

      return {
        query: { paymentId, bankTxnId, ledgerEntryId },
        matched: matches.length > 0,
        matches: matches.map((m) => ({
          payment_id: m.paymentId,
          bank_txn_id: m.bankTxnId,
          ledger_entry_id: m.ledgerEntryId,
          match_pass: m.matchPass === 1 ? 'Pass 1 (Deterministic)' : m.matchPass === 2 ? 'Pass 2 (Fuzzy)' : 'Pass 3 (LLM)',
          confidence: m.confidenceScore,
          audit_notes: m.notes,
        })),
        exceptions: exceptions.map((e) => ({
          source_system: e.sourceSystem,
          source_id: e.sourceId,
          reasoning: e.reasoning,
          suggested_action: e.suggestedAction,
        })),
      };
    }

    case 'listExceptions': {
      const { sourceSystem, limit = 20 } = args;
      const where: any = { runId };
      if (sourceSystem) {
        where.sourceSystem = { equals: sourceSystem, mode: 'insensitive' };
      }

      const exceptions = await prisma.exceptionLog.findMany({
        where,
        take: Math.min(Number(limit), 50),
        orderBy: { createdAt: 'asc' },
      });

      return {
        count: exceptions.length,
        filter: { sourceSystem: sourceSystem || 'all' },
        exceptions: exceptions.map((e) => ({
          source_system: e.sourceSystem,
          source_id: e.sourceId,
          reasoning: e.reasoning,
          suggested_action: e.suggestedAction,
        })),
      };
    }

    case 'listMatchesByPass': {
      const { matchPass, limit = 20 } = args;
      const matches = await prisma.matchResult.findMany({
        where: {
          runId,
          matchPass: Number(matchPass),
        },
        take: Math.min(Number(limit), 50),
        orderBy: { createdAt: 'asc' },
      });

      return {
        pass: Number(matchPass),
        pass_name: matchPass === 1 ? 'Deterministic' : matchPass === 2 ? 'Fuzzy' : 'LLM AI',
        count: matches.length,
        matches: matches.map((m) => ({
          payment_id: m.paymentId,
          bank_txn_id: m.bankTxnId,
          ledger_entry_id: m.ledgerEntryId,
          confidence: m.confidenceScore,
          notes: m.notes,
        })),
      };
    }

    case 'searchRunData': {
      const { query, limit = 20 } = args;
      const q = String(query).trim();

      const [matches, exceptions] = await Promise.all([
        prisma.matchResult.findMany({
          where: {
            runId,
            OR: [
              { paymentId: { contains: q, mode: 'insensitive' } },
              { bankTxnId: { contains: q, mode: 'insensitive' } },
              { ledgerEntryId: { contains: q, mode: 'insensitive' } },
              { notes: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: Math.min(Number(limit), 30),
        }),
        prisma.exceptionLog.findMany({
          where: {
            runId,
            OR: [
              { sourceId: { contains: q, mode: 'insensitive' } },
              { reasoning: { contains: q, mode: 'insensitive' } },
              { suggestedAction: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: Math.min(Number(limit), 30),
        }),
      ]);

      return {
        query: q,
        matches_found: matches.length,
        exceptions_found: exceptions.length,
        matches: matches.map((m) => ({
          payment_id: m.paymentId,
          bank_txn_id: m.bankTxnId,
          ledger_entry_id: m.ledgerEntryId,
          match_pass: m.matchPass,
          confidence: m.confidenceScore,
          notes: m.notes,
        })),
        exceptions: exceptions.map((e) => ({
          source_system: e.sourceSystem,
          source_id: e.sourceId,
          reasoning: e.reasoning,
          suggested_action: e.suggestedAction,
        })),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function generateContentWithRetry(modelInstance: any, request: any, maxRetries = 5): Promise<any> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await modelInstance.generateContent(request);
    } catch (err: any) {
      attempt++;
      const isTransient =
        err?.status === 429 ||
        err?.message?.includes('429') ||
        err?.message?.includes('Resource has been exhausted') ||
        err?.message?.includes('Too Many Requests') ||
        err?.message?.includes('fetch failed') ||
        err?.message?.includes('ECONNRESET') ||
        err?.message?.includes('ETIMEDOUT');
      if (isTransient && attempt < maxRetries) {
        let delayMs = attempt * 8000;
        try {
          const retryInfo = err?.errorDetails?.find((d: any) => d['@type']?.includes('RetryInfo'));
          if (retryInfo?.retryDelay) {
            const seconds = parseFloat(retryInfo.retryDelay.replace('s', ''));
            if (!isNaN(seconds)) delayMs = Math.max(delayMs, (seconds + 2) * 1000);
          }
        } catch {}
        console.warn(`[chat-agent] Transient error / Rate limit hit. Waiting ${Math.round(delayMs / 1000)}s before retry ${attempt}/${maxRetries}...`);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
}

// 3. Agent Execution Loop with Gemini Function Calling
export async function handleChatMessage(
  runId: string,
  userMessage: string,
  conversationId?: string
): Promise<ChatAgentResponse> {
  const activeConversationId = conversationId || crypto.randomUUID();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in backend environment.');
  }

  // Verify run exists
  const run = await prisma.reconciliationRun.findUnique({ where: { id: runId } });
  if (!run) {
    const errorReply = `Error: Reconciliation run with ID "${runId}" does not exist in the database. Please provide a valid reconciliation run ID.`;
    return {
      answer: errorReply,
      toolCalls: [],
      runId,
      conversationId: activeConversationId,
      messageId: '',
    };
  }

  // Load previous chat history scoped strictly to this specific conversation
  const priorHistory = await prisma.chatMessage.findMany({
    where: { runId, conversationId: activeConversationId },
    orderBy: { createdAt: 'asc' },
    take: 15,
  });

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    tools: [{ functionDeclarations: toolDeclarations }],
    systemInstruction: `You are the FinReconcile AI Assistant, an expert financial operations auditor.
You answer user questions about a specific reconciliation run (Run ID: ${runId}).

CRITICAL INSTRUCTIONS:
1. ALWAYS use the provided tools (getRunSummary, getRecordDetails, listExceptions, listMatchesByPass, searchRunData) to look up facts before answering. NEVER invent, hallucinate, or assume record IDs, statuses, amounts, or reasons.
2. Ground all answers strictly in the tool outputs and cite specific IDs explicitly: payment_id (e.g. pay_XXXX), bank_txn_id (e.g. TXNXXXX), and ledger_entry_id (e.g. LED-XXXX).
3. If an unmatched exception is asked about, explain the recorded reasoning from the audit log and the suggested action clearly.
4. If a query cannot be answered from the database records or tools (e.g. external data like weather, or nonexistent IDs), say so explicitly and decline rather than hallucinating.
5. Provide concise, professional, audit-ready summaries with formatted markdown tables or bullet points when helpful.`,
    generationConfig: {
      temperature: 0,
    },
  });

  // Load prior messages for this specific conversation
  const priorMessages = await prisma.chatMessage.findMany({
    where: {
      runId,
      conversationId: activeConversationId,
    },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  const contents: any[] = [];

  for (const m of priorMessages) {
    contents.push({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    });
  }

  contents.push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  const toolCallsLog: ToolCallRecord[] = [];
  let currentResponse = await generateContentWithRetry(model, { contents });

  // Function calling resolution loop (up to 5 turns)
  let loopCount = 0;
  const maxTurns = 5;

  while (currentResponse.response.functionCalls() && loopCount < maxTurns) {
    loopCount++;
    const functionCalls = currentResponse.response.functionCalls();
    if (!functionCalls || functionCalls.length === 0) break;

    // Append model function call candidate to conversation contents
    const modelCandidate = currentResponse.response.candidates?.[0]?.content;
    if (modelCandidate) {
      contents.push(modelCandidate);
    }

    const functionResponseParts: any[] = [];

    for (const call of functionCalls) {
      const callArgs = { ...(call.args as Record<string, any>), runId: (call.args as any)?.runId || runId };
      const result = await executeTool(call.name, callArgs);

      toolCallsLog.push({
        tool: call.name,
        args: callArgs,
        result,
      });

      functionResponseParts.push({
        functionResponse: {
          name: call.name,
          response: result,
        },
      });
    }

    // Send function responses back to Gemini with role: 'user'
    contents.push({
      role: 'user',
      parts: functionResponseParts,
    });

    currentResponse = await generateContentWithRetry(model, { contents });
  }

  const finalAnswer = currentResponse.response.text() || 'Unable to generate response from tool data.';

  // Persist user and assistant messages in database with activeConversationId
  await prisma.chatMessage.create({
    data: {
      runId,
      conversationId: activeConversationId,
      role: 'user',
      content: userMessage,
    },
  });

  const assistantMessage = await prisma.chatMessage.create({
    data: {
      runId,
      conversationId: activeConversationId,
      role: 'assistant',
      content: finalAnswer,
      toolCalls: toolCallsLog.length > 0 ? (toolCallsLog as any) : undefined,
    },
  });

  return {
    answer: finalAnswer,
    toolCalls: toolCallsLog,
    runId,
    conversationId: activeConversationId,
    messageId: assistantMessage.id,
  };
}
