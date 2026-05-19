# Web Pipeline Extraction Context

## 1. Pipeline Overview (Enrichment-First Static Scrape)

```
Imported/awaiting_brand → Extracting → Processed → Merging → Reviewing → Publishing → Export
       ↑                    ↑            ↑           ↑            ↑
   Integra import     Static scrape   Enrichment   Consolidation  Review/approve
   or manual add     (crawl4ai)      results       (DeepSeek)
```

**Pipeline status enum** (`pipeline_status_five`): `awaiting_brand`, `imported`, `extracting`, `processed`, `merging`, `reviewing`, `publishing`, `failed`

Defined at: `apps/web/supabase/migrations/20250101000000_baseline.sql:162-174`

---

## 2. Key DB Tables

### `products_ingestion` (baseline.sql:4253-4281)
| Column | Type | Purpose |
|--------|------|---------|
| `sku` | text PK | Unique product identifier |
| `input` | jsonb | Raw imported data (source-of-truth for price) |
| `sources` | jsonb | Scraped/enriched data keyed by source name |
| `b2b_sources` | jsonb | B2B sync source data |
| `consolidated` | jsonb | AI-consolidated product record |
| `pipeline_status` | pipeline_status_five | Canonical workflow state |
| `brand_id` | uuid FK | Links to `brands` for approved-source eligibility |
| `cohort_id` | uuid FK | Pipeline batch grouping |
| `scrape_quality` | jsonb | Per-SKU quality evaluation results |
| `confidence_score` | numeric(0-1) | AI consolidation confidence |
| `is_test_run` | boolean | Test products skip normal pipeline flow |
| `enrichment_config` | jsonb | Per-product source/field overrides |

### `enrichment_jobs` (baseline.sql:3390-3430)
| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | Job identifier |
| `status` | text | `queued`, `running`, `completed`, `completed_with_errors`, `failed`, `cancelled` |
| `skus` | text[] | Product SKUs in this job |
| `total_count`, `completed_count`, `failed_count` | int | Progress tracking |
| `mode` | text | `structured`, `metadata`, `llm`, `mixed` |
| `config` | jsonb | Contains `scrapers`, `sku_context`, `source_plans_by_sku` |
| `ai_credentials` | jsonb | Runtime credentials for LLM/API keys |
| `lease_token` | uuid | Runner lease for job ownership |
| `test_mode` | boolean | Test flag |

### `enrichment_attempts` (baseline.sql:3586-3630)
Per-SKU extraction attempt within a job. Status: `queued`, `running`, `success`, `partial`, `failed`, `cancelled`. Contains `result`, `normalized_source`, `confidence_overall`, `source_url`.

### `enrichment_targets` (baseline.sql:3650-3680)
URL targets for enrichment: `sku`, `url`, `domain`, `status` (candidate/selected/rejected/processed/failed), `selected` (boolean).

### `scraper_configs` (baseline.sql:2340-2360)
Registries for YAML-based scraper configs. Key columns: `slug`, `display_name`, `domain`, `current_version_id`.

### `scraper_credentials` (baseline.sql:5149-5163)
AES-256-GCM encrypted credentials. Columns: `scraper_slug`, `credential_type` (login/password), `encrypted_value`, `key_version`.

### `scraper_runners` (baseline.sql:5267-5283)
Runner instances: `name`, `status` (online/offline/busy/idle/polling/paused), `current_job_id`, `lease_token`, `jobs_completed`.

### `scraper_test_runs` (baseline.sql:1296-1301)
Test results: `scraper_id`, `status` (passed/failed/partial), `test_type`, `skus_tested`, `assertion_results`.

### `scrape_results` (baseline.sql:5117-5126)
Idempotency records: `job_id`, `runner_name`, `data` (jsonb with `_idempotency_key`).

### `batch_jobs` / `batch_job_items`
Consolidation (DeepSeek AI) batch processing tables.

---

## 3. Core API Routes (Scraper ↔ Coordinator)

