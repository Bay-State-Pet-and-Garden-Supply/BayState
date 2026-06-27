# Site Extraction Profile — Local Codebase Context

Generated for design discussion about improving BayState's Crawl4AI product extraction. No source files modified.

---

## 1. Crawl4AI Engine (`apps/scraper/src/crawl4ai_engine/`)

### 1.1 Engine Core (`engine.py`)

**File:** `apps/scraper/src/crawl4ai_engine/engine.py` (lines 1–362)

The `Crawl4AIEngine` is the central async orchestrator wrapping `crawl4ai.AsyncWebCrawler`. Key characteristics:

- **Session handling** (lines 128–148): Session IDs can be explicitly provided or are dynamically generated per-domain (`_get_domain_session_id` at line 128). Dynamic sessions use `<domain>_<uuid4>` format and are killed explicitly via `kill_session()` in a `finally` block after crawl completes (line 156). This prevents zombie browser contexts but adds startup/teardown overhead per URL.
- **No persistent browser context usage**: `use_persistent_context=False` is the default (line 226). `user_data_dir` is passed through from config but no scraper paths set it today. The `auth.py` module explicitly sets `use_persistent_context: False` (see §5.3).
- **Cache mode** (lines 258–268): Defaults to `CacheMode.ENABLED`. Configurable via `crawler.cache_mode` in config dict. The Crawl4AI `CacheMode` enum controls whether pages are cached to disk — **this is a Page Cache, not a Site Extraction Profile**. No per-domain or per-brand cache configuration exists.
- **Browser config** (lines 198–241): `_build_browser_config()` maps browser settings from config dict to `BrowserConfig`. Supports `cookies`, `headers`, `proxy`, `proxy_config`, and `enable_stealth`. The `use_persistent_context` flag and `user_data_dir` are wired through but currently always False/None in production configs.
- **Fallback chain** (lines 142–168): After primary crawl, if the result failed with 403/429/forbidden, a `fallback_fetch_function` from config is invoked. No image-capture-level fallback for anti-bot.
- **Metrics** (lines 170–178): Per-crawl metrics recorded via `Crawl4AIMetricsCollector` — success/failure, duration, error type, anti-bot trigger.

### 1.2 Types (`types.py`)

**File:** `apps/scraper/src/crawl4ai_engine/types.py` (lines 1–93)

Three main dataclasses:
- `CrawlConfig` — Job-level config (URL, timeout, wait_for, CSS selector, schema extraction)
- `CrawlResult` — Crawl output (url, success, content, html, extracted_data, error)
- `EngineConfig` — Engine-level config (browser_type, timeout, max_concurrency, retry)

**Gap:** No `SiteExtractionProfile` or `FieldEvidenceRule` types exist anywhere. The `schema` field in `CrawlConfig` is a flat `dict[str, str]` — no structured field-level extraction rules.

### 1.3 Config Loader (`config.py`)

**File:** `apps/scraper/src/crawl4ai_engine/config.py` (lines 1–62)

Minimal YAML loading with hierarchical merge. No schema for config structure — anything goes. Configs are loaded at runtime from database (admin-published) not local YAML.

### 1.4 Metrics (`metrics.py`)

**File:** `apps/scraper/src/crawl4ai_engine/metrics.py` (lines 1–300)

Thread-safe `Crawl4AIMetricsCollector` with:
- `ExtractionMetrics` per-crawl recording (url, mode, success, duration, error_type, cache_hit, anti_bot_triggered)
- `record_extraction()` (line 85) accepts optional enrichment fields: `model`, `latency_ms`, `cost_estimate`, `resolver_status`
- `record_validation_error()` (line 184) for field-level validation error tracking
- `get_summary()` (line 252) returns comprehensive metrics
- `get_prometheus_metrics()` (line 314) for `/metrics` endpoint

**Gap:** No field-level extraction quality metrics or source-by-field evidence tracking.

### 1.5 Retry (`retry.py`)

**File:** `apps/scraper/src/crawl4ai_engine/retry.py` (lines 1–580+)

Sophisticated retry with `CircuitBreaker`, exponential backoff, error classification via `core.failure_classifier`. Distinguishes transient vs. terminal errors.

