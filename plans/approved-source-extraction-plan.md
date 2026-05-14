# Implementation Plan

## Goal
Replace static scraper, official-brand URL candidate, and open-web AI discovery flows with a coordinator-built Approved Source Extraction workflow that sends Crawl4AI runners per-product approved source plans and blocks extraction until each product has an assigned brand.

## Tasks
1. **Add database foundation for approved sources and per-product brand assignment**
   - File: `apps/web/supabase/migrations/YYYYMMDDHHMMSS_add_approved_source_extraction.sql`
   - Changes:
     - Add `public.brand_sources` with:
       - `id uuid primary key default gen_random_uuid()`
       - `brand_id uuid not null references public.brands(id) on delete cascade`
       - `source_type text not null check (source_type in ('official_brand', 'distributor', 'internal', 'licensed_feed'))`
       - `source_slug text not null`
       - `display_name text not null`
       - `domains text[] not null default '{}'::text[]`
       - `asset_domains text[] not null default '{}'::text[]`
       - `crawl4ai_adapter_slug text not null`
       - `requires_auth boolean not null default false`
       - `credential_ref text null`
       - `search_mode text not null check (search_mode in ('sku_search', 'domain_search', 'direct_url', 'feed_lookup'))`
       - `allowed_fields text[] not null default '{}'::text[]`
       - `priority integer not null default 100`
       - `enabled boolean not null default true`
       - `metadata jsonb not null default '{}'::jsonb`
       - `created_at timestamptz not null default now()` / `updated_at timestamptz not null default now()`
     - Add constraints/indexes:
       - `unique (brand_id, source_type, source_slug)`
       - index on `(brand_id, enabled, priority)`
       - GIN indexes on `domains` and `asset_domains`
       - optional check that `requires_auth = false OR credential_ref IS NOT NULL`
     - Add `brand_id uuid null references public.brands(id)` to `public.products_ingestion`.
     - Add index `idx_products_ingestion_brand_id` on `products_ingestion(brand_id)`.
     - Add pipeline enum value `awaiting_brand` to `pipeline_status_five` if the live schema still uses the enum.
     - Backfill `products_ingestion.brand_id` from `consolidated->>'brand_id'` where valid.
     - Set active imported rows without `brand_id` to `awaiting_brand`; rows with a brand remain/become `imported`.
   - Acceptance:
     - Migration applies on a copy of the remote schema.
     - Existing products retain SKUs/input/sources/consolidated.
     - Products without a brand are queryable as `awaiting_brand`; products with a brand are eligible for extraction.

2. **Regenerate and update database-derived TypeScript types**
   - File: `apps/web/lib/supabase/database.types.ts`
   - File: `apps/web/types/supabase.ts`
   - Changes:
     - Regenerate Supabase types after Task 1.
     - Ensure `brand_sources` appears under `Database['public']['Tables']`.
     - Ensure `products_ingestion.Row/Insert/Update` includes `brand_id`.
     - Ensure `pipeline_status_five` includes `awaiting_brand` if enum-backed.
   - Acceptance:
     - TypeScript recognizes `brand_sources` queries without casts.
     - Existing pipeline tests compile against the new status value.

3. **Update pipeline status vocabulary and imported/awaiting-brand visibility**
   - File: `apps/web/lib/pipeline/types.ts`
   - File: `apps/web/lib/pipeline/queries.ts`
   - File: `apps/web/lib/pipeline/derivation.ts`
   - File: `apps/web/lib/pipeline/types.test.ts`
   - File: `apps/web/lib/pipeline/queries.test.ts`
   - Changes:
     - Add `awaiting_brand` to `PERSISTED_PIPELINE_STATUSES` and `PIPELINE_TABS` before `imported`, or map it into the existing imported workspace if product wants one visible tab.
     - Add display labels and any normalization aliases needed.
     - Update count/query helpers so `awaiting_brand` products are not invisible.
     - Define transition rule: `awaiting_brand` → `imported` when `brand_id` is assigned.
   - Acceptance:
     - Pipeline counts include products awaiting brand assignment.
     - Existing imported products with brands still display under `imported`.
     - Tests cover `awaiting_brand` normalization and queries.

