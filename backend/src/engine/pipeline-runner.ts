import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { runDeterministicPass, RzpRecord, BankRecord, LedgerRecord, MatchResult } from './deterministic';
import { runFuzzyPass } from './fuzzy';
import { runLlmPass } from './llm';

const prisma = new PrismaClient();

export type PipelineEvent = {
  type:
    | 'pipeline_init'
    | 'pass1_started'
    | 'pass1_complete'
    | 'pass2_started'
    | 'pass2_complete'
    | 'pass3_started'
    | 'pass3_progress'
    | 'pass3_complete'
    | 'reconcile_complete'
    | 'error';
  runId: string;
  timestamp: string;
  data: Record<string, any>;
};

export class PipelineManager extends EventEmitter {
  private eventHistory = new Map<string, PipelineEvent[]>();
  private activeRuns = new Set<string>();

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  public getEventHistory(runId: string): PipelineEvent[] {
    return this.eventHistory.get(runId) || [];
  }

  public emitPipelineEvent(event: PipelineEvent) {
    if (!this.eventHistory.has(event.runId)) {
      this.eventHistory.set(event.runId, []);
    }
    this.eventHistory.get(event.runId)!.push(event);
    this.emit(`run:${event.runId}`, event);
  }

  public isRunActive(runId: string): boolean {
    return this.activeRuns.has(runId);
  }

  public async executePipeline(
    runId: string,
    razorpayData: RzpRecord[],
    bankData: BankRecord[],
    ledgerData: LedgerRecord[]
  ) {
    this.activeRuns.add(runId);
    const nowIso = () => new Date().toISOString();

    try {
      this.emitPipelineEvent({
        type: 'pipeline_init',
        runId,
        timestamp: nowIso(),
        data: {
          total_records: razorpayData.length,
          bank_records: bankData.length,
          ledger_records: ledgerData.length,
          status: 'processing',
        },
      });

      const totalStart = performance.now();

      // Pass 1: Deterministic
      this.emitPipelineEvent({
        type: 'pass1_started',
        runId,
        timestamp: nowIso(),
        data: { name: 'Deterministic Exact Matching', input_count: razorpayData.length },
      });

      const p1Start = performance.now();
      const pass1Result = runDeterministicPass(razorpayData, bankData, ledgerData);
      const pass1_ms = Math.round(performance.now() - p1Start);

      this.emitPipelineEvent({
        type: 'pass1_complete',
        runId,
        timestamp: nowIso(),
        data: {
          matched: pass1Result.matches.length,
          unmatched_remaining: pass1Result.unmatched.razorpay.length,
          duration_ms: pass1_ms,
        },
      });

      // Pass 2: Fuzzy
      this.emitPipelineEvent({
        type: 'pass2_started',
        runId,
        timestamp: nowIso(),
        data: {
          name: 'Fuzzy Matching Engine (Date Drift, Narration, Amount Tolerance)',
          input_count: pass1Result.unmatched.razorpay.length,
        },
      });

      const p2Start = performance.now();
      const pass2Result = runFuzzyPass(
        pass1Result.unmatched.razorpay,
        pass1Result.unmatched.bank,
        pass1Result.unmatched.ledger
      );
      const pass2_ms = Math.round(performance.now() - p2Start);

      this.emitPipelineEvent({
        type: 'pass2_complete',
        runId,
        timestamp: nowIso(),
        data: {
          matched: pass2Result.matches.length,
          unmatched_remaining: pass2Result.unmatched.razorpay.length,
          duration_ms: pass2_ms,
        },
      });

      // Pass 3: LLM
      this.emitPipelineEvent({
        type: 'pass3_started',
        runId,
        timestamp: nowIso(),
        data: {
          name: 'LLM AI Reconciliation Pass (Split Settlements & Complex Variance)',
          total_to_review: pass2Result.unmatched.razorpay.length,
        },
      });

      const p3Start = performance.now();
      const pass3Result = await runLlmPass(
        pass2Result.unmatched.razorpay,
        pass2Result.unmatched.bank,
        pass2Result.unmatched.ledger,
        (progress) => {
          this.emitPipelineEvent({
            type: 'pass3_progress',
            runId,
            timestamp: nowIso(),
            data: {
              current_index: progress.currentIndex,
              total_records: progress.totalRecords,
              payment_id: progress.paymentId,
              matched: progress.matched,
              running_match_count: progress.runningMatchCount,
              reasoning: progress.reasoning,
              status: progress.status,
            },
          });
        }
      );
      const pass3_ms = Math.round(performance.now() - p3Start);

      this.emitPipelineEvent({
        type: 'pass3_complete',
        runId,
        timestamp: nowIso(),
        data: {
          matched: pass3Result.matches.length,
          unmatched_remaining: pass3Result.unmatched.razorpay.length,
          duration_ms: pass3_ms,
        },
      });

      const total_ms = Math.round(performance.now() - totalStart);
      const records_per_second = total_ms > 0 ? Number(((razorpayData.length / (total_ms / 1000))).toFixed(2)) : 0;

      const allMatches = [...pass1Result.matches, ...pass2Result.matches, ...pass3Result.matches];
      const exceptionLogs = buildExceptionLogs(pass3Result.unmatched, pass3Result.decisions);
      const matchRate = razorpayData.length === 0 ? 0 : Number(((allMatches.length / razorpayData.length) * 100).toFixed(1));

      // Persist results to DB
      await prisma.reconciliationRun.update({
        where: { id: runId },
        data: {
          status: 'completed',
          totalRecords: razorpayData.length,
          matchedRecords: allMatches.length,
          exceptions: exceptionLogs.length,
          durationMs: total_ms,
          matchResults: {
            create: allMatches.map((match) => ({
              paymentId: match.payment_id,
              bankTxnId: match.bank_txn_id,
              ledgerEntryId: match.ledger_entry_id,
              matchPass: match.match_pass,
              confidenceScore: match.confidence,
              notes: match.notes,
            })),
          },
          exceptionLogs: {
            create: exceptionLogs.map((exception) => ({
              sourceSystem: exception.source_system,
              sourceId: exception.source_id,
              reasoning: exception.reasoning,
              suggestedAction: exception.suggested_action,
            })),
          },
        },
      });

      const summaryPayload = {
        run_id: runId,
        status: 'completed',
        summary: {
          total_records: razorpayData.length,
          total_matched: allMatches.length,
          match_rate_pct: matchRate,
          exceptions: exceptionLogs.length,
        },
        timing: {
          total_ms,
          pass1_ms,
          pass2_ms,
          pass3_ms,
          records_per_second,
        },
        pass1: { matched: pass1Result.matches.length },
        pass2: { matched: pass2Result.matches.length, unmatched_remaining: pass2Result.unmatched.razorpay.length },
        pass3: {
          enabled: pass3Result.enabled,
          matched: pass3Result.matches.length,
          unmatched_remaining: pass3Result.unmatched.razorpay.length,
          notes: pass3Result.notes,
        },
        matches_count: allMatches.length,
        exceptions_count: exceptionLogs.length,
      };

      this.emitPipelineEvent({
        type: 'reconcile_complete',
        runId,
        timestamp: nowIso(),
        data: summaryPayload,
      });

      return summaryPayload;
    } catch (error: any) {
      console.error(`[Pipeline Error] Run ${runId} failed:`, error);
      await prisma.reconciliationRun.update({
        where: { id: runId },
        data: { status: 'failed' },
      }).catch(() => {});

      this.emitPipelineEvent({
        type: 'error',
        runId,
        timestamp: nowIso(),
        data: { message: error instanceof Error ? error.message : 'Unknown pipeline error' },
      });
      throw error;
    } finally {
      this.activeRuns.delete(runId);
    }
  }
}