### 1.6 Anti-Bot (`anti_bot.py`)

**File:** `apps/scraper/src/crawl4ai_engine/anti_bot.py` (lines 1–300)

`AntiBotConfigGenerator` with:
- User-agent rotation pools (3 default UAs)
- Browser fingerprint rotation (3 default fingerprints — Win32+MacIntel, different locales)
- Proxy pool (empty by default)
- Random or round-robin rotation strategy
- `StealthConfigGenerator` for Chrome stealth flags

**Gap:** No integration with persistent browser profiles or session replay across crawls. Rotations are per-run only.

---

## 2. Platform Extraction (`apps/scraper/scrapers/ai_search/platform_extraction.py`)

**File:** `apps/scraper/scrapers/ai_search/platform_extraction.py` (lines 1–500)

### 2.1 Platform Detection (`detect_platform()`)

Fingerprint-based detection for Shopify, WooCommerce, Magento, BigCommerce. Checks HTML + URL patterns. Returns `str | None`.

**Gap:** Detection runs on every crawl with no cached profile result, and detected platform is not persisted for reuse.

### 2.2 Platform Schemas (`_build_shopify_schema()` etc.)

Static CSS-selector schemas for each platform (lines 100–340). These are `JsonCssExtractionStrategy` shapes used as deterministic extraction before LLM fallback. They cover: product_name, brand, description, SKU, images, categories, specifications.

**Key detail (line 376):** These are selectors only — no price, stock, or add-to-cart selectors per protected-field policy.

**Gap:** Schemas are hardcoded Python dicts. Not data-driven, not overridable per-brand, not stored as profiles. No Field Evidence Rule infrastructure.

### 2.3 Payload Normalization (`normalize_platform_payload()`)

Coerces platform schema output into a flat dict shape. Filters non-product images via regex (`_LOGO_REJECT_PATTERNS`, line 406). Deduplicates images. Splits breadcrumb strings.

---

## 3. Product Page Extraction (`apps/scraper/scrapers/product_url_extraction/`)

### 3.1 Extractor (`extractor.py`)

**File:** `apps/scraper/scrapers/product_url_extraction/extractor.py` (lines 1–300)

`ProductPageExtractor` — canonical extraction pipeline (line 44):
1. Fetch with Crawl4AIEngine (relaxed-wait retry)
2. Detect soft-404 / wrong landing page
3. Resolve variant-specific payload (Demandware family pages)
4. Extract JSON-LD
5. If incomplete, extract meta tags
6. If incomplete, HTTP GET + JSON-LD + meta fallback
7. If still incomplete, run LLM extraction
8. Normalize into one result shape
9. Return evidence with method/confidence/telemetry

Returns dict with fields: `product_name`, `brand`, `description`, `images`, `categories`, `size_metrics`, `method`, `confidence`, `model`, `token_usage`, `telemetry`, plus all facet fields (animal_type, life_stage, breed_size, food_form, flavor, etc.).

**Key:** The extraction pipeline does **not** consult any per-brand or per-domain extraction profile. Every URL gets the same pipeline.

### 3.2 Media Selector (`media_selector.py`)

**File:** `apps/scraper/scrapers/product_url_extraction/media_selector.py` (lines 1–900+)

`ProductMediaSelector` — sophisticated heuristic image scoring:
- Canonicalizes image URLs (stripping width/height/crop/fit params)
- Scores based on: allowed domain (source CDN), gallery context, JSON-LD presence, product name tokens, brand tokens, cross-flavor detection, cross-product-form detection, non-product path hints
- Hard-blocks Unsplash, soft-blocks Replo
- `ALLOWED_CDN_DOMAINS_BY_SITE` (line 100) — currently only `openfarmpet.com`, `scotts.com`, `scottsmiraclegro.com`, `miraclegro.com`
- `LLMMediaSelector` wraps heuristic with LLM-assisted refinement

**Gap:** CDN allowlist is hardcoded with only 4 brands. No data-driven per-source-allowlist. No extraction profile for image selection rules.

### 3.3 Known URL Wrapper (`known_url_wrapper.py`)

**File:** `apps/scraper/scrapers/product_url_extraction/known_url_wrapper.py` (lines 1–140)