4. **Move brand assignment from cohort-derived consolidated data to per-product durable state**
   - File: `apps/web/app/api/admin/pipeline/bulk/brand/route.ts`
   - File: `apps/web/lib/pipeline/cohorts.ts`
   - File: `apps/web/lib/pipeline-scraping.ts`
   - File: `apps/web/app/admin/pipeline/page.tsx`
   - File: `apps/web/components/admin/pipeline/PipelineClient.tsx` or the imported-stage child component it delegates to
   - Changes:
     - Update brand assignment endpoint to write `products_ingestion.brand_id` directly.
     - Keep `consolidated.brand_id` in sync for backwards compatibility during rollout, but treat `products_ingestion.brand_id` as canonical for extraction eligibility.
     - Set `pipeline_status = 'imported'` when a brand is assigned to an `awaiting_brand` product.
     - Set `pipeline_status = 'awaiting_brand'` when brand is cleared from an unprocessed/imported product.
     - Keep cohort recohorting optional/secondary; do not require cohort brand to build source plans.
     - Add imported/awaiting-brand UI controls to select/search brands per product and bulk assign brands.
   - Acceptance:
     - A product can be assigned a brand without relying on cohort-level `brand_id`.
     - Products without `brand_id` cannot start extraction.
     - Clearing a brand removes extraction eligibility.

5. **Define shared Approved Source Plan contract in the coordinator**
   - File: `apps/web/lib/approved-sources/types.ts` (new)
   - Changes:
     - Add exported types:
       - `ApprovedSourceType = 'official_brand' | 'distributor' | 'internal' | 'licensed_feed'`
       - `ApprovedSourcePlanEntry` with source type/slug, display name, domains, asset domains, adapter slug, requires auth, credential ref, search mode, allowed fields, priority, and run-first flag.
       - `ApprovedSourcePlan` with `schema_version`, `sku`, `input`, `brand`, optional `selected_distributor_slug`, `priority`, `source_policy`, and `llm_policy`.
       - `ApprovedSourcePolicy` with `allowed_domains`, `allowed_asset_domains`, `disallowed_domains`, `approved_sources_only`.
     - Add constants for disallowed domains: `amazon.com`, `chewy.com`, `walmart.com`, `petco.com`, `petsmart.com`, `ebay.com`, `google.com`, marketplace/blog/review patterns where enforceable.
   - Acceptance:
     - Contract can represent the example plan from the pitch.
     - Contract supports distributor-first and official-brand fallback without open-web discovery.

6. **Build source plans from `brand_sources` plus product brand state**
   - File: `apps/web/lib/approved-sources/source-plan.ts` (new)
   - File: `apps/web/lib/brand-registry.ts`
   - Changes:
     - Add `buildApprovedSourcePlans(supabase, skus, options)`.
     - Load `products_ingestion.sku,input,brand_id` and joined `brands(id,name,slug,official_domains,preferred_domains)`.
     - Reject/return structured errors for SKUs with no `brand_id`.
     - Load enabled `brand_sources` for each brand ordered by `priority` ascending.
     - If a selected distributor is supplied, mark it `runFirst: true` and sort it before official brand entries.
     - For official-brand entries, merge `brand_sources.domains` with existing `brands.official_domains` and `brands.preferred_domains` as seed domains only when the entry does not already define domains.
     - Construct `source_policy.allowed_domains` and `allowed_asset_domains` from all source entries.
     - Ensure no disallowed domain is present; fail source-plan build if a configured source includes a blocked domain.
   - Acceptance:
     - Building a plan for a branded product with brand sources returns a deterministic priority list.
     - Building a plan for an unbranded product returns an explicit not-eligible error.
     - Unit tests cover distributor-first ordering and blocked-domain rejection.

