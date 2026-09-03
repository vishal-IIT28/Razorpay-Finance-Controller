export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type DetectedRole = 'razorpay' | 'bank' | 'ledger' | 'unknown';

export interface SchemaDetectionResult {
  filename: string;
  role: DetectedRole;
  confidence: number;
  mapping: Record<string, string>;
  detectedVia: 'heuristic' | 'llm';
  sampleRowCount: number;
  rawHeaders: string[];
  reasoning?: string;
}

export interface DetectSchemaApiResponse {
  files: SchemaDetectionResult[];
  all_required_present: boolean;
  missing_roles: string[];
  error?: string;
}

export interface ReconcileStartResponse {
  message: string;
  run_id: string;
  status: 'processing' | 'completed' | 'failed';
  stream_url: string;
  detected_roles: SchemaDetectionResult[];
  summary: {
    razorpay_records: number;
    bank_records: number;
    ledger_records: number;
  };
  error?: string;
}

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

export interface ReconcileRunDetails {
  run_id: string;
  created_at: string;
  status: 'processing' | 'completed' | 'failed';
  summary: {
    total_records: number;
    total_matched: number;
    match_rate_pct: number;
    exceptions: number;
  };
  timing: {
    total_ms: number;
  };
  passes: {
    pass1_matched: number;
    pass2_matched: number;
    pass3_matched: number;
  };
  matches: ReconcileMatch[];
  exceptions: ReconcileException[];
}

export interface PastRunSummary {
  run_id: string;
  created_at: string;
  status: string;
  total_records: number;
  total_matched: number;
  match_rate_pct: number;
  exceptions: number;
  duration_ms: number | null;
  precision: number | null;
  recall: number | null;
}

export interface ChatMessageItem {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: unknown;
  }>;
  created_at: string;
}

export interface ChatApiResponse {
  answer: string;
  toolCalls: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: unknown;
  }>;
  runId: string;
  conversationId: string;
  messageId: string;
  error?: string;
}

// 1. Schema Detection API
export async function detectUploadedSchemas(files: File[]): Promise<DetectSchemaApiResponse> {
  const formData = new FormData();
  for (const f of files) {
    formData.append('files', f);
  }

  const res = await fetch(`${API_BASE}/api/detect-schema`, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Schema detection failed with status ${res.status}`);
  }
  return data;
}

// 2. Reconciliation Intake (Starts Background Pipeline)
export async function startReconciliation(
  filePayloads: Array<{ file: File; assignedRole: DetectedRole }>,
  datasetLabel?: 'default' | 'holdout'
): Promise<ReconcileStartResponse> {
  const formData = new FormData();
  for (const item of filePayloads) {
    // If the user overrode the role, use field name or upload as named file
    formData.append(item.assignedRole, item.file);
  }
  if (datasetLabel) {
    formData.append('dataset_label', datasetLabel);
  }

  const res = await fetch(`${API_BASE}/api/reconcile`, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok && res.status !== 202) {
    throw new Error(data.error || `Reconciliation intake failed with status ${res.status}`);
  }
  return data;
}

// 3. Fetch Completed Run Details
export async function fetchRunDetails(runId: string): Promise<ReconcileRunDetails> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Failed to fetch run details for ${runId}`);
  }
  return data;
}

// 4. Fetch Past Runs List
export async function fetchPastRuns(): Promise<PastRunSummary[]> {
  const res = await fetch(`${API_BASE}/api/runs`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch past runs list');
  }
  return data.runs || [];
}

// 5. Send Chat Message to Agent
export async function sendChatMessage(
  runId: string,
  message: string,
  conversationId?: string
): Promise<ChatApiResponse> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, conversationId }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to send message to agent');
  }
  return data;
}

// 6. Fetch Conversation History
export async function fetchChatHistory(
  runId: string,
  conversationId?: string
): Promise<ChatMessageItem[]> {
  const url = conversationId
    ? `${API_BASE}/api/runs/${runId}/chat?conversationId=${encodeURIComponent(conversationId)}`
    : `${API_BASE}/api/runs/${runId}/chat`;

  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch chat history');
  }
  return data.messages || [];
}