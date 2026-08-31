# FinReconcile AI — Task Tracking

## Phase 1: Rigor Foundation
- [x] Task 1.1: Archive old plan (`task.legacy.md`) and create fresh task tracking
- [x] Task 1.2: Reproducible dataset generation with `faker.seed()`, `GENERATOR_SEED` env var, `--output-dir` arg, and committed `data/holdout/` fixture
- [x] Task 1.3: Instrument end-to-end and per-pass pipeline throughput (`pass1_ms`, `pass2_ms`, `pass3_ms`, `total_ms`, `records_per_second`) and add `durationMs` to `ReconciliationRun` schema + migration
- [x] Task 1.4: Verify complete audit trail delivery in API response (`matches` array fully populated and untruncated)
- [x] Task 1.5: Reproducible ground truth evaluation with explicit run targeting (`<run_id>` / `--latest`) and holdout dataset support (`--dataset=holdout`)
- [x] Task 1.6: Zero-temperature LLM pass (`temperature: 0`) for strict grading reproducibility

## Phase 2: Agentic Backend

## Phase 3: Interactive Frontend

## Phase 4: Validation & Tests

## Phase 5: Docs & Demo
