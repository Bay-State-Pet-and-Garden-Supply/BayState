# Implementation Plan

## Goal
Simplify the product data ingestion pipeline to the 8-stage internal workflow (`imported → url_review → enriching → processed → merging → reviewing → publishing → failed`), replace legacy collection/recovery flows with one versioned enrichment contract, and reduce schema/worker/UI complexity while preserving consolidation and publishing behavior.

## Assumptions and Naming Notes
- The requested target names are the source of truth for this plan: `enriching`, `processed`, `merging`, `reviewing`, and `publishing` replace older operational names.
- The current repository appears to use `scraped` rather than `x_scraped` in several files. The migration should map both `x_scraped` and `scraped` to `processed` defensively.
- Existing BayState-specific files with legacy terminology map to the requested generic terms as follows:
  - `scrape_quality` / `lib/pipeline/scrape-quality.ts` ≈ `quality_check_results` / `quality-check.ts`
  - `fallback_metadata` / `lib/pipeline/fallback-orchestration.ts` ≈ `recovery_metadata` / `recovery-orchestration.ts`
  - `official_brand_url_candidates` / `lib/official-brand-*` ≈ `discovery_candidates` / `lib/discovery/`
  - `scrape_jobs` / `scrape_job_chunks` ≈ old worker job/chunk tables; replace with `enrichment_jobs` / `enrichment_attempts`.
- Keep old paths alive until Phase 8 deletion to preserve rollback options.
- Use Bun for web checks and pytest/ruff for worker checks.

## Target State

### Persisted statuses
```ts
export const PERSISTED_PIPELINE_STATUSES = [
  "imported",
  "url_review",
  "enriching",
  "processed",
  "merging",
  "reviewing",
  "publishing",
  "failed",
] as const;
```

### State transitions
```ts
export const STATUS_TRANSITIONS = {
  imported: ["url_review", "failed"],
  url_review: ["enriching", "imported", "failed"],
  enriching: ["processed", "url_review", "failed"],
  processed: ["merging", "reviewing", "imported", "failed"],
  merging: ["reviewing", "processed", "failed"],
  reviewing: ["publishing", "processed", "failed"],
  publishing: ["reviewing", "failed"],
  failed: ["imported", "url_review", "enriching"],
} as const;
```

### Admin tabs
`Imported → URL Review → Enriching → Processed → Merging → Reviewing → Publishing → Failed`

## v1 Result TypeScript Contract

Create this as `apps/web/lib/enrichment/contracts.ts` and mirror it in worker-side Pydantic models.

```ts
export type EnrichmentResultStatus = "success" | "partial" | "failed";

export type EnrichmentMode = "structured" | "metadata" | "llm" | "mixed";

export interface EnrichmentResultSourceV1 {
  url: string;
  domain?: string | null;
  label?: string | null;
  target_id?: string | null;
}

export interface EnrichedProductFactsV1 {
  name?: string | null;
  brand?: string | null;
  description?: string | null;
  category?: string | null;
  sku?: string | null;
  weight?: string | null;
  dimensions?: string | null;
  shipping_weight?: string | null;
  image_urls?: string[];
  ingredients?: string | null;
  features?: string[];
  pet_type?: string | null;
  life_stage?: string | null;
  pet_size?: string | null;
  food_form?: string | null;
  flavor?: string | null;
  special_diet?: string[];
  health_feature?: string[];
  packaging_type?: string | null;
  size?: string | null;
  color?: string | null;
}

export interface EnrichmentConfidenceV1 {
  overall: number;
  fields: Record<keyof EnrichedProductFactsV1 | string, number>;
}

export interface EnrichmentValidationV1 {
  sku_match?: boolean;
  warnings?: string[];
  missing_required?: string[];
}

export interface EnrichmentAttemptSummaryV1 {
  mode: EnrichmentMode | string;
  status: EnrichmentResultStatus | string;
  error?: string | null;
}

export interface EnrichmentResultV1 {
  schema_version: "v1";
  sku: string;
  source: EnrichmentResultSourceV1;
  status: EnrichmentResultStatus;
  extracted_at: string;
  model?: string | null;
  mode: EnrichmentMode;
  product: EnrichedProductFactsV1;
  confidence: EnrichmentConfidenceV1;
  validation: EnrichmentValidationV1;
  attempts: EnrichmentAttemptSummaryV1[];
}

export interface NormalizedEnrichedSourceV1 {
  schema_version: "v1";
  source_kind: "enriched";
  title?: string | null;
  name?: string | null;
  brand?: string | null;
  description?: string | null;
  category?: string | null;
  weight?: string | null;
  images?: string[];
  image_urls?: string[];
  url: string;
  confidence_score: number;
  extracted: EnrichedProductFactsV1;
  confidence: EnrichmentConfidenceV1;
  validation: EnrichmentValidationV1;
  attempts: EnrichmentAttemptSummaryV1[];
  model?: string | null;
  mode: EnrichmentMode;
  extracted_at: string;
}
```

## `enrichment_targets` SQL Definition

Create this in the Phase 1 migration and keep it after legacy candidate tables are removed.

```sql
create table if not exists public.enrichment_targets (
  id uuid primary key default gen_random_uuid(),
  sku text not null references public.products_ingestion(sku) on delete cascade,
  url text not null,
  domain text,
  status text not null default 'candidate'
    check (status in ('candidate', 'selected', 'rejected', 'processed', 'failed')),
  selected boolean not null default false,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source text not null default 'manual'
    check (source in ('manual', 'import', 'suggested', 'existing', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sku, url)
);

create index if not exists enrichment_targets_sku_idx
  on public.enrichment_targets (sku);

create index if not exists enrichment_targets_selected_idx
  on public.enrichment_targets (sku, selected)
  where selected = true;

create index if not exists enrichment_targets_status_idx
  on public.enrichment_targets (status);

alter table public.enrichment_targets enable row level security;

create policy "Staff can manage enrichment targets"
  on public.enrichment_targets
  for all
  using (public.is_staff())
  with check (public.is_staff());
```

## Phase 1 — Define Contracts, Statuses, URL Target Storage, and DB Foundation

