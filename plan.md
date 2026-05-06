# Implementation Plan

## Goal
Add LM Studio as a selectable AI consolidation provider, using direct OpenAI-compatible chat chunks when Batch API is unavailable while preserving the existing submit → monitor → retrieve → apply frontend lifecycle.

## Tasks

### Phase 1: Config, schema, and provider routing

1. **Add DB support for direct-chat synthetic batches**
   - File: `apps/web/supabase/migrations/20260505120000_add_lmstudio_direct_consolidation.sql`
   - Changes: Create a migration with this SQL shape:
     ```sql
     ALTER TABLE public.batch_jobs
       ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'batch_api';

     ALTER TABLE public.batch_jobs
       DROP CONSTRAINT IF EXISTS batch_jobs_execution_mode_check;

     ALTER TABLE public.batch_jobs
       ADD CONSTRAINT batch_jobs_execution_mode_check
       CHECK (execution_mode IN ('batch_api', 'direct_chat_chunks'));

     ALTER TABLE public.batch_jobs
       DROP CONSTRAINT IF EXISTS batch_jobs_provider_check;

     ALTER TABLE public.batch_jobs
       ADD CONSTRAINT batch_jobs_provider_check
       CHECK (provider IN ('openai', 'openai_compatible', 'gemini', 'lmstudio'));

     ALTER TABLE public.ai_provider_credentials
       DROP CONSTRAINT IF EXISTS ai_provider_credentials_provider_check;

     ALTER TABLE public.ai_provider_credentials
       ADD CONSTRAINT ai_provider_credentials_provider_check
       CHECK (provider IN ('openai', 'openai_compatible', 'gemini', 'lmstudio', 'serpapi', 'brave'));

     ALTER TABLE public.llm_parallel_runs
       DROP CONSTRAINT IF EXISTS llm_parallel_runs_primary_provider_check;

     ALTER TABLE public.llm_parallel_runs
       ADD CONSTRAINT llm_parallel_runs_primary_provider_check
       CHECK (primary_provider IN ('openai', 'openai_compatible', 'gemini', 'lmstudio'));

     ALTER TABLE public.llm_parallel_runs
       DROP CONSTRAINT IF EXISTS llm_parallel_runs_shadow_provider_check;

     ALTER TABLE public.llm_parallel_runs
       ADD CONSTRAINT llm_parallel_runs_shadow_provider_check
       CHECK (shadow_provider IN ('openai', 'openai_compatible', 'gemini', 'lmstudio'));

     CREATE TABLE IF NOT EXISTS public.batch_job_items (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       batch_id uuid NOT NULL REFERENCES public.batch_jobs(id) ON DELETE CASCADE,
       sku text NOT NULL,
       status text NOT NULL DEFAULT 'pending',
       request_payload jsonb NOT NULL DEFAULT '{}',
       response_payload jsonb,
       parsed_result jsonb,
       product_source jsonb NOT NULL DEFAULT '{}',
       error_message text,
       attempt_count integer NOT NULL DEFAULT 0,
       fallback_batch_id uuid REFERENCES public.batch_jobs(id),
       started_at timestamptz,
       completed_at timestamptz,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now(),
       CONSTRAINT batch_job_items_status_check
         CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
       CONSTRAINT batch_job_items_unique_batch_sku UNIQUE (batch_id, sku)
     );

     CREATE INDEX IF NOT EXISTS idx_batch_jobs_execution_mode
       ON public.batch_jobs(execution_mode);
     CREATE INDEX IF NOT EXISTS idx_batch_job_items_batch_status
       ON public.batch_job_items(batch_id, status);
     CREATE INDEX IF NOT EXISTS idx_batch_job_items_sku
       ON public.batch_job_items(sku);
     CREATE INDEX IF NOT EXISTS idx_batch_job_items_fallback_batch_id
       ON public.batch_job_items(fallback_batch_id)
       WHERE fallback_batch_id IS NOT NULL;

     ALTER TABLE public.batch_job_items ENABLE ROW LEVEL SECURITY;

     DROP POLICY IF EXISTS "Allow authenticated users to read batch job items" ON public.batch_job_items;
     CREATE POLICY "Allow authenticated users to read batch job items"
       ON public.batch_job_items FOR SELECT TO authenticated USING (true);

     DROP POLICY IF EXISTS "Allow authenticated users to insert batch job items" ON public.batch_job_items;
     CREATE POLICY "Allow authenticated users to insert batch job items"
       ON public.batch_job_items FOR INSERT TO authenticated WITH CHECK (true);

     DROP POLICY IF EXISTS "Allow authenticated users to update batch job items" ON public.batch_job_items;
     CREATE POLICY "Allow authenticated users to update batch job items"
       ON public.batch_job_items FOR UPDATE TO authenticated USING (true);

     CREATE OR REPLACE FUNCTION public.update_batch_job_items_updated_at()
     RETURNS trigger AS $$
     BEGIN
       NEW.updated_at = now();
       RETURN NEW;
     END;
     $$ LANGUAGE plpgsql;

     DROP TRIGGER IF EXISTS batch_job_items_updated_at ON public.batch_job_items;
     CREATE TRIGGER batch_job_items_updated_at
       BEFORE UPDATE ON public.batch_job_items
       FOR EACH ROW
       EXECUTE FUNCTION public.update_batch_job_items_updated_at();

     COMMENT ON COLUMN public.batch_jobs.execution_mode IS 'Execution path: batch_api for provider Batch API, direct_chat_chunks for LM Studio/OpenAI-compatible direct chat fallback.';
     COMMENT ON TABLE public.batch_job_items IS 'Per-SKU work items and responses for synthetic direct-chat consolidation batches.';
     ```
   - Acceptance: Migration applies cleanly; existing `batch_jobs` rows get `execution_mode='batch_api'`; constraints allow `provider='lmstudio'`.

