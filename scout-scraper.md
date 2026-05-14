# Scraper Runner Architecture — Complete Context

## 1. Runner Architecture Overview

### daemon.py (entry point)
**File:** `apps/scraper/daemon.py` (lines 1-260)

Long-running polling daemon that runs in Docker. Flow:
1. Loads env, initializes Sentry + metrics server
2. Creates `ScraperAPIClient` (HTTP + Supabase Realtime connection)
3. Enters main loop:
   - Tries `client.claim_cohort()` first (if `USE_COHORT_PROCESSING=true`)
   - Falls back to `client.claim_chunk()`
   - No work → backoff with jitter (30s → 300s), heartbeat every 60s
   - Has work → `process_chunk()` or `process_cohort()`
   - After `MAX_JOBS_BEFORE_RESTART` (100) → exits for container restart (memory hygiene)
   - Catches `RunnerBuildMismatchError` (HTTP 426) and shuts down gracefully

**Key detail:** The daemon checks runner build version against coordinator expectations. If mismatched, the coordinator returns HTTP 426 and the daemon exits. This ensures runners are updated before processing.

### runner/ package
**Directory:** `apps/scraper/runner/`

Files:
- `__main__.py` — entry point, loads env, delegates to CLI
- `cli.py` — argparse, local mode, test mode, API mode dispatching
- `__init__.py` — `run_job()` (the core orchestrator), `_run_sequential_job()`, `_run_cohort_job()`, `_run_official_brand_job()`
- `chunk_mode.py` — `run_chunk_worker_mode()` — loops claiming chunks for same job with incremental progress saving
- `full_mode.py` — single job execution
- `realtime_mode.py` — Supabase Realtime-based work claiming
- `job_execution.py` — `execute_claimed_job()` — wrapper with progress/failure handling
- `assertions.py` — test assertion comparison engine

**`run_job()` flow** (line ~335 in `runner/__init__.py`):
1. Check if cohort processing needed → `_run_cohort_job()` or `_run_sequential_job()`
2. Parse scrapers from `JobConfig` into `ScraperConfigModel` (Pydantic)
3. For each scraper config:
   - Create `WorkflowExecutor` with a Playwright browser
   - For each SKU: `executor.execute_workflow(context={"sku": sku})`
   - Collect results, map field names (Name→title, Brand→brand, etc.)
   - Build payload dict via `sanitize_product_payload()`
   - Emit progress/telemetry events
4. Return `{skus_processed, scrapers_run, data: {sku: {scraper_name: payload}}, logs, telemetry}`

Also handles "Official Brand" jobs (`_run_official_brand_job`) — URL discovery is now server-side and deprecated on runner; only `direct_url_extraction` still uses the runner for AI extraction.

---

## 2. Static Scraper Configs

**Directory:** `apps/scraper/scrapers/configs/`

15 YAML configs, all `scraper_type: static`:

| Config | `requires_login` | Login workflow | OCR | Notes |
|--------|-----------------|----------------|-----|-------|
| amazon.yaml | No | No | No | Complex search→PDP extraction, Brand regex transform |
| bentleyseeds.yaml | No | No | No | Shopify-based, search→product_url→extract |
| bradley.yaml | — | — | — | — |
| central-pet.yaml | — | — | — | — |
| coastal.yaml | No | No | No | Product listing→detail extraction |
| countrymax.yaml | — | — | — | — |
| fromm_test.yaml | — | — | — | Test-specific config |
| gardeners.yaml | — | — | — | — |
| k9granolafactory.yaml | — | — | — | — |
| mazuri.yaml | — | — | — | — |
| orgill.yaml | — | — | — | — |
| petedge.yaml | — | — | — | — |
| petfoodex.yaml | — | — | — | Login-gated |
| petswarehouse.yaml | — | — | — | — |
| phillips.yaml | **Yes** | Yes (CCSiteLogin) | **Yes** (OCR from images) | Login→search→extract, credential_refs: [phillips] |