### Tasks
1. **Add the v1 result contract**
   - File: `apps/web/lib/enrichment/contracts.ts`
   - Changes:
     - Add `EnrichmentResultV1`, `EnrichedProductFactsV1`, confidence/validation/attempt interfaces, and `NormalizedEnrichedSourceV1` from above.
     - Add runtime Zod schema if the project prefers route-level validation in this module; otherwise create `apps/web/lib/enrichment/validation.ts`.
   - Acceptance:
     - TypeScript can import `EnrichmentResultV1` from server routes and tests.

2. **Update existing enrichment types to remove protected fields from enrichment**
   - File: `apps/web/lib/enrichment/types.ts`
   - Changes:
     - Keep `price` and `sku` protected.
     - Remove `stock_status` from `ENRICHABLE_FIELDS`.
     - Add product-fact fields from v1 contract: `shipping_weight`, `image_urls`, `ingredients`, `features`, `pet_type`, `life_stage`, `pet_size`, `food_form`, `flavor`, `special_diet`, `health_feature`, `packaging_type`, `size`, `color`.
     - Update `SourceType` to include `enriched` or replace `scraper | official_brand` with neutral source values.
   - Acceptance:
     - Existing enrichment tests compile with adjusted protected/enrichable expectations.

3. **Create first DB migration with new tables but no destructive drops**
   - File: `apps/web/supabase/migrations/20260514XXXXXX_simplify_pipeline_enrichment_foundation.sql`
   - Changes:
     - Create `enrichment_targets` using the SQL above.
     - Create `enrichment_jobs` and `enrichment_attempts` tables.
     - Add indexes, RLS policies, and helper trigger for `updated_at`.
   - Suggested SQL for job tables:
     ```sql
     create table if not exists public.enrichment_jobs (
       id uuid primary key default gen_random_uuid(),
       status text not null default 'queued'
         check (status in ('queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
       skus text[] not null default '{}',
       total_count integer not null default 0,
       completed_count integer not null default 0,
       failed_count integer not null default 0,
       model text,
       mode text not null default 'mixed'
         check (mode in ('structured', 'metadata', 'llm', 'mixed')),
       config jsonb not null default '{}',
       token_usage jsonb not null default '{}',
       cost_estimate numeric,
       error_message text,
       created_by uuid references auth.users(id),
       claimed_by text,
       lease_token uuid,
       lease_expires_at timestamptz,
       started_at timestamptz,
       completed_at timestamptz,
       created_at timestamptz not null default now(),
       updated_at timestamptz not null default now()
     );

     create index if not exists enrichment_jobs_status_idx
       on public.enrichment_jobs (status, created_at);

     create table if not exists public.enrichment_attempts (
       id uuid primary key default gen_random_uuid(),
       job_id uuid not null references public.enrichment_jobs(id) on delete cascade,
       sku text not null references public.products_ingestion(sku) on delete cascade,
       target_id uuid references public.enrichment_targets(id) on delete set null,
       attempt_number integer not null default 1,
       status text not null default 'queued'
         check (status in ('queued', 'running', 'success', 'partial', 'failed', 'cancelled')),
       mode text not null default 'mixed'
         check (mode in ('structured', 'metadata', 'llm', 'mixed')),
       model text,
       source_url text,
       result jsonb,
       normalized_source jsonb,
       confidence_overall numeric check (confidence_overall is null or (confidence_overall >= 0 and confidence_overall <= 1)),
       field_confidence jsonb not null default '{}',
       validation jsonb not null default '{}',
       retry_count integer not null default 0,
       error_message text,
       started_at timestamptz,
       completed_at timestamptz,
       created_at timestamptz not null default now(),
       updated_at timestamptz not null default now(),
       unique (job_id, sku, attempt_number)
     );

     create index if not exists enrichment_attempts_job_idx
       on public.enrichment_attempts (job_id);
     create index if not exists enrichment_attempts_sku_idx
       on public.enrichment_attempts (sku);
     create index if not exists enrichment_attempts_status_idx
       on public.enrichment_attempts (status, created_at);

     alter table public.enrichment_jobs enable row level security;
     alter table public.enrichment_attempts enable row level security;

     create policy "Staff can manage enrichment jobs"
       on public.enrichment_jobs for all
       using (public.is_staff())
       with check (public.is_staff());

     create policy "Staff can manage enrichment attempts"
       on public.enrichment_attempts for all
       using (public.is_staff())
       with check (public.is_staff());
     ```
   - Acceptance:
     - `supabase db reset` or migration tests can create the new tables.

4. **Add type generation/update step to the implementation checklist**
   - File: `apps/web/types/supabase.ts`
   - Changes:
     - Regenerate after migrations rather than hand-editing.
   - Acceptance:
     - New tables and enum statuses are represented in generated types.

### Test Implications
- Add unit tests for `EnrichmentResultV1` validation fixtures:
  - New: `apps/web/__tests__/lib/enrichment/contracts.test.ts`
- Update existing tests:
  - `apps/web/__tests__/app/api/admin/enrichment/jobs-route.test.ts`
  - `apps/web/lib/pipeline/types.test.ts`

### Rollback Strategy
- This phase is additive. Roll back by dropping `enrichment_targets`, `enrichment_jobs`, `enrichment_attempts`, and new contract files.
- Do not drop or mutate old tables in this phase.

### Dependencies
- None. This is the foundation for every later phase.

## Phase 2 — Restore/Promote URL Review and Enriching UI from Git History

### Tasks
1. **Restore URL Review workspace as a first-class tab**
   - File: `apps/web/components/admin/pipeline/UrlReviewWorkspace.tsx`
   - Changes:
     - If missing or stale, restore from git history.
     - Change data source from old candidate table to `enrichment_targets`.
     - Add actions to add URL, select URL(s), reject URL, and send selected SKUs to `enriching`.
   - Acceptance:
     - URL Review tab loads selected/candidate targets for SKUs with status `url_review`.

2. **Restore/repurpose candidate picker**
   - File: `apps/web/components/admin/pipeline/CandidateUrlPicker.tsx`
   - Changes:
     - Replace legacy discovery candidate props with `enrichment_targets` rows.
     - Support `source`, `confidence`, `selected`, and `status` fields.
   - Acceptance:
     - Unit tests can select/reject a target without referencing old discovery tables.