2. **Update generated Supabase types**
   - File: `apps/web/types/supabase.ts`
   - Changes: Add `batch_jobs.execution_mode` to Row/Insert/Update; add full `batch_job_items` table Row/Insert/Update/Relationships; include `fallback_batch_id` relationship to `batch_jobs`.
   - Acceptance: TypeScript allows `.from('batch_job_items')` operations and `batch_jobs.execution_mode` access without casts.

3. **Add LM Studio to credentials and defaults normalization**
   - File: `apps/web/lib/ai-scraping/credentials.ts`
   - Changes: Add `lmstudio` to `AIProvider` and `LLMProvider`; include it in credential status records and compatibility fallback keys if needed; make `normalizeLLMProvider()` preserve `openai`, `openai_compatible`, `gemini`, and `lmstudio` instead of always returning `openai`; make `normalizeConsolidationDefaults()` persist real `llm_supports_batch_api` values instead of hardcoding `true`; allow non-OpenAI model names when provider is `lmstudio`; load the LM Studio key from `ai_provider_credentials` when selected; still load `openai_api_key` for fallback.
   - Acceptance: Saving defaults with `{ llm_provider: 'lmstudio', llm_supports_batch_api: false }` round-trips; OpenAI fallback key remains available.

4. **Fix consolidation provider routing**
   - File: `apps/web/lib/consolidation/openai-client.ts`
   - Changes: Replace hardcoded `resolveEffectiveProvider()` with `options.forceProvider ?? configuredProvider`; when forced to `openai`, use OpenAI key, default OpenAI model, OpenAI base URL/env, and `llm_supports_batch_api=true`; when selected/forced to `lmstudio`, use LM Studio key/base URL/model and preserve `llm_supports_batch_api=false`; include provider/base URL/model/supports-batch in the client signature.
   - Acceptance: `getConsolidationConfig()` returns `lmstudio` settings when configured; `getConsolidationConfig({ forceProvider: 'openai' })` returns usable OpenAI Batch settings even if LM Studio is selected.

5. **Update consolidation type and validation provider enums**
   - Files: `apps/web/lib/consolidation/types.ts`, `apps/web/lib/validation/consolidation-schemas.ts`, `apps/web/lib/consolidation/parallel-runs.ts`
   - Changes: Add `BatchExecutionMode = 'batch_api' | 'direct_chat_chunks'`; add `execution_mode` to `BatchJob`; add `BatchJobItem` interface; allow `provider='lmstudio'`; update `normalizeProvider()` in `parallel-runs.ts` to preserve `lmstudio`.
   - Acceptance: Existing batch schemas still validate OpenAI rows; new direct-chat rows validate with `execution_mode='direct_chat_chunks'`.