**Common YAML structure:**
```yaml
schema_version: "1.0"
name: phillips
display_name: Phillips Pet
base_url: https://shop.phillipspet.com
scraper_type: static
selectors:           # Named selector definitions with CSS/XPath + fallbacks
  - name: Name
    selector: "#plp-desktop-row .cc_product_name strong"
    fallback_selectors: ["h1", "[data-testid='product-name']"]
    attribute: text
    multiple: false
    required: true
workflows:           # Ordered action steps
  - action: login          # For login-gated sites
  - action: navigate       # URL with {sku} template
  - action: wait_for       # Wait for specific selectors
  - action: check_no_results
  - action: conditional_skip
  - action: extract        # Extract named fields
  - action: process_images # Regex replacements + filters
  - action: ocr_images     # Tesseract OCR on product images
test_skus: [...]          # SKUs used in test mode
test_assertions:          # Expected extraction results for QA
  - sku: "072705115310"
    expected:
      title: "Fromm Gold Large Breed Dog 30 lb"
      brand: "FROMM FAMILY FOODS LLC"
```

**24 action handlers** in `apps/scraper/scrapers/actions/handlers/`:
navigate, extract, click, wait_for, wait, login, combine_fields, process_images, ocr_images, extract_and_transform, conditional, conditional_click, conditional_skip, check_no_results, validate_search_result, set_proxy, and more. All inherit `BaseAction` and register via `ActionRegistry`.

**How brittle?** Extremely. Every config hard-codes:
- CSS selectors with multiple fallback chains (8+ attempts per field)
- URL templates with `{sku}` substitution
- Vendor-specific login flows (credential_refs, submit_button, success_indicator)
- Image URL regex transformations
- OCR pipelines (phillips.yaml)
- Pagination and search result handling

A single DOM change at any vendor breaks extraction. The `test_assertions` exist precisely to catch these regressions.

---

## 3. Current Extraction Methods

### Playwright (primary — ~95% of production traffic)
- `WorkflowExecutor` → `_create_browser()` → `create_playwright_browser()`
- Full browser automation: navigate, click, wait, extract text/attributes
- Headless by default, visible mode supported for debugging
- Anti-detection: stealth mode, fingerprint rotation
- Browser state persistence for login sessions (storage state)
- 24 action handlers run as workflow steps

### crawl4ai (secondary — AI extraction path)
- `src/crawl4ai_engine/engine.py`: `Crawl4AIEngine` — async context manager wrapping `crawl4ai.AsyncWebCrawler`
- Used by `ProductPageExtractor` (the "Official Brand" AI extraction pipeline)
- Extraction modes: LLM-Free (fast), LLM (DeepSeek), Auto (escalation chain)
- Anti-bot: fingerprint pools, UA rotation, proxy support
- Strategies: CSS, XPath extraction strategies
- Not used in static scraper workflows — only for AI/manufacturer enrichment

### SERP Search (AI discovery path)
- `scrapers/providers/serper.py`: `SerperSearchClient` — Google SERP API
- Used by Official Brand flow to find manufacturer product pages
- Alternative providers: gemini, openai (all legacy aliases → serper now)
- Search results flow: `search.py` → `scoring.py` → `matching.py`

### LLM Extraction (AI path)
- `scrapers/ai_search/llm_runtime.py`: DeepSeek-first (was OpenAI, now forced to deepseek-chat)
- `scrapers/ai_search/crawl4ai_extractor.py`: `Crawl4AIExtractor` — full pipeline:
  1. Crawl4AI fetch → 2. Soft-404 detection → 3. JSON-LD → 4. Meta tags → 5. HTTP fallback → 6. LLM extraction
- `scrapers/ai_search/extraction.py`: HTML/JSON-LD parsing utilities
- `scrapers/product_url_extraction/extractor.py`: `ProductPageExtractor` — the canonical AI extractor (replaces old OfficialBrandScraper)

### OCR (niche)
- `actions/handlers/ocr.py`: Tesseract-based OCR on product images
- Only enabled in `phillips.yaml` (`ocr_config: enabled: true`)

---

## 4. Test Assertions & Admin Scraper Lab

### YAML test_assertions
14 of 15 configs have `test_assertions`. Example:
```yaml
test_assertions:
  - sku: "072705115310"
    expected:
      title: "Fromm Gold Large Breed Dog 30 lb"
      brand: "FROMM FAMILY FOODS LLC"
```

Supported fields: `title`, `brand`, `price`, `image` (and config-specific fields)