3. **Add Enriching operational tab**
   - File: `apps/web/components/admin/pipeline/ActiveRunsTab.tsx`
   - Preferred rename/new file: `apps/web/components/admin/pipeline/ActiveEnrichmentsTab.tsx`
   - Changes:
     - Display `enrichment_jobs` and `enrichment_attempts` instead of old job/chunk tables.
     - Show queued/running/completed/failed counts, model, mode, average confidence, retry counts.
   - Acceptance:
     - Enriching tab displays active enrichment jobs and no longer requires old job tables.

4. **Rename Processed results view**
   - Existing file: `apps/web/components/admin/pipeline/ScrapedResultsView.tsx`
   - New file: `apps/web/components/admin/pipeline/ProcessedResultsView.tsx`
   - Changes:
     - Rename component/export and update copy from Scraped/Scrape to Processed/Enriched.
     - Read `sources.enriched` and display normalized aliases plus nested extracted facts/confidence.
   - Acceptance:
     - Processed tab shows v1 result data and can initiate merging.

5. **Update pipeline shell to include new tabs**
   - Files:
     - `apps/web/components/admin/pipeline/PipelineClient.tsx`
     - `apps/web/components/admin/pipeline/StageTabs.tsx`
     - `apps/web/components/admin/pipeline/StatusBadge.tsx`
     - `apps/web/components/admin/pipeline/PipelineStats.tsx`
     - `apps/web/app/admin/pipeline/page.tsx`
   - Changes:
     - Add tab rendering for `url_review`, `enriching`, `processed`, `merging`, `reviewing`, `publishing`.
     - Keep search/filter state in URL and clear stage-specific filters on stage changes.
     - Update stage descriptions and colors.
   - Acceptance:
     - Admin pipeline route renders all 8 target tabs.

### Test Implications
- Update:
  - `apps/web/__tests__/components/admin/pipeline/StageTabs.test.tsx`
  - `apps/web/__tests__/components/admin/pipeline/PipelineClient.operational-tabs.test.tsx`
  - `apps/web/__tests__/components/admin/pipeline/ScrapedResultsView.test.tsx` → rename to `ProcessedResultsView.test.tsx`
  - `apps/web/__tests__/app/admin/pipeline/page.test.tsx`
- Add tests for `UrlReviewWorkspace` using `enrichment_targets` fixtures.

### Rollback Strategy
- Keep old components available until Phase 8.
- If UI rollout fails, feature flag `PIPELINE_SIMPLIFIED_UI=false` can keep rendering the old tab array while DB tables remain additive.

### Dependencies
- Depends on Phase 1 tables and types.

## Phase 3 — Add Enrichment API v2 Beside Old Paths

### Tasks
1. **Rewrite admin job creation endpoint**
   - File: `apps/web/app/api/admin/enrichment/jobs/route.ts`
   - Changes:
     - Stop calling `scrapeProducts` from `apps/web/lib/pipeline-scraping.ts`.
     - Accept `{ skus, targetIds?, mode?, model?, config? }`.
     - Validate SKUs exist in `products_ingestion`.
     - Create an `enrichment_jobs` row and one `enrichment_attempts` row per SKU/selected target.
     - Transition products from `url_review` to `enriching`.
   - Acceptance:
     - POST returns `{ success, jobId, skuCount, attemptCount }`.

2. **Create worker claim endpoint for enrichment work**
   - New file: `apps/web/app/api/scraper/v1/claim-enrichment/route.ts`
   - Changes:
     - Authenticate with existing runner API key validation.
     - Atomically claim queued `enrichment_attempts` and mark job/attempt running.
     - Return job config, SKU, selected target URL, model/mode, lease token.
   - Acceptance:
     - Worker can claim one or more attempts without old chunk tables.

3. **Create v2 callback endpoint**
   - New file: `apps/web/app/api/scraper/v1/enrichment-callback/route.ts`
   - Changes:
     - Authenticate with existing runner API key validation.
     - Parse and validate `EnrichmentResultV1` payload.
     - Normalize into `sources.enriched` shape.
     - Write raw result to `enrichment_attempts.result` and normalized object to `enrichment_attempts.normalized_source`.
     - Merge normalized object into `products_ingestion.sources.enriched`.
     - Update product status:
       - `success` or high-confidence `partial` → `processed`
       - failed/low confidence with more URLs available → `url_review`
       - failed/low confidence with retry budget → `enriching`
       - exhausted → `failed`
     - Update `enrichment_jobs` counters and terminal status.
   - Acceptance:
     - Callback fixture persists v1 result and moves product to correct next status.

4. **Add normalization utility**
   - New file: `apps/web/lib/enrichment/normalize-result.ts`
   - Changes:
     - Export `normalizeEnrichmentResultForSources(result: EnrichmentResultV1): NormalizedEnrichedSourceV1`.
     - Map `product.name` to both `title` and `name`.
     - Map `product.image_urls` to both `images` and `image_urls`.
     - Preserve nested `extracted`, `confidence`, `validation`, `attempts`.
   - Acceptance:
     - Unit tests prove backward-compatible aliases exist.

5. **Keep old callback route temporarily**
   - File: `apps/web/app/api/scraper/v1/chunk-callback/route.ts`
   - Changes:
     - No destructive edits yet.
     - Optionally add deprecation log if old job kind is received after feature flag cutover.
   - Acceptance:
     - Old tests still pass until Phase 8.

### Test Implications
- Add:
  - `apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts`
  - `apps/web/__tests__/app/api/scraper/v1/claim-enrichment-route.test.ts`
  - `apps/web/__tests__/lib/enrichment/normalize-result.test.ts`
- Update:
  - `apps/web/__tests__/app/api/admin/enrichment/jobs-route.test.ts`
  - `apps/web/__tests__/api/admin/pipeline/active-runs.test.ts` or rename to `active-enrichments.test.ts`.

### Rollback Strategy
- Disable admin job route via feature flag.
- Worker can continue using old claim/callback routes because they are not deleted yet.
- Revert product statuses from `enriching` back to `url_review` for queued jobs if needed.

### Dependencies
- Depends on Phases 1 and 2.

## Phase 4 — Slim Worker to One Enrichment Job Kind

### Tasks
1. **Add worker-side v1 models**
   - New file: `apps/scraper/scrapers/ai_search/enrichment_models.py`
   - Changes:
     - Pydantic models mirroring `EnrichmentResultV1`.
     - Explicitly exclude price, stock status, manufacturer part number, and product line.
   - Acceptance:
     - `pytest tests/unit/test_enrichment_models.py` validates fixtures.