### Phase 2: Direct chat execution path and fallback

6. **Extract shared batch result parsing**
   - New File: `apps/web/lib/consolidation/result-parsing.ts`
   - Changes: Move/export the existing structured response parser from `batch-service.ts` into helpers such as `parseStructuredConsolidationText()` and `parseBatchOutputLine()` so OpenAI Batch output and LM Studio direct responses use identical normalization/taxonomy validation.
   - File: `apps/web/lib/consolidation/batch-service.ts`
   - Changes: Import the new helpers; remove duplicate private parsing logic.
   - Acceptance: Existing `retrieveResults()` tests still pass with no output shape changes.

7. **Create LM Studio direct-chat service**
   - New File: `apps/web/lib/consolidation/direct-chat-service.ts`
   - Changes: Add helpers:
     - `preflightModels(runtime)` calls `GET {llm_base_url}/models` with Bearer auth and an 8-10s timeout; returns model list or error.
     - `createDirectChatBatch(products, metadata, runtime, content)` inserts one `batch_jobs` row with `provider='lmstudio'`, `execution_mode='direct_chat_chunks'`, synthetic `provider_batch_id`, `status='pending'`, `metadata.batch_content_jsonl`, and one `batch_job_items` row per SKU with request payload and product source.
     - `processDirectChatChunk(batchDbId, { limit: 1 })` claims pending items, runs `client.chat.completions.create()` sequentially with `timeout: 35000`, stores raw response plus parsed result, increments token counts, and marks each item `completed` or `failed`.
     - `aggregateDirectChatStatus(batchDbId)` computes total/completed/failed/progress from `batch_job_items` and updates parent `batch_jobs` counts/status.
     - `retrieveDirectChatResults(batchDbId)` returns parsed direct item results.
     - `cancelDirectChatBatch(batchDbId)` marks parent and non-terminal items `cancelled`.
   - Acceptance: A synthetic batch can be created, one item is processed per status poll, item results are persisted, and counts aggregate from `batch_job_items`.

8. **Route `submitBatch()` by provider capability**
   - File: `apps/web/lib/consolidation/batch-service.ts`
   - Changes: Refactor submission into an internal helper accepting `{ forceProvider?, parentBatchId?, skipDirectChat? }`; call `getConfiguredBatchRuntime(false)` first; if selected provider has `llm_supports_batch_api=false`, run LM Studio preflight; on preflight success call `createDirectChatBatch()` and return its synthetic batch id; on preflight failure call internal submit with `forceProvider:'openai'` and `skipDirectChat:true`; OpenAI path remains Batch API and persists `execution_mode='batch_api'`; add `parent_batch_id` to `persistBatchJobRecord()` payload for fallback children.
   - Acceptance: LM Studio with reachable `/v1/models` creates DB synthetic batches and no `/files`/`/batches` calls; unreachable LM Studio automatically submits OpenAI Batch.

9. **Make status polling process direct chunks and aggregate child fallback**
   - File: `apps/web/lib/consolidation/batch-service.ts`
   - Changes: Extend `findBatchJobRow()` selects to include `execution_mode`, `parent_batch_id`, and metadata; in `getBatchStatus()`, if row is `direct_chat_chunks`, process one pending item, aggregate item status, and return a normal `BatchStatus`; when all direct items are terminal and failures exist, submit exactly one child OpenAI Batch for failed SKUs with `parent_batch_id` set and store child id in parent metadata; if a child exists, poll child status and merge counts into the parent status.
   - Acceptance: Existing monitor UI receives the same `BatchStatus` fields; failed LM Studio items trigger one child OpenAI batch, not repeated children.

10. **Retrieve and cancel direct batches through existing APIs**
    - File: `apps/web/lib/consolidation/batch-service.ts`
    - Changes: In `retrieveResults()`, detect direct parent rows and return direct successful item results plus child OpenAI fallback results when present; return "batch not complete" if child fallback is still running; in `cancelBatch()`, cancel direct parent/items locally and cancel any child OpenAI batch if it exists.
    - Acceptance: Existing `/api/admin/consolidation/[batchId]` preview and `/apply` endpoint work for both execution modes.

