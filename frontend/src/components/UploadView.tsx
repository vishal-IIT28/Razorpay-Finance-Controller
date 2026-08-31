'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  BrainCircuit,
  Sparkles,
  RefreshCw,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Layers,
  HelpCircle,
} from 'lucide-react';
import {
  DetectedRole,
  SchemaDetectionResult,
  detectUploadedSchemas,
} from '@/lib/api';

export interface UploadedFileItem {
  id: string;
  file: File;
  assignedRole: DetectedRole;
  detection: SchemaDetectionResult | null;
  status: 'detecting' | 'ready' | 'error';
  errorMessage?: string;
}

interface UploadViewProps {
  onStartReconciliation: (
    files: Array<{ file: File; assignedRole: DetectedRole }>
  ) => void;
  isSubmitting?: boolean;
}

const ROLE_DEFINITIONS: Record<
  DetectedRole,
  { label: string; description: string; color: string; badgeBg: string; border: string }
> = {
  razorpay: {
    label: 'Razorpay Gateway Export',
    description: 'Payment IDs, fees, tax, gross amount, capture & settlement status',
    color: 'text-sky-400',
    badgeBg: 'bg-sky-950/70 text-sky-300 border-sky-800',
    border: 'border-sky-500/30',
  },
  bank: {
    label: 'Bank Statement (Credits/Debits)',
    description: 'Transaction references, net credit amounts, dates, narration & UTR',
    color: 'text-emerald-400',
    badgeBg: 'bg-emerald-950/70 text-emerald-300 border-emerald-800',
    border: 'border-emerald-500/30',
  },
  ledger: {
    label: 'Internal ERP Ledger',
    description: 'Invoices, customer accounts, expected receivables, payment refs',
    color: 'text-indigo-400',
    badgeBg: 'bg-indigo-950/70 text-indigo-300 border-indigo-800',
    border: 'border-indigo-500/30',
  },
  unknown: {
    label: 'Unassigned / Unclassified',
    description: 'CSV schema not mapped to a required reconciliation source',
    color: 'text-amber-400',
    badgeBg: 'bg-amber-950/70 text-amber-300 border-amber-800',
    border: 'border-amber-500/30',
  },
};