2. **Create enrichment worker execution path**
   - Files:
     - `apps/scraper/runner/__init__.py`
     - `apps/scraper/runner/chunk_mode.py`
     - `apps/scraper/daemon.py`
     - `apps/scraper/core/api_client.py`
   - Changes:
     - Add mode/job kind for `enrichment` attempts.
     - Claim via `/api/scraper/v1/claim-enrichment`.
     - Execute one selected target URL through the existing core engine and AI pipeline.
     - POST v1 result to `/api/scraper/v1/enrichment-callback`.
   - Acceptance:
     - Local worker can process a fixture attempt end-to-end without YAML config input.

3. **Keep core engine/runtime, remove workflow config dependency from new path**
   - Keep:
     - `apps/scraper/src/crawl4ai_engine/`
     - `apps/scraper/scrapers/ai_search/`
     - `apps/scraper/scrapers/product_url_extraction/`
     - `apps/scraper/core/api_client.py`
     - `apps/scraper/core/retry_executor.py`
     - `apps/scraper/core/failure_classifier.py`
     - `apps/scraper/utils/logger.py`
     - `apps/scraper/utils/sentry.py`
   - Changes:
     - Do not require `ScraperConfigModel` or YAML configs for enrichment job kind.
     - Preserve browser/rendering support used internally by the core engine if needed.
   - Acceptance:
     - Enrichment path imports no modules from `scrapers/actions/handlers` or `scrapers/executor`.

4. **Add local CLI for enrichment attempt fixture**
   - File: `apps/scraper/runner/cli.py`
   - Changes:
     - Add `--mode enrichment --sku <sku> --url <url>` or equivalent dev command.
     - Output v1 JSON result to stdout in local mode.
   - Acceptance:
     - Developer can run one SKU/URL fixture locally.

### Test Implications
- Add:
  - `apps/scraper/tests/unit/runner/test_enrichment_mode.py`
  - `apps/scraper/tests/unit/test_enrichment_models.py`
  - `apps/scraper/tests/integration/test_enrichment_callback_flow.py` with mocked coordinator.
- Update:
  - `apps/scraper/tests/test_runner_entrypoints.py`
  - `apps/scraper/tests/unit/test_api_client.py`
- Keep legacy handler/executor tests until Phase 8 deletion.

### Rollback Strategy
- Worker can switch back to old polling mode because old routes are still present.
- Keep Docker image with old worker tag until v2 path is validated.

### Dependencies
- Depends on Phase 3 API endpoints.

## Phase 5 — Normalize v1 Results into `sources.enriched` and Stabilize Consolidation Inputs

### Tasks
1. **Normalize persisted sources**
   - File: `apps/web/lib/enrichment/normalize-result.ts`
   - Changes:
     - Ensure normalized source shape matches what existing consolidation expects: `title/name`, `brand`, `description`, `category`, `weight`, `images`, `url`, `confidence_score`.
   - Acceptance:
     - `sources.enriched` can be passed through existing prompt source filtering without loss.

2. **Update product source helpers**
   - Files:
     - `apps/web/lib/product-sources.ts`
     - `apps/web/lib/scraper-callback/products-ingestion.ts`
   - Changes:
     - Treat `enriched` as a meaningful source kind.
     - Preserve nested extracted facts and confidence objects.
     - Do not strip optional product fact fields.
   - Acceptance:
     - Unit tests show enriched source survives merge/filter operations.

3. **Simplify consolidation prompt source ranking**
   - File: `apps/web/lib/consolidation/prompt-builder.ts`
   - Changes:
     - Remove hard assumptions about static/discovery source trust levels.
     - Rank `sources.enriched` as primary evidence.
     - Keep `shopsite_input` or imported input as canonical for protected fields where relevant.
   - Acceptance:
     - Prompt builder tests include enriched fixture and do not reference removed source kinds.

4. **Keep consolidation submit route stable but update status filter**
   - File: `apps/web/app/api/admin/consolidation/submit/route.ts`
   - Changes:
     - Accept products in `processed` instead of old processed-equivalent status.
     - Transition submitted products to `merging` instead of old merge-equivalent status.
   - Acceptance:
     - Existing consolidation batch creation still works with status rename.

5. **Update apply-results status transition**
   - File: `apps/web/lib/consolidation/batch-service.ts`
   - Changes:
     - When applying consolidation results, move products from `merging` to `reviewing`.
     - Replace old status strings in recovery/return paths with `processed` and `reviewing`.
   - Acceptance:
     - Batch service tests pass with new status names.

### Test Implications
- Update:
  - `apps/web/__tests__/lib/consolidation/batch-service.test.ts`
  - `apps/web/lib/consolidation/__tests__/prompt-builder.test.ts` if present
  - `apps/web/__tests__/app/api/admin/consolidation/*.test.ts`
- Add enriched source fixture used by prompt builder and batch service tests.

### Rollback Strategy
- Keep old source aliases in normalized object.
- If consolidation fails, manually reset affected products from `merging` to `processed` and disable v2 job creation.

### Dependencies
- Depends on Phase 3 callback/normalization and Phase 4 worker output.

## Phase 6 — Switch Pipeline Tabs, Status Constants, Queries, and State Machine

### Tasks
1. **Rewrite pipeline status constants and stage config**
   - File: `apps/web/lib/pipeline/types.ts`
   - Changes:
     - Replace old status array with target 8 statuses.
     - Set `PIPELINE_TABS` equal to target 8 statuses.
     - Remove fallback/derived operational status arrays.
     - Update `STAGE_CONFIG` labels/descriptions/colors.
     - Update `PipelineProduct.pipeline_status` type.
   - Acceptance:
     - Type tests expect only target statuses.

2. **Rewrite state transitions**
   - File: `apps/web/lib/pipeline/core.ts`
   - Changes:
     - Use transition map shown in Target State.
     - Allow `any → failed` either explicitly in map or via helper logic.
   - Acceptance:
     - Transition tests cover happy path and failed recovery paths.

3. **Update tab derivation and active job lookups**
   - File: `apps/web/lib/pipeline/derivation.ts`
   - Changes:
     - `WORKFLOW_PIPELINE_TABS` target 8 statuses.
     - Replace `scraping` active job concept with `enriching`.
     - Query `enrichment_jobs` / `enrichment_attempts` instead of `scrape_jobs` / `scrape_job_chunks`.
   - Acceptance:
     - Derivation tests map every status to itself.

