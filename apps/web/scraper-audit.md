# Scraper AGENTS.md Audit

## Summary

Audited 7 AGENTS.md files against actual filesystem at `apps/scraper/`. Also examined stale duplicate at `apps/web/apps/scraper/`.

---

## 1. Stale Duplicate: `apps/web/apps/scraper/`

### Origin
Full `git clone` of the old standalone **BayStateScraper** repo (remote: `https://github.com/Bay-State-Pet-and-Garden-Supply/BayStateScraper.git`). Last commit `fbbc5d9` on **2026-03-05** — 2+ months stale.

### Dimensions
| Metric | Stale Duplicate | Real Scraper |
|--------|----------------|--------------|
| Size | 76 MB | 843 MB |
| daemon.py | 323 lines | 631 lines |
| runner/`__init__.py` | 554 lines | 1421 lines |
| chunk_mode.py | 146 lines | 267 lines |

### Files in Stale Duplicate with No Real-Scraper Counterpart
- `core/concurrent_scraper.py` — removed/refactored
- `core/database/supabase_sync.py` — violates "no DB in runners" rule
- `core/performance_profiler.py` — removed
- `core/scraper_testing_client.py`, `scraper_testing_integration.py` — replaced
- `scraper_backend/archive/ai_handlers/ai_base.py`, `ai_extract.py`, `ai_search.py`, `ai_validate.py` — **these are the orphaned AI handlers** that the actions AGENTS.md claims exist but don't
- `scrapers/events/` — entire old events subsystem (9 files), replaced by `core/events.py`
- Misc: `run_job.py`, `install.py`, test scripts, dumped results files

### Files in Real Scraper Missing from Stale Duplicate
- `scrapers/cohort/` — cohort processing
- `scrapers/ai_search/` — AI search (14 files)
- `scrapers/product_url_extraction/` — URL extractor
- `scrapers/providers/` — provider implementations
- `scrapers/pricing_loader.py`, `sku_loader.py`, `result_collector.py`, `config_validation.py`
- `core/config.py`, `selector_health.py`, `timeout_config.py`, `version.py`
- `validation/`, `reports/`, `data/`, `prompts/`

### Recommendation
**Delete** `apps/web/apps/scraper/`. It is a stale checkout of the old standalone repo, superseded by `apps/scraper/` (which is part of the monorepo `BayState.git`). Nothing references it from the web app.

---

## 2. Root AGENTS.md (`apps/scraper/AGENTS.md`)

| Claim | Actual | Verdict |
|-------|--------|---------|
| `actions/` with `handlers/` | Exists but `handlers/` is **empty** (only `__pycache__`) | **Stale reference** — the real handlers are at `scrapers/actions/handlers/`. Delete the empty `actions/` dir. |
| `engine/` | Exists but **empty** (only `__pycache__`) | **Stale reference** — delete. |
| `scrapers/actions/handlers/` — 24 handlers | **24 handler `.py` files** (excluding `__init__.py`) | **Correct** |
| "Scraper Config" → "Publish via BayStateApp Admin UI" | Consistent with project policy | **Accurate** |
| Execution flow mentions `POST /api/scraper/v1/claim-chunk` | Verified in `core/api_client.py` | **Accurate** |
| `daemon.py` claims work via claim/claim-cohort | Verified in `daemon.py` | **Accurate** |
| Structure tree omits several dirs (`cohort/`, `ai_search/`, `product_url_extraction/`, `config_validation.py`, `engine/`, `validation/`) | These exist in actual tree | **Minor omission** — should add to structure listing |

**Issues found:** 2 stale empty directories (`actions/`, `engine/`) referenced; structure tree incomplete.

---

## 3. `core/AGENTS.md`

| Claim | Actual | Verdict |
|-------|--------|---------|
| Duplicate "RELATED" section (lines 61-65 and 65-69) | Identical text appears twice | **Bug** — remove duplicate |
| `database/` — "(empty – deprecated stubs removed)" | Only `__init__.py` present | **Accurate** |
| 24 files listed | Matches actual | **Accurate** |
| No DB credentials in runners | Consistent with actual | **Accurate** |

