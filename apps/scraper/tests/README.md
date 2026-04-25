# Scraper Test Suite Documentation

This document describes the test structure, test categories, and how to run tests for the BayStateScraper.


## Quick Reference

### CI Gating Command (Offline Only)

Run this exact command locally before pushing changes to Official Brand Scraper or AI Search code:

```bash
cd apps/scraper && pytest -m "not benchmark and not live and not performance" --ignore=tests/benchmarks
```

This command:
- Excludes live API tests (requires Serper.dev, OpenAI keys)
- Excludes benchmark tests (performance measurement)
- Excludes performance tests (timing-sensitive)
- Skips the benchmarks directory entirely


## Test Categories

### 1. Offline Tests (Run in CI)

These tests run on every PR and push. They require no external APIs and complete in under 2 minutes.

**Gating Test Files for OBS/AI Search Changes:**

| File | Purpose | Lines of Code |
|------|---------|---------------|
| `tests/unit/test_official_brand_scraper.py` | Unit tests for OfficialBrandScraper with mocked dependencies | ~600 |
| `tests/unit/test_search_scorer_regressions.py` | Regression tests for SearchScorer scoring behavior | ~450 |
| `tests/integration/test_official_brand_pipeline.py` | Integration tests using fixture-backed search results | ~400 |
| `tests/unit/test_golden_dataset_regression.py` | Threshold-based regression tests against golden dataset | ~500 |
| `tests/unit/test_golden_fixture_bridge.py` | Tests for golden dataset to fixture client bridge | ~300 |
| `tests/unit/test_ground_truth_validator.py` | Validation tests for ground truth fixture data | ~200 |

**Other Offline Test Files:**
- `tests/unit/test_extraction_validator.py` - Ported assertions from archived tests
- `tests/unit/test_selection_pipeline.py` - Selection pipeline behavior tests
- `tests/unit/test_fixture_search_client.py` - Fixture-based search client tests
- `tests/unit/test_result_quality.py` - Result quality validation tests
- `tests/unit/test_extract_transform.py` - Data transformation tests
- `tests/unit/test_audit_cli.py` - CLI audit command tests


### 2. Live Tests (Manual Only)

**These tests are NOT run in CI. They require live API credentials and incur costs.**

Live tests are marked with the `live` pytest marker. There are approximately 20 live tests in the `tests/benchmarks/` directory.

**Required Environment Variables for Live Tests:**
```bash
export SCRAPER_API_KEY=bsr_...        # BayStateApp API key
export LLM_API_KEY=sk-...             # OpenAI API key
export SERPER_API_KEY=...             # Serper.dev API key (for search tests)
```

**Running Live Tests Manually:**

```bash
cd apps/scraper

# Run all live tests
pytest -m "live" --run-live

# Run specific live test
pytest tests/benchmarks/unified/test_official_brand_scraper.py -m "live" --run-live -v

# Run with limited URLs (faster)
pytest tests/benchmarks/ -m "live" --run-live --max-urls=10
```

**Live Test Command-Line Options:**
- `--run-live` - Required flag to enable live API calls
- `--max-urls=N` - Limit to N URLs (default: 50)
- `--modes=auto,llm-free,llm` - Extraction modes to test
- `--timeout=N` - Per-URL timeout in seconds (default: 30)


### 3. Benchmark Tests (Scheduled Nightly)

Benchmark tests run on a schedule via `benchmark-live.yml`. They are NOT run on PRs.

**Schedule:** Nightly at 03:00 UTC via cron trigger in `.github/workflows/benchmark-live.yml`

**Running Benchmarks Manually:**

```bash
cd apps/scraper

# Run all benchmarks (requires API keys)
pytest tests/benchmarks/unified/ -m "benchmark or live" --run-live

# Run specific benchmark
pytest tests/benchmarks/unified/test_engine_performance.py -m "performance"

# Run performance benchmarks only (no API calls)
pytest tests/benchmarks/unified/ -m "performance"
```


## pytest Markers

Defined in `apps/scraper/pytest.ini`:

| Marker | Description | CI Status |
|--------|-------------|-----------|
| `live` | Requires live external APIs (search, LLM, etc.) | EXCLUDED |
| `benchmark` | Performance or benchmark-oriented tests | EXCLUDED |
| `performance` | Tests that measure performance metrics | EXCLUDED |
| `integration` | Tests that exercise live scraper integrations | INCLUDED (offline) |
| `slow` | Tests that are slow-running (>30s) | INCLUDED |
| `timeout` | Tests with a timeout limit | INCLUDED |