4. **Update run types**
   - File: `apps/web/lib/pipeline/run-types.ts`
   - Changes:
     - Remove `serp_search` and `page_scrape` kinds.
     - Add `enrichment` kind.
     - Labels: `enrichment: "Product Enrichment"`, `consolidation: "Product Merging"`, `apply_results: "Apply Merge Results"`.
   - Acceptance:
     - Run type tests reflect new labels and no legacy run kinds.

5. **Update pipeline data queries**
   - Files:
     - `apps/web/lib/pipeline.ts`
     - `apps/web/lib/pipeline/queries.ts`
     - `apps/web/app/api/admin/pipeline/route.ts`
     - `apps/web/app/api/admin/pipeline/counts/route.ts`
     - `apps/web/app/api/admin/pipeline/bulk/route.ts`
     - `apps/web/app/api/admin/pipeline/transition/route.ts`
     - `apps/web/app/api/admin/pipeline/status-compat.ts`
   - Changes:
     - Query/count the target statuses only.
     - Validate bulk/transition targets against target statuses.
     - Remove compatibility shims for `published`, `finalized`, old fallback statuses after migration is complete.
   - Acceptance:
     - API route tests use target statuses and counts.

6. **Update reviewing/publishing code paths**
   - Files:
     - `apps/web/components/admin/pipeline/FinalizingResultsView.tsx` → either rename to `ReviewingResultsView.tsx` or keep filename with new copy.
     - `apps/web/lib/pipeline/publish.ts`
     - `apps/web/app/api/admin/pipeline/publish/route.ts`
     - `apps/web/app/admin/pipeline/export/page.tsx`
   - Changes:
     - Status `reviewing` replaces old review/finalization status.
     - Status `publishing` replaces old export status.
     - Publishing logic itself remains unchanged.
   - Acceptance:
     - Publish tests pass with new status names.

### Test Implications
- Update:
  - `apps/web/lib/pipeline/core.test.ts`
  - `apps/web/lib/pipeline/types.test.ts`
  - `apps/web/lib/pipeline/derivation.test.ts`
  - `apps/web/lib/pipeline/queries.test.ts`
  - `apps/web/__tests__/lib/pipeline-status-validation.test.ts`
  - `apps/web/__tests__/lib/pipeline-transition.test.ts`
  - `apps/web/__tests__/lib/pipeline.test.ts`
  - `apps/web/__tests__/app/api/admin/pipeline/route.test.ts`
  - `apps/web/__tests__/app/api/admin/pipeline/publish-route.test.ts`
  - `apps/web/__tests__/api/admin/pipeline/export-route.test.ts`

### Rollback Strategy
- Keep DB migration from Phase 7 separate from code merge if possible.
- If code deploy fails before DB migration, revert application commit and leave additive tables intact.
- If DB migration already ran, use the down-mapping SQL from Phase 7 rollback.

### Dependencies
- Depends on Phase 5 so `processed` products can feed merging correctly.

## Phase 7 — Run DB Migration: Enum, New Statuses, Column Drops, and Legacy Table Safety

### Tasks
1. **Create enum/status migration**
   - File: `apps/web/supabase/migrations/20260514XXXXXX_pipeline_status_simplification.sql`
   - Changes:
     - Create new enum type.
     - Map old statuses into new statuses.
     - Alter `products_ingestion.pipeline_status` to new enum.
     - Rename/drop old enum type only after dependencies are cleared.
   - SQL skeleton:
     ```sql
     begin;

     alter table public.products_ingestion
       alter column pipeline_status drop default;

     create type public.pipeline_status_simplified as enum (
       'imported',
       'url_review',
       'enriching',
       'processed',
       'merging',
       'reviewing',
       'publishing',
       'failed'
     );

     alter table public.products_ingestion
       alter column pipeline_status type public.pipeline_status_simplified
       using (
         case pipeline_status::text
           when 'imported' then 'imported'
           when 'searching' then 'url_review'
           when 'url_review' then 'url_review'
           when 'extracting' then 'enriching'
           when 'scraping' then 'enriching'
           when 'needs_fallback_review' then 'url_review'
           when 'x_scraped' then 'processed'
           when 'scraped' then 'processed'
           when 'consolidating' then 'merging'
           when 'finalizing' then 'reviewing'
           when 'exporting' then 'publishing'
           when 'failed' then 'failed'
           else 'failed'
         end
       )::public.pipeline_status_simplified;

     alter table public.products_ingestion
       alter column pipeline_status set default 'imported'::public.pipeline_status_simplified;

     -- Drop old check constraints if they exist; names vary across migrations.
     do $$
     declare
       constraint_name text;
     begin
       for constraint_name in
         select conname
         from pg_constraint
         where conrelid = 'public.products_ingestion'::regclass
           and conname like '%pipeline_status%check%'
       loop
         execute format('alter table public.products_ingestion drop constraint if exists %I', constraint_name);
       end loop;
     end $$;

     -- Keep old enum renamed until generated types and dependent objects are verified.
     do $$
     begin
       if exists (select 1 from pg_type where typname = 'pipeline_status_five') then
         alter type public.pipeline_status_five rename to pipeline_status_five_legacy;
       end if;
     exception when duplicate_object then
       -- already renamed
       null;
     end $$;

     alter type public.pipeline_status_simplified rename to pipeline_status_five;

     commit;
     ```
   - Acceptance:
     - All `products_ingestion` rows have one of the 8 target statuses.

2. **Drop obsolete columns safely**
   - File: same migration or separate `20260514XXXXXX_drop_legacy_pipeline_columns.sql`
   - Changes:
     - For the generic request, drop `quality_check_results`, `recovery_metadata` if present.
     - For the current repo, drop `scrape_quality`, `fallback_metadata` if present.
   - SQL:
     ```sql
     alter table public.products_ingestion
       drop column if exists quality_check_results,
       drop column if exists recovery_metadata,
       drop column if exists scrape_quality,
       drop column if exists fallback_metadata;
     ```
   - Acceptance:
     - Generated types no longer include these columns.

