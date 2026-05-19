# Live Extraction Validation — 2026-05-19

## Objective
Validate real approved-source extraction flows against live distributor sites after the AI provider profile refactor and production credential sync, then make whatever tuning was needed to get production-safe behavior.

## Code changes completed

### Coordinator / web
- `apps/web/lib/ai-scraping/credentials.ts`
  - added config-driven runtime credential resolution
  - added `getAIScrapingRuntimeCredentialsForConfig(...)`
  - fixed provider-specific key selection
- `apps/web/app/api/admin/enrichment/jobs/route.ts`
  - stopped writing non-existent `ai_credentials` DB column
  - traces `config_id` on queued jobs/attempts
- `apps/web/app/api/scraper/v1/claim-enrichment/route.ts`
  - resolves runtime credentials from queued `config_id`
- `apps/web/lib/scraper-auth.ts`
  - fixed local/dev fallback auth to use `runner_api_keys`
- `apps/web/app/api/scraper/v1/credentials/[id]/route.ts`
  - fixed credential alias canonicalization
  - fixed allowlist handling for adapter slugs like `pet-food-experts-crawl4ai`
- `apps/web/lib/approved-sources/distributor-catalog.ts`
  - added required CDN asset domains for Phillips and Pet Food Experts
- `apps/web/supabase/migrations/20260518233000_ai_provider_configs.sql`
  - persists `ai_provider_configs`
  - adds `config_id` to enrichment jobs/attempts

### Scraper / runner
- `apps/scraper/runner/__init__.py`
  - runner now consumes queued AI runtime credentials
- `apps/scraper/scrapers/approved_sources/executor.py`
  - always attaches `api_client` to extractor
  - aligns accepted partial confidence with coordinator processing threshold (`0.6`)
  - partial acceptance threshold now matches coordinator processing threshold (`0.6`)
- `apps/scraper/scrapers/approved_sources/auth.py`
  - canonicalized credential refs / aliases
- `apps/scraper/scrapers/approved_sources/result_builder.py`
  - auth/no-match results always emit non-empty source URLs
- `apps/scraper/scrapers/approved_sources/adapters/base.py`
  - centralized safer SKU verification and partial-vs-success handling
- `apps/scraper/scrapers/approved_sources/adapters/phillips.py`
  - supports legacy `#plp-desktop-row`
  - ranks competing result cards instead of blindly taking the first scanner row
  - downgrades quick-search heuristic matches to partial/`sku_match=false`
- `apps/scraper/scrapers/approved_sources/adapters/orgill.py`
  - supports `#cphMainContent_ctl00_lblRetailUpc` for UPC-based matches
  - improved encoded search URL handling
- `apps/scraper/scrapers/approved_sources/adapters/pet_food_experts.py`
  - fixed brand parsing to stop at the next attribute label
  - improved encoded search URL handling
- `apps/scraper/scrapers/ai_search/llm_runtime.py`
  - `lmstudio` now aliases to `openai_compatible`

## Automated validation

### Typecheck / tests
- `apps/web`: `tsc --noEmit` ✅
- Web targeted Jest: **24 passed** ✅
- Scraper targeted pytest: **96 passed** ✅

## Live extraction results

### 1) Real pipeline SKU — Phillips
**SKU:** `840243156412`

Result after tuning:
- status: `partial`
- pipeline outcome: `processed`
- name: `Blue Buffalo True Chews Meatball Dog Beef Treat 12 oz C=6`
- brand: `BLUE BUFFALO`
- images: `1`
- confidence: `0.69`
- note: quick-search result is a strong brand/name match, but the supplier page identifiers differ from the ingestion SKU, so this now lands as a production-safer partial instead of a false deterministic success.

Persisted local pipeline state:
- `products_ingestion.pipeline_status = processed`
- `products_ingestion.sources.enriched.name = Blue Buffalo True Chews Meatball Dog Beef Treat 12 oz C=6`
- `products_ingestion.sources.enriched.brand = BLUE BUFFALO`
- `products_ingestion.sources.enriched.image_urls` count = `1`
- `products_ingestion.sources.enriched.confidence.overall = 0.69`

### 2) Legacy validation SKU — Pet Food Experts
**SKU:** `33011808`

Result after tuning:
- status: `success`
- pipeline outcome: `processed`
- name: `DAVE'S PET FOOD DOG RESTRICTED BLAND DIET CHICKEN & RICE 13.2OZ - 12 PACK`
- brand: `Daves Pet Food`
- images: `1`
- confidence: `1.0`

Persisted local pipeline state:
- `products_ingestion.pipeline_status = processed`
- `products_ingestion.is_test_run = true`
- `products_ingestion.sources.enriched.name` populated
- `products_ingestion.sources.enriched.brand` populated
- `products_ingestion.sources.enriched.image_urls` count = `1`
- `products_ingestion.sources.enriched.confidence.overall = 1`

### 3) Legacy validation SKU — Orgill
**SKU:** `037193347322`

Result after tuning:
- status: `success`
- pipeline outcome: `processed`
- name: `Southern Imperial R16-APSH-K2BX Pallet Sign Holder, 11 in W, Acrylic, Black`
- brand: `SOUTHERN IMPERIAL`
- images: `1`
- confidence: `1.0`

Persisted local pipeline state:
- `products_ingestion.pipeline_status = processed`
- `products_ingestion.is_test_run = true`
- `products_ingestion.sources.enriched.name` populated
- `products_ingestion.sources.enriched.brand` populated
- `products_ingestion.sources.enriched.image_urls` count = `1`
- `products_ingestion.sources.enriched.confidence.overall = 1`

## Key production conclusions
- **Phillips credentials + login + extraction are working live.**
- **Pet Food Experts credentials + login + extraction are working live.**
- **Orgill credentials + login + extraction are working live.**
- **Coordinator → claim → runner → callback → ingestion persistence is working locally with traced `config_id`.**
- The AI provider profile architecture is now wired into the extraction path without depending on the removed `ai_credentials` job column.

## Remaining non-blocking sharp edge
- Phillips quick-search can return a clearly correct product card whose supplier identifiers do not exactly equal the ingestion SKU. This now lands as a **partial** with warning instead of an unsafe deterministic success. That is intentional and safer for production.

## Local data note
Temporary legacy validation rows were written into `products_ingestion` for:
- `33011808`
- `037193347322`

Both are marked `is_test_run = true`.