**Default pytest.ini excludes live tests:**
```ini
addopts = --verbose -m "not live"
```


## Archive Directory (`tests/archive/`)

The `tests/archive/` directory contains 13 legacy test files from the AI Search v1 era. These files are kept for reference but are NOT run as part of the test suite.

**Rationale for Archiving:**
- AI Search v1 used different architecture (browser-use based)
- New Official Brand Scraper uses crawl4ai engine
- Assertions were ported to new test files where applicable
- Archive preserves historical test logic for reference

**Archived Files (13 total):**

| File | Classification | Status |
|------|----------------|--------|
| `test_two_step_refiner.py` | ARCHIVE | TwoStepSearchRefiner deleted |
| `test_ab_test_prompts.py` | ARCHIVE | A/B test harness for old prompts |
| `t17_ab_test_harness.py` | ARCHIVE | Old browser-use harness |
| `test_source_selector.py` | ARCHIVE | LLMSourceSelector deleted |
| `test_candidate_resolver.py` | ARCHIVE | CandidateResolver deleted |
| `test_crawl4ai_vs_browser_use.py` | ARCHIVE | Browser-use legacy comparison |
| `test_comparison.py` | ARCHIVE | Old extraction A/B framework |
| `test_benchmark.py` | ARCHIVE | AISearchScraper set to None |
| `test_batch_search_sku_first.py` | PORT | Assertions ported to `test_search_scorer_regressions.py` |
| `test_context_ranking.py` | PORT | Assertions ported to `test_search_scorer_regressions.py` |
| `test_cohort_validation.py` | PORT | Assertions ported to `test_extraction_validator.py` |
| `test_domain_retry.py` | PORT | Documented as "hold for reimplementation" |
| `test_batch_search_official_resolution.py` | PORT | Assertions ported to `test_selection_pipeline.py` |

**Note:** The `pytest.ini` does not include `tests/archive/` in `testpaths`, so these files are automatically excluded from test collection.


## Test Structure

```
tests/
├── unit/                           # Unit tests (fast, isolated, mocked)
│   ├── test_official_brand_scraper.py
│   ├── test_search_scorer_regressions.py
│   ├── test_golden_dataset_regression.py
│   ├── test_golden_fixture_bridge.py
│   ├── test_fixture_search_client.py
│   ├── test_ground_truth_validator.py
│   ├── test_extraction_validator.py
│   ├── test_selection_pipeline.py
│   └── ...
├── integration/                    # Integration tests (fixtures, no live APIs)
│   └── test_official_brand_pipeline.py
├── benchmarks/                     # Benchmark tests (scheduled, live APIs)
│   ├── unified/
│   │   ├── test_official_brand_scraper.py
│   │   ├── test_engine_performance.py
│   │   ├── test_extraction_accuracy.py
│   │   └── ...
│   └── legacy/                     # Legacy benchmark utilities
├── archive/                        # ARCHIVED - AI Search v1 tests (not run)
│   ├── test_two_step_refiner.py
│   ├── test_ab_test_prompts.py
│   └── ... (13 files total)
├── fixtures/                       # Test data
│   └── test_skus_ground_truth.json
├── evaluation/                     # Evaluation utilities
│   ├── ground_truth_loader.py
│   └── ground_truth_validator.py
└── support/                        # Test support utilities
    └── scraper_testing_client.py
```


## Legacy AI Search v1 vs Current Official Brand Scraper

### Test Responsibility Matrix

| Component | Legacy (v1) | Current (v2) | Test Location |
|-----------|-------------|--------------|---------------|
| Search Provider | Serper.dev with browser-use | Serper.dev with crawl4ai | `tests/benchmarks/` (live) |
| Source Selection | LLM-based ranking | Scoring-based ranking | `tests/unit/test_search_scorer_regressions.py` |
| Extraction | Browser-use automation | crawl4ai engine | `tests/unit/test_official_brand_scraper.py` |
| Brand Detection | Heuristic + LLM | Knowledge Graph + scoring | `tests/integration/test_official_brand_pipeline.py` |
| URL Validation | Manual | Automated with retries | `tests/unit/test_selection_pipeline.py` |

### Key Differences

**Legacy AI Search v1:**
- Used `browser-use` for web automation
- LLM-based source selection and ranking
- Heavy reliance on OpenAI API calls
- Tests in `tests/archive/` directory

