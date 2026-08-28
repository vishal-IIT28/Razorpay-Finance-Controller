'use client';

import { useState } from 'react';
import { uploadAndReconcile } from '@/lib/api';

export default function Dashboard() {
  const [razorpayFile, setRazorpayFile] = useState<File | null>(null);
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [ledgerFile, setLedgerFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    summary: {
      totalRecords: number;
      matchRate: number;
      pass1Matched: number;
      pass2Matched: number;
      pass3Matched: number;
      exceptionsCount: number;
    };
    exceptions: any[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReconcile = async () => {
    if (!razorpayFile || !bankFile || !ledgerFile) {
      setError('Please upload all 3 CSV files.');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res: any = await uploadAndReconcile(razorpayFile, bankFile, ledgerFile);

      setData({
        summary: {
          totalRecords: res.summary?.total_records ?? 0,
          matchRate: res.summary?.match_rate_pct ?? 0,
          pass1Matched: res.pass1?.matched ?? 0,
          pass2Matched: res.pass2?.matched ?? 0,
          pass3Matched: res.pass3?.matched ?? 0,
          exceptionsCount: res.summary?.exceptions ?? (res.exceptions?.length || 0),
        },
        exceptions: res.exceptions || [],
      });
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportReport = () => {
    if (!data) return;
    const reportJson = JSON.stringify(data, null, 2);
    const blob = new Blob([reportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reconciliation-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="border-b border-slate-800 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">FinReconcile AI</h1>
            <p className="text-slate-400 text-sm mt-1">Multi-Source Financial Reconciliation Engine (Razorpay · Bank · Ledger)</p>
          </div>
          {data && (
            <button
              onClick={handleExportReport}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm self-start md:self-auto"
            >
              Export Audit Report (JSON)
            </button>
          )}
        </header>

        {/* Upload Panel */}
        <section className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">1. Ingest Data Sources</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <div className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-lg p-4 text-center transition-colors">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Razorpay Payments CSV</label>
              <input type="file" accept=".csv" onChange={(e) => setRazorpayFile(e.target.files?.[0] || null)} className="hidden" id="rzp-input" />
              <label htmlFor="rzp-input" className="cursor-pointer text-sm text-blue-400 hover:text-blue-300 font-medium block truncate">
                {razorpayFile ? razorpayFile.name : 'Choose File...'}
              </label>
            </div>

            <div className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-lg p-4 text-center transition-colors">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Bank Statement CSV</label>
              <input type="file" accept=".csv" onChange={(e) => setBankFile(e.target.files?.[0] || null)} className="hidden" id="bank-input" />
              <label htmlFor="bank-input" className="cursor-pointer text-sm text-blue-400 hover:text-blue-300 font-medium block truncate">
                {bankFile ? bankFile.name : 'Choose File...'}
              </label>
            </div>

            <div className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-lg p-4 text-center transition-colors">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Internal Ledger CSV</label>
              <input type="file" accept=".csv" onChange={(e) => setLedgerFile(e.target.files?.[0] || null)} className="hidden" id="ledger-input" />
              <label htmlFor="ledger-input" className="cursor-pointer text-sm text-blue-400 hover:text-blue-300 font-medium block truncate">
                {ledgerFile ? ledgerFile.name : 'Choose File...'}
              </label>
            </div>

          </div>

          {error && <p className="text-rose-400 text-sm mt-3">{error}</p>}

          <button
            onClick={handleReconcile}
            disabled={loading}
            className="mt-6 w-full md:w-auto bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? 'Processing Passes (Deterministic ➔ Fuzzy ➔ LLM)...' : 'Run Reconciliation Engine'}
          </button>
        </section>

        {/* Results Panel */}
        {data && (
          <div className="space-y-8">
            {/* KPI Summary */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-lg">
                <span className="text-xs font-medium text-slate-400 uppercase">Total Records</span>
                <p className="text-2xl font-bold text-white mt-1">{data.summary.totalRecords}</p>
              </div>
              <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-lg">
                <span className="text-xs font-medium text-slate-400 uppercase">Match Rate</span>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{data.summary.matchRate}%</p>
              </div>
              <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-lg">
                <span className="text-xs font-medium text-slate-400 uppercase">Matches (P1 / P2 / P3)</span>
                <p className="text-2xl font-bold text-blue-400 mt-1">
                  {data.summary.pass1Matched} / {data.summary.pass2Matched} / {data.summary.pass3Matched}
                </p>
              </div>
              <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-lg">
                <span className="text-xs font-medium text-slate-400 uppercase">Unresolved Exceptions</span>
                <p className="text-2xl font-bold text-amber-400 mt-1">{data.summary.exceptionsCount}</p>
              </div>
            </section>

            {/* Exceptions Table */}
            <section className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-slate-200 mb-4">Exception List & Gemini Rationale</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Source System</th>
                      <th className="p-3">Source ID</th>
                      <th className="p-3">Engine Audit Rationale</th>
                      <th className="p-3">Suggested Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {data.exceptions.map((exc: any, index: number) => (
                      <tr key={`exc-${index}`} className="hover:bg-slate-800/30">
                        <td className="p-3 font-semibold text-slate-200">{exc.source_system}</td>
                        <td className="p-3 font-mono text-xs text-blue-400">{exc.source_id}</td>
                        <td className="p-3 text-slate-300">{exc.reasoning}</td>
                        <td className="p-3 text-amber-400/90 text-xs">{exc.suggested_action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

      </div>
    </main>
  );
}