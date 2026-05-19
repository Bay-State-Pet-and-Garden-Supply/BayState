# Meta-Prompt: Extraction Execution Agent

## Goal
Run a real extraction against BayState's ingestion pipeline. Select representative products from the pipeline, queue extraction jobs, monitor completion, and inspect results — all against the local Supabase instance. Do NOT edit any application code.

## Context/Evidence
See `web-pipeline-extraction.md` for the full context. Key facts:

- Pipeline stages: `imported` → `extracting` → `processed` → `merging` → `reviewing` → `publishing` → `failed`
- Static scraping uses `enrichment_jobs` + `enrichment_attempts` tables (not `scrape_jobs`)
- Products in `imported` status with an assigned `brand_id` are eligible for extraction
- The admin API requires a valid admin session cookie for auth; scraper API uses `X-API-Key: bsr_*`
- Callback endpoints: `POST /api/scraper/v1/enrichment-callback` (production), `POST /api/scraper/v1/test-callback` (test results)
- Idempotency uses SHA256 keys in `scrape_results.data._idempotency_key`
- Protected fields (price, sku, cost, msrp) never come from enrichment — they come from `input` only
- Credential mapping: `phillips_crawl4ai→phillips`, `orgill_crawl4ai→orgill`, `pet_food_experts_crawl4ai→petfoodex`

## Success Criteria
Before completing, the following must be true:
1. [ ] Products in `imported` status have been identified with their `brand_id` and `input` data
2. [ ] A static scrape job has been queued via `POST /api/admin/pipeline/scrape` or enrichment job via `POST /api/admin/enrichment/jobs` for at least 1-3 products
3. [ ] The job status has transitioned beyond `queued` — ideally to at least `running` or `completed`
4. [ ] Results have been inspected in `products_ingestion.sources` for a completed SKU
5. [ ] Pipeline status has been verified after extraction (should be `processed` for success)
6. [ ] Any errors or blockers are documented with enough context for debugging

## Hard Constraints
- **DO NOT** edit any application code, migration files, or configuration
- **DO NOT** run destructive DB operations (DROP, DELETE, TRUNCATE)
- **DO NOT** override protected fields (price, sku, cost, msrp) in test data or verification
- If credentials are missing, report it clearly; do not fabricate or bypass credential checks
- If the local Supabase instance has no import data in `products_ingestion`, stop and report
- The scraper runner daemon must be running for extraction to execute — verify with heartbeat

## Suggested Approach
1. **Phase 1 — Inventory**: Query `products_ingestion` to find products in `imported` status with `brand_id` set. Check `scraper_configs` for available scrapers. Verify `scraper_credentials` are configured.
2. **Phase 2 — Queue**: Select 1-3 representative products. Queue a static scrape via the admin pipeline scrape API.
3. **Phase 3 — Monitor**: Poll `/api/admin/pipeline/runs` and check `enrichment_jobs`/`enrichment_attempts` statuses.
4. **Phase 4 — Inspect**: Once a SKU reaches `completed`/`processed`, read back `products_ingestion.sources` to inspect what was extracted. Check `scrape_quality` and `confidence_score`.
5. **Phase 5 — Report**: Summarize what ran, what was extracted, any errors, and the observed flow.

## Validation
- After queuing a job: verify `enrichment_jobs` has a row with `status: 'queued'`
- After claim: verify `enrichment_attempts` has rows with `status: 'running'`, `claimed_by` set
- After callback: verify `products_ingestion.sources` has source data, pipeline_status shows `processed` or `failed`
- For enriched SKUs: check that `price` in `input` is unchanged (protected field invariant)
- For test jobs: verify `scraper_test_runs` has result rows

## Stop/Escalation Rules
- **Stop if**: No products in `imported` status exist → report and stop
- **Stop if**: API returns 401/403 for admin → verify session cookie
- **Stop if**: API returns credential errors → report which credentials are missing
- **Escalate via `contact_supervisor` with `need_decision` if**: Unsure how to authenticate to the admin API, uncertain which products to select, or need to choose between scraping approaches

## Resolved Questions & Assumptions
- Scraper runner is assumed to be running locally (via `python daemon.py --env dev`)
- Local Supabase is assumed to have seed data (12+ products, 6+ brands per SCHEMA.md expectations)
- Admin session cookie is assumed to be available or obtainable via browser login
- The enrichment-first pipeline model means static scraping is always the first extraction step
- Approved-source extraction requires a brand_id on the product; URL-based scraping does not

## Output Expectations
Write findings to a markdown document documenting:
- Products selected (SKUs, names, brands)
- Scrapers/enrichment jobs queued (job IDs)
- Run status timeline
- Results inspection (what was extracted, quality scores, pipeline status)
- Any errors or unusual observations
- Summary of the end-to-end flow as it actually ran
