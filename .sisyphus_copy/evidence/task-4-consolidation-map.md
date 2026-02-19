# Task 4 — Directory Audit + Consolidation Map

## Canonical Structure Decision

- **Canonical code location:** root-level packages/files (`core/`, `scrapers/`, `runner.py`) are the source of truth.
- **Reason:** runtime entrypoint is root daemon and Docker entrypoint is `daemon.py` (`Dockerfile` uses `ENTRYPOINT ["python", "daemon.py"]`), and daemon currently imports root modules (`core.api_client`, `runner`).
- **Legacy entry points to delete in follow-up task:**
  - `main.py`
  - `scrapers/main.py`

---

## Python File Inventory Summary (scope requested)

- Root tree (excluding `scraper_backend/`, `src-tauri/`, `ui/`, env/cache dirs): audited.
- `scraper_backend/` tree: audited.
- `scrapers/` vs `scraper_backend/scrapers/` overlap:
  - Common `.py` files: `3`
    - `models/config.py`
    - `parser/__init__.py`
    - `parser/yaml_parser.py`
  - Root-only `.py` files in `scrapers/`: `55`
  - Backend-only `.py` files in `scraper_backend/scrapers/`: `0`

---

## Duplicate Pair Decisions

## 1) `core/api_client.py` vs `scraper_backend/core/api_client.py`

- **Classification:** **Divergent** (both have unique behavior).
- **Feature delta:**
  - Root has: `ClaimedChunk` dataclass, `poll_for_work`, `heartbeat`, `post_logs`, `get_credentials`, chunk claim without required `job_id` parameter, `GET /supabase-config`.
  - Backend has: `JobScraperConfig` DTO rename, `ConfigFetchError`, `get_published_config`, `send_logs` (renamed from `post_logs`), required `job_id` in `claim_chunk`, lease fields populated in `get_job_config`, `POST /supabase-config`.
- **Survivor:** **`core/api_client.py` (root)**.
- **Merge required into survivor:**
  1. Add `get_published_config()` + `ConfigFetchError` support.
  2. Backward-compatible logging API (`post_logs` + optional alias `send_logs`).
  3. Keep daemon-needed methods (`heartbeat`, `poll_for_work`, `get_credentials`) unless explicitly retired.
  4. Reconcile `claim_chunk` signature (support both job-scoped and legacy forms, then deprecate one path).
  5. Reconcile supabase config HTTP verb with API contract.

## 2) `core/anti_detection_manager.py` vs `scraper_backend/core/anti_detection_manager.py`

- **Classification:** **Divergent**.
- **Feature delta:**
  - Root implementation is Playwright/page-based (`page.locator`, `page.content`, `page.title`) and aligns with current architecture.
  - Backend copy includes Selenium-style `driver.find_elements` flow and a `By` shim; appears older/misaligned with Playwright runtime.
- **Survivor:** **`core/anti_detection_manager.py` (root)**.
- **Merge required into survivor:**
  - Only safe comments/docs if desired; **do not import Selenium-style driver behavior**.

## 3) `core/events.py` vs `scraper_backend/core/events.py`

- **Classification:** **Identical**.
- **Survivor:** **`core/events.py` (root)**.
- **Merge required:** none.

## 4) `runner.py` vs `scraper_backend/runner.py`

- **Classification:** **Divergent** (`scraper_backend/runner.py` has significantly more functionality).
- **Feature delta:**
  - Root runner has daemon-compatible log buffering path (`log_buffer`), `ConfigurationError`, and existing test expectations.
  - Backend runner adds structured JSON logging, sensitive-data redaction, pre-flight `health_check`, realtime mode, config fetch/validation integration, richer error typing/trace IDs, expanded chunk-worker behavior.
