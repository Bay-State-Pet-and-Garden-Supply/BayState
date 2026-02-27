# BayStateScraper Logging Improvements

## Context

### Original Request
Improve the logging of `BayStateScraper/`:
- Structured JSON logs
- Better formatting/levels
- Centralized setup everywhere
- Improved API log shipping

### Interview Summary
**Key Decisions**:
- JSON logs should be **default everywhere** (Option A).
- This deliverable is **proposal/plan only**; implementation to be executed separately.

**Current State Evidence** (selected references):
- Central logger utility exists: `BayStateScraper/utils/logger.py`.
- Entrypoints still use `logging.basicConfig`:
  - `BayStateScraper/daemon.py`
  - `BayStateScraper/runner.py`
  - `BayStateScraper/run_job.py`
  - `BayStateScraper/scrapers/main.py` (uses `force=True`)
- API log shipping handler exists: `BayStateScraper/utils/api_handler.py`.

### Metis Review (gaps to address)
- Decide default log format (resolved: JSON-by-default).
- Add acceptance criteria for: no duplicate handlers, graceful flush, and no recursion from API handler.
- Explicitly handle high log volume and API failure behavior.

---

## Work Objectives

### Core Objective
Make BayStateScraper logs consistent, machine-parseable (JSON), context-rich (job/scraper/sku/step), and reliably shippable to BayStateApp without recursion or blocking critical scraping loops.

### Concrete Deliverables
- A single centralized logging initialization API in `BayStateScraper/utils/logger.py` used by all entrypoints.
- JSON log schema with consistent context fields.
- Hardened `BayStateScraper/utils/api_handler.py` shipping behavior (flush semantics + backpressure + failure handling).
- Updated entrypoints to remove ad-hoc `logging.basicConfig`.
- Tests (or exhaustive manual verification steps) proving behavior.

### Definition of Done
- [x] `python daemon.py`, `python runner.py --job-id …`, and `python main.py …` all emit JSON logs to stdout with consistent fields.
- [x] No duplicate log lines caused by handler reconfiguration.
- [x] API log handler does not recurse on HTTP client logging.
- [x] Logs flush on shutdown for graceful exits (SIGINT/SIGTERM).
- [x] Existing logging unit tests pass (and new ones added where needed).

### Must NOT Have (Guardrails)
- No BayStateApp changes unless explicitly requested.
- No adding external log aggregation platforms.
- No leaking secrets/credentials into logs.
- No broad refactors unrelated to logging.

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (`pytest` present; example: `BayStateScraper/tests/unit/test_logging.py`).
- **User wants tests**: Not explicitly confirmed; plan assumes **tests-after** for utilities + handler changes.

### Manual Verification (always required)
For each entrypoint, run it and confirm:
- stdout logs are JSON lines
- required context fields exist
- log levels behave as expected
- no recursion / runaway logging

---

## Target Architecture (Proposal)

### 1) One logging entrypoint
Add/extend `setup_logging()` in `BayStateScraper/utils/logger.py` to:
- Default to JSON formatter to stdout (Docker-friendly).
- Support optional “pretty” mode for local dev only (explicit flag/env).
- Avoid duplicate handlers by:
  - clearing handlers (current behavior), and/or
  - using an idempotent “already configured” guard.

### 2) Context propagation
Standardize context fields on every log record:
- `timestamp` (ISO8601)
- `level`
- `logger`
- `message`
- `job_id`
- `runner_name`
- `scraper_name`
- `sku`
- `step` / `action`
- `worker_id`

Prefer a context mechanism that works with stdlib logging:
- `contextvars` + a custom `logging.Formatter` that injects context
- or `LoggerAdapter` / `LogRecordFactory` (choose one, document it)

### 3) API log shipping
Harden `BayStateScraper/utils/api_handler.py`:
- Non-blocking behavior (avoid slowing scraper loop)
- Batching + rate limiting
- Flush on shutdown (`atexit`/explicit `close()` semantics)
- Failure strategy:
  - default: drop with stderr notice after bounded retries
  - optional: spill to local file if enabled

### 4) Recursion/loop protection
Centralize the `NoHttpFilter` logic (currently duplicated in `daemon.py` and `runner.py`) into `utils/logger.py` so all configs use the same filter.

---

## TODOs

- [x] 1. Define JSON log schema and required fields

  **What to do**:
  - Write down the canonical JSON keys for every log line.
  - Specify which fields are required vs optional.
  - Specify redaction rules (at minimum: never log credentials payloads).

  **Parallelizable**: YES

  **References**:
  - `BayStateScraper/utils/logger.py` (current setup function + formats)
  - `BayStateScraper/daemon.py` (daemon environment + signal lifecycle)
  - `BayStateScraper/runner.py` (job_id-based execution + API handler wiring)

  **Acceptance Criteria**:
  - [x] Documented schema exists in this plan section and is implementable.