11. **Expose execution mode in job lists and sync**
    - Files: `apps/web/lib/consolidation/batch-service.ts`, `apps/web/app/api/admin/consolidation/sync/route.ts`, `apps/web/app/api/admin/pipeline/active-consolidations/route.ts`
    - Changes: Include/map `execution_mode` in `listBatchJobs()` and active-consolidation selects; ensure `/sync` uses `getBatchStatus()` for both `batch_api` and `direct_chat_chunks` rows.
    - Acceptance: Admin job lists and active consolidation cards show progress for LM Studio synthetic batches.

### Phase 3: Admin APIs for settings and model discovery

12. **Expand consolidation settings API**
    - File: `apps/web/app/api/admin/consolidation/settings/route.ts`
    - Changes: GET returns `defaults` and credential statuses for `openai` and `lmstudio`; POST accepts `lmstudio_api_key`, `openai_api_key`, and `defaults`; when `defaults.llm_provider==='lmstudio'`, enforce `llm_supports_batch_api=false`; when provider is `openai`, enforce `llm_supports_batch_api=true`; validate LM Studio base URL is `http:` or `https:` and preferably ends with `/v1`; store LM Studio key via `setAIScrapingProviderSecret('lmstudio', ...)`.
    - Acceptance: Admin can save LM Studio base URL/model/key and OpenAI fallback key through the consolidation settings API.

13. **Keep combined AI credentials endpoint compatible**
    - File: `apps/web/app/api/admin/ai-scraping/credentials/route.ts`
    - Changes: Add optional `lmstudio_api_key` support and return `statuses.lmstudio`; pass LM Studio consolidation defaults through without coercing provider/model/supports-batch back to OpenAI.
    - Acceptance: Existing settings consumers keep working; tests can assert LM Studio status is present.

14. **Add LM Studio model discovery API**
    - New File: `apps/web/app/api/admin/consolidation/models/route.ts`
    - Changes: Add admin-authenticated route that calls LM Studio `/v1/models` with saved or POSTed base URL and API key; normalize response to `{ models: Array<{ id: string; label: string }> }`; return 400 for missing/invalid base URL, 502 for failed upstream/preflight; never log full API keys.
    - Acceptance: `GET /api/admin/consolidation/models` returns saved LM Studio models; optional `POST` with unsaved `{ llm_base_url, api_key }` can preview models before saving.

### Phase 4: Frontend settings UI

15. **Make model combobox provider-neutral**
    - File: `apps/web/components/admin/settings/AIModelCombobox.tsx`
    - Changes: Add optional `options`, `placeholder`, `emptyLabel`, and `searchPlaceholder` props; default to existing OpenAI model options so scraping UI is unchanged; label unknown model ids as the id.
    - Acceptance: Existing OpenAI combobox tests still pass; LM Studio can pass dynamic model options.

16. **Add LM Studio controls to consolidation settings card**
    - File: `apps/web/components/admin/settings/AIConsolidationSettingsCard.tsx`
    - Changes: Switch data source to `/api/admin/consolidation/settings`; add provider select (`OpenAI Batch`, `LM Studio Direct Chat`); add LM Studio API key and base URL inputs; show `llm_supports_batch_api=false` read-only/help text for LM Studio; load model options from `/api/admin/consolidation/models` when provider/base URL/key are available; show refresh-models button and preflight errors; save LM Studio defaults with `llm_provider:'lmstudio'`, selected model, base URL, `llm_supports_batch_api:false`, and confidence threshold; keep OpenAI Batch path unchanged; add copy explaining preflight fallback and per-item OpenAI fallback.
    - Acceptance: Admin can select LM Studio, fetch models, choose a model, save settings, and still see OpenAI fallback credential status.

17. **Keep settings page composition unchanged**
    - File: `apps/web/app/admin/settings/page.tsx`
    - Changes: No structural lifecycle changes expected; only verify the existing `AIConsolidationSettingsCard` placement still works.
    - Acceptance: Settings page renders the updated card without route changes.