7. **Create admin CRUD/API for brand source configuration**
   - File: `apps/web/app/api/admin/brands/[id]/sources/route.ts` (new)
   - File: `apps/web/app/api/admin/brands/route.ts`
   - File: `apps/web/app/admin/brands/actions.ts`
   - File: `apps/web/app/admin/brands/page.tsx`
   - Changes:
     - Add GET/PUT endpoints or server actions to list and replace a brand's `brand_sources`.
     - Validate domains are normalized hostnames, not full arbitrary URLs.
     - Validate disallowed domains at write time.
     - Validate allowed fields against the extraction contract fields.
     - Add minimal admin UI for sources: source type, slug, display name, domains, asset domains, adapter slug, auth/credential ref, search mode, priority, enabled.
   - Acceptance:
     - Admin can configure an official brand source and Phillips distributor source for a brand.
     - Saving Amazon/Chewy/etc. as a domain fails with a clear message.

8. **Replace static scrape job creation with approved source extraction job creation**
   - File: `apps/web/app/api/admin/pipeline/scrape/route.ts`
   - File: `apps/web/app/api/admin/enrichment/jobs/route.ts`
   - File: `apps/web/lib/pipeline-scraping.ts`
   - Changes:
     - Rename user-facing behavior from static scrape to approved extraction while keeping the existing route path if needed for UI compatibility.
     - Reject `scrapers` as the primary selector; accept `skus` and optional `selectedDistributorSlug`/`selectedDistributorBySku`.
     - Call `buildApprovedSourcePlans` before queuing.
     - Prefer the existing `enrichment_jobs` / `enrichment_attempts` durable path for MVP because it already has runner claiming, retry, callback, and `sources.enriched` storage.
     - Store per-job/per-SKU source plans in `enrichment_jobs.config.source_plans_by_sku` or per-attempt `config.source_plan` if a column is added.
     - Set eligible products to `extracting`; leave unbranded products in `awaiting_brand` and report them in the response.
     - Mark job mode as `approved_source` or `mixed` only if the current schema restricts modes.
   - Acceptance:
     - Starting extraction with an unbranded SKU returns a 400 or partial response listing blocked SKUs.
     - Starting extraction with a branded SKU creates an enrichment job/attempt with a source plan.
     - No static scraper config slug is required.

9. **Update scraper poll/claim APIs to send source plans, not scraper configs**
   - File: `apps/web/app/api/scraper/v1/claim-enrichment/route.ts`
   - File: `apps/web/app/api/scraper/v1/poll/route.ts`
   - File: `apps/web/app/api/scraper/v1/job/route.ts`
   - Changes:
     - In `claim-enrichment`, include `source_plan` from job/attempt config in each claimed attempt's `config`.
     - In `poll`, remove `getDatabaseScraperConfigs()` dependency for approved-source jobs and add `source_plan` / `source_plans_by_sku` to `PollResponse.job`.
     - Stop injecting `ai_discovery`, `crawl4ai_discovery`, and synthetic `official_brand` scraper entries.
     - Keep `scrapers: []` only as a temporary backwards-compatible field until runner types are migrated.
     - Ensure credentials are not embedded; send only `credential_ref` values from the plan.
   - Acceptance:
     - Runner receives a source plan for approved extraction jobs.
     - Poll responses no longer expose static scraper configs for approved extraction.
     - Existing runner auth/version headers remain unchanged.

10. **Deprecate official-brand URL candidate and open-web AI discovery endpoints/UI**
    - File: `apps/web/app/api/admin/pipeline/official-brand/discover/route.ts`
    - File: `apps/web/app/api/admin/pipeline/official-brand/extract/route.ts`
    - File: `apps/web/app/api/admin/pipeline/official-brand/candidates/route.ts`
    - File: `apps/web/app/api/admin/pipeline/official-brand/url-review-cohorts/route.ts`
    - File: `apps/web/app/admin/pipeline/official-brand/page.tsx`
    - File: `apps/web/app/api/admin/enrichment/sources/route.ts`
    - Changes:
      - Return 410 or a feature-disabled response from open-web discovery/official-brand candidate endpoints once the new UI path exists.
      - Remove UI links/buttons that launch URL candidate discovery.
      - Keep database tables for audit temporarily; do not drop `official_brand_url_candidates` or `enrichment_targets` in the first migration.
      - Add a follow-up cleanup task to remove unused routes/tables after production confidence.
    - Acceptance:
      - No admin UI action can queue open-web AI discovery.
      - Old endpoints fail safely with instructions to configure approved sources.