### Scraper Poll/Claim — `POST /api/scraper/v1/claim-enrichment`
- **Auth**: X-API-Key header → `validateRunnerAuth()`
- **Body**: `{ max_attempts?: number (default 10, max 50) }`
- **Flow**: Atomically claims `enrichment_attempts` with status `queued`, sets `started_at`, returns attempts with job config (including `source_plans_by_sku` for approved-source extraction, or a `source_url` for URL-based extraction). Groups by job, sets leases (15min TTL).
- **Response**: `{ attempts: [{ id, job_id, sku, source_url, domain, mode, model, config, source_plan, ai_credentials, lease_token, lease_expires_at, test_mode }] }`

### Heartbeat — `POST /api/scraper/v1/heartbeat`
- **Auth**: X-API-Key or Bearer token
- **Body**: `{ runner_name, status, current_job_id, lease_token, jobs_completed, memory_usage_mb }`
- **Flow**: Validates runner auth, checks version compatibility, extends lease (5min TTL), updates `scraper_runners`.
- **Response**: `{ acknowledged, timestamp, enforced_runner_name, lease_expires_at }`

### Enrichment Callback — `POST /api/scraper/v1/enrichment-callback`
- **Auth**: X-API-Key
- **Body**: `EnrichmentResultV1` (full schema with `_attempt_id`, `_lease_token` transport fields)
- **Flow**: Validates payload, normalizes result, finds the attempt, updates `enrichment_attempts` with result + confidence, merges into `products_ingestion.sources.enriched`, transitions pipeline status (`processed` for success, `extracting` for retry, `failed` after threshold). Updates `enrichment_jobs` counters. Creates retry attempt if below threshold (3 max).
- **Next status logic**: `success+confidence>=0.7 → processed`, `partial+confidence>=0.6 → processed`, otherwise retry up to 3 times then `failed`.
- **Response**: `{ success, sku, next_status, confidence }`

### Test Callback — `POST /api/scraper/v1/test-callback`
- **Auth**: X-API-Key
- **Body**: `{ job_id, config_id, status, assertion_results, summary, duration_ms }`
- **Flow**: Validates, checks idempotency, writes to `scraper_test_runs`, updates scraper health via DB function + fallback direct update.
- Has explicit idempotency key strategy: `admin:{job_id}` or `chunk:{job_id}:{payload_hash}`.

### Supabase Config — (GET/POST) `/api/scraper/v1/supabase-config`
- Provides Supabase URL + realtime key to authenticated runners.

### Progress — `POST /api/scraper/v1/progress`
- Receives in-flight progress updates from the runner (used for UI real-time status).

---

## 4. Admin API Routes (Pipeline Control)

### Pipeline Query — `GET /api/admin/pipeline`
- **Query params**: `stage`, `status`, `search`, `limit` (default 200), `offset`, `selectAll`, `startDate`, `endDate`, `source`, `product_line`, `cohort_id`, `minConfidence`, `maxConfidence`
- Returns paginated products + count + availableSources for each pipeline stage/status.

### Pipeline Bulk Update — `POST /api/admin/pipeline`
- **Body**: `{ skus: string[], newStatus: string }`
- Valid transitions per `lib/pipeline/core.ts` state machine.

### Scrape Products — `POST /api/admin/pipeline/scrape`
- **Body**: `{ skus: string[], scrapers: string[], testMode?: boolean }`
- Validates credentials for known scrapers (phillips_crawl4ai → phillips, orgill_crawl4ai → orgill, pet_food_experts_crawl4ai → petfoodex).
- Creates `enrichment_jobs` with `config.scrapers`, `config.sku_context`, `config.source: 'pipeline'`.
- Transitions products from `imported` → `extracting`.
- Returns `{ success, jobIds, skuCount }`.

