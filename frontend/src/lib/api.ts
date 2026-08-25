export interface ReconcileResponse {
  runId: string;
  summary: {
    totalRecords: number;
    exactMatches: number;
    fuzzyMatches: number;
    llmMatches: number;
    unmatchedExceptions: number;
    matchRate: string;
  };
  matches: Array<{
    id: string;
    pass: 'deterministic' | 'fuzzy' | 'llm';
    razorpayId: string;
    amount: number;
    confidence: number;
    reasoning?: string;
  }>;
  exceptions: Array<{
    id: string;
    source: string;
    amount: number;
    reason: string;
  }>;
}

export async function uploadAndReconcile(
  razorpayFile: File,
  bankFile: File,
  ledgerFile: File
): Promise<ReconcileResponse> {
  const formData = new FormData();
  formData.append('razorpay', razorpayFile);
  formData.append('bank', bankFile);
  formData.append('ledger', ledgerFile);

  const res = await fetch('http://localhost:3001/api/reconcile', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Reconciliation failed: ${res.statusText}`);
  }

  return res.json();
}