### Phase 5: Tests and validation

18. **Update credentials and routing unit tests**
    - Files: `apps/web/__tests__/lib/ai-scraping/credentials.test.ts`, new `apps/web/__tests__/lib/consolidation/openai-client.test.ts`
    - Changes: Add tests for LM Studio defaults round-trip, `llm_supports_batch_api=false`, LM Studio key/status loading, arbitrary LM Studio model names, and `forceProvider:'openai'` using OpenAI fallback config while LM Studio is selected.
    - Acceptance: Focused tests pass with `bun run web test -- __tests__/lib/ai-scraping/credentials.test.ts __tests__/lib/consolidation/openai-client.test.ts`.

19. **Update batch service integration tests for direct path**
    - File: `apps/web/__tests__/lib/consolidation/batch-service.integration.test.ts`
    - Changes: Update `BATCH_LOOKUP_COLUMNS`; add tests for: LM Studio preflight success creates synthetic `batch_jobs`/`batch_job_items`; preflight failure falls back to OpenAI Batch; `getBatchStatus()` processes one item with a 35s timeout option and aggregates progress; failed direct items create one child OpenAI batch with `parent_batch_id`; `retrieveResults()` returns direct parsed results and child fallback results; `cancelBatch()` cancels direct rows without calling provider Batch API.
    - Acceptance: Direct-chat behavior is covered without hitting real LM Studio/OpenAI.

20. **Update schema validation tests**
    - Files: `apps/web/__tests__/validation/schemas.test.ts`, `apps/web/lib/validation/consolidation-schemas.ts`
    - Changes: Add `execution_mode` to fixture rows; validate `provider:'lmstudio'`; add `batch_job_items` schema tests if a schema is exported.
    - Acceptance: Validation suite passes.

21. **Add API route tests**
    - Files: `apps/web/__tests__/app/api/admin/ai-scraping/credentials.route.test.ts`, new `apps/web/__tests__/app/api/admin/consolidation/settings.route.test.ts`, new `apps/web/__tests__/app/api/admin/consolidation/models.route.test.ts`
    - Changes: Assert LM Studio key/defaults save; settings GET includes LM Studio status; models route handles success, bad URL, upstream failure, and unauthorized admin.
    - Acceptance: API route tests pass with mocked `fetch` and mocked credentials helpers.

22. **Update frontend settings tests**
    - File: `apps/web/__tests__/components/admin/settings/ai-settings-cards.test.tsx`
    - Changes: Update mock settings payload to include `lmstudio`; add test for selecting LM Studio, entering base URL/key, fetching dynamic models, selecting a model, and saving `llm_supports_batch_api:false`; keep OpenAI messaging assertions updated.
    - Acceptance: React Testing Library tests pass and no client component accesses DB directly.

23. **Run focused validation**
    - Files: N/A
    - Changes: Run focused tests first, then broader checks:
      - `bun run web test -- __tests__/lib/consolidation/batch-service.integration.test.ts`
      - `bun run web test -- __tests__/lib/ai-scraping/credentials.test.ts __tests__/app/api/admin/consolidation/models.route.test.ts __tests__/components/admin/settings/ai-settings-cards.test.tsx`
      - `bun run web lint`
    - Acceptance: All focused tests and lint pass.

