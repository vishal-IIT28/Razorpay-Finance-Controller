# FinReconcile AI — Autonomous Financial Reconciliation & Settlement Controller

FinReconcile AI is an autonomous, agentic financial reconciliation platform engineered for complex three-way settlement audit between payment gateways (Razorpay), commercial bank statements, and internal ERP ledgers.

Built on an Obsidian & Dark Titanium high-density operations console, FinReconcile AI combines deterministic matching, calibrated fuzzy engines, and LLM reasoning with real-time Server-Sent Events (SSE) streaming, flexible multi-file intake, and a tool-calling AI agent.

---

## 🏛️ System Architecture

```mermaid
graph TD
    subgraph Intake Layer
        A1[Razorpay Gateway CSV] --> DET[AI Schema Detector / Column Heuristics]
        A2[Bank Statement CSV] --> DET
        A3[ERP Ledger CSV] --> DET
        DET -->|1-N Flexible Files + Role Mapping| PIPE[Reconciliation Engine]
    end

    subgraph 3-Pass Reconciliation Engine
        PIPE --> P1{Pass 1: Deterministic Match}
        P1 -->|Exact Reference + Net Amount + Date| M1[(Matched Records)]
        P1 -->|Unmatched / Drift| P2{Pass 2: Calibrated Fuzzy Match}
        
        P2 -->|Date Drift ≤ 3d / Fuse.js 0.6 / Fee ≤ 2%| M2[(Matched Records)]
        P2 -->|Unmatched / Complex Anomaly| P3{Pass 3: Gemini 3.5 Flash-Lite}

        P3 -->|Candidate Context / Split Leg Reasoning| M3[(Matched Records)]
        P3 -->|Unresolvable Outliers| EX[(PostgreSQL Exception Queue)]
    end

    subgraph Real-Time & Agentic Infrastructure
        PIPE -.->|Live SSE Event Stream| SSE[GET /api/reconcile/:runId/stream]
        SSE -.-> UI[Next.js Interactive Console]
        
        UI <-->|Session-Isolated Multi-Turn Chat| AGENT[Settlement Q&A Agent]
        AGENT <-->|Tool Calling / DB Lookups| DB[(PostgreSQL Database)]
    end
```

---

## 🚀 Key Features

### 1. Flexible Multi-File Intake & Automatic Schema Detection
- **1-N CSV Ingestion**: Accepts arbitrary file counts and filenames (e.g. `random_export_august_2026.csv`, `bank_dump.csv`).
- **Signature Heuristics + LLM Fallback**: Identifies gateway, bank, and ledger roles using weighted column boundary scoring in `<2ms`, falling back to LLM classification only for ambiguous headers.
- **User Role Overrides**: Full client-side control allows operators to manually override detected roles before pipeline execution.

### 2. Calibrated 3-Pass Reconciliation Pipeline
- **Pass 1 (Deterministic)**: Sub-millisecond exact matching across payment ID, net amount, and settlement date.
- **Pass 2 (Calibrated Fuzzy Engine)**:
  - Date drift tolerance up to 3 business days.
  - Narration variance resolution using 6-character reference fragments and calibrated `0.6` Fuse.js threshold.
  - Gateway deduction tolerance up to 2.0% fee variance.
  - **Greedy Fallback Protection**: Eliminates false-positive consumption of unrelated records without reference evidence.
- **Pass 3 (Contextual AI Reasoning)**:
  - Model: `gemini-3.5-flash-lite` with `temperature: 0` for deterministic reproducibility.
  - Resolves multi-leg split settlements, unstructured narration anomalies, and fees with candidate context.
  - Granular pacing and dynamic backoff for API quota stability.

### 3. Zero-Polling SSE Live Streaming
- Streaming endpoint `GET /api/reconcile/:runId/stream` emits typed pipeline lifecycle events (`pass1_complete`, `pass2_complete`, `pass3_progress`, `reconcile_complete`).
- Real-time resolution ticker renders per-record Gemini reasoning and match decisions live as they occur.
- Built-in event replay buffer ensures zero event loss regardless of client connection timing.

### 4. Agentic Settlement Q&A Assistant
- **5 Database Tools**: `getRunSummary`, `getRecordDetails`, `listExceptions`, `listMatchesByPass`, `searchRunData`.
- **Multi-Session Isolation**: Every thread is keyed by client-generated `conversationId` and persisted to PostgreSQL, allowing independent conversations per run.
- **Collapsible Tool Traces**: Assistant responses display interactive execution traces with tool parameters and raw database payloads.
- **Amber Policy Refusal Cards**: Distinct visual styling for out-of-scope queries (weather, non-financial operations) or unverified target IDs.