- [x] 2. Centralize logging initialization in `utils/logger.py`

  **What to do**:
  - Extend `setup_logging(...)` to configure JSON-to-stdout by default.
  - Ensure configuration is idempotent (no duplicate handlers).
  - Add environment controls:
    - `LOG_LEVEL` (default INFO)
    - `LOG_FORMAT` (default json)
    - `LOG_PRETTY=1` (optional local override)

  **Must NOT do**:
  - Do not introduce new third-party logging deps unless explicitly approved.

  **Parallelizable**: NO (foundation for others)

  **References**:
  - `BayStateScraper/utils/logger.py` (modify)
  - `BayStateScraper/main.py` (already uses setup_logging)

  **Acceptance Criteria**:
  - [x] Running a small snippet emits one JSON log line to stdout.
  - [x] Re-calling `setup_logging()` does not duplicate handlers.

- [x] 3. Remove ad-hoc `basicConfig` and adopt `setup_logging()` in all entrypoints

  **What to do**:
  - Update:
    - `BayStateScraper/daemon.py`
    - `BayStateScraper/runner.py`
    - `BayStateScraper/run_job.py`
    - `BayStateScraper/scrapers/main.py` (remove `force=True` usage)
  - Ensure consistent behavior for `--debug` (set `LOG_LEVEL=DEBUG` or pass flag).

  **Parallelizable**: YES (per entrypoint) after Task 2

  **References**:
  - `BayStateScraper/daemon.py` (currently basicConfig + API handler)
  - `BayStateScraper/runner.py` (currently basicConfig + API handler)
  - `BayStateScraper/run_job.py` (stdout-only logging)
  - `BayStateScraper/scrapers/main.py` (force=True behavior)

  **Acceptance Criteria**:
  - [x] Each entrypoint emits JSON logs by default.
  - [x] No duplicate log lines.

- [x] 4. Centralize and apply HTTP recursion filter

  **What to do**:
  - Move `NoHttpFilter` from `daemon.py`/`runner.py` into `utils/logger.py`.
  - Ensure filter is applied to API shipping handler and/or relevant loggers.

  **Parallelizable**: YES (with Task 5)

  **References**:
  - `BayStateScraper/daemon.py` (NoHttpFilter definition)
  - `BayStateScraper/runner.py` (NoHttpFilter definition)

  **Acceptance Criteria**:
  - [x] No infinite recursion when API client logs.
  - [x] httpx/httpcore noise is suppressed as intended.

- [x] 5. Harden `ScraperAPIHandler` shipping semantics

  **What to do**:
  - Add bounded retry/backoff on transient failures.
  - Ensure `flush()` is called on shutdown (atexit + handler.close()).
  - Ensure handler does not block scraping hot paths:
    - Option: internal queue + background thread for sending
    - Keep bounded memory (drop policy or ring buffer)
  - Ensure payload includes job_id and context fields.

  **Parallelizable**: YES (with Task 4)

  **References**:
  - `BayStateScraper/utils/api_handler.py` (current batching implementation)
  - `BayStateScraper/core/api_client.py` (post_logs usage)
  - `BayStateScraper/tests/unit/test_logging.py` (existing tests)

  **Acceptance Criteria**:
  - [x] Unit tests cover: buffering, flush, and failure behavior.
  - [x] Manual SIGTERM/SIGINT test shows final buffer flushed or dropped per policy.

- [x] 6. Add/extend tests and manual verification scripts

  **What to do**:
  - Extend `BayStateScraper/tests/unit/test_logging.py` (or add new tests) to cover:
    - JSON formatter outputs valid JSON
    - Context fields present
    - API handler flush/backoff behavior
  - Add a minimal manual checklist for:
    - `daemon.py` startup/shutdown
    - `runner.py` single job run

  **Parallelizable**: YES

  **References**:
  - `BayStateScraper/tests/unit/test_logging.py`
  - `BayStateScraper/daemon.py`
  - `BayStateScraper/runner.py`

  **Acceptance Criteria**:
  - [x] `python -m pytest` passes for logging tests (manual verification confirmed).
  - [x] Manual checklist steps are executable and unambiguous.

---

## Success Criteria

### Verification Commands (examples)
- `python -m pytest BayStateScraper/tests/unit/test_logging.py -v`
- `python BayStateScraper/daemon.py` (observe JSON logs)

### Final Checklist
- [x] JSON logs default across all entrypoints.
- [x] Context fields available for job/scraper/sku/step.
- [x] API shipping is resilient and non-recursive.
- [x] No duplicate handlers/log spam.
