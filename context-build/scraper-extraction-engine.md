# Scraper Runner & Crawl4AI Extraction Engine — Context Build

> Generated: 2026-05-18  
> Scope: daemon/job polling, enrichment dispatch, extraction pipeline, schemas, configs, credentials, local commands, failure classification, tuning knobs.

---

## 1. AGENTS.md Summary

| File | Key directives |
|---|---|
| `apps/scraper/AGENTS.md` | Python 3.10+, Playwright, YAML DSL, Docker, crawl4ai v0.3.0. API-only runner via `X-API-Key: bsr_*`. No direct DB. Phase 10: **static scraping deactivated**, all work → enrichment path. |
| `runner/AGENTS.md` | Three execution modes: `full`, `chunk_worker`, `realtime`. `__init__.py` is the dispatcher. No mode-specific logic outside this package. |
| `core/AGENTS.md` | Infrastructure: `ScraperAPIClient`, events, retry, circuit breaker, failure classifier. No DB credentials in runners. |
| `src/crawl4ai_engine/AGENTS.md` | v0.3.0 engine. Async-only. Extraction modes: LLM-Free (2-4s), LLM (8-15s), Auto (2-8s). Fallback chain: LLM-free → LLM → Static selectors → Manual review. |
| `scrapers/AGENTS.md` | AI-driven discovery + extraction. Phase 10: legacy `actions/`, `executor/`, `parser/` removed. |

---

## 2. Complete Execution Flow

### 2.1 Daemon Poll Loop (`daemon.py`)

```
daemon.py
├── env loading  (.env or .env.development)
├── signal handlers (SIGTERM/SIGINT → graceful shutdown)
└── main_async()
    ├── ScraperAPIClient() — HTTP client to coordinator
    ├── init_sentry()      — error tracing (no-op if no DSN)
    ├── start_metrics_server() — Prometheus /metrics
    ├── health check — waits up to 30s for API availability
    ├── RealtimeManager — Supabase Realtime presence (non-blocking)
    └── MAIN POLLING LOOP
        ├── client.claim_enrichment(runner_name=...) → ClaimedEnrichment or None
        ├── _process_enrichment(attempt, client, rm)
        │   └── runner._run_enrichment_job(attempt, ...)
        ├── heartbeat every 60s when idle
        └── backoff: POLL_INTERVAL * 1.5^(idle_count-1), max MAX_POLL_INTERVAL
```

**Key env vars:**
| Variable | Default | Notes |
|---|---|---|
| `SCRAPER_API_URL` | (required) | Base URL for coordinator |
| `SCRAPER_API_KEY` | (required) | `bsr_*` prefix |
| `RUNNER_NAME` | hostname | Identifier |
| `POLL_INTERVAL` | 30s | Idle poll interval |
| `MAX_POLL_INTERVAL` | 300s | Max backoff cap |
| `MAX_JOBS_BEFORE_RESTART` | 100 | Memory hygiene |
| `BAYSTATE_RUNNER_BUILD_ID` | "unknown" | Build version for coordinator admission |

**Local dev start:** `python daemon.py --env dev` or `./run-dev.sh`

### 2.2 Runner Dispatch (`runner/__init__.py`)

`_run_enrichment_job()` has two paths:

**A. Standard URL Extraction** (when `attempt.target_url` is a real URL):
```
1. Create ProductPageExtractor(headless, llm_model, cache_enabled, extraction_strategy="llm")
2. extractor.extract(url=target_url, sku=target_sku, brand=..., product_name=...)
3. build_v1_from_extraction_result(...) → EnrichmentResultV1
4. _submit_result(api_client, ...) → POST /api/scraper/v1/enrichment-callback
```

**B. Approved Source Extraction** (when `target_url == "approved_source_extraction"`):
```
1. Parse source_plan from attempt.job_config
2. Create ApprovedSourceExecutor(plan, extractor, api_client)
3. executor.execute() → EnrichmentResultV1
4. _submit_result(...)
```

### 2.3 Core Extraction Pipeline (`Crawl4AIExtractor`)

File: `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py` (~1675 lines)

The `_extract_inner()` method implements the pipeline:

```
_extract_inner(url, sku, product_name, brand):
│
├── [1] Crawl with Crawl4AIEngine (no extraction strategy)
│   ├── engine_config: browser.headless, crawler.magic, simulate_user, etc.
│   ├── First attempt: wait_until="networkidle", timeout=30000
│   └── Retry on timeout: wait_until="domcontentloaded", delay_before_return_html=2.0, timeout=45000
│
├── [2] Resolve family variant (Demandware sites)
│   └── resolve_official_family_variant()
│
├── [3] Soft-404 detection
│   └── _looks_like_not_found_page() checks title, og:title, HTML body
│       → If detected, route to fallback extractor immediately
│
├── [4] JSON-LD extraction  (fastest, ~0-50ms)
│   ├── extract_product_from_html_jsonld()
│   ├── confidence: max(json-ld confidence, 0.8)
│   └── Completeness check: _check_extraction_completeness()
│       ├── Checks: description, size_metrics, categories quality
│       ├── Rejects generic descriptions, brand-only names
│       └── If incomplete → stores as jsonld_fallback, falls through
│
├── [5] Meta tag extraction  (fast, ~0-30ms)
│   ├── extract_product_from_meta_tags() — og:, twitter:, meta tags
│   ├── confidence: max(meta confidence, 0.8)
│   └── Same completeness check → stores meta result as fallback
│
├── [6] Second crawl with LLM extraction strategy  (slow, 8-15s)
│   ├── Builds LLMExtractionStrategy with:
│   │   ├── llm_config: provider, api_token, base_url
│   │   ├── schema: ProductData model JSON schema
│   │   ├── instruction: built from build_extraction_instruction(sku, brand, name, version)
│   │   ├── input_format: "fit_markdown"
│   │   ├── chunk_token_threshold: 4000, overlap_rate: 0.1
│   │   └── extra_args: max_tokens=2000, temperature=0.01
│   ├── cache_mode: BYPASS (to force re-crawl with strategy)
│   ├── Falls back to networkidle→domcontentloaded on timeout
│   └── error handling: auth errors → jsonld_fallback or FallbackExtractor
│
├── [7] Post-processing
│   ├── _normalize_llm_product_data() — cleans brand, size_metrics, description, images
│   ├── Image enrichment: merge_product_images() + grounding redirect resolution
│   ├── Category inference
│   └── Completeness score: filled/required_fields
│
└── [8] If everything fails → FallbackExtractor (HTTP GET + JSON-LD + meta)
```

### 2.4 Crawl4AIEngine (`src/crawl4ai_engine/engine.py`)

**Async context manager** wrapping `crawl4ai.AsyncWebCrawler`.

Key methods:
| Method | Purpose |
|---|---|
| `crawl(url)` | Single URL fetch. Retry loop for transient exceptions (timeout, connection, network, DNS). Anti-bot fallback on 403/429. Domain-persistent session IDs. |
| `crawl_many(urls)` | Batch with `MemoryAdaptiveDispatcher`. Session-per-domain or global. Stream results via `arun_many`. |
| `initialize()` / `cleanup()` | Explicit lifecycle (also via `__aenter__` / `__aexit__`) |

**Normalized config shape:**
```python
engine_config = {
    "browser": {
        "headless": True,
        "browser_type": "chromium",
        "viewport": {"width": 1920, "height": 1080},
        "user_agent": "...",
        "proxy": "...",
        "enable_stealth": False,
        "extra_args": [...],
        "text_mode": False,
        "light_mode": False,
        "avoid_ads": True,
    },
    "crawler": {
        "magic": True,                # v0.4+ auto-enhancements
        "simulate_user": True,        # human-like mouse movements
        "remove_overlay_elements": True,
        "session_id": "...",          # optional domain persistence
        "cache_mode": "ENABLED" | "BYPASS",
        "css_selector": "...",
        "excluded_tags": ["nav","footer","header","aside","form"],
        "js_code": "...",             # scroll JS
        "wait_for": "...",
        "wait_until": "networkidle",
        "wait_for_images": True,
        "scan_full_page": True,
        "scroll_delay": 0.45,
        "page_timeout": 30000,
        "delay_before_return_html": 0,
        "mean_delay": 0.1,
        "max_range": 0.3,
        "semaphore_count": 3,
        "concurrency_limit": 3,
        "max_retries": 2,
        "pruning_enabled": True,
        "pruning_min_word_threshold": ...,
        "pruning_threshold": 0.48,
        "markdown_options": {...},
        "extraction_strategy": LLMExtractionStrategy(...),  # second pass only
        "fallback_fetch_function": _fallback_wrapper,
        "flatten_shadow_dom": False,
    }
}
```