### Create Enrichment Job — `POST /api/admin/enrichment/jobs`
- **Body**: `{ skus, targetIds?, mode?, model?, config?, selectedDistributorSlug? }`
- Validates SKUs in `imported` or `extracting` status (max 500).
- Builds approved source plans if `selectedDistributorSlug` provided.
- Creates `enrichment_jobs` + `enrichment_attempts`.
- **Key**: when `config.source_type === "approved_source_extraction"`, sets `source_plans_by_sku` in job config.
- Returns `{ success, jobId, skuCount, skipped_skus? }`.

### List Enrichment Jobs — `GET /api/admin/enrichment/jobs`
- Returns last 50 `enrichment_jobs` ordered by `created_at` desc.

### Cancel Enrichment Job — `DELETE /api/admin/enrichment/jobs?id=...`
- Cancels job + attempts, resets products stuck in `extracting` back to `imported`.

### Pipeline Runs — `GET /api/admin/pipeline/runs`
- Aggregates both `batch_jobs` (consolidation) and `enrichment_jobs` into canonical `PipelineRunSummary[]`.
- Returns active runs first, then recent (last 48h) runs.
- Provides `nextAction` hint: `wait`, `retry_failed`, `apply_results`, `review_errors`.

### Admin Scrapers List — `GET /api/admin/scrapers`
- Lists all `scraper_configs` with version status.

### Admin Scraper Test — `POST /api/admin/scrapers/test`
- **Body**: `{ scraper_id, type: "test" | "fake" }`
- Creates `scrape_jobs` row with `job_type` and `test_metadata`.
- Requires `test_assertions` in the YAML config.

### Enrichment Product Data — `GET /api/admin/enrichment/[sku]`
- Returns available sources, enabled sources, resolved Golden Record data, original price.

### Enrichment Defaults — `GET/POST /api/admin/enrichment/defaults`
- Reads/writes `site_settings` key `enrichment_defaults` (enabled_sources, priority_order).

### Enrichment Sources — `GET /api/admin/enrichment/sources`
- Returns all available enrichment sources from `lib/enrichment/sources.ts`.

---

## 5. Data Flow: End-to-End Extraction

### A) Static Scraping (crawl4ai via enrichment_jobs)

1. **Trigger**: Admin selects products → clicks "Scrape" → `POST /api/admin/pipeline/scrape`
2. Pipeline-scraping.ts loads scrape context from `products_ingestion` + `products` (brand registry, catalog entries, cohort brands)
3. Creates `enrichment_jobs` row with config containing `scrapers` array + `sku_context`
4. Creates `enrichment_attempts` (one per SKU, initially `queued`)
5. Products transition to `extracting`
6. Python runner polls `POST /api/scraper/v1/claim-enrichment` → claims attempts
7. Runner executes Playwright/crawl4ai against each target URL
8. Runner posts results back via `POST /api/scraper/v1/enrichment-callback`
9. Callback handler:
   - Normalizes result into `sources.enriched` with backward-compatible aliases
   - Evaluates quality → determines next pipeline status
   - Updates `enrichment_attempts` (result, confidence, validation)
   - Merges into `products_ingestion.sources`
   - Transitions product: `processed` (success), `extracting` (retry), or `failed`

### B) Approved Source Extraction (distributor-specific)

1. Trigger: Admin selects products + distributor → `POST /api/admin/enrichment/jobs` with `selectedDistributorSlug`
2. Builds `source_plans_by_sku` via `buildApprovedSourcePlans()` from `lib/approved-sources/source-plan`
3. Per SKU, creates a priority-ordered plan of source URLs with credential requirements
4. Runner claims attempts, sees `source_url: "approved_source_extraction"` sentinel
5. Runner iterates through source plan, tries each until successful
6. Results posted back through same enrichment-callback endpoint

### C) Test Jobs
- `isTestJob` flag in both enrichment jobs and callback flow
- Test jobs skip `products_ingestion` updates
- Test results go to `scraper_test_runs` table

---

## 6. Key Library Files