- **Survivor:** **`runner.py` (root)**.
- **Merge required into survivor:**
  1. Structured logging stack (JSON formatter + redaction filter).
  2. Pre-flight health check fail-fast.
  3. Realtime mode orchestration (currently backend-only).
  4. Config fetch/validation path integration where compatible.
  5. Preserve daemon compatibility (existing `run_job(..., log_buffer=...)` contract or update daemon/tests together).

## 5) `scrapers/` vs `scraper_backend/scrapers/`

- **Classification:** **Completely different at directory scope (partial overlap only)**.
  - Root `scrapers/` is the full package (actions/events/executor/main/result collector/tests/etc.).
  - Backend `scraper_backend/scrapers/` is sparse subset with 3 overlapping files.
- **Survivor:** **`scrapers/` (root)**.
- **Per-overlap sub-decisions:**
  - `parser/__init__.py`: **Identical** → keep root.
  - `parser/yaml_parser.py`: **Identical** → keep root.
  - `models/config.py`: **Divergent** (backend has stricter schema-versioning and bounds; root has broader compatibility with current root imports) → keep root file, merge backend schema safeguards selectively.
- **Merge required into survivor (`scrapers/models/config.py`):**
  1. `schema_version` validation strategy (if API payloads now depend on it).
  2. Numeric bounds (`timeout`, `retries`, `image_quality`) where non-breaking.
  3. New optional fields (`display_name`, `edge_case_skus`) if consumed upstream.

---

## Import Path Change Map

### A) Remove `scraper_backend.*` imports from active runtime paths

- `daemon.py`
  - `from scraper_backend.core.realtime_manager import RealtimeManager`
  - **Change to:** `from core.realtime_manager import RealtimeManager` (after moving/creating root `core/realtime_manager.py`).

- `runner.py` (root survivor after merge)
  - absorb backend functionality directly; avoid `scraper_backend.*` imports in final state.

- `scraper_backend` modules that survive functionally should be moved to root and imports rewritten:
  - `scraper_backend/core/config_fetcher.py` → `core/config_fetcher.py`
  - `scraper_backend/core/realtime_manager.py` → `core/realtime_manager.py`
  - related imports from `scraper_backend.core.*` → `core.*`

### B) Standardize model/parser imports to root package

- Current backend subset still references mixed roots in some places.
- Final target:
  - `scrapers.*` and `core.*` only on canonical runtime path.

### C) Test/import bootstrap cleanup

- `tests/conftest.py` currently inserts `scraper_backend` into `sys.path`.
- After consolidation, remove `scraper_backend` path injection and keep root-only path setup.

---

## Entry Points Requiring Updates

## `daemon.py`

- Keep as primary runtime entrypoint.
- Update imports to canonical root modules only (not `scraper_backend.*`).
- If runner API changes during merge, update daemon calls (`run_job`, chunk/log methods) in same migration.

## `main.py`

- Marked legacy by task context; remove in deletion task after import graph is clean.

## `scrapers/main.py`

- Marked legacy by task context; remove in deletion task after callers are migrated.

## `Dockerfile`

- Keep `ENTRYPOINT ["python", "daemon.py"]` (consistent with canonical root).
- No immediate change required unless daemon location changes (not planned).

## `tests/conftest.py`

- Remove `scraper_backend` path bootstrap once consolidated modules live under root.
- Ensure tests import canonical root modules only.

---

## Keep / Merge / Delete Summary

- **Keep (canonical):**
  - `core/api_client.py` (merge backend features)
  - `core/anti_detection_manager.py`
  - `core/events.py`
  - `runner.py` (merge backend features)
  - `scrapers/` package (merge `models/config.py` enhancements selectively)

- **Merge-from (then retire duplicate copies):**
  - `scraper_backend/core/api_client.py`
  - `scraper_backend/runner.py`
  - `scraper_backend/scrapers/models/config.py`

- **Delete in follow-up consolidation/deletion task:**
  - duplicate modules under `scraper_backend/` once merged
  - legacy entry points: `main.py`, `scrapers/main.py`