### 2.5 ProductPageExtractor (`scrapers/product_url_extraction/extractor.py`)

Thin wrapper that creates a `Crawl4AIExtractor` and delegates. The public `extract()` method:

1. Builds URL list: [primary, *fallback_urls[:max_fallbacks-1]]
2. Tries each URL until success
3. Calls `Crawl4AIExtractor.extract()` for each
4. Normalizes result into canonical shape with keys: `success, sku, source, url, final_url, product_name, brand, description, images, categories, size_metrics, method, confidence, model, mode, token_usage, telemetry`
5. Returns first success or last error

---

## 3. Data Models & Schemas

### 3.1 Enrichment Result Contract

**`EnrichmentResultV1`** (`scrapers/ai_search/enrichment_models.py`):
```python
class EnrichmentResultV1(BaseModel):
    schema_version: str = "v1"
    sku: str
    source: EnrichmentResultSource(url, domain)
    status: "success" | "partial" | "failed"
    extracted_at: str  # ISO datetime
    model: str | None
    mode: "structured" | "metadata" | "llm" | "mixed" | "approved_source"
    product: EnrichedProductFacts
    confidence: EnrichmentConfidence(overall, fields)
    validation: EnrichmentValidation(sku_match, warnings, missing_required)
    attempts: list[EnrichmentAttemptSummary]
    # Approved source fields:
    decision: str | None
    llm_used: bool | None
    source_results: list[SourceResultInfo]
```

**`EnrichedProductFacts` fields:** name, brand, description, category, sku, weight, dimensions, shipping_weight, image_urls, ingredients, features, pet_type, life_stage, pet_size, food_form, flavor, special_diet, health_feature, packaging_type, size, color

### 3.2 Extraction Result Shape (internal)

Dict keys produced by `Crawl4AIExtractor.extract()`:
- `success`, `sku`, `source`, `url`, `final_url`
- `product_name`, `brand`, `description`, `images`, `categories`, `size_metrics`
- `weight`, `dimensions`, `shipping_weight`, `features`, `ingredients`
- `pet_type`, `life_stage`, `food_form`, `flavor`, `special_diet`, `health_feature`
- `method`, `confidence`, `model`, `mode`
- `field_confidence`, `sku_match`, `warnings`, `missing_required`
- `token_usage`, `elapsed_ms`, `telemetry`

### 3.3 Approved Source Plan Types

**`ApprovedSourcePlan`** (`scrapers/approved_sources/types.py`):
- `priority`: sorted list of `ApprovedSourcePlanEntry` (runFirst first, then by priority int)
- `sourcePolicy`: allowed/disallowed domains
- `llmPolicy`: LLM fallback rules (enabled, onlyAfterDeterministicFailure)

Each `ApprovedSourcePlanEntry` has: sourceType, sourceSlug, displayName, domains, adapterSlug, requiresAuth, credentialRef, searchMode, allowedFields, priority, runFirst.

### 3.4 Core API Models (`core/api_client.py`)

- **`ClaimedEnrichment`**: attempt_id, job_id, sku, target_url, domain, model, mode, job_config, ai_credentials, lease_token, source_plan
- **`ScraperConfig`**: name, display_name, base_url, selectors, options, test_skus, retries, validation, login, credential_refs
- **`JobConfig`**: job_id, skus, scrapers, test_mode, max_workers, job_type, job_config, ai_credentials, lease_token

---

## 4. Credentials Architecture

**Resolution order** for each scraper slug:
1. API call → `GET /api/scraper/v1/credentials/{slug}` (from coordinator)
2. Supabase lookup → `scraper_credentials` table with AES-GCM decryption
3. Environment variables → `{SLUG_UPPER}_USERNAME` / `{SLUG_UPPER}_PASSWORD`

Cached in `_credential_cache` dict per job. Cleared on job complete.

**Encryption:** AES-GCM with key from `AI_CREDENTIALS_ENCRYPTION_KEY` env var (32-byte base64 or raw).

---

## 5. Failure Classification & Retry

### 5.1 Exception Hierarchy (`scrapers/exceptions.py`)