3. **Retire auxiliary candidate table after data migration**
   - Old table: `public.discovery_candidates` or current `public.official_brand_url_candidates`
   - New table: `public.enrichment_targets`
   - Changes:
     - Backfill old candidate rows into `enrichment_targets` before drop.
     - Drop old table only after verification.
   - SQL skeleton:
     ```sql
     insert into public.enrichment_targets (sku, url, domain, status, selected, confidence, source, created_at, updated_at)
     select
       sku,
       url,
       domain,
       case when coalesce(selected, false) then 'selected' else 'candidate' end,
       coalesce(selected, false),
       confidence,
       'existing',
       coalesce(created_at, now()),
       coalesce(updated_at, now())
     from public.official_brand_url_candidates
     on conflict (sku, url) do update set
       selected = excluded.selected,
       confidence = excluded.confidence,
       updated_at = now();

     drop table if exists public.discovery_candidates;
     drop table if exists public.official_brand_url_candidates;
     ```
   - Acceptance:
     - URL Review still has targets after legacy table removal.

4. **Regenerate Supabase types**
   - File: `apps/web/types/supabase.ts`
   - Changes:
     - Regenerate from DB.
   - Acceptance:
     - TypeScript references new enum/tables and no dropped columns.

### Test Implications
- Update migration tests:
  - `apps/scraper/tests/test_database_migration.py` if it references old job/status schema.
  - Add web migration verification test if project has a migration test harness.
- Run focused web tests after generated types update.

### Rollback Strategy
- Pre-migration backup:
  - Snapshot `products_ingestion` statuses.
  - Copy legacy candidate table to backup if it will be dropped.
- Down-mapping if rollback needed:
  - `processed -> scraped` (or `x_scraped` if that is the target rollback value)
  - `enriching -> scraping`
  - `merging -> consolidating`
  - `reviewing -> finalizing`
  - `publishing -> exporting`
  - `url_review -> url_review`
- Dropped columns cannot be recovered unless backed up; prefer delaying destructive column drops until after one stable deployment if operational risk is high.

### Dependencies
- Depends on Phases 1 through 6.
- Must coordinate deploy window because enum migration and generated types must match application code.

## Phase 8 — Remove Legacy Modules, Routes, Worker Configs, and Dead Tests

### Tasks
1. **Delete legacy web modules**
   - Remove:
     - `apps/web/lib/pipeline/scrape-quality.ts` (or requested `lib/pipeline/quality-check.ts` if present)
     - `apps/web/lib/pipeline/fallback-orchestration.ts` (or requested `recovery-orchestration.ts` if present)
     - `apps/web/lib/official-brand-discovery.ts`
     - `apps/web/lib/official-brand-review-types.ts`
     - `apps/web/lib/official-brand-review.ts`
     - `apps/web/lib/official-brand-scoring.ts`
     - `apps/web/lib/official-brand-workflow.ts`
     - `apps/web/lib/scraper-callback/official-brand-validation.ts`
     - `apps/web/lib/discovery/` if present
   - Acceptance:
     - `grep` finds no imports of deleted modules.

2. **Delete legacy web routes**
   - Remove:
     - `apps/web/app/api/admin/pipeline/fallback/route.ts`
     - `apps/web/app/api/admin/pipeline/official-brand/`
     - `apps/web/app/admin/pipeline/official-brand/`
     - `apps/web/app/api/admin/pipeline/scrape/route.ts` if fully replaced by `app/api/admin/enrichment/jobs/route.ts`
     - `apps/web/app/api/admin/pipeline/scrapers/route.ts` if no longer needed in pipeline UI
     - Requested generic paths if present: `app/api/admin/pipeline/recovery/route.ts`, `app/api/admin/pipeline/discovery/`
   - Acceptance:
     - Next.js build has no route conflicts and no imports of deleted route helpers.

3. **Delete/rename legacy UI components**
   - Remove:
     - `apps/web/components/admin/pipeline/FallbackReviewView.tsx`
     - `apps/web/components/admin/pipeline/SearchingTab.tsx`
     - Requested generic files if present: `RecoveryView.tsx`, `DiscoveryTab.tsx`
   - Rename or replace:
     - `ScrapedResultsView.tsx` → `ProcessedResultsView.tsx`
     - `ActiveRunsTab.tsx` → `ActiveEnrichmentsTab.tsx` if no other run types remain.
   - Acceptance:
     - Component tests import only new component names.

4. **Delete legacy worker configuration/executor code after v2 worker is stable**
   - Remove:
     - `apps/scraper/scrapers/configs/*.yaml`
     - `apps/scraper/scrapers/actions/handlers/`
     - `apps/scraper/scrapers/actions/registry.py` if no remaining action path uses it
     - `apps/scraper/scrapers/actions/base.py` if no remaining action path uses it
     - `apps/scraper/scrapers/executor/`
     - `apps/scraper/scrapers/parser/`
     - `apps/scraper/scrapers/config_validation.py`
     - `apps/scraper/scrapers/result_collector.py`
     - `apps/scraper/scrapers/sku_loader.py`
     - `apps/scraper/scrapers/pricing_loader.py`
     - `apps/scraper/scrapers/selector_storage.py`
     - `apps/scraper/core/anti_detection_manager.py` only if no retained engine imports it
     - `apps/scraper/scrapers/actions/handlers/ocr.py`
   - Keep:
     - `apps/scraper/src/crawl4ai_engine/`
     - `apps/scraper/scrapers/ai_search/`
     - `apps/scraper/scrapers/product_url_extraction/`
     - `apps/scraper/scrapers/providers/`
     - `apps/scraper/core/api_client.py`
     - `apps/scraper/core/retry_executor.py`
     - `apps/scraper/core/failure_classifier.py`
     - `apps/scraper/core/adaptive_retry_strategy.py`
     - `apps/scraper/core/version.py`
     - `apps/scraper/utils/`
     - `apps/scraper/runner/`
   - Acceptance:
     - Worker tests pass without YAML config fixtures.

5. **Remove or rewrite legacy tests**
   - Remove/replace web tests:
     - `apps/web/__tests__/lib/pipeline-scrape-quality.test.ts`
     - `apps/web/__tests__/lib/pipeline-scraping.test.ts`
     - `apps/web/__tests__/app/api/admin/pipeline/scrape-route.test.ts`
     - Official-brand/fallback route/component tests if present.
   - Remove/replace worker tests:
     - `apps/scraper/tests/test_action_registry.py`
     - `apps/scraper/tests/test_config_validation.py`
     - `apps/scraper/tests/test_workflow_executor.py`
     - `apps/scraper/tests/test_ocr_action.py`
     - handler/config-selector-specific tests under `apps/scraper/tests/unit/`.
   - Acceptance:
     - Test suite no longer references deleted modules.