11. **Move credential lookup from hard-coded scraper names to source credential refs**
    - File: `apps/web/app/api/scraper/v1/credentials/route.ts`
    - File: `apps/web/app/api/scraper/v1/credentials/[id]/route.ts`
    - Changes:
      - Accept `credential_ref` as the primary lookup key.
      - Authorize access by checking that the requesting runner is allowed for at least one enabled `brand_sources.credential_ref` matching the request.
      - Preserve a temporary compatibility map for `phillips`, `petfoodex`, and `orgill` only until adapters use credential refs.
      - Never include credentials in source plans or job configs.
    - Acceptance:
      - Runner can fetch Phillips credentials by credential ref.
      - Unknown credential refs return 404/403 without revealing secret names.

12. **Add runner-side source plan models and parser**
    - File: `apps/scraper/core/api_client.py`
    - File: `apps/scraper/scrapers/approved_sources/types.py` (new)
    - Changes:
      - Add dataclasses or Pydantic models mirroring `ApprovedSourcePlan` and source entries.
      - Add `source_plan: dict[str, Any] | None` to `JobConfig`, `ClaimedChunk`, and `ClaimedEnrichment` where appropriate, or parse it from `job_config['source_plan']`.
      - Update `poll_for_work`, `get_job_config`, `claim_chunk`, and `claim_enrichment` parsing to preserve source plans.
    - Acceptance:
      - Unit tests prove source plans survive API parsing.
      - Missing source plan on approved-source jobs fails early with a classified configuration error.

13. **Add runner source policy gate**
    - File: `apps/scraper/scrapers/approved_sources/policy.py` (new)
    - File: `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py`
    - File: `apps/scraper/scrapers/product_url_extraction/extractor.py`
    - Changes:
      - Add URL/domain normalization helpers.
      - Enforce `approvedSourcesOnly`: URL hostname must match allowed source domains before crawl.
      - Enforce asset domain policy for image URLs after extraction.
      - Block configured disallowed domains even if mistakenly present in an allowed list.
      - Return structured retry/non-retry failure classification for policy violations.
    - Acceptance:
      - Tests prove Amazon/Chewy/Walmart/Petco/PetSmart/eBay/Google image URLs are rejected.
      - Tests prove official brand and configured distributor domains are allowed.
      - Extracted images from unknown CDN domains are dropped or flagged unless in `asset_domains`.

14. **Implement approved-source runner orchestration with distributor-first behavior**
    - File: `apps/scraper/runner/__init__.py`
    - File: `apps/scraper/scrapers/approved_sources/orchestrator.py` (new)
    - File: `apps/scraper/scrapers/approved_sources/adapters/base.py` (new)
    - File: `apps/scraper/scrapers/approved_sources/adapters/official_brand.py` (new)
    - File: `apps/scraper/scrapers/approved_sources/adapters/phillips.py` (new MVP stub or implementation)
    - Changes:
      - Add runner job type `approved_source_extraction`.
      - Dispatch approved-source jobs before legacy official-brand/static branches.
      - Execute source entries in sorted priority order with selected distributor first.
      - For distributor entries, call adapter deterministic SKU search/extraction and validate SKU/name/brand match.
      - If deterministic confidence is above threshold, skip LLM and return `decision: 'deterministic_success'` with `llmUsed: false`.
      - If incomplete, continue to official brand source.
      - LLM fallback may only run on HTML/markdown fetched from a policy-approved source URL.
      - Include evidence: source URL, source type/slug, matched fields, confidence, validation warnings.
    - Acceptance:
      - A source plan with Phillips first attempts Phillips before official brand.
      - A high-confidence distributor result prevents LLM use.
      - A partial distributor result falls back to official brand.
      - Policy blocks any adapter redirect to disallowed domains.