export default function UploadView({
  onStartReconciliation,
  isSubmitting = false,
}: UploadViewProps) {
  const [items, setItems] = useState<UploadedFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isDetectingAll, setIsDetectingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Process newly added files and run AI schema detection
  const handleFilesAdded = async (newFiles: File[]) => {
    setGlobalError(null);
    const validCsvs = newFiles.filter(
      (f) => f.name.toLowerCase().endsWith('.csv') || f.type === 'text/csv'
    );

    if (validCsvs.length < newFiles.length) {
      setGlobalError('Only CSV (.csv) files are supported for financial reconciliation.');
    }

    if (validCsvs.length === 0) return;

    // Create temporary items in "detecting" state
    const newItems: UploadedFileItem[] = validCsvs.map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file: f,
      assignedRole: 'unknown',
      detection: null,
      status: 'detecting',
    }));

    setItems((prev) => [...prev, ...newItems]);
    setIsDetectingAll(true);

    try {
      // Call real backend schema detection endpoint POST /api/detect-schema
      const response = await detectUploadedSchemas(validCsvs);

      setItems((prev) =>
        prev.map((item) => {
          const matchedDetection = response.files.find(
            (d) => d.filename === item.file.name
          );

          if (matchedDetection) {
            return {
              ...item,
              assignedRole: matchedDetection.role,
              detection: matchedDetection,
              status: 'ready',
            };
          }
          return item;
        })
      );
    } catch (err: any) {
      console.error('[Schema detection error]', err);
      setGlobalError(err?.message || 'Failed to analyze CSV schemas via backend API.');
      setItems((prev) =>
        prev.map((item) =>
          newItems.some((n) => n.id === item.id)
            ? { ...item, status: 'error', errorMessage: err?.message || 'Detection failed' }
            : item
        )
      );
    } finally {
      setIsDetectingAll(false);
    }
  };

  const handleRoleChange = (id: string, newRole: DetectedRole) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, assignedRole: newRole } : item))
    );
  };

  const handleRemoveFile = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearAll = () => {
    setItems([]);
    setGlobalError(null);
  };

  // Drag-and-drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(Array.from(e.dataTransfer.files));
    }
  };

  // Validation of required financial roles
  const assignedRoles = items.map((i) => i.assignedRole);
  const hasGateway = assignedRoles.includes('razorpay');
  const hasBank = assignedRoles.includes('bank');
  const hasLedger = assignedRoles.includes('ledger');

  const missingRolesList: string[] = [];
  if (!hasGateway) missingRolesList.push('Razorpay Gateway Export');
  if (!hasBank) missingRolesList.push('Bank Statement');
  if (!hasLedger) missingRolesList.push('Internal ERP Ledger');

  const isDatasetReady = hasGateway && hasBank && hasLedger && !isDetectingAll;

  // Submit and trigger reconciliation
  const handleStartReconciliation = () => {
    if (!isDatasetReady) return;
    const payloads = items
      .filter((i) => i.assignedRole !== 'unknown')
      .map((i) => ({ file: i.file, assignedRole: i.assignedRole }));
    onStartReconciliation(payloads);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Layers className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-semibold text-slate-100 tracking-tight">
              Intake & AI Schema Classifier
            </h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Upload 1 to N arbitrary CSV statements. AI automatically classifies financial roles and maps columns.
          </p>
        </div>

        {items.length > 0 && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 border border-slate-800 rounded-md transition-colors w-fit"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All Files
          </button>
        )}
      </div>

      {/* Global Error Banner */}
      {globalError && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/80 text-rose-300 text-sm flex items-start gap-3">
          <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-rose-200">Intake / Detection Warning</p>
            <p className="text-rose-300/90 text-xs mt-0.5">{globalError}</p>
          </div>
        </div>
      )}

      {/* Drag and Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-sky-400 bg-sky-950/20 shadow-lg shadow-sky-500/5'
            : 'border-slate-800 hover:border-slate-700 bg-slate-900/30 hover:bg-slate-900/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFilesAdded(Array.from(e.target.files));
              e.target.value = '';
            }
          }}
        />

        <div className="max-w-md mx-auto flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 shadow-inner">
            <UploadCloud className="w-6 h-6 text-sky-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">
              Drag & drop CSV files here, or <span className="text-sky-400 underline underline-offset-2">browse files</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Supports arbitrary column orders and names across Payment Gateway exports, Bank credits/debits, and Internal Ledgers.
            </p>
          </div>
        </div>
      </div>

      {/* Uploaded Files Grid */}
      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="font-semibold uppercase tracking-wider text-slate-400">
              Analyzed Datasets ({items.length})
            </span>
            {isDetectingAll && (
              <span className="flex items-center gap-1.5 text-sky-400">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                AI Classifying Schemas...
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3.5">
            {items.map((item) => {
              const roleDef = ROLE_DEFINITIONS[item.assignedRole];
              const isLlm = item.detection?.detectedVia === 'llm';

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl bg-slate-900/70 border transition-all ${
                    item.status === 'error'
                      ? 'border-rose-800/60 bg-rose-950/10'
                      : roleDef.border
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* File Meta & Detection */}
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      <div className="p-2.5 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-300 shrink-0">
                        <FileSpreadsheet className="w-5 h-5 text-sky-400" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-medium text-slate-200 truncate">
                            {item.file.name}
                          </h4>
                          <span className="text-xs font-mono-numbers text-slate-400">
                            ({(item.file.size / 1024).toFixed(1)} KB)
                          </span>

                          {/* Detection Method Pill */}
                          {item.detection && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                                isLlm
                                  ? 'bg-purple-950/80 text-purple-300 border-purple-800'
                                  : 'bg-slate-800/90 text-slate-300 border-slate-700'
                              }`}
                            >
                              {isLlm ? (
                                <>
                                  <BrainCircuit className="w-3 h-3 text-purple-400" />
                                  Gemini LLM Classifier
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3 h-3 text-sky-400" />
                                  Heuristic Signature
                                </>
                              )}
                            </span>
                          )}

                          {/* Confidence Score */}
                          {item.detection && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono-numbers font-medium bg-slate-800 text-slate-300 border border-slate-700">
                              {(item.detection.confidence * 100).toFixed(0)}% Conf
                            </span>
                          )}
                        </div>

                        {/* LLM Reasoning or Mapped Fields Snippet */}
                        {item.detection?.reasoning && isLlm && (
                          <div className="mt-2 p-2 rounded bg-purple-950/40 border border-purple-900/60 text-xs text-purple-200">
                            <span className="font-semibold text-purple-300">AI Reasoning: </span>
                            &ldquo;{item.detection.reasoning}&rdquo;
                          </div>
                        )}

                        {item.detection?.mapping && Object.keys(item.detection.mapping).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {Object.entries(item.detection.mapping).slice(0, 5).map(([canonical, raw]) => (
                              <span
                                key={canonical}
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono-numbers bg-slate-800/60 border border-slate-700/50 text-slate-300"
                              >
                                <span className="text-slate-400">{canonical}</span> &rarr; {raw}
                              </span>
                            ))}
                            {Object.keys(item.detection.mapping).length > 5 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] text-slate-400">
                                +{Object.keys(item.detection.mapping).length - 5} more columns
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Role Override Dropdown & Delete */}
                    <div className="flex items-center gap-3 shrink-0 self-end lg:self-center">
                      <div className="flex flex-col items-end">
                        <label className="text-[10px] uppercase font-semibold text-slate-400 mb-1">
                          Role Mapping
                        </label>
                        <select
                          value={item.assignedRole}
                          onChange={(e) => handleRoleChange(item.id, e.target.value as DetectedRole)}
                          className="bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
                        >
                          <option value="razorpay">Razorpay Gateway Export</option>
                          <option value="bank">Bank Statement</option>
                          <option value="ledger">Internal ERP Ledger</option>
                          <option value="unknown">Unassigned / Exclude</option>
                        </select>
                      </div>

                      <button
                        onClick={() => handleRemoveFile(item.id)}
                        title="Remove file"
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors mt-4"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dataset Validation & Launch Bar */}
      <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              Reconciliation Dataset Checklist
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              3-pass matching requires one verified dataset for each financial domain.
            </p>
          </div>

          {/* Role Status Indicators */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                hasGateway
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {hasGateway ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-slate-400" />}
              Razorpay Gateway
            </div>

            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                hasBank
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {hasBank ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-slate-400" />}
              Bank Statement
            </div>

            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                hasLedger
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {hasLedger ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-slate-400" />}
              Internal Ledger
            </div>
          </div>
        </div>

        {/* Validation Error Message if Missing */}
        {!isDatasetReady && items.length > 0 && (
          <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/60 text-amber-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Missing required financial dataset role(s):{' '}
              <strong className="text-amber-200">{missingRolesList.join(', ')}</strong>. Upload or reassign files to fulfill all 3 sources before proceeding.
            </span>
          </div>
        )}

        {/* Action Button */}
        <div className="flex items-center justify-end pt-2">
          <button
            onClick={handleStartReconciliation}
            disabled={!isDatasetReady || isSubmitting}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold shadow-lg transition-all ${
              isDatasetReady && !isSubmitting
                ? 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/20 cursor-pointer'
                : 'bg-slate-800 text-slate-400 border border-slate-700/60 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Initiating Pipeline...
              </>
            ) : (
              <>
                Execute 3-Pass Reconciliation
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
