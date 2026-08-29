export interface ReconcileMatch {
  payment_id: string;
  bank_txn_id: string;
  ledger_entry_id: string;
  match_pass: 1 | 2 | 3;
  confidence: number;
  notes: string;
}

export interface ReconcileException {
  source_system: string;
  source_id: string;
  reasoning: string;
  suggested_action: string;
}

export interface ReconcileResponse {
  message: string;
  run_id: string;
  summary: {
    total_records: number;
    total_matched: number;
    match_rate_pct: number;
    exceptions: number;
  };
  pass1: {
    matched: number;
  };
  pass2: {
    matched: number;
    unmatched_remaining: number;
  };
  pass3: {
    enabled: boolean;
    matched: number;
    unmatched_remaining: number;
    notes: string[];
  };
  matches: ReconcileMatch[];
  exceptions: ReconcileException[];
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