15. **Extend enrichment result contract for source-backed multi-source evidence**
    - File: `apps/web/lib/enrichment/contracts.ts`
    - File: `apps/web/lib/enrichment/validation.ts`
    - File: `apps/web/lib/enrichment/normalize-result.ts`
    - File: `apps/scraper/scrapers/ai_search/enrichment_models.py`
    - Changes:
      - Preserve `schema_version: 'v1'` compatibility if possible, but add optional fields:
        - `source.source_type`
        - `source.source_slug`
        - `source.approved_source_id`
        - `source.evidence`
        - top-level `decision`
        - top-level `llm_used`
        - optional `source_results[]`
      - If the shape is too large for v1 compatibility, introduce `schema_version: 'v2'` and accept both in validation.
      - Normalize new evidence fields into `products_ingestion.sources.enriched` without breaking consolidation aliases.
    - Acceptance:
      - Existing enrichment callback still accepts old v1 results during transition.
      - Approved-source results store source slug/type, evidence, confidence, and `llm_used`.

16. **Update callback/status handling for approved-source extraction**
    - File: `apps/web/app/api/scraper/v1/enrichment-callback/route.ts`
    - File: `apps/web/lib/enrichment/normalize-result.ts`
    - Changes:
      - Store approved-source results under `sources.enriched` and optionally `sources.approved_source_extraction` for audit detail.
      - Keep pipeline transition `extracting` → `processed` on success/usable partial.
      - Record policy failures as non-retryable failed attempts unless caused by missing config/credentials.
      - Include evidence/warnings in `validation` and product error messages.
    - Acceptance:
      - Successful approved-source callback moves product to `processed`.
      - Policy-blocked callback records useful error and does not repeatedly retry.

17. **Seed/configure initial approved sources**
    - File: `apps/web/supabase/migrations/YYYYMMDDHHMMSS_seed_initial_brand_sources.sql` (optional after schema migration)
    - Changes:
      - For known high-priority brands, create official-brand `brand_sources` rows from existing `brands.official_domains`.
      - Create Phillips distributor source rows only for brands/products where Bay State intends to use Phillips.
      - Do not mass-create distributor sources for every brand without confirmation.
    - Acceptance:
      - At least one test brand has official brand and Phillips source entries.
      - Source plans can be built without manual SQL for the pilot SKU.

18. **Update tests for coordinator flow**
    - File: `apps/web/__tests__/lib/approved-sources/source-plan.test.ts` (new)
    - File: `apps/web/__tests__/app/api/admin/enrichment/jobs-route.test.ts`
    - File: `apps/web/__tests__/api/admin/pipeline/scrape-route.test.ts` or existing equivalent
    - File: `apps/web/__tests__/lib/pipeline-scraping.test.ts`
    - Changes:
      - Test source plan ordering, no-brand blocking, disallowed-domain rejection, credential-ref omission, and product status updates.
      - Update old tests expecting `amazon`, `target`, `walmart` static scraper behavior to expect approved-source validation failures or remove them.
    - Acceptance:
      - Focused Jest tests pass with `bun run web test -- --testPathPatterns="approved-sources|enrichment|pipeline-scraping"`.

19. **Update tests for runner flow**
    - File: `apps/scraper/tests/unit/test_approved_source_policy.py` (new)
    - File: `apps/scraper/tests/unit/test_approved_source_orchestrator.py` (new)
    - File: `apps/scraper/tests/unit/test_api_client_source_plan.py` (new or existing API client test)
    - File: `apps/scraper/tests/test_runner_job_execution.py`
    - Changes:
      - Test source-plan parsing.
      - Test blocked domains and blocked asset images.
      - Test distributor-first deterministic success skips LLM.
      - Test official-brand fallback after incomplete distributor result.
    - Acceptance:
      - Focused pytest subset passes: `python -m pytest tests/unit/test_approved_source_policy.py tests/unit/test_approved_source_orchestrator.py tests/unit/test_api_client_source_plan.py`.

20. **Remove/hide deprecated static scraper and AI discovery paths from UI after MVP passes**
    - File: `apps/web/app/admin/scrapers/**`
    - File: `apps/web/components/admin/pipeline/**`
    - File: `apps/web/app/api/admin/pipeline/scrapers/route.ts`
    - Changes:
      - Hide static scraper selection from the pipeline extraction action.
      - Rename UI actions from "Scrape"/"AI Discovery" to "Approved Source Extraction".
      - Keep Scraper Lab only if needed for legacy audit/testing, marked deprecated.
    - Acceptance:
      - Admin cannot select Amazon/Walmart/static scrapers for enrichment.
      - Primary pipeline action starts approved-source extraction.