## Files to Modify
- `apps/web/lib/ai-scraping/credentials.ts` - add LM Studio provider, credential/status handling, real consolidation defaults normalization, fallback OpenAI key support.
- `apps/web/lib/consolidation/openai-client.ts` - fix provider routing and forced OpenAI fallback config.
- `apps/web/lib/consolidation/batch-service.ts` - route batch vs direct execution, process direct status polling, fallback child batches, retrieve/cancel/list updates.
- `apps/web/lib/consolidation/types.ts` - add LM Studio provider, execution mode, and item types.
- `apps/web/lib/consolidation/parallel-runs.ts` - preserve `lmstudio` in provider normalization.
- `apps/web/lib/validation/consolidation-schemas.ts` - allow LM Studio and execution mode.
- `apps/web/types/supabase.ts` - add migration-generated table/column types.
- `apps/web/app/api/admin/consolidation/settings/route.ts` - save/read LM Studio consolidation settings and keys.
- `apps/web/app/api/admin/ai-scraping/credentials/route.ts` - compatibility support for LM Studio status/key/defaults.
- `apps/web/app/api/admin/consolidation/sync/route.ts` - ensure direct-chat rows sync through `getBatchStatus()`.
- `apps/web/app/api/admin/pipeline/active-consolidations/route.ts` - include execution mode in active job data if UI needs it.
- `apps/web/components/admin/settings/AIModelCombobox.tsx` - support dynamic provider model options.
- `apps/web/components/admin/settings/AIConsolidationSettingsCard.tsx` - add provider selector, LM Studio URL/key/model picker, fallback messaging.
- `apps/web/__tests__/lib/ai-scraping/credentials.test.ts` - LM Studio credential/default tests.
- `apps/web/__tests__/lib/consolidation/batch-service.integration.test.ts` - direct-chat and fallback tests.
- `apps/web/__tests__/validation/schemas.test.ts` - schema fixture updates.
- `apps/web/__tests__/app/api/admin/ai-scraping/credentials.route.test.ts` - LM Studio compatibility endpoint tests.
- `apps/web/__tests__/components/admin/settings/ai-settings-cards.test.tsx` - updated settings UI tests.

## New Files
- `apps/web/supabase/migrations/20260505120000_add_lmstudio_direct_consolidation.sql` - DB schema for execution mode and per-SKU direct-chat items.
- `apps/web/lib/consolidation/direct-chat-service.ts` - LM Studio preflight, synthetic batch creation, item chunk processing, aggregation, retrieval, cancellation.
- `apps/web/lib/consolidation/result-parsing.ts` - shared result parsing for Batch API and direct chat responses.
- `apps/web/app/api/admin/consolidation/models/route.ts` - admin LM Studio `/v1/models` proxy/preflight endpoint.
- `apps/web/__tests__/lib/consolidation/openai-client.test.ts` - provider routing/fallback config tests.
- `apps/web/__tests__/app/api/admin/consolidation/settings.route.test.ts` - consolidation settings route tests.
- `apps/web/__tests__/app/api/admin/consolidation/models.route.test.ts` - LM Studio model discovery route tests.

## Dependencies
- Phase 1 migration/types/provider routing must land before direct-chat service compiles.
- Phase 2 direct-chat service depends on result parsing extraction and fixed `getConsolidationConfig({ forceProvider: 'openai' })`.
- Phase 3 settings/model APIs depend on credential changes.
- Phase 4 frontend depends on Phase 3 API response shapes.
- Phase 5 tests depend on all implementation phases; add/update mocks as each phase lands.

## Risks
- **Provider identity ambiguity**: Plan uses a new `lmstudio` provider id. If product wants generic `openai_compatible` labeled as LM Studio, adjust provider literals/migration before implementation.
- **Serverless/API timeout**: One status poll may spend up to ~35s processing one item. Keep direct chunk size at 1 by default; do not process large chunks inside one request unless hosting timeout is confirmed.
- **OpenAI fallback model**: LM Studio model names may not exist in OpenAI. Forced OpenAI fallback must use `DEFAULT_AI_MODEL` or another explicit OpenAI fallback model, not the LM Studio model.
- **SSRF/security**: `/api/admin/consolidation/models` and LM Studio chat calls fetch an admin-configured URL from the deployed server. Validate protocol, avoid logging secrets, and consider allowlisting if deployment policy requires it.
- **Concurrent polling**: Multiple status polls can race to claim pending items. Item claiming must update status conditionally (`pending` → `running`) and skip rows already claimed.
- **Fallback duplication**: Store child fallback batch id in parent metadata and check it before creating a child batch.
- **DB size**: Storing full JSONL in `batch_jobs.metadata.batch_content_jsonl` plus per-item request payloads can grow. Verify JSONB row sizes for 100-500 product batches or move bulk content to item rows only if needed.
- **Generated types**: `types/supabase.ts` is generated; manual edits are acceptable only if generation is unavailable, otherwise regenerate after migration.