**Issues found:** Duplicated RELATED section.

---

## 4. `scrapers/AGENTS.md`

| Claim | Actual | Verdict |
|-------|--------|---------|
| "27 action handlers" | 24 handler files | **WRONG** — should be 24 |
| `events/` listed in structure tree | `scrapers/events/` **does not exist** | **WRONG** — EventEmitter lives in `core/events.py` |
| Structure tree omits `config_validation.py`, `pricing_loader.py`, `sku_loader.py`, `result_collector.py`, `cohort/`, `ai_search/`, `product_url_extraction/`, `providers/` | These exist | **Omission** |
| `scrapers/tests/` directory | Exists (5 items) | **Accurate** |
| `scrapers/utils/` directory | Exists (3 utility files) | **Accurate** |
| "Adding Actions" example code | Matches `base.py`/`registry.py` pattern | **Accurate** |

**Issues found:** Wrong handler count (27→24), phantom `events/` dir, incomplete structure tree.

---

## 5. `actions/AGENTS.md`

| Claim | Actual | Verdict |
|-------|--------|---------|
| "27 action implementations" | 24 `.py` handler files | **WRONG** |
| Lists `extract_and_transform.py` | File is named `extract_transform.py` (registered name IS `extract_and_transform`) | **Misleading** — the filename doesn't match the registered name, but the handler exists |
| Lists `transform_value.py` | Code is in `transform.py` | **Misleading** |
| Lists `conditional_skip.py` | Code is in `validation.py` | **Misleading** |
| Lists `ai_base.py`, `ai_extract.py`, `ai_search.py`, `ai_validate.py` | **None exist** — these were archived in the old repo's `scraper_backend/archive/ai_handlers/` | **WRONG** — these handlers were removed and not ported |
| Handler categories list the same phantom files | Same mismatches | **WRONG** |

**Issues found:** Wrong count, 4 phantom AI handler files, 3 filename-vs-filepath mismatches.

---

## 6. `executor/AGENTS.md`

| Claim | Actual | Verdict |
|-------|--------|---------|
| `workflow_executor.py` ~589 lines | **723 lines** | **Stale** — was 589 at decomposition, grew since |
| Original god class 797 lines | Likely historically accurate (unverifiable now) | **OK** |
| 6 modules listed | 6 files exist | **Accurate** |
| Architecture description | Matches current code | **Accurate** |
| Usage example | Matches imports | **Accurate** |

**Issues found:** Line count out of date (589→723).

---

## 7. `runner/AGENTS.md`

| Claim | Actual | Verdict |
|-------|--------|---------|
| `runner.py` thin wrapper (5 lines) | Root `runner.py` is literally `from runner.cli import main; main()` | **Technically 2 lines, but intent is accurate** |
| `daemon.py` uses `run_job()` with mode dispatch | Verified in `daemon.py` | **Accurate** |
| `Docker ENTRYPOINT: python daemon.py` | Need to check Dockerfile | Presumed **Accurate** |
| Structure listing | Matches actual files | **Accurate** |
| `run_job` exported from `__init__.py` | Verified | **Accurate** |

**Issues found:** Minor (runner.py is 2 lines, not 5).

---

## 8. `src/crawl4ai_engine/AGENTS.md`

| Claim | Actual | Verdict |
|-------|--------|---------|
| Uses `AsyncWebCrawler` from crawl4ai | Verified in imports | **Accurate** |
| Error classification from `core.failure_classifier` | Verified | **Accurate** |
| Results via `callback.py` with HMAC-SHA256 | Verified | **Accurate** |
| Structure listing (9 files) | All exist | **Accurate** |
| Config from `scrapers/configs/*.yaml` | Verified | **Accurate** |
| No sync operations; async-only | Verified | **Accurate** |