**Current Official Brand Scraper:**
- Uses `crawl4ai` for web extraction
- Scoring-based source selection (SearchScorer)
- Knowledge Graph integration for brand detection
- LLM fallback only when needed
- Tests in `tests/unit/` and `tests/integration/` directories


## CI/CD Workflows

### scraper-ci.yml (PR/Push)

**Trigger:** Pull requests and pushes to `main`/`develop`

**Test Command:**
```bash
pytest -m "not benchmark and not live and not performance" --ignore=tests/benchmarks
```

**Purpose:** Fast, deterministic feedback on code changes. No API costs. No external dependencies.

### benchmark-live.yml (Scheduled)

**Trigger:**
- Schedule: Nightly at 03:00 UTC
- Manual: `workflow_dispatch` for on-demand runs

**Test Command:**
```bash
pytest tests/benchmarks/unified/ -m "benchmark or live" --run-live
```

**Purpose:** Monitor live API performance, catch regressions in real-world extraction, track costs.

**No Weekly Scheduled Tests:**
There is no weekly scheduled workflow for Official Brand Scraper tests. Live tests run nightly via `benchmark-live.yml` only. If you need to run live tests more frequently, use manual `workflow_dispatch` trigger or run locally with appropriate API keys.


## Running Tests Locally

### Before Pushing (Offline Tests)

```bash
cd apps/scraper

# Run all offline tests (CI equivalent)
pytest -m "not benchmark and not live and not performance" --ignore=tests/benchmarks

# Run only unit tests
pytest tests/unit/ -v

# Run only Official Brand Scraper tests
pytest tests/unit/test_official_brand_scraper.py -v

# Run with coverage
pytest tests/unit/ --cov=scrapers --cov-report=term-missing
```

### Manual Live Testing (Requires API Keys)

```bash
cd apps/scraper

# Set required environment variables
export SCRAPER_API_KEY=bsr_your_key_here
export LLM_API_KEY=sk_your_key_here

# Run live benchmarks
pytest tests/benchmarks/unified/test_official_brand_scraper.py -m "live" --run-live -v

# Run specific benchmark with limits
pytest tests/benchmarks/unified/ -m "benchmark" --max-urls=10 --timeout=60
```


## Troubleshooting

### Test Collection Shows "ModuleNotFoundError"

Some legacy imports may fail during test collection. These are from archived modules and do not affect the active test suite:

```
ImportError while loading conftest '.../tests/archive/test_benchmark.py'
```

This is expected. The `tests/archive/` directory is excluded from testpaths in `pytest.ini`.

### Live Tests Fail Without `--run-live`

Live tests are skipped by default unless you pass `--run-live`:

```bash
# This will SKIP live tests
pytest -m "live"

# This will RUN live tests
pytest -m "live" --run-live
```

### Cache Miss Errors in Fixture Tests

If you see `CacheMissError` in fixture-based tests, the golden dataset may be missing or corrupted:

```bash
# Verify golden dataset exists
ls -la apps/scraper/data/golden_dataset_v3.search_results.json

# If missing, regenerate from source or restore from git
git checkout apps/scraper/data/golden_dataset_v3.search_results.json
```


## Pre-existing Test Failures (Known Issues)

Three tests in `test_search_scorer_regressions.py` fail due to known scoring behavior:

1. `test_scoring_prefers_exact_official_stella_page_over_retailer`
2. `test_scoring_prefers_exact_official_fluval_pdp_over_retailer`
3. `test_scoring_prefers_exact_mannapro_official_horse_treat_pdp_over_exact_small_retailer`

**Root Cause:** Retailer URLs containing the SKU in the path receive a +5.0 SKU match bonus, causing them to outrank official brand domains. This is documented scoring behavior, not a bug.

These failures are expected and should NOT be "fixed" without a deliberate scoring algorithm change.


## Summary

| What | Command | When |
|------|---------|------|
| **CI Gating** | `pytest -m "not benchmark and not live and not performance" --ignore=tests/benchmarks` | Before every push |
| **Unit Tests** | `pytest tests/unit/ -v` | During development |
| **Live Tests** | `pytest -m "live" --run-live` | Manual only, requires API keys |
| **Benchmarks** | `pytest tests/benchmarks/ -m "benchmark"` | Nightly scheduled or manual |
| **All Offline** | `pytest -m "not live"` | Local verification |
