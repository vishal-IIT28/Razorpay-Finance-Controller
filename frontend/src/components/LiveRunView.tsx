'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  Cpu,
  BrainCircuit,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Terminal,
  ShieldCheck,
  Zap,
  Radio,
  FileSpreadsheet,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';

export interface Pass3ProgressItem {
  index: number;
  total: number;
  paymentId: string;
  matched: boolean;
  runningMatched: number;
  reasoning: string;
  timestamp: string;
}

export interface LiveRunViewProps {
  runId: string;
  onComplete: (runId: string) => void;
}

export default function LiveRunView({ runId, onComplete }: LiveRunViewProps) {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error'>('connecting');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Pipeline execution state
  const [totalRecords, setTotalRecords] = useState(0);
  const [pass1Status, setPass1Status] = useState<'idle' | 'running' | 'completed'>('idle');
  const [pass1Stats, setPass1Stats] = useState<{ matched: number; duration_ms: number } | null>(null);

  const [pass2Status, setPass2Status] = useState<'idle' | 'running' | 'completed'>('idle');
  const [pass2Stats, setPass2Stats] = useState<{ matched: number; duration_ms: number } | null>(null);

  const [pass3Status, setPass3Status] = useState<'idle' | 'running' | 'completed'>('idle');
  const [pass3Stats, setPass3Stats] = useState<{ matched: number; duration_ms: number } | null>(null);
  const [pass3Current, setPass3Current] = useState<{ index: number; total: number; paymentId: string } | null>(null);

  const [tickerItems, setTickerItems] = useState<Pass3ProgressItem[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [completedSummary, setCompletedSummary] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const tickerEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Pre-load run details if already completed in DB
  useEffect(() => {
    fetch(`${API_BASE}/api/runs/${runId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((runData) => {
        if (runData && runData.status === 'completed') {
          setIsCompleted(true);
          setConnectionStatus('closed');
          setTotalRecords(runData.summary?.total_records || 150);
          setCompletedSummary({
            total_records: runData.summary?.total_records,
            total_matched: runData.summary?.total_matched,
            match_rate_pct: runData.summary?.match_rate_pct,
            exceptions: runData.summary?.exceptions,
            timing: { total_ms: runData.timing?.total_ms },
            duration_ms: runData.timing?.total_ms,
            durationMs: runData.timing?.total_ms,
          });
          if (runData.passes) {
            setPass1Stats({ matched: runData.passes.pass1_matched, duration_ms: 10 });
            setPass1Status('completed');
            setPass2Stats({ matched: runData.passes.pass2_matched, duration_ms: 100 });
            setPass2Status('completed');
            setPass3Stats({
              matched: runData.passes.pass3_matched,
              duration_ms: Math.max(0, (runData.timing?.total_ms || 0) - 110),
            });
            setPass3Status('completed');
          }
        }
      })
      .catch(() => {});
  }, [runId]);

  // Elapsed timer
  useEffect(() => {
    if (isCompleted) return;
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isCompleted]);

  // Connect to SSE Stream GET /api/reconcile/:runId/stream
  useEffect(() => {
    let sse: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSse = () => {
      setConnectionStatus('connecting');
      sse = new EventSource(`${API_BASE}/api/reconcile/${runId}/stream`);
      eventSourceRef.current = sse;

      sse.onopen = () => {
        setConnectionStatus('connected');
      };

      const handlePipelineEvent = (eventType: string, eventDataString: string) => {
        try {
          const payload = JSON.parse(eventDataString);
          const { runId: eventRunId, timestamp, ...data } = payload;
          const type = eventType || payload.type;

          switch (type) {
            case 'pipeline_init':
              setTotalRecords(data.total_records || 0);
              break;

            case 'pass1_started':
              setPass1Status('running');
              break;

            case 'pass1_complete':
              setPass1Status('completed');
              setPass1Stats({ matched: data.matched, duration_ms: data.duration_ms });
              break;

            case 'pass2_started':
              setPass2Status('running');
              break;

            case 'pass2_complete':
              setPass2Status('completed');
              setPass2Stats({ matched: data.matched, duration_ms: data.duration_ms });
              break;

            case 'pass3_started':
              setPass3Status('running');
              setPass3Current({
                index: 0,
                total: data.total_to_review || data.input_count || data.totalRecords || 0,
                paymentId: 'Initializing Gemini...',
              });
              break;

            case 'pass3_progress': {
              const curIdx = data.current_index ?? data.index ?? data.currentIndex ?? 0;
              const totalRecs = data.total_records ?? data.total ?? data.totalRecords ?? 0;
              const payId = data.payment_id ?? data.paymentId ?? '';
              const isMatched = Boolean(data.matched);
              const runningMatches = data.running_match_count ?? data.running_matched ?? data.runningMatchCount ?? 0;
              const reasonText = data.reasoning || '';

              setPass3Status('running');
              setPass3Current({ index: curIdx, total: totalRecs, paymentId: payId });
              setTickerItems((prev) => [
                ...prev,
                {
                  index: curIdx,
                  total: totalRecs,
                  paymentId: payId,
                  matched: isMatched,
                  runningMatched: runningMatches,
                  reasoning: reasonText,
                  timestamp: timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
                },
              ]);
              break;
            }

            case 'pass3_complete':
              setPass3Status('completed');
              setPass3Stats({ matched: data.matched, duration_ms: data.duration_ms });
              break;

            case 'reconcile_complete':
              setIsCompleted(true);
              setCompletedSummary(data);
              setConnectionStatus('closed');
              sse?.close();
              break;

            case 'error':
              setErrorMessage(data.message || 'Pipeline execution encountered an error.');
              setConnectionStatus('error');
              break;

            default:
              break;
          }
        } catch (e) {
          console.error('[SSE parse error]', e);
        }
      };

      const eventNames = [
        'pipeline_init',
        'pass1_started',
        'pass1_complete',
        'pass2_started',
        'pass2_complete',
        'pass3_started',
        'pass3_progress',
        'pass3_complete',
        'reconcile_complete',
        'error',
      ];

      for (const name of eventNames) {
        sse.addEventListener(name, (e: MessageEvent) => {
          handlePipelineEvent(name, e.data);
        });
      }

      sse.onmessage = (event) => {
        handlePipelineEvent('', event.data);
      };

      sse.onerror = () => {
        if (!isCompleted) {
          setConnectionStatus('reconnecting');
          sse?.close();
          reconnectTimeout = setTimeout(connectSse, 3000);
        }
      };
    };

    connectSse();

    return () => {
      sse?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [runId, isCompleted]);

  // Auto-scroll the live ticker
  useEffect(() => {
    tickerEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tickerItems]);

  const totalMatchedRunning =
    (pass1Stats?.matched || 0) +
    (pass2Stats?.matched || 0) +
    (tickerItems.length > 0 ? tickerItems[tickerItems.length - 1]!.runningMatched : 0);

  const totalRecs =
    completedSummary?.total_records ??
    completedSummary?.summary?.total_records ??
    totalRecords;

  const matchedRecs = isCompleted
    ? (completedSummary?.total_matched ??
       completedSummary?.summary?.total_matched ??
       totalMatchedRunning)
    : totalMatchedRunning;

  const matchRateRunning = totalRecs > 0 ? ((matchedRecs / totalRecs) * 100).toFixed(1) : '0.0';

  const stageSumsMs = (pass1Stats?.duration_ms || 0) + (pass2Stats?.duration_ms || 0) + (pass3Stats?.duration_ms || 0);
  const computedTotalMs =
    completedSummary?.timing?.total_ms ??
    completedSummary?.duration_ms ??
    completedSummary?.durationMs ??
    (stageSumsMs > 0 ? stageSumsMs : (elapsedSeconds > 0 ? elapsedSeconds * 1000 : 0));

  const displayElapsedSec = isCompleted && computedTotalMs > 0
    ? Math.round(computedTotalMs / 1000)
    : elapsedSeconds;

  const formatTimerDigits = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const unmatchedRecs = Math.max(0, totalRecs - matchedRecs);

  const totalExceptionLogs =
    completedSummary?.exceptions ??
    completedSummary?.summary?.exceptions ??
    completedSummary?.exceptions_count ??
    unmatchedRecs;

  const durationFormatted =
    computedTotalMs >= 60000
      ? `${(computedTotalMs / 1000).toFixed(1)}s (${Math.floor(computedTotalMs / 60000)}m ${Math.round((computedTotalMs % 60000) / 1000)}s)`
      : `${(computedTotalMs / 1000).toFixed(1)}s`;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Telemetry Header */}
      <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-100 tracking-tight">
                  Live Reconciliation Telemetry
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono-numbers font-medium bg-slate-800 text-slate-300 border border-slate-700">
                  {runId.slice(0, 8)}...{runId.slice(-6)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Streaming live multi-pass resolution events over HTTP Server-Sent Events.
              </p>
            </div>
          </div>
        </div>

        {/* Live Counters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Connection Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            {connectionStatus === 'connected' && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-emerald-300 font-medium">SSE Stream Connected</span>
              </>
            )}
            {connectionStatus === 'connecting' && (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                <span className="text-sky-300">Connecting Stream...</span>
              </>
            )}
            {connectionStatus === 'reconnecting' && (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-300">Reconnecting Stream...</span>
              </>
            )}
            {connectionStatus === 'closed' && (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Pipeline Finished</span>
              </>
            )}
          </div>

          {/* Stopwatch */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono-numbers text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{formatTimerDigits(displayElapsedSec)}</span>
          </div>

          {/* Running Match Rate */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-sky-950/40 border border-sky-800/60 text-xs font-mono-numbers text-sky-300">
            <Zap className="w-3.5 h-3.5 text-sky-400" />
            <span>Matched: <strong>{matchedRecs}</strong> / {totalRecs} ({matchRateRunning}%)</span>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 3-Pass Stage Pipeline Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pass 1: Deterministic */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            pass1Status === 'completed'
              ? 'bg-emerald-950/20 border-emerald-800/60'
              : pass1Status === 'running'
              ? 'bg-sky-950/30 border-sky-500 shadow-lg shadow-sky-500/10'
              : 'bg-[#0f172a] border-slate-800 opacity-60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-emerald-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              Pass 1: Deterministic
            </span>
            {pass1Status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            {pass1Status === 'running' && <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />}
          </div>
          <p className="text-xs text-slate-300 font-medium mt-2">Exact Reference & Amount</p>
          <p className="text-[11px] text-slate-400 mt-0.5">O(1) Hash Map fast match</p>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono-numbers">
            <span className="text-slate-400">Matched:</span>
            <span className="font-semibold text-emerald-300">
              {pass1Stats ? `${pass1Stats.matched} (${pass1Stats.duration_ms}ms)` : '—'}
            </span>
          </div>
        </div>

        {/* Pass 2: Calibrated Fuzzy */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            pass2Status === 'completed'
              ? 'bg-amber-950/20 border-amber-800/60'
              : pass2Status === 'running'
              ? 'bg-sky-950/30 border-sky-500 shadow-lg shadow-sky-500/10'
              : 'bg-[#0f172a] border-slate-800 opacity-60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-amber-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              Pass 2: Fuzzy Matching
            </span>
            {pass2Status === 'completed' && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
            {pass2Status === 'running' && <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />}
          </div>
          <p className="text-xs text-slate-300 font-medium mt-2">Date Drift & Narration</p>
          <p className="text-[11px] text-slate-400 mt-0.5">3-day window & 2% tolerance</p>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono-numbers">
            <span className="text-slate-400">Matched:</span>
            <span className="font-semibold text-amber-300">
              {pass2Stats ? `${pass2Stats.matched} (${pass2Stats.duration_ms}ms)` : '—'}
            </span>
          </div>
        </div>

        {/* Pass 3: Gemini LLM Agent */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            pass3Status === 'completed'
              ? 'bg-purple-950/20 border-purple-800/60'
              : pass3Status === 'running'
              ? 'bg-purple-950/30 border-purple-500 shadow-lg shadow-purple-500/10'
              : 'bg-[#0f172a] border-slate-800 opacity-60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-purple-400 flex items-center gap-1.5">
              <BrainCircuit className="w-3.5 h-3.5" />
              Pass 3: Gemini 3.5 AI
            </span>
            {pass3Status === 'completed' && <CheckCircle2 className="w-4 h-4 text-purple-400" />}
            {pass3Status === 'running' && <RefreshCw className="w-4 h-4 text-purple-400 animate-spin" />}
          </div>
          <p className="text-xs text-slate-300 font-medium mt-2">Discrepancy Resolution</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Per-record reasoning & audits</p>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono-numbers">
            <span className="text-slate-400">Matched:</span>
            <span className="font-semibold text-purple-300">
              {pass3Stats
                ? `${pass3Stats.matched} (${(pass3Stats.duration_ms / 1000).toFixed(1)}s)`
                : pass3Current
                ? `Resolving ${pass3Current.index}/${pass3Current.total}`
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Live Pass 3 Scrolling Resolution Ticker */}
      <div className="rounded-2xl bg-[#0a0f1d] border border-slate-800 overflow-hidden shadow-2xl">
        {/* Ticker Bar Header */}
        <div className="px-5 py-3.5 bg-[#0f172a] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Live AI Resolution Ticker (Pass 3 Per-Record Stream)
            </span>
          </div>
          {pass3Current && pass3Current.total > 0 && (
            <span className="text-xs font-mono-numbers font-medium text-purple-300 bg-purple-950/70 border border-purple-800/80 px-2.5 py-0.5 rounded-full">
              Progress: {pass3Current.index} / {pass3Current.total} ({((pass3Current.index / pass3Current.total) * 100).toFixed(0)}%)
            </span>
          )}
        </div>

        {/* Ticker Items Container */}
        <div className="p-4 max-h-[380px] min-h-[220px] overflow-y-auto space-y-2.5 font-mono-numbers text-xs">
          {tickerItems.length === 0 ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
              <span>
                {pass1Status === 'running' || pass2Status === 'running'
                  ? 'Executing Pass 1 & Pass 2 matching algorithms...'
                  : 'Awaiting Pass 3 AI discrepancy resolution events...'}
              </span>
            </div>
          ) : (
            tickerItems.map((item, idx) => (
              <div
                key={`${item.paymentId}-${idx}`}
                className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-start justify-between gap-3 transition-all ${
                  item.matched
                    ? 'bg-emerald-950/20 border-emerald-900/60 text-slate-200'
                    : 'bg-slate-900/80 border-slate-800/80 text-slate-300'
                }`}
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                      #{item.index.toString().padStart(2, '0')}/{item.total}
                    </span>
                    <span className="font-semibold text-sky-400">{item.paymentId}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                        item.matched
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-rose-950/70 text-rose-300 border border-rose-800'
                      }`}
                    >
                      {item.matched ? 'MATCHED' : 'UNRESOLVED EXCEPTION'}
                    </span>
                  </div>
                  {item.reasoning && (
                    <p className="text-[11px] text-slate-300 font-sans leading-relaxed pt-0.5">
                      &ldquo;{item.reasoning}&rdquo;
                    </p>
                  )}
                </div>

                <div className="text-[10px] text-slate-400 shrink-0 self-end sm:self-start">
                  {item.timestamp}
                </div>
              </div>
            ))
          )}
          <div ref={tickerEndRef} />
        </div>
      </div>

      {/* Completion Banner & CTA */}
      {isCompleted && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/50 via-slate-900 to-sky-950/50 border border-emerald-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-emerald-200">
                Reconciliation Complete
              </h3>
              <p className="text-xs text-slate-300 mt-0.5 font-mono-numbers leading-relaxed">
                Matched <strong>{matchedRecs}</strong> of <strong>{totalRecs}</strong> records (
                <strong>{matchRateRunning}%</strong>) in <strong>{durationFormatted}</strong> —{' '}
                <strong>{unmatchedRecs}</strong> unresolved payments (
                {totalExceptionLogs > unmatchedRecs ? (
                  <span><strong>{totalExceptionLogs}</strong> exception logs across 3 sources</span>
                ) : (
                  <span><strong>{unmatchedRecs}</strong> exceptions</span>
                )}
                ).
              </p>
            </div>
          </div>

          <button
            onClick={() => onComplete(runId)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm shadow-lg shadow-emerald-500/20 transition-all cursor-pointer shrink-0"
          >
            Explore Dashboard & Audit Trail
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
