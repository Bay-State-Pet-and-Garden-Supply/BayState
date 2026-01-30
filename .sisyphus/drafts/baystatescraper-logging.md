# Draft: BayStateScraper Logging Improvements

## Requirements (confirmed)
- Improve logging for `BayStateScraper/`.
- Add **structured JSON logs**.
- Improve **formatting/levels** (reduce noise, consistency).
- **Centralize logging setup everywhere** (remove ad-hoc `logging.basicConfig`).
- Improve **API log shipping** (`utils/api_handler.py`).

## User Preferences
- Execution choice: **Proposal only** (no code changes in this step).

## Current State (evidence)

### Central logger utility
- `BayStateScraper/utils/logger.py` defines `setup_logging(debug_mode: bool=False)`:
  - Configures root logger.
  - Clears handlers to avoid duplicates.
  - Adds `RotatingFileHandler` writing to `logs/app.log` (10MB, 5 backups).
  - Adds console `StreamHandler`.
  - Formats:
    - File: `%(asctime)s - %(name)s - %(levelname)s - %(message)s`
    - Console: `%(levelname)s: %(message)s`

### Entrypoints and logging initialization
- `BayStateScraper/main.py` calls `setup_logging(debug_mode=args.debug)`.
- `BayStateScraper/runner.py` uses `logging.basicConfig(...)` (custom format) and adds `ScraperAPIHandler`.
- `BayStateScraper/daemon.py` uses `logging.basicConfig(...)` (custom format) and adds `ScraperAPIHandler`.
- `BayStateScraper/run_job.py` uses `logging.basicConfig(..., stream=sys.stdout)`.
- `BayStateScraper/scrapers/main.py` uses `logging.basicConfig(level=logging.DEBUG, force=True)` in debug path.

### API log handler
- `BayStateScraper/utils/api_handler.py` implements `ScraperAPIHandler(logging.Handler)`:
  - Buffers logs (`buffer_size=20`, `flush_interval=2s`).
  - Sends batched payload to `api_client.post_logs(job_id, logs)`.
  - Uses `sys.stderr.write(...)` on flush failures to avoid recursion.

### Known inconsistencies / problems to solve
- Multiple `basicConfig` calls with different formats.
- `force=True` in `scrapers/main.py` can override any prior configuration.
- Duplication of `NoHttpFilter` class in `runner.py` and `daemon.py`.
- API logging handler exists but is configured ad-hoc per entrypoint.

## Technical Decisions (pending)
- Default log format decision: **JSON by default** (user chose Option A).
- Whether to use **stdlib logging only** (custom JSON formatter + contextvars) vs leverage `structlog` (listed in requirements per earlier exploration).
- Exact schema for JSON logs (fields, nesting).
- How to pass correlation context consistently (job_id, scraper, sku, step, runner_name, worker_id).
- Log destinations: stdout only vs stdout + rotating file; and behavior inside Docker.

## Scope Boundaries
- INCLUDE:
  - Unifying logging initialization across entrypoints.
  - JSON log formatting.
  - Consistent log levels and message patterns.
  - Hardening API log shipping behavior.
- EXCLUDE:
  - Non-logging refactors of scraper logic.
  - Changes to BayStateApp (unless required for log ingestion contract).

## Open Questions
- Should JSON logs be the **default** output in Docker/production, with pretty/human logs only in local dev?
- What log fields are required by BayStateApp log ingestion (if any)?
- Any PII/secret redaction requirements beyond “avoid credentials”?
- Test strategy preference: use existing `pytest` unit tests for logging utilities, or manual verification only?

## Metis Notes (gap analysis)
- `setup_logging()` exists but key entrypoints still use `logging.basicConfig()`.
- Production entrypoints (`daemon.py`, `runner.py`) log to console; file logging only if `setup_logging()` is adopted.
- Need decisions on: default JSON vs text logs, API log volume expectations, retention limits, and failure behavior when log shipping fails.
- Critical acceptance criteria to add in plan: no duplicate handlers, graceful flush on shutdown, and no recursion from API handler.