---

## 📊 Dual-Dataset Benchmark & Verification

The reconciliation engine was evaluated using [`backend/scripts/evaluate.ts`](backend/scripts/evaluate.ts) across both the tuned dataset and a strictly isolated holdout dataset (generated with seeded PRNG to prevent data leakage).

> **Model Tested**: All benchmark figures were measured against **`gemini-3.5-flash-lite`** with **`temperature: 0`**.

| Category | Tuned Dataset (`data/`) | Holdout Dataset (`data/holdout/`) | Primary Match Engine |
| :--- | :---: | :---: | :--- |
| **Exact Match** | 100.0% P / 100.0% R / 100.0% F1 | 100.0% P / 100.0% R / 100.0% F1 | Pass 1: Deterministic Engine |
| **Date Drift (≤ 3 Days)** | 100.0% P / 100.0% R / 100.0% F1 | 100.0% P / 100.0% R / 100.0% F1 | Pass 2: Calibrated Fuzzy Engine |
| **Narration Variance** | 100.0% P / 100.0% R / 100.0% F1 | 100.0% P / 100.0% R / 100.0% F1 | Pass 2: Fuse.js (0.6 Threshold) |
| **Split Settlements** | 100.0% P / 93.8% R / 96.8% F1 | 100.0% P / 90.0% R / 94.7% F1 | Pass 3: Gemini Candidate Reasoning |
| **Amount Mismatch (≤ 2%)** | 100.0% P / 74.2% R / 85.2% F1 | 100.0% P / 66.7% R / 80.0% F1 | Pass 2 / Pass 3 (Outliers >2% to Exceptions) |
| **Missing Records** | 100.0% Precision (0 FP) | 100.0% Precision (0 FP) | Isolated in Exception Queue |
| **OVERALL ACCURACY** | **100.00% Precision / 96.58% F1** | **100.00% Precision / 97.42% F1** | **0 False Positives** across 300 records |

*Note on Outliers: Transactions with unexplained fee gaps exceeding 2% without itemized deduction logs (e.g. 5%–28% bank deductions) are intentionally routed to the Exception Queue rather than guessing, preserving **100.00% precision**.*

---

## 🛠️ Quick Start & Local Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: PostgreSQL 14+ (or cloud instance such as Neon)
- **Gemini API Key**: Google AI Studio API key

### 1. Repository Setup & Environment Configuration
```bash
# Clone repository
git clone https://github.com/vishal-IIT28/Razorpay-Finance-Controller.git
cd Razorpay-Finance-Controller

# Configure Backend .env
cp backend/.env.example backend/.env
```

Ensure `backend/.env` contains your connection strings:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/finreconcile?sslmode=require"
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-3.5-flash-lite"
PORT=3001
```

> [!WARNING]
> **API Quota & Rate Limits Notice**:
> - Google AI Studio free-tier API keys enforce strict daily project rate limits (~500 requests/day for `gemini-3.5-flash-lite`, and ~20 requests/day for preview models like `gemini-2.5-flash`).
> - Pass 3 alone consumes **27–38 LLM calls** per 150-record reconciliation run to evaluate complex anomaly candidates.
> - Running `npm run test:integration` or testing the Settlement Q&A chat agent extensively also draws from the same daily quota.
> - **Recommendation for Graders**: Graders and operators are strongly advised to use a paid-tier API key (or budget free-tier runs accordingly) to prevent transient `429 Too Many Requests` quota exhaustion during multi-run testing.

### 2. Backend Installation & Database Migration
```bash
cd backend
npm install
npx prisma migrate deploy   # Apply schema migrations
npm run dev                 # Start Express server on http://localhost:3001
```

### 3. Frontend Installation & Startup
In a separate terminal window:
```bash
cd frontend
npm install
npm run dev                 # Start Next.js console on http://localhost:3000
```

### 4. Running the Automated Test Suite (100% Offline)
```bash
cd backend
npm test                    # Runs all 27 unit & integration tests in <3s
```

### 5. Running the Live Integration Q&A Test (Requires Gemini API)
```bash
cd backend
npm run test:integration    # Tests live Gemini function-calling agent
```

### 6. Evaluating Ground Truth Accuracy
```bash
cd backend
# Evaluate against default tuned dataset
npx tsx scripts/evaluate.ts --latest --dataset=default