**Issues found:** None — this is the most accurate AGENTS.md.

---

## Consolidated Stale Claim Corrections

| # | Doc | Old Claim | New Correction |
|---|-----|-----------|----------------|
| 1 | Root AGENTS | `actions/` dir with handlers | Empty/stale; delete. Real handlers at `scrapers/actions/handlers/` |
| 2 | Root AGENTS | `engine/` dir | Empty/stale; delete |
| 3 | Root AGENTS | Structure tree omits 8+ dirs | Add: `scrapers/cohort/`, `ai_search/`, `product_url_extraction/`, `providers/`, `config_validation.py`, `pricing_loader.py`, `result_collector.py`, `sku_loader.py` |
| 4 | `core/AGENTS` | Duplicate "RELATED" section | Remove duplicate lines 65-69 |
| 5 | `scrapers/AGENTS` | 27 action handlers | **24** handler files (39 registered actions across 24 files) |
| 6 | `scrapers/AGENTS` | `events/` directory | Does not exist; EventEmitter is in `core/events.py` |
| 7 | `scrapers/AGENTS` | Incomplete structure | Same additional items as #3 |
| 8 | `actions/AGENTS` | 27 implementations | **24** handler files |
| 9 | `actions/AGENTS` | `extract_and_transform.py` | File is `extract_transform.py` (registered action name is correct) |
| 10 | `actions/AGENTS` | `transform_value.py` | Code is in `transform.py` |
| 11 | `actions/AGENTS` | `conditional_skip.py` | Code is in `validation.py` |
| 12 | `actions/AGENTS` | `ai_base.py`, `ai_extract.py`, `ai_search.py`, `ai_validate.py` | **Do not exist** — archived in old repo, never ported |
| 13 | `executor/AGENTS` | `workflow_executor.py` ~589 lines | **723 lines** |
| 14 | `runner/AGENTS` | `runner.py` 5 lines | 2 lines (trivial) |
| 15 | Stale duplicate AGENTS | 27 handlers | Same 24 count issue |
| 16 | Stale duplicate AGENTS | `scraper_backend/scrapers/actions/handlers/` | Path doesn't exist; handlers live at `scrapers/actions/handlers/` |
| 17 | Stale duplicate AGENTS | `mypy scraper_backend/` command | Should be `mypy .` |
| 18 | Stale duplicate AGENTS | `python cli/scraper_cli.py --help` | Should be `python cli/main.py --help` (or `bsr --help`) |
| 19 | Stale duplicate AGENTS | Polls `GET /api/admin/scraping/pending-jobs` | Real daemon polls `POST /api/scraper/v1/claim-chunk` / `claim-cohort` |

---

## Files Most Needing Updates

1. **`actions/AGENTS.md`** — 12 of 19 issues. Wrong count, phantom files, wrong filenames.
2. **`scrapers/AGENTS.md`** — Wrong count, phantom `events/` dir, incomplete tree.
3. **Root AGENTS.md** — Stale empty dirs referenced, incomplete tree.
4. **`core/AGENTS.md`** — Duplicate section.
5. **`executor/AGENTS.md`** — Line count drift.

**`src/crawl4ai_engine/AGENTS.md`** is the most accurate — zero issues found.

---

## Action Items

1. **Delete `apps/web/apps/scraper/`** — stale clone, superseded by `apps/scraper/`
2. **Delete empty `apps/scraper/actions/`** and **`apps/scraper/engine/`** — stale dirs
3. **Update `actions/AGENTS.md`** — fix count, remove phantom AI files, fix file mapping
4. **Update `scrapers/AGENTS.md`** — fix count, remove `events/` ref, add missing tree items
5. **Update root `AGENTS.md`** — remove stale dirs from tree, add missing items
6. **Update `core/AGENTS.md`** — deduplicate RELATED section
7. **Update `executor/AGENTS.md`** — correct workflow_executor.py line count
