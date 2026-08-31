# FinReconcile AI — Task Tracking

## Phase 1: Rigor Foundation
- [x] Task 1.1: Archive old plan (`task.legacy.md`) and create fresh task tracking
- [x] Task 1.2: Reproducible dataset generation with `faker.seed()`, `GENERATOR_SEED` env var, `--output-dir` arg, and committed `data/holdout/` fixture
- [x] Task 1.3: Instrument end-to-end and per-pass pipeline throughput (`pass1_ms`, `pass2_ms`, `pass3_ms`, `total_ms`, `records_per_second`) and add `durationMs` to `ReconciliationRun` schema + migration
- [x] Task 1.4: Verify complete audit trail delivery in API response (`matches` array fully populated and untruncated)
- [x] Task 1.5: Reproducible ground truth evaluation with explicit run targeting (`<run_id>` / `--latest`) and holdout dataset support (`--dataset=holdout`)
- [x] Task 1.6: Zero-temperature LLM pass (`temperature: 0`) for strict grading reproducibility

## Phase 2: Agentic Backend
- [x] Task 2.1: Flexible file intake endpoint (`POST /api/reconcile`, `POST /api/detect-schema`) supporting 1-N arbitrary CSV files with schema/role detection & missing-role validation
- [x] Task 2.2: Live progress streaming via Server-Sent Events (`GET /api/reconcile/:runId/stream`) with per-record Pass 3 resolution events
- [x] Task 2.3: Agentic Q&A endpoint (`POST /api/chat`, `POST /api/runs/:runId/chat`) with real Gemini function-calling tools, tool-call trace logging, and citation-grounded answers
- [x] Task 2.4: Chat conversation history persistence in PostgreSQL via Prisma `ChatMessage` model and migration `20260831010000_add_chat_messages`
- [x] Task 2.5: Automated headless smoke tests (`test-chat.ts` and `test-schema-intake.ts`) verifying tool calling, schema detection, and multi-file intake

## Phase 3: Interactive Frontend

## Phase 4: Validation & Tests

## Phase 5: Docs & Demo