### Runner test-mode
`python runner.py --local --config scrapers/configs/phillips.yaml --test-mode`

Flow (in `runner/cli.py`):
1. `run_test_mode()` — loads config, validates, extracts SKUs from test_assertions
2. `run_local_mode()` — executes `run_job()` with those SKUs
3. `build_test_mode_payload()` — compares expected vs actual per field
4. Prints pass/fail summary, exits with error code if any fail

### Admin Scraper Lab
The web admin (`apps/web/app/admin`) has a Scraper Lab interface that:
- Lets operators run test assertions against configs
- Shows assertion diffs (expected vs actual)
- Uses the same `test_assertions` YAML block from published configs
- Calls the runner API to execute tests

This is a QA/debugging tool, not part of the production pipeline.

---

## 5. API Surface (Scraper ↔ Web Coordinator)

### Runner → Web (authenticated with `X-API-Key: bsr_*`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/scraper/v1/claim-chunk` | POST | Claim next chunk atomically (Supabase RPC `claim_next_pending_chunk`) |
| `/api/scraper/v1/claim-cohort` | POST | Claim cohort batch |
| `/api/scraper/v1/heartbeat` | POST | Health check + job lease renewal (5min TTL) |
| `/api/scraper/v1/chunk-callback` | POST | Submit chunk results (incremental or final) |
| `/api/scraper/v1/cohort-callback` | POST | Submit cohort results |
| `/api/scraper/v1/job?job_id=X` | GET | Fetch job config + scraper configs |
| `/api/scraper/v1/credentials/{slug}` | GET | Fetch credentials (on-demand, cached per job) |
| `/api/scraper/v1/logs` | POST | Submit batch logs |
| `/api/scraper/v1/progress` | POST | Submit progress snapshot |
| `/api/scraper/v1/supabase-config` | GET | Fetch Supabase Realtime config |
| `/api/scraper/v1/poll` | POST | Legacy polling (daemon now prefers claim-chunk) |
| `/api/admin/scraping/callback` | POST | Legacy full-job callback (still used by full_mode) |

### Web → Runner (admin-triggered)

| Endpoint | Purpose |
|----------|---------|
| `/api/admin/scraping/trigger` | Queue new scrape job |
| `/api/admin/scraping/test` | Trigger test-mode scrape (Scraper Lab) |
| `/api/internal/scraper-configs` | Fetch published config definitions |

### Key Integration Points
- **Build versioning:** Runner sends `X-BayState-Runner-Build-Id/Sha/Release-Channel` on all requests. Coordinator returns `X-BayState-Latest-Runner-Build-Id/Sha` if update needed.
- **Lease tokens:** Used for idempotency and ownership verification
- **HMAC signatures:** Optional `X-Payload-Signature` header for callbacks
- **Incremental progress:** `chunk-callback` accepts partial results mid-job via `submit_chunk_progress()`
- **Chunk rollup:** Web tracks all chunks per job; when last chunk completes, aggregates results and updates pipeline status

### Pipeline Status Flow (Web side in chunk-callback)
1. Chunk completed → merge products into `products_ingestion.sources`
2. For standard jobs: `evaluateScrapeQuality()` → route to `scraped` (pass) or `imported` (fail)
3. For Official Brand extraction: persist to `official_brand_url_candidates`, route to `scraped` or `url_review`
4. Finalize test jobs with telemetry

---

## 6. What's Scraper-Specific vs Repurposable

### Scraper-Specific (delete/can-be-removed in AI-only model)

