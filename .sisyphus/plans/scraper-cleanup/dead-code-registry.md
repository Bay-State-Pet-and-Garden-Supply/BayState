# Dead Code Registry - Scraper Cleanup

**Generated:** March 5, 2026  
**Source:** Investigation Tasks T3 (runtime vs runner) and T4 (test files catalog)  
**Purpose:** Document dead/unused code for Wave 2 cleanup phase

---

## 1. SAFE TO DELETE (Confirmed Unused)

### 1.1 Legacy Runtime Module

| Item | Path | Lines | Reason |
|------|------|-------|--------|
| **runtime.py** | `apps/scraper/scrapers/runtime.py` | 1197 | Legacy module superseded by `runner/__init__.py` |

**Details:**
- Contains `run_scraping()` function that duplicates `run_job()` in runner module
- Uses older threading model with ThreadPoolExecutor and shared queues
- Only remaining consumer is `run_job.py` (see Migration Path below)
- Functionality has been consolidated into `runner/__init__.py:run_job()`

**Migration Path:**
- `run_job.py` needs to be updated to use `from runner import run_job` instead
- The API is similar but not identical. Key differences:
  - `run_job()` takes `JobConfig` object instead of individual parameters
  - `run_job()` returns `dict[str, Any]` results
  - No progress callbacks in new API (uses EventEmitter instead)

**Risk Assessment:** LOW
- File is only used by one script (`run_job.py`)
- No tests import this module
- Can be safely deleted after `run_job.py` migration

---

### 1.2 Root-Level One-Off Test Files

| Item | Path | Lines | Reason |
|------|------|-------|--------|
| **test_setup.py** | `apps/scraper/test_setup.py` | ~165 | One-time setup verification script |
| **test_supabase_connection.py** | `apps/scraper/test_supabase_connection.py` | ~110 | One-time connection test |
| **test_supabase_writes.py** | `apps/scraper/test_supabase_writes.py` | ~145 | One-time write validation test |
| **test_fix_extraction.py** | `apps/scraper/test_fix_extraction.py` | ~120 | One-time extraction bug fix test |
| **test_cost_validation.py** | `apps/scraper/test_cost_validation.py` | ~520 | One-time cost calculation validation |
| **test_browser_use_fix.py** | `apps/scraper/test_browser_use_fix.py` | ~90 | One-time browser-use regression test |
| **tmp_metrics_test.py** | `apps/scraper/tmp_metrics_test.py` | ~50 | Temporary metrics validation |

**Details:**
All 7 files share these characteristics:
- Created for specific one-time verification tasks
- Named without `test_` prefix that pytest looks for (confusingly, they all start with `test_` but are standalone scripts, not pytest tests)
- Not integrated into test suite
- No CI references
- Contain hardcoded values and manual assertions
- Some reference deprecated APIs

**Risk Assessment:** LOW
- None imported by production code
- None referenced in CI/CD
- None are actual pytest test files
- Safe to archive or delete

---

## 2. NEEDS_VERIFICATION (Uncertain)

### 2.1 Entry Point Script

| Item | Path | Lines | Status |
|------|------|-------|--------|
| **run_job.py** | `apps/scraper/run_job.py` | 59 | Used by legacy CLI, needs migration |

**Details:**
- Currently imports from `scrapers.runtime` (the legacy module)
- Entry point for CLI: `python run_job.py --skus ...`
- Needs migration to use `from runner import run_job`

**Verification Needed:**
1. Is this script referenced in documentation?
2. Is it used by any automation/workflows?
3. Should it be kept and migrated, or deprecated in favor of `daemon.py`?

**Risk Assessment:** MEDIUM
- Could be referenced in runbooks or user workflows
- Migration required before `runtime.py` can be deleted
- Verify no external dependencies before changes

---

### 2.2 API Server Script

| Item | Path | Lines | Status |
|------|------|-------|--------|
| **server.py** | `apps/scraper/api/server.py` | unknown | May import runtime.py |

**Details:**
- Grep found import reference but need to verify actual usage
- Part of debug/development API server