JSON contract wrapper (`KnownUrlExtractionRequest`, `run_known_url_extraction()`) for TypeScript callers to invoke `ProductPageExtractor`. Entry point for manual URL paste and URL-Review-triggered extraction.

---

## 4. AI Search / Enrichment Pipeline

### 4.1 Crawl4AI Extractor (`crawl4ai_extractor.py`)

**File:** `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py` (lines 1–2500+)

Massive module (2500+ lines) with:
- `Crawl4AIExtractor` class — handles product extraction using Crawl4AI with LLM fallback
- Extraction pipeline: JSON-LD → meta tags → CSS selectors → LLM extraction
- `extract_to_v1()` method produces EnrichmentResultV1-shaped results
- Image grounding via `GroundingRedirectResolver`
- Extensive LLM prompt management and retry logic

### 4.2 Enrichment Models (`enrichment_models.py`)

**File:** `apps/scraper/scrapers/ai_search/enrichment_models.py` (lines 1–450+)

Pydantic models for the v1 enrichment contract:
- `EnrichmentResultV1` — full result shape: status, product (EnrichedProductFacts), confidence, validation, source_results[]
- `EnrichedProductFacts` — nested: core (name, brand, description, price, weight, category), facets[], media[], evidence
- `SourceResultInfo` — per-source: sourceSlug, sourceType, confidence, matchedFields, evidenceUrl, product, outcome (found/not_stocked/source_error/skipped)
- `build_nested_product_facts()` (line 170) — maps flat field dict → structured EnrichedProductFacts with facet aliasing
- `build_v1_from_extraction_result()` (line 320) — adapter mapping from extraction result dict

### 4.3 Approved Source Executor (`approved_sources/executor.py`)

**File:** `apps/scraper/scrapers/approved_sources/executor.py` (lines 1–400+)

Cascade execution engine supporting two modes:
- **Legacy**: Distributors first, then SERP/official brand fallback if all distributors clean not_stocked
- **V2** (staged): Distributors → official_brand_crawl → serp_candidate, with UPC proof gating

Key distinction: V2 uses `resolutionStage` field on source plan entries. The `OfficialBrandCrawlAdapter` applies strict UPC proof gates before emitting `found`.

### 4.4 Official Brand Crawl Adapter (`adapters/official_brand_crawl.py`)

**File:** `apps/scraper/scrapers/approved_sources/adapters/official_brand_crawl.py` (lines 1–260)

Strict UPC-gated crawl of official brand domains. Applies:
- `is_exact_upc_proof()` — checks extracted UPC against expected
- `High-Confidence No-UPC Rule` (line 150) — allows found without exact UPC when confidence ≥ 0.90, brand domain match, strong descriptor overlap
- Returns verdicts: `found` (exact proof), `found` (high confidence), `not_stocked` (candidates)

### 4.5 SERP Discovery Adapter (`adapters/serp_discovery.py`)

**File:** `apps/scraper/scrapers/approved_sources/adapters/serp_discovery.py` (lines 1–1200+)

5-phase autonomous SERP discovery: UPC search → LLM name consolidation → brand site search → open-web fallback → extraction. Uses Serper.dev API for search.

### 4.6 Result Builder (`approved_sources/result_builder.py`)

**File:** `apps/scraper/scrapers/approved_sources/result_builder.py` (lines 1–320)

Builds `EnrichmentResultV1` with correct `decision` and `outcome` values for: success, partial, auth_required, auth_failed, auth_expired, no_match, policy_blocked, failed.

---

## 5. Runner Infrastructure

### 5.1 Daemon Entry (`daemon.py`)

**File:** `apps/scraper/daemon.py`

Polling daemon that claims jobs from coordinator and dispatches to runner. Key paths:
- `runner/__init__.py` — identifies `ENRICHMENT` job type
- `core/api_client.py` — HTTP client to coordinator
- `src/crawl4ai_engine/` — extraction execution

### 5.2 Callback Delivery (`callback.py`)

**File:** `apps/scraper/src/crawl4ai_engine/callback.py` (lines 1–180)