```
ScraperError (base)
├── RetryableError
│   ├── NetworkError          — connection/timeout
│   ├── TimeoutError          — operation timed out
│   ├── ElementNotFoundError   — selector not found
│   ├── PageLoadError         — page failed to load
│   ├── StaleElementError     — stale reference
│   ├── RateLimitError        — 429 / too many requests
│   ├── CaptchaError          — CAPTCHA detected
│   ├── AccessDeniedError     — 403/blocked
│   └── SessionExpiredError
├── NonRetryableError
│   ├── ConfigurationError    — bad YAML
│   ├── SelectorError         — broken selector
│   ├── AuthenticationError   — bad credentials
│   ├── PageNotFoundError     — 404
│   ├── NoResultsError
│   ├── BrowserError          — browser crash
│   ├── CircuitBreakerOpenError
│   └── MaxRetriesExceededError
└── WorkflowExecutionError
```

### 5.2 Failure Classifier (`core/failure_classifier.py`)

**`FailureType` enum**: NO_RESULTS, LOGIN_FAILED, CAPTCHA_DETECTED, RATE_LIMITED, PAGE_NOT_FOUND, ACCESS_DENIED, NETWORK_ERROR, ELEMENT_MISSING, TIMEOUT

**Detection methods:**
- `classify_exception()`: matches exception type/message against pattern DB
- `classify_page_content()`: selector-based + text pattern detection on rendered page

Each failure type has: selectors (CSS), text_patterns (regex), recovery_strategy.

### 5.3 Retry System (`src/crawl4ai_engine/retry.py`)

**`ErrorClassification` categories**: TRANSIENT, PERMANENT, ANTI_BOT

**`classify_error()`** combines:
1. `scrapers.exceptions.classify_exception()` → typed ScraperError
2. `FailureClassifier.classify_exception()` → FailureType
3. Keyword matching against ANTI_BOT_KEYWORDS, TRANSIENT_KEYWORDS, PERMANENT_KEYWORDS

**Retry policies:**
| Category | Max retries | Base delay | Max delay |
|---|---|---|---|
| Normal | 3 | 1.0s | 30.0s |
| Anti-bot | 1 | 30.0s | 300.0s |

**Circuit breaker**: 5 failures in 60s window → open for 30s. Half-open mode after cooldown with 1 test call.

---

## 6. Anti-Bot System (`src/crawl4ai_engine/anti_bot.py`)

**`AntiBotSettings`** with pools:
- `user_agent_pool`: 3 default Chrome UAs (Win/Mac/Linux)
- `fingerprint_pool`: 3 `BrowserFingerprint` configs (viewport, locale, timezone, platform, deviceScaleFactor)
- `proxy_pool`: configurable
- `extra_args`: `--disable-blink-features=AutomationControlled`, `--disable-infobars`, etc.
- `rotation_strategy`: `"round_robin"` (default) or `"random"`

**`ScraperAntiBotManager`**: per-scraper config generator registration. Creates browser configs with UA + fingerprint + proxy rotation.

---

## 7. LLM Runtime Configuration (`scrapers/ai_search/llm_runtime.py`)

**Provider resolution order:**
1. Explicit `llm_provider` parameter
2. `LLM_PROVIDER` env var
3. Default: `"deepseek"`

**Provider options:**

| Provider | Default Model | API Key Source | Base URL |
|---|---|---|---|
| `deepseek` | `deepseek-chat` | `DEEPSEEK_API_KEY` env | `https://api.deepseek.com/v1` |
| `openai` | `gpt-4o-mini` | `OPENAI_API_KEY` env | `https://api.openai.com/v1` |
| `openai_compatible` | `google/gemma-3-12b-it` | explicit param | explicit param (LM Studio: `http://localhost:1234/v1`) |

**Crawl4AI provider string:** `f"openai/{model}"` (crawl4ai uses OpenAI-compatible wrapper for all providers)

---

## 8. Extraction Prompts

Located in `apps/scraper/prompts/`:

| Version | Focus | Fields | Key changes from v1 |
|---|---|---|---|
| `v1` | Original baseline | product_name, brand, description, size_metrics, images, categories | — |
| `v2` | Price + availability | +price, +availability; removed size_metrics, categories | Price normalization, strict availability enum |
| `v3` | (exists, not read) | — | — |
| `v4` | Concise, schema-aligned | product_name, brand, description, size_metrics, images, categories | Short, clear rules, strict anti-hallucination, fit_markdown input |

**Currently active:** `v4` (set via `prompt_version` parameter, defaults to `"v1"` in `ProductPageExtractor.__init__` but `Crawl4AIExtractor` uses whatever is passed).

