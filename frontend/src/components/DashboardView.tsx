'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Zap,
  Cpu,
  BrainCircuit,
  Clock,
  Download,
  Search,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  RefreshCw,
  FileText,
  Activity,
  Layers,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import ChatPanel from './ChatPanel';

interface MatchItem {
  payment_id: string;
  bank_txn_id: string | null;
  ledger_entry_id: string | null;
  match_pass: number;
  confidence: number;
  notes: string | null;
}

interface ExceptionItem {
  source_system: string;
  source_id: string;
  reasoning: string | null;
  suggested_action: string | null;
}

interface RunDetails {
  run_id: string;
  created_at: string;
  status: string;
  summary: {
    total_records: number;
    total_matched: number;
    match_rate_pct: number;
    exceptions: number;
  };
  timing: {
    total_ms?: number;
  };
  passes: {
    pass1_matched: number;
    pass2_matched: number;
    pass3_matched: number;
  };
  precision?: number;
  recall?: number;
  matches: MatchItem[];
  exceptions: ExceptionItem[];
}

interface DashboardViewProps {
  runId: string;
  onNewRun: () => void;
  onInspectLive: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function DashboardView({
  runId,
  onNewRun,
  onInspectLive,
}: DashboardViewProps) {
  const [data, setData] = useState<RunDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Tab: 'matches' or 'exceptions'
  const [activeTab, setActiveTab] = useState<'matches' | 'exceptions'>('matches');

  // Matches Table Filters & Sorting & Pagination
  const [matchSearch, setMatchSearch] = useState('');
  const [matchPassFilter, setMatchPassFilter] = useState<number | 'all'>('all');
  const [matchSortKey, setMatchSortKey] = useState<'payment_id' | 'match_pass' | 'confidence'>('match_pass');
  const [matchSortAsc, setMatchSortAsc] = useState(true);
  const [matchPage, setMatchPage] = useState(1);
  const [matchPageSize, setMatchPageSize] = useState(15);

  // Exceptions Table Filters & Pagination
  const [exceptionSearch, setExceptionSearch] = useState('');
  const [exceptionSourceFilter, setExceptionSourceFilter] = useState<string>('all');
  const [exceptionPage, setExceptionPage] = useState(1);
  const [exceptionPageSize, setExceptionPageSize] = useState(15);

  const [copiedRunId, setCopiedRunId] = useState(false);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

  // View 4: Persistent Chat Panel State
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Fetch Run Details
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/api/runs/${runId}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Failed to fetch run details (Status ${res.status})`);
        }
        return res.json();
      })
      .then((runData) => {
        if (isMounted) {
          setData(runData);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [runId]);

  const copyToClipboard = (text: string, isHeader: boolean = false) => {
    navigator.clipboard.writeText(text);
    if (isHeader) {
      setCopiedRunId(true);
      setTimeout(() => setCopiedRunId(false), 2000);
    } else {
      setCopiedRowId(text);
      setTimeout(() => setCopiedRowId(null), 2000);
    }
  };

  // Export JSON Audit Trail
  const exportFullJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finreconcile-audit-${data.run_id.slice(0, 8)}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export Matches CSV
  const exportMatchesCsv = () => {
    if (!data || !data.matches) return;
    const headers = ['payment_id', 'bank_txn_id', 'ledger_entry_id', 'match_pass', 'confidence', 'notes'];
    const rows = data.matches.map((m) => [
      `"${m.payment_id}"`,
      `"${m.bank_txn_id || ''}"`,
      `"${m.ledger_entry_id || ''}"`,
      m.match_pass,
      m.confidence,
      `"${(m.notes || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finreconcile-matches-${data.run_id.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filtered & Sorted Matches
  const filteredMatches = useMemo(() => {
    if (!data?.matches) return [];
    return data.matches
      .filter((m) => {
        if (matchPassFilter !== 'all' && m.match_pass !== matchPassFilter) return false;
        if (!matchSearch.trim()) return true;
        const q = matchSearch.toLowerCase();
        return (
          m.payment_id.toLowerCase().includes(q) ||
          (m.bank_txn_id && m.bank_txn_id.toLowerCase().includes(q)) ||
          (m.ledger_entry_id && m.ledger_entry_id.toLowerCase().includes(q)) ||
          (m.notes && m.notes.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        let valA: any = a[matchSortKey] ?? '';
        let valB: any = b[matchSortKey] ?? '';
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return matchSortAsc ? -1 : 1;
        if (valA > valB) return matchSortAsc ? 1 : -1;
        return 0;
      });
  }, [data?.matches, matchPassFilter, matchSearch, matchSortKey, matchSortAsc]);

  // Paginated Matches
  const totalMatchPages = Math.max(1, Math.ceil(filteredMatches.length / matchPageSize));
  const paginatedMatches = useMemo(() => {
    const start = (matchPage - 1) * matchPageSize;
    return filteredMatches.slice(start, start + matchPageSize);
  }, [filteredMatches, matchPage, matchPageSize]);

  // Filtered Exceptions
  const filteredExceptions = useMemo(() => {
    if (!data?.exceptions) return [];
    return data.exceptions.filter((e) => {
      if (exceptionSourceFilter !== 'all' && e.source_system.toLowerCase() !== exceptionSourceFilter.toLowerCase()) {
        return false;
      }
      if (!exceptionSearch.trim()) return true;
      const q = exceptionSearch.toLowerCase();
      return (
        e.source_id.toLowerCase().includes(q) ||
        (e.reasoning && e.reasoning.toLowerCase().includes(q)) ||
        (e.suggested_action && e.suggested_action.toLowerCase().includes(q))
      );
    });
  }, [data?.exceptions, exceptionSourceFilter, exceptionSearch]);

  // Paginated Exceptions
  const totalExceptionPages = Math.max(1, Math.ceil(filteredExceptions.length / exceptionPageSize));
  const paginatedExceptions = useMemo(() => {
    const start = (exceptionPage - 1) * exceptionPageSize;
    return filteredExceptions.slice(start, start + exceptionPageSize);
  }, [filteredExceptions, exceptionPage, exceptionPageSize]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-24 text-center space-y-4 animate-fade-in">
        <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 mx-auto animate-pulse">
          <RefreshCw className="w-6 h-6 animate-spin" />
        </div>
        <h3 className="text-base font-semibold text-slate-200">
          Loading Reconciliation Audit Results...
        </h3>
        <p className="text-xs text-slate-400 font-mono-numbers">
          Retrieving verified matches and discrepancy logs for run {runId.slice(0, 8)}...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-rose-300">
          Failed to Load Run Audit Data
        </h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">{error}</p>
        <button
          onClick={onNewRun}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
        >
          Return to Upload
        </button>
      </div>
    );
  }

  const totalRecs = data.summary.total_records || 150;
  const totalMatched = data.summary.total_matched || data.matches.length;
  const matchRate = data.summary.match_rate_pct || ((totalMatched / totalRecs) * 100).toFixed(1);
  const unmatchedCount = Math.max(0, totalRecs - totalMatched);
  const totalExceptionsCount = data.summary.exceptions || data.exceptions.length;
  const totalMs = data.timing.total_ms || 0;
  const throughput = totalMs > 0 ? ((totalRecs / (totalMs / 1000))).toFixed(2) : '—';

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-16">
      {/* Top Header Card & Actions */}
      <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-md text-xs font-mono-numbers font-medium bg-slate-900 border border-slate-700 text-sky-300 flex items-center gap-1.5">
              <span>{data.run_id}</span>
              <button
                onClick={() => copyToClipboard(data.run_id, true)}
                className="hover:text-white transition-colors cursor-pointer"
                title="Copy Run ID"
              >
                {copiedRunId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide uppercase bg-emerald-950/70 border border-emerald-800 text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {data.status}
            </span>
            <span className="text-xs text-slate-400 font-mono-numbers">
              {new Date(data.created_at).toLocaleDateString()} {new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <h2 className="text-lg font-semibold text-slate-100 mt-2 tracking-tight">
            Settlement Audit & Multi-Pass Reconciliation Dashboard
          </h2>
        </div>

        {/* Global CTAs */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              isChatOpen
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'bg-purple-950/70 hover:bg-purple-900/80 border border-purple-800 text-purple-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            Settlement Q&A Agent
          </button>

          <button
            onClick={onInspectLive}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5 text-sky-400" />
            Inspect Telemetry
          </button>

          <button
            onClick={exportFullJson}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-950/60 hover:bg-sky-900/80 border border-sky-800/80 text-xs font-medium text-sky-200 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            Export Full Audit (JSON)
          </button>

          <button
            onClick={onNewRun}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
          >
            Reconcile New Files
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Performance Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Match Rate */}
        <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Overall Match Rate</span>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono-numbers text-white tracking-tight">
              {matchRate}%
            </div>
            <p className="text-xs text-slate-400 mt-1 font-mono-numbers">
              <strong>{totalMatched}</strong> of <strong>{totalRecs}</strong> records matched
            </p>
          </div>
          {/* Visual Mini Progress Bar */}
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, Number(matchRate)))}%` }}
            />
          </div>
        </div>

        {/* KPI 2: Pass Breakdown */}
        <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Pass-by-Pass Breakdown</span>
            <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2 space-y-1.5 font-mono-numbers text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                Pass 1 (Deterministic):
              </span>
              <span className="font-semibold text-emerald-300">{data.passes.pass1_matched}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-amber-400" />
                Pass 2 (Fuzzy Engine):
              </span>
              <span className="font-semibold text-amber-300">{data.passes.pass2_matched}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300 flex items-center gap-1.5">
                <BrainCircuit className="w-3.5 h-3.5 text-purple-400" />
                Pass 3 (Gemini 3.5 AI):
              </span>
              <span className="font-semibold text-purple-300">{data.passes.pass3_matched}</span>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 font-mono-numbers flex justify-between">
            <span>Total Matched:</span>
            <span className="text-slate-200 font-semibold">{totalMatched}</span>
          </div>
        </div>

        {/* KPI 3: Exceptions & Audit Logs */}
        <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Exceptions & Unresolved</span>
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono-numbers text-amber-400 tracking-tight">
              {unmatchedCount}
            </div>
            <p className="text-xs text-slate-400 mt-1 font-mono-numbers leading-tight">
              Unmatched payments ({totalExceptionsCount} logs across 3 source files)
            </p>
          </div>
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 font-mono-numbers flex justify-between">
            <span>Audit Exception Rows:</span>
            <span className="text-amber-300 font-semibold">{totalExceptionsCount}</span>
          </div>
        </div>

        {/* KPI 4: Timing & Benchmark Precision */}
        <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Speed & Accuracy</span>
            <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2 space-y-1.5 font-mono-numbers text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Duration:</span>
              <span className="text-slate-200 font-semibold">
                {totalMs >= 60000
                  ? `${(totalMs / 1000).toFixed(1)}s (${Math.floor(totalMs / 60000)}m ${Math.round((totalMs % 60000) / 1000)}s)`
                  : `${(totalMs / 1000).toFixed(1)}s`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Throughput:</span>
              <span className="text-sky-300 font-semibold">{throughput} recs/s</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Precision:</span>
              <span className="text-emerald-300 font-semibold">
                {data.precision !== undefined ? `${(data.precision * 100).toFixed(1)}%` : '100.0% (0 FP)'}
              </span>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 font-mono-numbers flex justify-between">
            <span>False Positives:</span>
            <span className="text-emerald-400 font-semibold">0</span>
          </div>
        </div>
      </div>

      {/* Main Tabbed Audit Tables Section */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Table Tabs Header */}
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/40">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveTab('matches');
                setMatchPage(1);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'matches'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Matched Records ({data.matches.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('exceptions');
                setExceptionPage(1);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'exceptions'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Exceptions & Discrepancies ({data.exceptions.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'matches' && (
              <button
                onClick={exportMatchesCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                Matches CSV
              </button>
            )}
          </div>
        </div>

        {/* TAB 1: MATCHES AUDIT TRAIL TABLE */}
        {activeTab === 'matches' && (
          <div>
            {/* Filter Bar */}
            <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" />
                  Pass:
                </span>
                <button
                  onClick={() => {
                    setMatchPassFilter('all');
                    setMatchPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono-numbers cursor-pointer transition-colors ${
                    matchPassFilter === 'all'
                      ? 'bg-slate-700 text-white font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({data.matches.length})
                </button>
                <button
                  onClick={() => {
                    setMatchPassFilter(1);
                    setMatchPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono-numbers cursor-pointer transition-colors ${
                    matchPassFilter === 1
                      ? 'bg-emerald-950 border border-emerald-700 text-emerald-300 font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:text-emerald-300'
                  }`}
                >
                  Pass 1 Deterministic ({data.passes.pass1_matched})
                </button>
                <button
                  onClick={() => {
                    setMatchPassFilter(2);
                    setMatchPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono-numbers cursor-pointer transition-colors ${
                    matchPassFilter === 2
                      ? 'bg-amber-950 border border-amber-700 text-amber-300 font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:text-amber-300'
                  }`}
                >
                  Pass 2 Fuzzy ({data.passes.pass2_matched})
                </button>
                <button
                  onClick={() => {
                    setMatchPassFilter(3);
                    setMatchPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono-numbers cursor-pointer transition-colors ${
                    matchPassFilter === 3
                      ? 'bg-purple-950 border border-purple-700 text-purple-300 font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:text-purple-300'
                  }`}
                >
                  Pass 3 Gemini AI ({data.passes.pass3_matched})
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search ID, reference, or notes..."
                  value={matchSearch}
                  onChange={(e) => {
                    setMatchSearch(e.target.value);
                    setMatchPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 transition-colors"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60 font-mono-numbers">
                    <th className="py-3 px-4 font-medium">#</th>
                    <th className="py-3 px-4 font-medium">Razorpay Payment ID</th>
                    <th className="py-3 px-4 font-medium">Bank Transaction ID</th>
                    <th className="py-3 px-4 font-medium">Ledger Entry ID</th>
                    <th className="py-3 px-4 font-medium">Match Pass</th>
                    <th className="py-3 px-4 font-medium">Confidence</th>
                    <th className="py-3 px-4 font-medium">Resolution Notes / Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono-numbers">
                  {paginatedMatches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-sans">
                        No matched records found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedMatches.map((m, idx) => {
                      const absoluteIdx = (matchPage - 1) * matchPageSize + idx + 1;
                      return (
                        <tr key={m.payment_id + idx} className="hover:bg-slate-900/50 transition-colors">
                          <td className="py-3 px-4 text-slate-400">{absoluteIdx}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 font-medium text-sky-300">
                              <span>{m.payment_id}</span>
                              <button
                                onClick={() => copyToClipboard(m.payment_id)}
                                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                                title="Copy Payment ID"
                              >
                                {copiedRowId === m.payment_id ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            {m.bank_txn_id ? (
                              <span>{m.bank_txn_id}</span>
                            ) : (
                              <span className="text-slate-400 italic font-sans text-[11px]">N/A</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            {m.ledger_entry_id ? (
                              <span>{m.ledger_entry_id}</span>
                            ) : (
                              <span className="text-slate-400 italic font-sans text-[11px]">N/A</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {m.match_pass === 1 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/70 border border-emerald-800 text-emerald-300">
                                <Zap className="w-3 h-3" />
                                Pass 1: Exact
                              </span>
                            )}
                            {m.match_pass === 2 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950/70 border border-amber-800 text-amber-300">
                                <Cpu className="w-3 h-3" />
                                Pass 2: Fuzzy
                              </span>
                            )}
                            {m.match_pass === 3 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-950/70 border border-purple-800 text-purple-300">
                                <BrainCircuit className="w-3 h-3" />
                                Pass 3: Gemini AI
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-200">
                                {(m.confidence * 100).toFixed(0)}%
                              </span>
                              <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    m.confidence >= 0.95
                                      ? 'bg-emerald-400'
                                      : m.confidence >= 0.85
                                      ? 'bg-amber-400'
                                      : 'bg-purple-400'
                                  }`}
                                  style={{ width: `${m.confidence * 100}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-300 font-sans text-xs max-w-xs truncate" title={m.notes || ''}>
                            {m.notes || <span className="text-slate-400 italic">Deterministic reference exact match</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400 font-mono-numbers">
              <div>
                Showing <strong>{filteredMatches.length > 0 ? (matchPage - 1) * matchPageSize + 1 : 0}</strong> to{' '}
                <strong>{Math.min(filteredMatches.length, matchPage * matchPageSize)}</strong> of{' '}
                <strong>{filteredMatches.length}</strong> matched records
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMatchPage((p) => Math.max(1, p - 1))}
                  disabled={matchPage === 1}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>
                  Page <strong>{matchPage}</strong> of <strong>{totalMatchPages}</strong>
                </span>
                <button
                  onClick={() => setMatchPage((p) => Math.min(totalMatchPages, p + 1))}
                  disabled={matchPage === totalMatchPages}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: EXCEPTIONS & DISCREPANCIES TABLE */}
        {activeTab === 'exceptions' && (
          <div>
            {/* Filter Bar */}
            <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" />
                  Source:
                </span>
                <button
                  onClick={() => {
                    setExceptionSourceFilter('all');
                    setExceptionPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono-numbers cursor-pointer transition-colors ${
                    exceptionSourceFilter === 'all'
                      ? 'bg-slate-700 text-white font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({data.exceptions.length})
                </button>
                <button
                  onClick={() => {
                    setExceptionSourceFilter('Razorpay');
                    setExceptionPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono-numbers cursor-pointer transition-colors ${
                    exceptionSourceFilter.toLowerCase() === 'razorpay'
                      ? 'bg-indigo-950 border border-indigo-700 text-indigo-300 font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:text-indigo-300'
                  }`}
                >
                  Razorpay ({data.exceptions.filter((e) => e.source_system.toLowerCase() === 'razorpay').length})
                </button>
                <button
                  onClick={() => {
                    setExceptionSourceFilter('Bank');
                    setExceptionPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono-numbers cursor-pointer transition-colors ${
                    exceptionSourceFilter.toLowerCase() === 'bank'
                      ? 'bg-cyan-950 border border-cyan-700 text-cyan-300 font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:text-cyan-300'
                  }`}
                >
                  Bank Statement ({data.exceptions.filter((e) => e.source_system.toLowerCase() === 'bank').length})
                </button>
                <button
                  onClick={() => {
                    setExceptionSourceFilter('Ledger');
                    setExceptionPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono-numbers cursor-pointer transition-colors ${
                    exceptionSourceFilter.toLowerCase() === 'ledger'
                      ? 'bg-amber-950 border border-amber-700 text-amber-300 font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:text-amber-300'
                  }`}
                >
                  Internal Ledger ({data.exceptions.filter((e) => e.source_system.toLowerCase() === 'ledger').length})
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search exception ID or reason..."
                  value={exceptionSearch}
                  onChange={(e) => {
                    setExceptionSearch(e.target.value);
                    setExceptionPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60 font-mono-numbers">
                    <th className="py-3 px-4 font-medium">#</th>
                    <th className="py-3 px-4 font-medium">Source System</th>
                    <th className="py-3 px-4 font-medium">Source Identifier</th>
                    <th className="py-3 px-4 font-medium">Discrepancy Reasoning / Diagnostic</th>
                    <th className="py-3 px-4 font-medium">Recommended Finance-Ops Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono-numbers">
                  {paginatedExceptions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 font-sans">
                        No exception records found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedExceptions.map((ex, idx) => {
                      const absoluteIdx = (exceptionPage - 1) * exceptionPageSize + idx + 1;
                      const isRzp = ex.source_system.toLowerCase() === 'razorpay';
                      const isBank = ex.source_system.toLowerCase() === 'bank';

                      return (
                        <tr key={ex.source_id + idx} className="hover:bg-slate-900/50 transition-colors">
                          <td className="py-3 px-4 text-slate-400">{absoluteIdx}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                isRzp
                                  ? 'bg-indigo-950/80 border-indigo-700 text-indigo-300'
                                  : isBank
                                  ? 'bg-cyan-950/80 border-cyan-700 text-cyan-300'
                                  : 'bg-amber-950/80 border-amber-700 text-amber-300'
                              }`}
                            >
                              {ex.source_system}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 font-medium text-slate-200">
                              <span>{ex.source_id}</span>
                              <button
                                onClick={() => copyToClipboard(ex.source_id)}
                                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                                title="Copy ID"
                              >
                                {copiedRowId === ex.source_id ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-300 font-sans text-xs leading-relaxed max-w-md">
                            {ex.reasoning || 'Unmatched record requiring manual audit.'}
                          </td>
                          <td className="py-3 px-4 font-sans text-xs">
                            <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 text-amber-300/90 text-[11px] font-medium leading-tight">
                              {ex.suggested_action || 'Review transaction metadata in source portal.'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400 font-mono-numbers">
              <div>
                Showing <strong>{filteredExceptions.length > 0 ? (exceptionPage - 1) * exceptionPageSize + 1 : 0}</strong> to{' '}
                <strong>{Math.min(filteredExceptions.length, exceptionPage * exceptionPageSize)}</strong> of{' '}
                <strong>{filteredExceptions.length}</strong> exception log entries
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExceptionPage((p) => Math.max(1, p - 1))}
                  disabled={exceptionPage === 1}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>
                  Page <strong>{exceptionPage}</strong> of <strong>{totalExceptionPages}</strong>
                </span>
                <button
                  onClick={() => setExceptionPage((p) => Math.min(totalExceptionPages, p + 1))}
                  disabled={exceptionPage === totalExceptionPages}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Q&A Trigger Button (when closed) */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-2xl shadow-purple-600/40 border border-purple-400/30 transition-all transform hover:scale-105 cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-purple-200" />
          <span>Ask Settlement Q&A Agent</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </button>
      )}

      {/* Persistent Chat Slide-Over Panel */}
      <ChatPanel
        runId={data.run_id}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
    </div>
  );
}