### Test Implications
- This is the largest test churn phase.
- Prefer delete tests only after replacement v2 route/contract/worker tests exist.

### Rollback Strategy
- Do not start Phase 8 until at least one successful deploy with Phases 1–7.
- Keep a git tag before deletion.
- If deletion causes regressions, revert Phase 8 commit only; DB remains on new model.

### Dependencies
- Depends on successful Phase 7 DB/application cutover.

## Phase 9 — Add Cost, Confidence, and Operational Monitoring

### Tasks
1. **Add confidence summary helpers**
   - New file: `apps/web/lib/enrichment/metrics.ts`
   - Changes:
     - Compute average confidence, low-confidence field counts, success/partial/failure rates, retry rates.
   - Acceptance:
     - Unit tests cover metrics for mixed attempt statuses.

2. **Add admin monitoring UI**
   - Files:
     - `apps/web/components/admin/pipeline/ActiveEnrichmentsTab.tsx`
     - `apps/web/app/admin/pipeline/monitoring/page.tsx`
     - `apps/web/components/admin/pipeline/HealthOverview.tsx`
   - Changes:
     - Show cost estimate, token usage, average confidence, failed attempts, retry counts, slow domains.
   - Acceptance:
     - Admin can identify low-confidence and expensive jobs.

3. **Add API summaries**
   - New or modified files:
     - `apps/web/app/api/admin/pipeline/active-runs/route.ts` → adapt to enrichment jobs or rename route after UI update.
     - `apps/web/app/api/admin/enrichment/jobs/route.ts` GET handler for summaries.
   - Changes:
     - Return active/recent `enrichment_jobs` with attempt aggregates.
   - Acceptance:
     - UI polling uses new job tables only.

4. **Add worker metrics fields**
   - Files:
     - `apps/scraper/src/crawl4ai_engine/metrics.py`
     - `apps/scraper/core/api_client.py`
     - `apps/scraper/runner/__init__.py`
   - Changes:
     - Include model, mode, token usage, elapsed time, retry count, confidence in callback payload.
   - Acceptance:
     - Metrics appear in `enrichment_jobs.token_usage`, `cost_estimate`, and attempts.

### Test Implications
- Add:
  - `apps/web/__tests__/lib/enrichment/metrics.test.ts`
  - `apps/web/__tests__/api/admin/pipeline/active-enrichments.test.ts`
- Update existing monitoring/health card tests.

### Rollback Strategy
- Monitoring is additive. Hide dashboards behind feature flag if performance issues occur.
- Keep raw attempt data even if dashboard is rolled back.

### Dependencies
- Depends on Phases 3–7 for populated enrichment job data.

## Files to Modify

### Web app core pipeline
- `apps/web/lib/pipeline/types.ts` — target statuses, tabs, stage config, product status types.
- `apps/web/lib/pipeline/core.ts` — target state transitions.
- `apps/web/lib/pipeline/derivation.ts` — target tab derivation and active enrichment lookup.
- `apps/web/lib/pipeline/run-types.ts` — replace old run kinds with `enrichment`.
- `apps/web/lib/pipeline.ts` — stage queries, status counts, bulk helper status handling.
- `apps/web/lib/pipeline/queries.ts` — query target statuses and new stage filters.
- `apps/web/lib/pipeline/publish.ts` — rename reviewing/publishing statuses without changing publishing behavior.
- `apps/web/lib/consolidation/prompt-builder.ts` — rank `sources.enriched` and remove old source assumptions.
- `apps/web/lib/consolidation/batch-service.ts` — status transitions from processed→merging→reviewing.
- `apps/web/lib/product-sources.ts` — preserve/recognize `sources.enriched`.
- `apps/web/lib/scraper-callback/products-ingestion.ts` — merge normalized enriched source if retained for shared persistence.
- `apps/web/lib/enrichment/types.ts` — update enrichable/protected fields.

### Web app API routes
- `apps/web/app/api/admin/enrichment/jobs/route.ts` — create `enrichment_jobs`/`enrichment_attempts` instead of old job type.
- `apps/web/app/api/scraper/v1/claim-enrichment/route.ts` — new worker claim endpoint.
- `apps/web/app/api/scraper/v1/enrichment-callback/route.ts` — new v2 result callback.
- `apps/web/app/api/admin/pipeline/route.ts` — status validation/query changes.
- `apps/web/app/api/admin/pipeline/counts/route.ts` — new status counts.
- `apps/web/app/api/admin/pipeline/bulk/route.ts` — target status validation.
- `apps/web/app/api/admin/pipeline/transition/route.ts` — target transition validation.
- `apps/web/app/api/admin/pipeline/active-runs/route.ts` — use enrichment job tables or rename route.
- `apps/web/app/api/admin/consolidation/submit/route.ts` — accept `processed`, transition to `merging`.
- `apps/web/app/api/admin/pipeline/publish/route.ts` — accept `reviewing`, transition to `publishing` as needed.

### Web app UI
- `apps/web/app/admin/pipeline/page.tsx` — initial fetches/counts for new tabs.
- `apps/web/components/admin/pipeline/PipelineClient.tsx` — render new tab set/workspaces.
- `apps/web/components/admin/pipeline/StageTabs.tsx` — 8 tabs.
- `apps/web/components/admin/pipeline/StatusBadge.tsx` — new status labels/colors.
- `apps/web/components/admin/pipeline/PipelineStats.tsx` — new counts.
- `apps/web/components/admin/pipeline/UrlReviewWorkspace.tsx` — top-level URL Review using `enrichment_targets`.
- `apps/web/components/admin/pipeline/CandidateUrlPicker.tsx` — `enrichment_targets` data model.
- `apps/web/components/admin/pipeline/ActiveRunsTab.tsx` — replace/rename to active enrichments.
- `apps/web/components/admin/pipeline/ScrapedResultsView.tsx` — rename/replace with processed results view.
- `apps/web/components/admin/pipeline/FinalizingResultsView.tsx` — update copy/statuses to reviewing.
- `apps/web/components/admin/pipeline/PipelineActions.tsx` — action names/status targets.
- `apps/web/components/admin/pipeline/PipelineProductCard.tsx` and related product table/detail components — display new stage labels.