## Files to Modify
- `apps/web/supabase/migrations/YYYYMMDDHHMMSS_add_approved_source_extraction.sql` - add `brand_sources`, `products_ingestion.brand_id`, status/indexes/backfill.
- `apps/web/lib/supabase/database.types.ts` - regenerated DB types.
- `apps/web/types/supabase.ts` - regenerated DB types mirror.
- `apps/web/lib/pipeline/types.ts` - add `awaiting_brand`, product `brand_id`, labels/normalization.
- `apps/web/lib/pipeline/queries.ts` - include/query `awaiting_brand` products.
- `apps/web/lib/pipeline/derivation.ts` - transition/normalization updates.
- `apps/web/lib/pipeline/cohorts.ts` - make product `brand_id` canonical while preserving cohort sync.
- `apps/web/lib/pipeline-scraping.ts` - replace static scraper job planning with approved source plan job creation or delegate to new module.
- `apps/web/lib/brand-registry.ts` - expose helpers needed by source-plan builder.
- `apps/web/app/api/admin/pipeline/bulk/brand/route.ts` - per-product brand assignment/status transition.
- `apps/web/app/api/admin/pipeline/scrape/route.ts` - start approved-source extraction instead of static scrapers.
- `apps/web/app/api/admin/enrichment/jobs/route.ts` - accept/build source plans and block unbranded SKUs.
- `apps/web/app/api/scraper/v1/claim-enrichment/route.ts` - return source plan in runner config.
- `apps/web/app/api/scraper/v1/poll/route.ts` - stop sending scraper configs for approved-source jobs; include source plan fields.
- `apps/web/app/api/scraper/v1/job/route.ts` - expose source plans for chunk/job fetches.
- `apps/web/app/api/scraper/v1/credentials/route.ts` - credential-ref lookup.
- `apps/web/app/api/scraper/v1/credentials/[id]/route.ts` - credential-ref lookup/details if used.
- `apps/web/app/api/admin/brands/route.ts` - include source summaries where useful.
- `apps/web/app/admin/brands/actions.ts` - brand source mutations.
- `apps/web/app/admin/brands/page.tsx` - brand source management UI.
- `apps/web/app/admin/pipeline/page.tsx` - ensure initial stage/status supports awaiting brand/imported extraction controls.
- `apps/web/components/admin/pipeline/PipelineClient.tsx` - brand assignment and approved extraction UI.
- `apps/web/app/api/admin/pipeline/official-brand/*/route.ts` - deprecate old URL-candidate APIs.
- `apps/web/app/admin/pipeline/official-brand/page.tsx` - hide/deprecate old official-brand workspace.
- `apps/web/app/api/admin/enrichment/sources/route.ts` - disable open-web source discovery.
- `apps/web/lib/enrichment/contracts.ts` - optional approved-source evidence fields or v2 result contract.
- `apps/web/lib/enrichment/validation.ts` - validate new result fields.
- `apps/web/lib/enrichment/normalize-result.ts` - preserve source evidence in `sources.enriched`.
- `apps/web/app/api/scraper/v1/enrichment-callback/route.ts` - handle approved-source result decisions/policy failures.
- `apps/scraper/core/api_client.py` - parse source plans and credential refs.
- `apps/scraper/daemon.py` - ensure claimed approved-source work passes source plan through to runner job config.
- `apps/scraper/runner/__init__.py` - dispatch `approved_source_extraction` jobs.
- `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py` - source policy validation before/after crawl if reused.
- `apps/scraper/scrapers/product_url_extraction/extractor.py` - source policy validation if existing extractor remains in fallback path.
- `apps/scraper/scrapers/ai_search/enrichment_models.py` - approved-source evidence/result fields.
- Existing tests under `apps/web/__tests__/**` and `apps/scraper/tests/**` - update static/AI-discovery expectations.

