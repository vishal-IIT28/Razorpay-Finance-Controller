# FinReconcile AI — Walkthrough & Verification

## Phase 1: Rigor Foundation Walkthrough

### Summary of Changes
- Archived previous plan to [task.legacy.md](file:///c:/Users/visha/Downloads/Razorpay-Finance-Controller/task.legacy.md).
- Created a fresh [task.md](file:///c:/Users/visha/Downloads/Razorpay-Finance-Controller/task.md) with structured phase headers.
- Refactored [backend/src/data-generator/generator.ts](file:///c:/Users/visha/Downloads/Razorpay-Finance-Controller/backend/src/data-generator/generator.ts) with `faker.seed()`, `GENERATOR_SEED`, and `--output-dir` arguments.
- Generated and committed 150-record holdout dataset under `data/holdout/`.
- Instrumented wall-clock pipeline timing, added `durationMs` to `ReconciliationRun`, and deployed migration `20260831000000_add_duration_ms`.
- Updated [backend/scripts/evaluate.ts](file:///c:/Users/visha/Downloads/Razorpay-Finance-Controller/backend/scripts/evaluate.ts) for explicit run targeting (`<run_id>` / `--latest`) and holdout evaluation (`--dataset=holdout`).
- Set `temperature: 0` in [backend/src/engine/llm.ts](file:///c:/Users/visha/Downloads/Razorpay-Finance-Controller/backend/src/engine/llm.ts).

### Phase 1 Accuracy Benchmark

| Metric | Tuned Dataset (`data/`) | Holdout Dataset (`data/holdout/`) |
| :--- | :--- | :--- |
| **Run ID** | `38b70135-7410-4d53-931d-9168bd30bda6` | `acb0d5ba-5f06-4c03-9b30-4c4679348d01` |
| **Total Records** | 150 | 150 |
| **Total Matched** | 127 | 132 |
| **Precision** | **100.00%** | **100.00%** |
| **Recall** | **93.38%** | **94.96%** |
| **F1 Score** | **96.58%** | **97.42%** |
| **False Positives (Mismatches)** | **0** | **0** |
| **False Negatives** | 9 (8 fee variance, 1 split) | 7 (6 fee variance, 1 split) |
| **Throughput** | 0.84 records/sec | 1.20 records/sec |

---

## Phase 2: Agentic Backend & Interactive Infrastructure

### Summary of Changes

1. **Flexible File Intake & Schema Detection**
   - Created [backend/src/engine/schema-detector.ts](file:///c:/Users/visha/Downloads/Razorpay-Finance-Controller/backend/src/engine/schema-detector.ts) implementing weighted header heuristics and Gemini LLM fallback classification.
   - Normalizes arbitrary column headers into canonical engine formats for Gateway (`razorpay`), Bank (`bank`), and Ledger (`ledger`).
   - Validates multi-file uploads; returns clear HTTP 400 errors identifying any missing roles.

2. **Server-Sent Events (SSE) Progress Streaming**
   - Created [backend/src/engine/pipeline-runner.ts](file:///c:/Users/visha/Downloads/Razorpay-Finance-Controller/backend/src/engine/pipeline-runner.ts) implementing event-driven execution with `pipeline_init`, `pass1_started`, `pass1_complete`, `pass2_started`, `pass2_complete`, `pass3_started`, `pass3_progress`, `pass3_complete`, and `reconcile_complete`.
   - Exposed `GET /api/reconcile/:runId/stream` streaming live updates directly to clients, with granular per-record progress emitted as each Pass 3 LLM call resolves.
   - Buffered event history allows clients to connect asynchronously without dropping events.

3. **Agentic Q&A Assistant with Tool Calling**
   - Created [backend/src/engine/chat-agent.ts](file:///c:/Users/visha/Downloads/Razorpay-Finance-Controller/backend/src/engine/chat-agent.ts) powered by Gemini 3.5 Flash Lite with 5 database function calling tools:
     - `getRunSummary`: summary telemetry, pass breakdown, timing, precision/recall.
     - `getRecordDetails`: lookup match details or exception logs for payment/bank/ledger IDs.
     - `listExceptions`: list unmatched records with audit reasoning and suggested actions.
     - `listMatchesByPass`: audit matches resolved by deterministic (1), fuzzy (2), or LLM (3).
     - `searchRunData`: keyword/ID search across matches and exceptions.
   - Enforced grounding: answers cite verified IDs (`payment_id`, `bank_txn_id`, `ledger_entry_id`, `invoice_id`).

4. **Conversation History Persistence & Thread Isolation**
   - Added `ChatMessage` model in [backend/prisma/schema.prisma](file:///c:/Users/visha/Downloads/Razorpay-Finance-Controller/backend/prisma/schema.prisma) with `conversationId String @default(uuid())` and composite index `@@index([runId, conversationId])`.
   - Deployed migrations `20260831010000_add_chat_messages` and `20260831020000_add_conversation_id_to_chat_messages` to PostgreSQL.
   - Scoped memory loading and retrieval endpoints: `POST /api/chat`, `POST /api/runs/:runId/chat`, `GET /api/runs/:runId/chat?conversationId=...`.

5. **Headless Verification Scripts**
   - [backend/scripts/test-chat.ts](file:///c:/Users/visha/Downloads/Razorpay-Finance-Controller/backend/scripts/test-chat.ts): automated smoke test exercising 6 Q&A queries against completed runs, including `searchRunData` and unanswerable edge cases.
   - [backend/scripts/test-chat-isolated-conversations.ts](file:///c:/Users/visha/Downloads/Razorpay-Finance-Controller/backend/scripts/test-chat-isolated-conversations.ts): verifies multi-turn conversation isolation between independent sessions on the same run and single-condition invalid run refusals.
   - [backend/scripts/test-ambiguous-schema.ts](file:///c:/Users/visha/Downloads/Razorpay-Finance-Controller/backend/scripts/test-ambiguous-schema.ts): tests LLM schema fallback with reasoning output on unlabelled/generic CSVs.
   - [backend/scripts/test-sse-stream.ts](file:///c:/Users/visha/Downloads/Razorpay-Finance-Controller/backend/scripts/test-sse-stream.ts): captures live per-record Pass 3 resolution events streamed over HTTP.

---

## Phase 2 Verification Results

### Unit Tests
- `npm test`: **8/8 unit tests passing (0 failures)**.

### Schema Detection Test
- `data/` (Tuned): **100% confidence heuristic match**
- `data/holdout/` (Holdout): **100% confidence heuristic match**
- Arbitrary filenames (`random_export_august_2026.csv`, `erp_journal_dump_final.csv`, `gateway_transactions_v2.csv`): **100% confidence heuristic match**
- Missing role test: **Returned clean HTTP 400 error identifying missing `bank` role**.

### Chat Agent Smoke Test Output
- **Query 1 (Summary)**: Invoked `getRunSummary`, cited 150 total records, 132 matched, 88.0% match rate, pass breakdown (94/29/9), and 124.7s duration.
- **Query 2 (Exception Deep Dive)**: Invoked `getRecordDetails` for `pay_BQtqNlhY0hUBzn`, cited failed status at gateway, matching ledger entry `LED-015088`, and recommended gateway status check.
- **Query 3 (Pass 3 LLM Audit)**: Invoked `listMatchesByPass(matchPass: 3)`, cited all 9 split transaction matches (`pay_0ktq1H0ibFQayy`, `pay_qwiknrUbOsdXF3`, `pay_MhKQ4shjWx1mLj`, etc.) with dual bank transaction IDs, ledger IDs, and split arithmetic notes.
- **Query 4 (Exception Queue Analysis)**: Invoked `listExceptions(Bank)` and `listExceptions(Ledger)`, cited all 8 bank txn IDs and 18 ledger entry IDs with audit reasoning.