HMAC-SHA256 signed result delivery to coordinator. `transform_results()` accepts raw crawl results and re-shapes into per-SKU callback payload. `send_callback()` sends the final payload with idempotency key.

### 5.3 Auth / Login Automation (`approved_sources/auth.py`)

**File:** `apps/scraper/scrapers/approved_sources/auth.py` (lines 1–800+)

Per-distributor login automation using Crawl4AI `js_code`. Supports Orgill, Phillips, Central Pet, Pet Food Experts, Bradley. Key line (785): `"use_persistent_context": False` — sessions are in-memory with process-local TTL caching. **No persistent browser profile storage.**

### 5.4 UPC Resolution (`approved_sources/upc_resolution.py`)

Referenced by `official_brand_crawl.py`. Contains `is_exact_upc_proof()`, `extract_upc_from_product()`, `compare_gtin()`, `build_candidate_evidence()`.

---

## 6. Coordinator-Side (Web App)

### 6.1 Pipeline Types (`lib/pipeline/types.ts`)

**File:** `apps/web/lib/pipeline/types.ts` (lines 1–200)

`PipelineProduct` interface:
- `sources: Record<string, unknown>` — per-source payload keyed by sourceSlug
- `consolidated` — AI-consolidated record with `core`, `facets[]`, `media[]`, `evidence`
- `brand_id` — FK for extraction eligibility
- `pipeline_status` — imported → extracting → processed → grouping → merging → reviewing → publishing → failed

### 6.2 Pipeline Core (`lib/pipeline/core.ts`)

**File:** `apps/web/lib/pipeline/core.ts` (lines 1–60)

State machine transitions. `extracting → processed | needs_attention | imported | failed`. ADR 0002 found-wins rule enforced at callback time.

### 6.3 Approved Source Types (`lib/approved-sources/types.ts`)

**File:** `apps/web/lib/approved-sources/types.ts` (lines 1–120)

TypeScript contracts for source plan construction. `ApprovedSourcePlanEntry` with: sourceType, sourceSlug, domains, assetDomains, adapterSlug, requiresAuth, searchMode, allowedFields, priority. `ApprovedSourcePolicy` with allowed/disallowed domains.

### 6.4 Source Plan Builder (`lib/approved-sources/source-plan.ts`)

**File:** `apps/web/lib/approved-sources/source-plan.ts` (lines 1–600+)

`buildApprovedSourcePlans()` — per-UPC plan builder:
1. Loads products by UPC
2. Validates brand assignment
3. Checks cascade readiness via `isCascadeConfigured()` (brands.source_cascade_configured_at + enabled brand_sources)
4. Loads `brand_sources` entries for each brand
5. Filters by retry mode (all vs. failed_or_untried)
6. Sorts by priority
7. If V2 enabled: adds synthetic `official_brand_crawl` + `serp_candidate_discovery` fallback entries

### 6.5 Source Cascade (`lib/approved-sources/source-cascade.ts`)

**File:** `apps/web/lib/approved-sources/source-cascade.ts` (lines 1–290)

`isCascadeConfigured()` checks `brands.source_cascade_configured_at` + at least one enabled distributor in `brand_sources`. `getUntriedAndErroredSources()` supports incremental re-extraction by querying `enrichment_source_attempts` table.

### 6.6 Scraper Callback Handler (`lib/scraper-callback/`)

**Files:**
- `contract.ts` — Zod validation schemas for callback payloads (ScraperResultsSchema, ChunkResultsSchema, ChunkCallbackPayloadSchema)
- `enrichment-result.ts` — EnrichmentResultV1 parsing, source payload construction, source attempt row building, ADR 0002 status decisions, V2 proof-required rule

Key function `determineFinalStatus()` (line 174): Any `found` → `processed`, no found + any `source_error` → `needs_attention`, all `not_stocked` → `processed`.

### 6.7 Enrichment Jobs API (`app/api/admin/enrichment/jobs/route.ts`)

**File:** `apps/web/app/api/admin/enrichment/jobs/route.ts` (lines 1–90)

Primary entry point for triggering cascade extraction. Accepts: `upcs[]`, `retryMode`, `testMode`, `serpDiscoveryEnabled`, `upcResolutionV2Enabled`. Validates brands exist. Calls `scrapeProducts()`.