| File | Purpose |
|------|---------|
| `lib/pipeline/types.ts` | Pipeline status enum, product types, stage configs |
| `lib/pipeline/core.ts` | Status transition validation state machine |
| `lib/pipeline/queries.ts` | Pipeline product query builders by tab/status |
| `lib/pipeline/run-types.ts` | Normalized run summary types for UI consumption |
| `lib/pipeline/scrape-quality.ts` | Per-SKU static scrape quality evaluation (pass/needs_fallback_review) |
| `lib/pipeline-scraping.ts` | `scrapeProducts()` — creates enrichment_jobs/attempts for static scraping |
| `lib/scraper-callback/products-ingestion.ts` | Persist scraped sources into products_ingestion |
| `lib/scraper-callback/idempotency.ts` | Callback deduplication via SHA256 idempotency keys |
| `lib/scraper-callback/contract.ts` | Zod schemas for scraper/chunk callback payloads |
| `lib/scraper-callback/test-handler.ts` | Test result processing + health score calculation |
| `lib/enrichment/types.ts` | Enrichable fields, protected fields (price/sku/cost/msrp), source types |
| `lib/enrichment/contracts.ts` | `EnrichmentResultV1` type, `NormalizedEnrichedSourceV1` |
| `lib/enrichment/validation.ts` | Zod validation for enrichment result payloads |
| `lib/enrichment/normalize-result.ts` | Normalize enrichment results into `sources.enriched` format |
| `lib/enrichment/sources.ts` | `getAllSources()` — available enrichment source configurations |
| `lib/enrichment/config.ts` | Per-product enrichment config + Golden Record resolution |
| `lib/consolidation/batch-service.ts` | DeepSeek batch orchestration (submit, poll, apply) |
| `lib/consolidation/direct-chat-service.ts` | Per-item DeepSeek API calls |
| `lib/consolidation/prompt-builder.ts` | Dynamic consolidation prompts |
| `lib/consolidation/types.ts` | Consolidation-specific types |
| `lib/admin/scrapers/configs-db.ts` | YAML scraper config load from local files | 
| `lib/admin/api-auth.ts` | `requireAdminAuth()` — admin auth guard |
| `lib/ai-scraping/credentials.ts` | AI provider config + runtime credentials |
| `lib/scraper-auth.ts` | Runner X-API-Key / Bearer auth validation |
| `lib/product-sources.ts` | Source merge + meaningful-data detection |

---

## 7. Important Patterns & Constraints

### Protected Fields (NEVER from enrichment)
Price, SKU, cost, MSRP are **always** from original import (`products_ingestion.input`). Enrichment never touches these. See `lib/enrichment/types.ts:15-20`.

### Price/SKU Safety
The enrichment callback normalizer strips price/sku from results before merging into `sources.enriched`.

### Pipeline Status Flow
```
imported → extracting → processed → merging → reviewing → publishing
                              ↓                           ↓
                           failed                      failed
```
Legacy aliases are mapped via `normalizePipelineStage()` in `lib/pipeline/types.ts` (e.g. `scraped→processed`, `scraping→extracting`, `consolidating→merging`).

### Quality Evaluation
`evaluateScrapeQuality()` in `lib/pipeline/scrape-quality.ts` checks for: matched SKU identifier + title + (brand OR url). Price/stock/availability are NOT evaluated. Returns `pass` or `needs_fallback_review`.

### Enrichment Retry Logic
Up to 3 retries per SKU. Decision function in `enrichment-callback/route.ts`:
- `success` + confidence ≥ 0.7 → `processed` (no retry)
- `partial` + confidence ≥ 0.6 → `processed` (no retry)
- Otherwise retry if count < 3, else `failed`

### Test Mode
Test jobs (via admin Scraper Lab `POST /api/admin/scrapers/test`) create `scrape_jobs` rows directly with `job_type: "test"`. The `isTestJob` flag skips `products_ingestion` status/production updates.

### Idempotency
Callback idempotency uses deterministic keys based on job_id + payload hash. Records stored in `scrape_results.data._idempotency_key`. Retry logic with exponential backoff for race conditions.