**Verification Needed:**
1. Confirm if actually imports runtime.py
2. Check if server.py is actively used
3. Migrate to runner if needed

**Risk Assessment:** MEDIUM
- Part of API layer, could have external callers
- Verify before deletion

---

### 2.3 Scrapers Main Module

| Item | Path | Lines | Status |
|------|------|-------|--------|
| **scrapers/__main__.py** | `apps/scraper/scrapers/__main__.py` | unknown | May use runtime.py |

**Details:**
- Grep found import reference
- Entry point when running `python -m scrapers`

**Verification Needed:**
1. Verify actual runtime.py import
2. Check if module is used as entry point
3. Migrate or deprecate

**Risk Assessment:** MEDIUM
- CLI entry point, may be documented
- Verify usage before changes

---

## 3. KEEP (Actively Used)

### 3.1 Canonical Runner Module

| Item | Path | Lines | Reason |
|------|------|-------|--------|
| **runner/__init__.py** | `apps/scraper/runner/__init__.py` | 554 | **Canonical implementation** |

**Details:**
- Primary `run_job()` function used throughout codebase
- Used by:
  - `daemon.py` - main daemon entry point
  - `runner/full_mode.py` - full job execution mode
  - `runner/chunk_mode.py` - distributed chunk worker mode
  - `runner/realtime_mode.py` - realtime listener mode
  - `runner/__main__.py` - CLI entry point
  - `runner/cli.py` - argument parsing
  - Tests in `tests/test_runner_config_errors.py`, `tests/test_chunk_mode.py`

**Key Features:**
- Async/await pattern with proper event loop management
- Event-driven architecture with EventEmitter
- Telemetry collection from events
- Discovery job support
- Proper browser lifecycle management
- Supports progress callbacks for incremental saving

**Risk Assessment:** KEEP - CRITICAL PATH
- Core production code
- Do not modify without thorough testing

---

### 3.2 Daemon Entry Point

| Item | Path | Lines | Reason |
|------|------|-------|--------|
| **daemon.py** | `apps/scraper/daemon.py` | 351 | Production daemon entry point |

**Details:**
- Main Docker container entry point
- Imports `run_job` from `runner` module (line 128)
- Handles polling, heartbeats, realtime connections
- Production-critical

**Risk Assessment:** KEEP - CRITICAL PATH

---

### 3.3 Runner Submodules

| Item | Path | Reason |
|------|------|--------|
| **runner/full_mode.py** | `apps/scraper/runner/full_mode.py` | Full job execution |
| **runner/chunk_mode.py** | `apps/scraper/runner/chunk_mode.py` | Distributed chunk worker |
| **runner/realtime_mode.py** | `apps/scraper/runner/realtime_mode.py` | Realtime listener |
| **runner/cli.py** | `apps/scraper/runner/cli.py` | CLI argument parsing |
| **runner/__main__.py** | `apps/scraper/runner/__main__.py` | Module entry point |

**Risk Assessment:** KEEP - ALL CRITICAL PATH

---

## Summary

### Deletion Priority

1. **Immediate (Low Risk):**
   - 7 root-level test files (`test_setup.py`, `test_supabase_connection.py`, etc.)

2. **After Migration (Low-Medium Risk):**
   - `scrapers/runtime.py` (migrate `run_job.py` first)

3. **Verification Required:**
   - `run_job.py` (migrate or deprecate)
   - `api/server.py` (verify usage)
   - `scrapers/__main__.py` (verify usage)

### Lines of Code Impact

| Category | Files | Approx. Lines |
|----------|-------|---------------|
| Safe to Delete | 8 | ~2,400 |
| Needs Verification | 3 | ~200+ |
| Keep | 7 | ~1,500+ |

### Recommended Wave 2 Actions

1. **Phase 1:** Archive/delete 7 one-off test files
2. **Phase 2:** Verify and migrate `run_job.py` to use `runner.run_job`
3. **Phase 3:** Verify `api/server.py` and `scrapers/__main__.py`
4. **Phase 4:** Delete `scrapers/runtime.py` after all migrations complete

---

*This registry was created based on static analysis and grep searches. Always verify in a development environment before deleting production code.*