# Evaluate against holdout dataset
npx tsx scripts/evaluate.ts --latest --dataset=holdout
```

---

## 🖥️ UI Operator Walkthrough

1. **View 1 (Flexible Intake)**: Open `http://localhost:3000`. Drag and drop CSV files from `data/` or `data/holdout/`. Confirm detected roles (Razorpay, Bank, Ledger) or adjust via the dropdown, then click **Execute Reconciliation**.
2. **View 2 (Live Telemetry & Stream)**: Watch the live SSE pipeline stream with animated stage cards and the real-time AI Resolution Ticker.
3. **View 3 (Dashboard & Audit Trail)**: Inspect KPIs (Match Rate, Pass Breakdown, Unresolved Counts), filter matches by pass, review source-by-source exceptions with recommended finance-ops actions, and click **Export Full Audit Report (JSON)**.
4. **View 4 (Persistent Q&A Agent)**: Launch the slide-over chat panel (`Settlement Q&A Agent`). Ask questions about payments (e.g. *"Why did payment pay_qupuVNka3rkAeZ fail?"*) to inspect tool traces, or ask out-of-scope queries to observe amber policy refusal cards.

---

## 📡 REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/detect-schema` | Uploads CSVs and returns heuristic / LLM schema classifications. |
| `POST` | `/api/reconcile` | Accepts multipart CSV files + role mappings and starts the pipeline. |
| `GET` | `/api/reconcile/:runId/stream` | Server-Sent Events stream for real-time pipeline event broadcasts. |
| `GET` | `/api/runs` | Returns historical execution runs with summary KPI metrics. |
| `GET` | `/api/runs/:runId` | Returns full run audit details (matches, exceptions, telemetry). |
| `GET` | `/api/runs/:runId/export` | Returns complete JSON audit export payload (`finreconcile-audit-<id>.json`). |
| `GET` | `/api/runs/:runId/chat` | Retrieves session-scoped message history (`?conversationId=<uuid>`). |
| `POST` | `/api/runs/:runId/chat` | Sends message to agentic assistant with automatic tool dispatch. |

---

## ⚖️ Known Limitations & Architectural Tradeoffs

1. **Zero-Temperature LLM Evaluation Tradeoff (`temperature: 0`)**:
   - Setting `temperature: 0` ensures strict determinism and reproducible benchmark grading across repeated evaluator runs.
   - *Tradeoff*: Clamping temperature eliminated prompt creativity on ambiguous multi-leg split settlements, costing exactly 1 split match on the tuned dataset (split recall was 15/16 TP under `temperature: 0` vs 16/16 TP under `temperature: 0.2`).
2. **Q&A Agent Test Coverage Scope**:
   - `npm test` runs 100% offline and validates database tool executors (`getRunSummary`, `getRecordDetails`, `listExceptions`, `listMatchesByPass`), query schemas, and PostgreSQL `conversationId` thread isolation directly.
   - *Scope Distinction*: The live agentic tool-selection loop (Gemini parsing function declarations and choosing which tool to invoke) requires live Gemini API connectivity and is verified via `npm run test:integration` rather than offline unit mocks.
3. **Pass 1 Narration Reference Matching Assumption**:
   - Pass 1 assumes the full Razorpay payment ID (`pay_...`) is embedded within the bank statement transaction narration.
   - *Real-World Consideration*: While standard for direct gateway settlement webhooks, messy or truncated bank statement feeds will fail Pass 1 exact lookup and gracefully route to Pass 2 (6-character fuzzy ID fragment matching) or Pass 3 (LLM contextual reasoning).
4. **Large Fee-Gap Outliers (>2% Variance)**:
   - Transactions with unexplained fee gaps exceeding 2% without itemized deduction logs (e.g. 5%–28% bank deductions) are intentionally routed to the Exception Queue rather than guessing, preserving **100.00% precision**.
5. **Duplicate Entries (Formally Descoped)**:
   - Synthetic duplicate injection and de-duplication resolution were formally descoped for this buildathon release to prevent regressions on core multi-pass precision.

---

## 🛡️ License & Acknowledgments

Built for the **Razorpay Finance Controller Hackathon**. Licensed under the MIT License.