**Prompt selection:** `build_extraction_instruction()` in `scrapers/utils/ai_utils.py` maps version to file.

**LLM parameters:** `max_tokens=2000`, `temperature=0.01` (near-deterministic).

---

## 9. Approved Sources Adapters

`scrapers/approved_sources/adapters/`:

| Adapter | Purpose | Auth |
|---|---|---|
| `base.py` | Abstract base adapter | — |
| `bradley.py` | Bradley Distributor | API key |
| `central_pet.py` | Central Pet Distributor | Login |
| `official_brand.py` | SERP/AI official brand fallback | None |
| `orgill.py` | Orgill Distributor | Login |
| `pet_food_experts.py` | Pet Food Experts Distributor | Login |
| `phillips.py` | Phillips Distributor | Login |

**Executor flow** (`ApprovedSourceExecutor`):
1. Sort entries: `runFirst=True` → others by priority
2. For each: get adapter, call `extract()`, return on first success
3. If no distributor succeeded and LLM policy enabled → OfficialBrandAdapter (SERP/AI fallback)
4. Validate result domain against source policy
5. Always returns `EnrichmentResultV1` (never None)

---

## 10. Image Pipeline

1. **Sources**: JSON-LD, meta tags (og:image, twitter:image), LLM output, `crawl_media` dict
2. **Merge**: `merge_product_images()` in `ExtractionUtils` — dedup, rank by quality
3. **Grounding redirect resolution**: `GroundingRedirectResolver` resolves Google redirect URLs
4. **Quality check**: warns if ≤1 image found but ≥4 candidates exist

---

## 11. Metrics & Telemetry

**`Crawl4AIMetricsCollector`** (`src/crawl4ai_engine/metrics.py`):
- Per-URL: mode, success, duration, error_type, anti_bot_triggered, cache_hit, model, cost_estimate
- Prometheus export via `metrics_endpoint.py`

**Extraction telemetry** logged per attempt:
```json
{
  "url": "...", "sku": "...", "method": "json-ld|meta-tags|llm|fallback",
  "success": bool, "fetch_time_ms": int, "parse_time_ms": int, "llm_time_ms": int,
  "confidence": float, "pruning_enabled": bool, "fit_markdown_used": bool,
  "fallback_triggered": bool, "image_diagnostics": {...},
  "resolver_status": "success|ambiguous|failed"
}
```

---

## 12. Local Development Commands

| Command | Purpose |
|---|---|
| `python daemon.py --env dev` | Run polling daemon (connects to localhost:3000) |
| `./run-dev.sh [--debug]` | Wrapper script with health check + venv activation |
| `python runner.py --mode chunk_worker --runner-name test-1` | Standalone chunk worker |
| `python -m pytest` | Run tests (excluded: live, benchmark, performance) |
| `ruff check .` | Lint |
| `python daemon.py --debug` | Debug logging |

**Env files:** `.env` (production), `.env.development` (dev overrides)

---

## 13. Tuning Knobs When Extraction Fails

| Knob | Location | Effect |
|---|---|---|
| `wait_until: "networkidle"` → `"domcontentloaded"` | `crawl4ai_extractor.py:751` | Faster page load, less timeout-sensitive |
| `timeout: 30000` → `45000` | `crawl4ai_extractor.py:755` | Relaxed timeout for slow pages |
| `scroll_delay: 0.45` | `crawl4ai_extractor.py` | Time between scroll steps for lazy-loaded content |
| `cache_mode: "ENABLED"` / `"BYPASS"` | Crawl4AIEngine config | Bypass for LLM second pass; enable for first pass |
| `magic: True` | Browser crawl config | v0.4+ auto-enhancements (anti-bot, interaction) |
| `simulate_user: True` | Browser crawl config | Human-like mouse movements |
| `remove_overlay_elements: True` | Browser crawl config | Dismiss cookie/fullscreen overlays |
| `scan_full_page: True` | Browser crawl config | Full page scroll for lazy content |
| `pruning_enabled: True` / threshold: 0.48 | Markdown generator | Content pruning aggressiveness |
| `fit_markdown` vs `raw_markdown` | LLM input_format | `fit_markdown` is pruned (less noise, less context) |
| `chunk_token_threshold: 4000` | LLM strategy | Token chunk size for LLM |
| `temperature: 0.01` | LLM strategy | Near-deterministic LLM output |
| `prompt_version: "v4"` | `build_extraction_instruction()` | Prompt template version |
| `max_tokens: 2000` | LLM strategy | Max output tokens |
| LLM model: `deepseek-chat` ↔ `gpt-4o-mini` ↔ local | `llm_runtime.py` | Provider/model swap |
| `extraction_strategy: "llm"` ↔ `"json_css"` | `ProductPageExtractor` | CSS extraction vs LLM |
| `_check_extraction_completeness()` thresholds | `crawl4ai_extractor.py:551` | When JSON-LD/meta is "complete enough" → skip LLM |