### 6.8 Pipeline Scraping (`lib/pipeline-scraping.ts`)

**File:** `apps/web/lib/pipeline-scraping.ts` (lines 1–700+)

`scrapeProducts()` — orchestrates per-UPC source plan creation and job submission to runners. Handles chunking, job creation, and status transition.

### 6.9 Consolidation Pipeline (`lib/consolidation/`)

**File:** `apps/web/lib/consolidation/AGENTS.md` — architecture guide

Key modules:
- `prompt-builder.ts` — Builds system prompts with source trust rules, product name rules, field rules, Facet Profile matrix, and output contract
- `prompt-evidence.ts` — Source filtering by trust level, field relevance mapping, evidence reduction
- `category-domain.ts` — Product domain classifier + field applicability matrix
- `facet-vocabulary.ts` — Canonical facet values for validation
- `detail-enrichment.ts` — Post-consolidation deterministic field extraction
- `result-parsing.ts` — Parses structured LLM JSON responses

### 6.10 Product Sources (`lib/product-sources.ts`)

**File:** `apps/web/lib/product-sources.ts` (lines 1–560+)

`normalizeProductSources()` — canonicalizes source field names, filters excluded keys, maps aliases. Used by both consolidation and evidence building.

---

## 7. Data Model (Supabase)

### 7.1 Table: `brands`

- `id`, `name`, `slug`, `official_domains`, `preferred_domains`
- `source_cascade_configured_at` — timestamp when admin saved source cascade

### 7.2 Table: `brand_sources`

Per-source entries for each brand:
- `brand_id`, `source_type` (distributor, official_brand, internal, licensed_feed)
- `source_slug`, `display_name`
- `domains[]`, `asset_domains[]`, `crawl4ai_adapter_slug`
- `requires_auth`, `credential_ref`
- `search_mode` (upc_search, domain_search, direct_url, feed_lookup)
- `allowed_fields[]`, `priority`, `enabled`

### 7.3 Table: `products_ingestion`

- `upc`, `brand_id`, `brand_id`
- `input` — raw import data
- `sources` — per-source canonical payloads keyed by sourceSlug
- `consolidated` — structured EnrichedProductFacts shape
- `pipeline_status` — state machine
- `selected_images[]`, `confidence_score`, `error_message`

### 7.4 Table: `enrichment_source_attempts`

- `job_id`, `attempt_id`, `upc`, `brand_id`
- `source_slug`, `source_type`, `display_name`, `priority`
- `outcome`, `confidence`, `matched_fields[]`, `evidence_url`
- `error_code`, `error_message`, `raw_result`, `attempted_at`
- Composite index on (upc, source_slug, attempted_at DESC)

---

## 8. Known Flows

### 8.1 Source Cascade Flow (Production)

1. Admin configures brand cascade in brand settings → saves to `brand_sources`
2. Admin selects products in Imported tab → POST `/api/admin/enrichment/jobs` with `{upcs}`
3. `buildApprovedSourcePlans()` loads brand + brand_sources, builds per-UPC plan
4. Posts jobs to scraper runner via API
5. Runner claims job, executes cascade via `ApprovedSourceExecutor.execute()`
6. Each adapter extracts (distributor adapters → official_brand_crawl → serp_discovery)
7. Results posted back via callback → `enrichment-result.ts` processes → writes `products_ingestion.sources` + `enrichment_source_attempts`
8. ADR 0002 determines pipeline status: ANY found → processed

### 8.2 Known URL / Admin Lab Flow

1. Admin enters URL manually in Pipeline UI or URL Review selects a URL
2. Invokes `run_known_url_extraction()` → `KnownUrlExtractionRequest` → `ProductPageExtractor.extract()`
3. Pipeline: Crawl4AIEngine fetch → JSON-LD → meta → fallback → LLM
4. Result returned to UI for review

### 8.3 Product Image Selection Flow

1. Crawl4AI returns `result.media["images"]` + JSON-LD images
2. `ProductMediaSelector.select()` scores + canonicalizes + deduplicates
3. Primary/gallery/rejected classification returned in MediaSelectionResult
4. Optional `LLMMediaSelector` refines with AI

---

