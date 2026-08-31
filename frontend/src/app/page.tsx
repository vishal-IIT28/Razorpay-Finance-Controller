'use client';

import React, { useState, useEffect } from 'react';
import {
  Layers,
  Sparkles,
  History,
  CheckCircle2,
  Clock,
  ArrowRight,
  Database,
  RefreshCw,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import UploadView from '@/components/UploadView';
import {
  API_BASE,
  DetectedRole,
  PastRunSummary,
  fetchPastRuns,
  startReconciliation,
} from '@/lib/api';

export type ActiveView = 'upload' | 'live-stream' | 'dashboard';

export default function FinReconcileApp() {
  const [activeView, setActiveView] = useState<ActiveView>('upload');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pastRuns, setPastRuns] = useState<PastRunSummary[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load past runs history on mount or when opening modal
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const runs = await fetchPastRuns();
      setPastRuns(runs);
    } catch (e) {
      console.warn('Could not load past runs:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Trigger reconciliation from UploadView
  const handleStartReconciliation = async (
    files: Array<{ file: File; assignedRole: DetectedRole }>
  ) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await startReconciliation(files);
      setActiveRunId(response.run_id);
      // Move to View 2 (Live Stream)
      setActiveView('live-stream');
    } catch (err: any) {
      console.error('[Start reconciliation error]', err);
      setErrorMessage(err?.message || 'Reconciliation intake failed');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col selection:bg-sky-500/30">
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-30 bg-[#090d16]/90 backdrop-blur-md border-b border-slate-800/80 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/10">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-white tracking-tight">
                  FinReconcile
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono-numbers font-medium bg-slate-800 text-slate-300 border border-slate-700">
                  Audit Controller
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Automated Settlement & Financial Operations Controller
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* System Status Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0f172a] border border-slate-800 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>System Online</span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-400">Neon DB Connected</span>
            </div>

            {/* Past Runs History Button */}
            <button
              onClick={() => {
                setShowHistoryModal(true);
                loadHistory();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <History className="w-4 h-4 text-sky-400" />
              Past Runs ({pastRuns.length})
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-sm flex items-center justify-between">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* VIEW 1: Flexible Upload & Schema Detection */}
        {activeView === 'upload' && (
          <UploadView
            onStartReconciliation={handleStartReconciliation}
            isSubmitting={isSubmitting}
          />
        )}

        {/* View 2 placeholder */}
        {activeView === 'live-stream' && (
          <div className="p-8 rounded-xl bg-slate-900 border border-slate-800 text-center space-y-4">
            <RefreshCw className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
            <h3 className="text-lg font-semibold text-slate-200">Reconciliation Running</h3>
            <p className="text-xs text-slate-400 font-mono-numbers">Active Run ID: {activeRunId}</p>
          </div>
        )}
      </main>

      {/* Past Runs History Drawer / Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <History className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-semibold text-slate-100">
                  Reconciliation Run History
                </h3>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {loadingHistory ? (
                <div className="py-12 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
                  Loading runs history from database...
                </div>
              ) : pastRuns.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  No completed runs found. Execute a reconciliation run to generate audit logs.
                </div>
              ) : (
                pastRuns.map((run) => (
                  <div
                    key={run.run_id}
                    className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono-numbers text-sky-400 font-medium">
                          {run.run_id.slice(0, 8)}...{run.run_id.slice(-6)}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-800/80">
                          {run.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-400 mt-2 font-mono-numbers">
                        <span>Records: {run.total_records}</span>
                        <span>Matched: {run.total_matched} ({run.match_rate_pct}%)</span>
                        <span>Exceptions: {run.exceptions}</span>
                        {run.duration_ms && <span>Duration: {(run.duration_ms / 1000).toFixed(1)}s</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <span className="text-[11px] text-slate-400 font-mono-numbers">
                        {new Date(run.created_at).toLocaleDateString()} {new Date(run.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}