### Worker
- `apps/scraper/core/api_client.py` — claim/callback methods for enrichment v2.
- `apps/scraper/daemon.py` — claim enrichment attempts before/after legacy work depending rollout.
- `apps/scraper/runner/__init__.py` — enrichment execution mode.
- `apps/scraper/runner/cli.py` — local enrichment run mode.
- `apps/scraper/runner/chunk_mode.py` — replace old chunk mode in new path or add enrichment loop.
- `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py` — emit v1 product facts/confidence.
- `apps/scraper/scrapers/product_url_extraction/extractor.py` — align output to v1 contract.
- `apps/scraper/scrapers/ai_search/llm_runtime.py` — model/mode metadata in output.
- `apps/scraper/src/crawl4ai_engine/metrics.py` — token/cost/latency metrics.

### DB/generated types
- `apps/web/supabase/migrations/20260514XXXXXX_simplify_pipeline_enrichment_foundation.sql` — new tables.
- `apps/web/supabase/migrations/20260514XXXXXX_pipeline_status_simplification.sql` — enum/data/drop migration.
- `apps/web/types/supabase.ts` — regenerate after migrations.

## New Files
- `apps/web/lib/enrichment/contracts.ts` — v1 TypeScript result contract.
- `apps/web/lib/enrichment/validation.ts` — optional Zod schemas for v1 payload validation.
- `apps/web/lib/enrichment/normalize-result.ts` — normalize v1 result into `sources.enriched`.
- `apps/web/lib/enrichment/metrics.ts` — confidence/cost metrics helpers.
- `apps/web/app/api/scraper/v1/claim-enrichment/route.ts` — worker claim endpoint.
- `apps/web/app/api/scraper/v1/enrichment-callback/route.ts` — v2 callback endpoint.
- `apps/web/components/admin/pipeline/ProcessedResultsView.tsx` — processed results workspace.
- `apps/web/components/admin/pipeline/ActiveEnrichmentsTab.tsx` — operational enrichment monitoring.
- `apps/scraper/scrapers/ai_search/enrichment_models.py` — worker Pydantic v1 contract.
- `apps/scraper/tests/unit/runner/test_enrichment_mode.py` — worker mode tests.
- `apps/scraper/tests/unit/test_enrichment_models.py` — worker contract tests.

## Files to Delete in Phase 8

### Web app
- `apps/web/lib/pipeline/scrape-quality.ts`
- `apps/web/lib/pipeline/fallback-orchestration.ts`
- `apps/web/lib/official-brand-discovery.ts`
- `apps/web/lib/official-brand-review-types.ts`
- `apps/web/lib/official-brand-review.ts`
- `apps/web/lib/official-brand-scoring.ts`
- `apps/web/lib/official-brand-workflow.ts`
- `apps/web/lib/scraper-callback/official-brand-validation.ts`
- `apps/web/app/api/admin/pipeline/fallback/route.ts`
- `apps/web/app/api/admin/pipeline/official-brand/`
- `apps/web/app/admin/pipeline/official-brand/`
- `apps/web/components/admin/pipeline/FallbackReviewView.tsx`
- `apps/web/components/admin/pipeline/SearchingTab.tsx`
- If present under generic names: `apps/web/lib/pipeline/quality-check.ts`, `apps/web/lib/pipeline/recovery-orchestration.ts`, `apps/web/lib/discovery/`, `apps/web/app/api/admin/pipeline/recovery/route.ts`, `apps/web/app/api/admin/pipeline/discovery/`, `RecoveryView.tsx`, `DiscoveryTab.tsx`.

### Worker
- `apps/scraper/scrapers/configs/*.yaml`
- `apps/scraper/scrapers/actions/handlers/`
- `apps/scraper/scrapers/executor/`
- `apps/scraper/scrapers/parser/`
- `apps/scraper/scrapers/config_validation.py`
- `apps/scraper/scrapers/result_collector.py`
- `apps/scraper/scrapers/sku_loader.py`
- `apps/scraper/scrapers/pricing_loader.py`
- `apps/scraper/scrapers/selector_storage.py`
- `apps/scraper/scrapers/actions/handlers/ocr.py`
- `apps/scraper/core/anti_detection_manager.py` only after confirming retained engine does not import it.

## Dependencies Between Phases
1. Phase 1 is required before all other phases.
2. Phase 2 depends on Phase 1 because URL Review needs `enrichment_targets`.
3. Phase 3 depends on Phase 1 and should be implemented before worker changes.
4. Phase 4 depends on Phase 3 API endpoints.
5. Phase 5 depends on Phase 3 callback shape and Phase 4 worker result shape.
6. Phase 6 depends on Phase 5 so status changes do not break consolidation.
7. Phase 7 depends on Phase 6 code being ready for the enum migration.
8. Phase 8 depends on a successful deploy of Phases 1–7.
9. Phase 9 depends on populated enrichment jobs/attempts from Phases 3–7.

## Validation Commands

### Web focused checks
```bash
bun run web test -- --testPathPatterns="pipeline|enrichment|consolidation"
bun run web lint
bun run web build
```

### Worker focused checks
```bash
cd apps/scraper
python -m pytest tests/unit/runner/test_enrichment_mode.py tests/unit/test_enrichment_models.py
python -m pytest -m "not benchmark and not live and not performance" --ignore=tests/benchmarks
ruff check . --output-format=github
mypy . --ignore-missing-imports || true
```

## Risks
- **Enum migration risk:** PostgreSQL enum removal requires type replacement and generated type sync. Mitigate with backup, staged deploy, and explicit data mapping.
- **Status name churn:** Many UI/API/tests hard-code old statuses. Mitigate with exhaustive grep and type-driven status constants.
- **Consolidation source mismatch:** Existing consolidation expects old source aliases. Mitigate by writing `sources.enriched` with backward-compatible aliases.
- **URL Review persistence gap:** Do not drop legacy candidate table until `enrichment_targets` is populated and URL Review reads from it.
- **Worker over-deletion:** Do not delete core rendering/runtime modules until v2 worker path has passing integration tests.
- **Destructive schema cleanup:** Delay column/table drops until after additive v2 path is proven in staging if rollback confidence is low.
- **Cost/confidence visibility:** AI-heavy enrichment needs cost and confidence dashboards before broad production use.
