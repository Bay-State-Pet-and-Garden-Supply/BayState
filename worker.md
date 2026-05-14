# Worker Implementation — Phase 4: Slim Python Worker (Enrichment Mode)

## Files Created

### `apps/scraper/scrapers/ai_search/enrichment_models.py` (NEW)
Pydantic models for the v1 enrichment result contract:
- `EnrichmentResultStatus`, `EnrichmentMode` enums
- `EnrichedProductFactsV1` — all product fields (excl. price, stock_status, manufacturer_part_number, product_line)
- `EnrichmentConfidenceV1`, `EnrichmentValidationV1`, `EnrichmentAttemptSummaryV1`, `EnrichmentResultSourceV1`
- `EnrichmentResultV1` — complete wrapper with schema_version="v1"
- `build_v1_from_extraction_result()` — helper to map from Crawl4AIExtractor result dict to v1 contract

## Files Modified

### `apps/scraper/core/api_client.py`
- Added `ClaimedEnrichment` dataclass (attempt_id, job_id, sku, target_url, domain, model, mode, ...)
- Added `claim_enrichment()` — POST to `/api/scraper/v1/claim-enrichment`
- Added `submit_enrichment_result()` — POST to `/api/scraper/v1/enrichment-callback`

### `apps/scraper/runner/__init__.py`
- Added import of enrichment models
- Added `ENRICHMENT_JOB_TYPE = "enrichment"` constant
- Updated `run_job()` — checks for `enrichment` job_type and dispatches to `_run_enrichment_job()`
- Added `_run_enrichment_job()` — takes target URL + SKU, runs AI extraction via ProductPageExtractor, formats as EnrichmentResultV1, submits result via API client
- Added `ENRICHMENT_JOB_TYPE` to `__all__`

### `apps/scraper/runner/cli.py`
- Added `--enrichment-mode` arg (enrichment/standard)
- Added `--url`, `--model`, `--enrichment-strategy`, `--brand`, `--product-name`, `--domain` args
- Added `run_enrichment_mode()` — runs `_run_enrichment_job()` locally, outputs JSON
- Updated `main()` — checks `--enrichment-mode` before local/API dispatch
- Merged duplicate `--sku` arg

### `apps/scraper/daemon.py`
- Added enrichment claiming before cohort/chunk claiming in main loop
- Checks `USE_ENRICHMENT_PROCESSING` env var (default: true)
- Added `_process_enrichment()` — builds JobConfig with enrichment payload, calls `_run_enrichment_job()`, handles errors

### `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py`
- Added `extract_to_v1()` method — runs standard extraction, maps to flatter v1 contract shape with:
  - All product facts (name, brand, description, category, weight, etc.)
  - Per-field confidence scoring
  - Missing required field detection
  - Elapsed time tracking
  - Token usage passthrough
- Updated class docstring to mention `extract_to_v1()`

### `apps/scraper/scrapers/product_url_extraction/extractor.py`
- Added v1 contract fields to normalized output: `weight`, `dimensions`, `shipping_weight`, `features`, `ingredients`, `pet_type`, `life_stage`, `food_form`, `flavor`, `model`, `mode`, `token_usage`
- Preserves all existing backward-compatible fields

### `apps/scraper/scrapers/ai_search/llm_runtime.py`
- Added `to_metadata()` method to `LLMRuntimeConfig` — returns model/provder metadata dict

### `apps/scraper/src/crawl4ai_engine/metrics.py`
- Added `model`, `latency_ms`, `cost_estimate` fields to `ExtractionMetrics`
- Updated `record_extraction()` signature to accept new fields
- Updated `get_summary()` to include enrichment-specific metrics (tokens, costs, latency, models)

## What's NOT Deleted (Intentionally)
- All YAML configs, action handlers, executor code, anti-detection — preserved for Phase 8
- Legacy scraping paths (`_run_sequential_job`, `_run_cohort_job`) remain fully operational

## Dependencies
- Requires Phase 3 web-side endpoints: `/api/scraper/v1/claim-enrichment` and `/api/scraper/v1/enrichment-callback`
- Crawl4AIEngine and ProductPageExtractor must be functional in the deployment environment