| Component | Lines | Why removable |
|-----------|-------|---------------|
| **15 YAML configs** (`scrapers/configs/*.yaml`) | ~3K total | CSS selectors, login flows, OCR — all unnecessary with AI-only |
| **24 action handlers** (`scrapers/actions/handlers/`) | ~5K | navigate, click, extract, login, wait — all Playwright DOM manipulation |
| **WorkflowExecutor** (`scrapers/executor/`) | ~1K | YAML workflow engine with browser automation |
| **SelectorResolver** (`scrapers/executor/selector_resolver.py`) | ~500 | CSS/XPath element finding |
| **StepExecutor** (`scrapers/executor/step_executor.py`) | ~500 | Step retry/dispatch with Playwright |
| **BrowserManager** (`scrapers/executor/browser_manager.py`) | ~300 | Playwright browser lifecycle |
| **DebugArtifactCapture** (`scrapers/executor/debug_capture.py`) | ~300 | Screenshots/page source for debugging static selectors |
| **NormalizationEngine** (`scrapers/executor/normalization.py`) | ~300 | Result normalization rules |
| **ResultCollector** (`scrapers/result_collector.py`) | ~100 | Per-SKU result aggregation (simple, could be inlined) |
| **SKU Loader / Pricing Loader** | ~200 | No longer needed |
| **Anti-detection configs** in YAML | — | Not needed for AI extraction |
| **OCR handler** (`actions/handlers/ocr.py`) | ~200 | Not needed |
| **Inline test assertions** in YAML | — | Move to web-side test framework |
| **`scrapers/config_validation.py`** | ~500 | YAML schema validation — obsolete |

### Repurposable (keep/modify for AI-only)

| Component | Lines | Why keep |
|-----------|-------|----------|
| **Crawl4AIEngine** (`src/crawl4ai_engine/`) | ~500 | Core extraction engine — already AI-capable |
| **Crawl4AIExtractor** (`scrapers/ai_search/crawl4ai_extractor.py`) | ~1.4K | Full AI extraction pipeline (JSON-LD → meta → LLM) |
| **ProductPageExtractor** (`scrapers/product_url_extraction/extractor.py`) | ~300 | Canonical AI extraction orchestrator |
| **LLM runtime** (`scrapers/ai_search/llm_runtime.py`) | ~100 | DeepSeek configuration |
| **Search providers** (`scrapers/providers/serper.py`) | ~300 | SERP search for product URLs |
| **ExtractionUtils** (`scrapers/ai_search/extraction.py`) | ~1K | HTML/JSON-LD parsing, size extraction |
| **MatchingUtils** (`scrapers/ai_search/matching.py`) | ~500 | Product name/brand matching |
| **Scoring** (`scrapers/ai_search/scoring.py`) | ~500 | URL ranking and confidence scoring |
| **API client** (`core/api_client.py`) | ~600 | Abstract the coordinator communication |
| **Core retry/health** (`core/`) | ~1K | Adaptive retry, circuit breaker, failure classification |
| **Structured logging** (`utils/logger.py`) | ~300 | JSON structured logging |
| **Sentry integration** (`utils/sentry.py`) | ~200 | Error tracking |
| **Runner core** (`runner/__init__.py` run_job) | ~700 | Job orchestration (can be slimmed) |
| **Runner CLI** (`runner/cli.py`) | ~300 | Entry point for local testing |
| **Assertions engine** (`runner/assertions.py`) | ~200 | Test comparison (could move to web) |
| **ScraperAPIClient** auth + claim flow | — | Can be simplified but still needed |

### Integration Risks for AI-Only Migration

**Risk 1: Web-side orchestration gap**
Current: Coordinator queues chunks → Runner polls, claims, processes, reports back.
AI-only: Coordinator must manage extraction (Crawl4AIEngine, LLM calls) directly or via a lightweight worker. The web app is Node.js/TypeScript — it doesn't have Python/crawl4ai/Playwright. Three options:
- **a)** Port AI extraction to TypeScript (using fetch/cheerio/JSDOM + OpenAI SDK) — biggest effort, highest payoff
- **b)** Keep Python runner but as a lightweight AI extraction worker (no Playwright, just LLM + crawl4ai for HTML fetch)
- **c)** Use a serverless function or external AI extraction service

**Risk 2: Login-gated sites**
Phillips Pet requires login. The current solution is Playwright automation with stored credentials. AI-only extraction from a public URL won't work for:
- Wholesale/distributor sites behind login
- Any vendor that gates product data behind authentication

**Risk 3: OCR pipeline**
Phillips Pet uses Tesseract OCR on product images to extract text. AI extraction can replace this (LLMs read text from images), but the image acquisition still needs a browser (or at least HTTP fetching of images).

**Risk 4: Search-based scraping**
Many configs search by SKU first, then navigate to product page. An AI extractor needs the final product URL. The current SERP-based approach (Official Brand flow) already handles this for manufacturer pages, but for distributor/retailer sites the search-to-product-page flow is more complex.