---

## 14. Risks & Known Issues

1. **LLM API key management**: If `deepseek` or `openai` provider is selected and no `api_key` is configured, LLM extraction silently falls through. Monitor `_is_llm_error_payload` for auth errors.
2. **`networkidle` timeout on slow pages**: Relaxed retry with `domcontentloaded` is handled, but adds 15s per page. If large batches time out, lower expectations or increase initial timeout.
3. **Memory pressure in Docker**: `MAX_JOBS_BEFORE_RESTART=100` forces container restart. The `kill_session()` cleanup in `crawl_many` attempts to mitigate, but long-running sessions can leak.
4. **Approved Source credential failure**: If credential lookup fails for all paths (API → Supabase → env), the adapter's `requiresAuth=True` entries are silently skipped.
5. **Image grounding redirect resolution**: `GroundingRedirectResolver` resolves Google SERP redirects for images. If resolver fails, images may be lost.
6. **Pruning content filter overaggressiveness**: Default `threshold=0.48` may strip useful content for niche product pages. Lowering to 0.3 may help but increases token usage.
7. **Prompt drift**: `prompt_version="v1"` is the default constructor parameter in `ProductPageExtractor`, but `v4` is the latest. If updating prompts, ensure the version parameter is explicitly set.

---

## 15. Key Files Quick Reference

| File Path | Lines | Purpose |
|---|---|---|
| `daemon.py` | ~310 | Entry point, polling loop |
| `runner/__init__.py` | ~380 | Enrichment job dispatcher |
| `scrapers/product_url_extraction/extractor.py` | ~330 | ProductPageExtractor wrapper |
| `scrapers/ai_search/crawl4ai_extractor.py` | ~1675 | Core extraction pipeline |
| `scrapers/ai_search/extraction.py` | ~1080 | JSON-LD, meta, image, category utilities |
| `scrapers/ai_search/enrichment_models.py` | ~210 | EnrichmentResultV1 Pydantic models |
| `scrapers/ai_search/llm_runtime.py` | ~100 | LLM provider config resolution |
| `scrapers/ai_search/matching.py` | — | SKU/name/brand matching utils |
| `scrapers/ai_search/scoring.py` | — | Search result scoring |
| `scrapers/approved_sources/executor.py` | ~320 | Approved source plan execution |
| `scrapers/approved_sources/types.py` | ~210 | Source plan data types |
| `scrapers/exceptions.py` | ~280 | Exception hierarchy |
| `core/api_client.py` | ~640 | HTTP client to coordinator |
| `core/failure_classifier.py` | ~280 | Failure type detection |
| `core/models.py` | ~150 | ExcelInputProduct, RawScrapedProduct |
| `core/version.py` | ~30 | Build ID/sha/channel |
| `core/settings_manager.py` | ~95 | Env-based settings |
| `src/crawl4ai_engine/engine.py` | ~440 | Async Crawl4AI engine |
| `src/crawl4ai_engine/types.py` | ~120 | Config/result types |
| `src/crawl4ai_engine/config.py` | ~65 | YAML config loading |
| `src/crawl4ai_engine/anti_bot.py` | ~330 | Anti-bot config generation |
| `src/crawl4ai_engine/retry.py` | ~430 | Circuit breaker + retry logic |
| `src/crawl4ai_engine/callback.py` | ~190 | HMAC-signed result delivery |
| `src/crawl4ai_engine/metrics.py` | ~490 | Metrics collection |
| `src/crawl4ai_engine/strategies/base.py` | ~180 | CSS/XPath extraction strategies |
| `prompts/extraction_v4.txt` | ~65 | Current extraction prompt |
| `config/evaluation_thresholds.yaml` | ~30 | QA thresholds |