export const pipelineManager = new PipelineManager();

type ExceptionPayload = {
  source_system: string;
  source_id: string;
  reasoning: string;
  suggested_action: string;
};

function buildExceptionLogs(
  unmatched: {
    razorpay: RzpRecord[];
    bank: BankRecord[];
    ledger: LedgerRecord[];
  },
  llmDecisions: Array<{
    payment_id: string;
    matched: boolean;
    reasoning: string;
    suggested_action: string;
  }> = []
): ExceptionPayload[] {
  const decisionByPayment = new Map(llmDecisions.map((decision) => [decision.payment_id, decision]));

  return [
    ...unmatched.razorpay.map((record) => ({
      source_system: 'Razorpay',
      source_id: record.payment_id,
      reasoning:
        decisionByPayment.get(record.payment_id)?.reasoning ??
        'No deterministic, fuzzy, or LLM match found across bank and ledger sources.',
      suggested_action:
        decisionByPayment.get(record.payment_id)?.suggested_action ??
        'Escalate to manual finance-ops investigation.',
    })),
    ...unmatched.bank.map((record) => ({
      source_system: 'Bank',
      source_id: record.txn_id,
      reasoning: 'Bank credit remained unmatched after deterministic and fuzzy passes.',
      suggested_action: 'Check for missing Razorpay payment, split settlement, or narration-only reference.',
    })),
    ...unmatched.ledger.map((record) => ({
      source_system: 'Ledger',
      source_id: record.entry_id,
      reasoning: 'Ledger entry remained unmatched after deterministic and fuzzy passes.',
      suggested_action: 'Verify invoice status, expected amount, and payment reference.',
    })),
  ];
}