**Risk 5: Incremental progress**
The chunk system allows saving partial results mid-job. An AI-only worker needs similar incremental reporting or must accept longer latency before results appear.

**Risk 6: Credential management**
Login credentials come from Supabase (encrypted) or env vars. AI-only extraction might not need these, but the credential resolution infrastructure (`ScraperAPIClient.get_credentials()`) would need to be preserved for any login-gated sources.

**Risk 7: Pipeline integration**
The chunk-callback route (`apps/web/app/api/scraper/v1/chunk-callback/route.ts`) has complex logic for:
- Merging chunk results
- Persisting to `products_ingestion.sources`
- Quality evaluation (`evaluateScrapeQuality`)
- Official Brand candidate marking
- Test job finalization

This would need to be refactored to accept AI-only results (which may have different structure/confidence scores).

**Risk 8: Testing infrastructure**
The `--test-mode` / assertion engine is deeply tied to YAML configs and Playwright execution. An AI-only replacement would need:
- New test framework (mock LLM responses or use recorded fixtures)
- Different "expected" format (probabilistic rather than exact matches)
- Quality confidence thresholds instead of exact field matching

---

## Summary: What to Delete, Keep, and Plan

### Delete (~70% of scraper codebase)
```
apps/scraper/scrapers/configs/           # 15 YAML files
apps/scraper/scrapers/actions/           # 24 action handlers + registry
apps/scraper/scrapers/executor/          # WorkflowExecutor, BrowserManager, SelectorResolver
apps/scraper/scrapers/parser/            # YAML config parser (mostly)
apps/scraper/scrapers/result_collector.py
apps/scraper/scrapers/sku_loader.py
apps/scraper/scrapers/pricing_loader.py
apps/scraper/scrapers/config_validation.py
apps/scraper/scrapers/selector_storage.py
apps/scraper/scrapers/tests/            # Config-specific tests
apps/scraper/scrapers/schemas/           # YAML config Pydantic models (mostly)
apps/scraper/core/anti_detection_manager.py  (if not using Playwright)
```

### Keep (~30%)
```
apps/scraper/src/crawl4ai_engine/        # Core engine — refactor to standalone
apps/scraper/scrapers/ai_search/         # AI extraction pipeline
apps/scraper/scrapers/product_url_extraction/  # ProductPageExtractor
apps/scraper/scrapers/providers/         # SERP search
apps/scraper/core/api_client.py          # API communication
apps/scraper/core/retry_executor.py      # Retry/circuit breaker
apps/scraper/core/failure_classifier.py  # Error classification
apps/scraper/core/adaptive_retry_strategy.py
apps/scraper/core/version.py            # Build versioning
apps/scraper/utils/                      # Logging, sentry, debugging
apps/scraper/runner/__init__.py          # run_job() orchestration (slimmed)
apps/scraper/runner/cli.py              # CLI entry point
apps/scraper/runner/assertions.py       # Test assertion engine (or migrate to web)
```

### Proposed AI-Only Architecture

```
┌─────────────────────────────────────────────┐
│  Coordinator (Next.js web app)               │
│  - ProductPageExtractor calls (via fetch/    │
│    Python subprocess or serverless)          │
│  - Gemini/DeepSeek LLM calls directly        │
│  - crawl4ai Engine as a microservice         │
│  - Pipeline orchestration (already exists)   │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  Lightweight Python worker (optional)        │
│  - Crawl4AIEngine (HTML fetch + extraction)  │
│  - ProductPageExtractor (AI pipeline)        │
│  - No Playwright, no YAML, no 24 handlers   │
│  - API client slimmed to 2-3 endpoints       │
└─────────────────────────────────────────────┘
```

The web coordinator already has AI-scraping infrastructure in `apps/web/lib/ai-scraping/` (credentials, discovery config). The runner becomes either:
1. **Absorbed entirely** — direct fetch/LLM calls from web (port crawl4ai extraction to TS or use OpenAI SDK)
2. **Lightweight AI worker** — Python service with crawl4ai + LLM, no browser automation

Option 1 is cleaner for the admin/storefront monolith. Option 2 preserves the existing coordinator-runner auth/lease pattern if login-gated sites persist.