### Credential Checking
Both `POST /api/admin/pipeline/scrape` and `POST /api/admin/enrichment/jobs` validate credentials before creating jobs:
- Known scraper→credential mapping: `phillips_crawl4ai → phillips`, `orgill_crawl4ai → orgill`, `pet_food_experts_crawl4ai → petfoodex`
- Missing credentials → 400 error with specific guidance

### Approved Source Extraction Flow
- Source plans built per SKU via `buildApprovedSourcePlans()` → creates priority-ordered list of distributor URLs/sources
- Requires the product to have a `brand_id` (assigned brand)
- Runner sees `source_url: "approved_source_extraction"` sentinel instead of a URL
- Runner iterates plan until first successful extraction, then posts back via standard enrichment callback

---

## 8. Commands for Local Extraction QA

### Start dev web app
```bash
cd /Users/nickborrello/Desktop/Projects/BayState
bun run web dev
```

### Start local scraper
```bash
cd /Users/nickborrello/Desktop/Projects/BayState/apps/scraper
python daemon.py --env dev
```

### Test a scraper YAML against local Supabase
```bash
cd /Users/nickborrello/Desktop/Projects/BayState/apps/scraper
python runner.py --local --config scrapers/configs/phillips.yaml --test-mode --sku "072705115310"
```
Add `--no-headless` for visual debugging.

### Run pipeline tests
```bash
cd /Users/nickborrello/Desktop/Projects/BayState/apps/web
bun run web test -- --testPathPatterns="pipeline"
```

### Check pipeline counts (via API)
```bash
curl -X GET "http://localhost:3000/api/admin/pipeline?status=imported&limit=10" \
  -H "Cookie: <admin-session-cookie>"
```

### Create test scrape job (via admin API)
```bash
curl -X POST "http://localhost:3000/api/admin/pipeline/scrape" \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin-session-cookie>" \
  -d '{"skus": ["072705115310"], "scrapers": ["phillips_crawl4ai"]}'
```

### Create enrichment job (via admin API)
```bash
curl -X POST "http://localhost:3000/api/admin/enrichment/jobs" \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin-session-cookie>" \
  -d '{"skus": ["072705115310"], "mode": "mixed"}'
```

### Check enrichment runs
```bash
curl -X GET "http://localhost:3000/api/admin/pipeline/runs" \
  -H "Cookie: <admin-session-cookie>"
```

---

## 9. Risks & Implementation Notes

1. **Runners must be running** for extraction to work. The coordinator creates queued jobs, but a Python runner must claim and execute them. Without `daemon.py` running, jobs stay in `queued` forever.

2. **Credentials** must be configured in the admin UI (Settings) before any scrape. The API validates credentials server-side before allowing job creation.

3. **Brand must be assigned** for approved-source extraction. Products in `awaiting_brand` status won't have `brand_id` and will be skipped.

4. **Local Supabase data**: If using local Supabase (`supabase start`), runner must have matching URL config. The `supabase-config` endpoint returns the Supabase connection string.

5. **YAML scraper configs** exist in the archive at `legacy-scraper-archive/configs/` but production configs are managed through the admin UI. The `configs-db.ts` module loads them from local filesystem, not DB.

6. **Max batch size**: Enrichment jobs cap at 500 SKUs per job. Static scraping doesn't have the same limit but practical limits apply.

7. **Idempotency**: The callback system has robust deduplication, but race conditions are possible. The idempotency module handles this with retry + verification.

8. **Lease TTL**: Enrichment job lease is 15min initially, heartbeat extends by 5min. If a runner crashes, the lease expires and another runner can claim.

9. **Test jobs vs production**: Test jobs skip `products_ingestion` status changes. They write results to `scraper_test_runs` for Scraper Lab UI display.

10. **The consolidation pipeline** (DeepSeek AI) is separate from enrichment. Enrichment fills `sources.enriched`, consolidation reads from there to produce `consolidated` via AI prompt-based extraction.