## New Files
- `apps/web/lib/approved-sources/types.ts` - shared coordinator source plan types/constants.
- `apps/web/lib/approved-sources/source-plan.ts` - builds per-SKU approved source plans.
- `apps/web/lib/approved-sources/domain-policy.ts` - web-side domain normalization and disallowed-domain checks.
- `apps/web/app/api/admin/brands/[id]/sources/route.ts` - brand source CRUD endpoint.
- `apps/web/__tests__/lib/approved-sources/source-plan.test.ts` - source plan unit tests.
- `apps/scraper/scrapers/approved_sources/__init__.py` - package exports.
- `apps/scraper/scrapers/approved_sources/types.py` - runner source plan models.
- `apps/scraper/scrapers/approved_sources/policy.py` - source and asset domain policy gate.
- `apps/scraper/scrapers/approved_sources/orchestrator.py` - distributor-first extraction orchestration.
- `apps/scraper/scrapers/approved_sources/adapters/base.py` - adapter interface.
- `apps/scraper/scrapers/approved_sources/adapters/official_brand.py` - official brand adapter using Crawl4AI approved domains.
- `apps/scraper/scrapers/approved_sources/adapters/phillips.py` - Phillips Crawl4AI distributor adapter/pilot.
- `apps/scraper/tests/unit/test_approved_source_policy.py` - policy tests.
- `apps/scraper/tests/unit/test_approved_source_orchestrator.py` - orchestration tests.
- `apps/scraper/tests/unit/test_api_client_source_plan.py` - API parsing tests.

## Dependencies
- Task 1 must happen before Tasks 2, 4, 6, 7, 8, and 17.
- Task 2 must happen before TypeScript-heavy coordinator implementation in Tasks 3-11.
- Task 3 must happen before UI/status work in Tasks 4, 8, and 20.
- Task 5 must happen before Tasks 6, 8, 9, 12, and 15.
- Task 6 must happen before extraction job creation in Task 8 and API responses in Task 9.
- Task 7 can start after Tasks 1, 2, and 5, but it does not block a seeded MVP if Task 17 supplies pilot rows.
- Task 8 depends on Tasks 4, 5, and 6.
- Task 9 depends on Task 8 and should be coordinated with runner parser changes in Task 12.
- Tasks 12 and 13 must happen before runner orchestration in Task 14.
- Task 15 should be completed before Task 16 and before runner returns final approved-source results.
- Deprecation Tasks 10 and 20 should happen after the new approved-source path has passing coordinator and runner tests.
- Test Tasks 18 and 19 should be updated alongside the implementation tasks they cover, not left until the end.

## Risks
- **Status vocabulary drift**: Current code has newer 8-stage TypeScript statuses while database types still reference `pipeline_status_five`; verify the live Supabase enum/check constraints before writing the migration.
- **Job-channel ambiguity**: The runner currently has both `/poll`/`scrape_jobs` and `/claim-enrichment`/`enrichment_attempts`. MVP should prefer one durable path for approved extraction, likely `enrichment_jobs`, while keeping poll compatibility minimal.
- **Per-product brand migration**: Existing code stores brand in `consolidated.brand_id` and cohort `brand_id`; making `products_ingestion.brand_id` canonical requires careful sync/backfill to avoid broken finalization/export assumptions.
- **Full replacement is broad**: Disabling official-brand URL candidates and AI discovery before approved-source UI/source rows exist can leave admins unable to enrich products. Gate deprecation behind a passing pilot.
- **Credential model change**: Moving from hard-coded scraper slugs to credential refs must preserve runner authorization and avoid leaking secret names.
- **Phillips adapter complexity**: Auth/session persistence, anti-bot behavior, and deterministic SKU matching may exceed a migration-only MVP. Start with adapter interface + policy tests, then implement Phillips as the first concrete adapter.
- **Image licensing/domain policy**: Many official sites use third-party CDNs. Requiring `asset_domains` may initially drop valid images until sources are configured thoroughly.
- **LLM fallback control**: Existing extraction paths can call LLM fallback internally. The runner policy must gate URL fetches and fallback inputs, not just search targets.
- **Generated type files**: `database.types.ts` and `types/supabase.ts` should be regenerated from Supabase rather than hand-edited when possible.
- **Tests referencing disallowed static scrapers**: Existing tests use `amazon`, `target`, and `walmart` as generic scraper names; update or replace these fixtures to avoid contradicting the new policy.