## 9. Gaps and Risks

### 9.1 No Site Extraction Profile Infrastructure
- **Severity:** BLOCKER
- **Details:** No schema, storage, or retrieval for per-brand+domain extraction profiles. All extraction knowledge is ephemeral (runtime selectors, LLM prompts). Nothing persists between runs at the domain level.
- **Files affected:** Everything — would need new types in `src/crawl4ai_engine/types.py`, `enrichment_models.py`, new DB migration, new admin UI, new scraper adapter

### 9.2 No Field Evidence Rules
- **Severity:** BLOCKER
- **Details:** Evidence rules (`"the product name is in the h1.title element"`) don't exist. CSS selectors are hardcoded in platform schemas and never persisted as reusable rules. LLM-based extraction provides no structured evidence provenance per field.
- **Files affected:** `platform_extraction.py` (hardcoded), `crawl4ai_extractor.py` (LLM-only, no structured evidence)

### 9.3 Browser Profiles Not Used
- **Severity:** HIGH
- **Details:** `use_persistent_context` defaults to False everywhere. Auth sessions are in-memory only (process-local TTL cache in `auth.py`). No persistent cookie/localStorage storage for authenticated distributor portals. No `user_data_dir` is configured.
- **Files affected:** `auth.py` line 785, `engine.py` lines 226-227

### 9.4 Platform Detection + Schema Usage Is Ad-Hoc
- **Severity:** HIGH
- **Details:** Platform detection runs every crawl. Platform schemas are hardcoded Python dicts. No way to override selectors per-brand. No versioning or graduated rollout for schema changes.
- **Files affected:** `platform_extraction.py` lines 100-370

### 9.5 Image CDN Allowlist Is Hardcoded and Tiny
- **Severity:** MEDIUM
- **Details:** `ALLOWED_CDN_DOMAINS_BY_SITE` in `media_selector.py` only has 4 brands. Should be driven by `brand_sources.asset_domains` but currently isn't.
- **Files affected:** `media_selector.py` line 100

### 9.6 No Explicit Correction Pipeline
- **Severity:** MEDIUM
- **Details:** Human corrections (field edits in Merging/Reviewing pipeline stages) are not captured as learning signals. Once a user corrects a field, the system forgets it on the next extraction. No feedback loop from corrections to extraction profiles.
- **Files affected:** Pipeline merge/review UI, no linkage back to extraction

### 9.7 Extraction Prompt Versioning Is One-Dimensional
- **Severity:** LOW
- **Details:** `prompt_version: str` field exists with default "v1", but there's no structured versioning, A/B testing, or per-domain prompt tuning.

### 9.8 Source Plan Has No Domain-Level Extraction Config
- **Severity:** MEDIUM
- **Details:** `ApprovedSourcePlanEntry` has `adapterSlug` (which adapter to use) but no per-domain extraction profile reference, no CSS override, no field-level trust weight, no image selection rules.

---

## 10. Suggested Next Grill Questions

1. **Profile storage scope:** Should Site Extraction Profiles live in Supabase (brand_sources extension), the scraper's local filesystem, or both? What's the sync model?
2. **Learning trigger:** Does an Explicit Correction (a) immediately refine the running profile, (b) create a pending review item, or (c) batch-collect for periodic retraining?
3. **Profile versioning:** When a Commerce Platform releases a new theme (e.g., Shopify 3.0 → Dawn 4.0), how do we detect the change and handle the transition?
4. **Fallback escalation:** If a Site Extraction Profile exists but fails to extract a specific field, should it silently fall back to the platform default, escalate to LLM, or flag for review?
5. **Browser Profile lifecycle:** Who provisions Browser Profiles? Are they per-brand, per-distributor, or per-scraper-runner? How long do they persist?
6. **Field Evidence Rule granularity:** Should rules be CSS-selector-based (current element), XPath-based, text-pattern-based, or a combination? Do rules need confidence scoring?
7. **Image selection:** Should per-domain image selection rules (which CDN to trust, which alt-text patterns indicate product shots) live in Site Extraction Profiles or separately?
8. **Existing correction data:** Are there already corrections in the DB (from consolidation apply/overwrite patterns) that could seed initial profiles?
