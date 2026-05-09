# Consolidation Pipeline Analysis

## Files Retrieved

| File | Lines | Importance |
|------|-------|------------|
| `lib/consolidation/types.ts` | 1-120 | Core types: `BatchExecutionMode`, `BatchStatus`, `BatchJob`, `SubmitBatchResponse` |
| `lib/consolidation/openai-client.ts` | 1-190 | Provider config resolution: `getConsolidationConfig()`, `getOpenAIClient()` |
| `lib/consolidation/batch-service.ts` | 1-2585 | Main orchestrator: `submitBatch()`, `getBatchStatus()`, `retrieveResults()`, `applyResults()` |
| `lib/consolidation/direct-chat-service.ts` | 1-470 | Direct-chat execution: `createDirectChatBatch()`, `processDirectChatChunk()`, `aggregateDirectChatStatus()` |
| `lib/consolidation/index.ts` | 1-54 | Public API exports |
| `lib/consolidation/parallel-runs.ts` | 1-270 | Parallel run tracking between providers |
| `lib/consolidation/two-phase-service.ts` | 1-360 | Two-phase consistency pass |
| `lib/providers/interfaces.ts` | 1-85 | Provider abstraction interfaces (`LLMClient`, `BatchProvider`) |
| `lib/providers/gemini-batch.ts` | 1-300 | Gemini batch implementation (UNUSED by consolidation pipeline) |
| `lib/providers/gemini-client.ts` | 1-260 | Gemini chat implementation (UNUSED by consolidation pipeline) |
| `lib/ai-scraping/credentials.ts` | 1-820 | Credential resolution, provider normalization, `llm_supports_batch_api` |
| `lib/ai-scraping/models.ts` | 1-60 | Model definitions, `DEFAULT_AI_MODEL = 'deepseek-chat'`, Gemini legacy stubs |
| `lib/ai-scraping/pricing.ts` | 1-60 | Cost calculation via `pricing-catalog.json` (NO DeepSeek entries) |
| `lib/ai-scraping/discovery-config.ts` | 1-110 | Discovery provider routing (forces DeepSeek) |
| `app/api/admin/consolidation/submit/route.ts` | 1-90 | POST endpoint for submitting consolidation |
| `app/api/admin/consolidation/settings/route.ts` | 1-120 | GET/POST for consolidation settings |
| `app/admin/settings/page.tsx` | 1-31 | Admin settings page (DeepSeek-focused) |
| `app/admin/pipeline/page.tsx` | 1-100 | Pipeline management page |
| `app/admin/pipeline/monitoring/page.tsx` | 1-20 | Pipeline monitoring page |
| `components/admin/pipeline/ActiveConsolidationsTab.tsx` | 1-640 | Active consolidation jobs UI + batch history |
| `components/admin/pipeline/ConsolidationJobCard.tsx` | 1-170 | Individual job card component |
| `components/admin/settings/AIConsolidationSettingsCard.tsx` | referenced | Consolidation settings UI |
| `supabase/migrations/20260508100000_migrate_ai_defaults_to_deepseek.sql` | 1-105 | DB migration setting DeepSeek as default |

---

## 1. OpenAI-to-DeepSeek Transition Status

**Migration is functionally complete at the default/configuration level.** The DB defaults now point to `deepseek`/`deepseek-chat` and the credentials layer normalizes legacy providers to `deepseek`. However, the code architecture still treats DeepSeek as an "OpenAI-compatible" provider rather than a first-class citizen.

### How it works now:

**`openai-client.ts`** → `getConsolidationConfig()`:
- Reads runtime config from DB via `getAIConsolidationRuntimeConfig()`
- If `effectiveProvider === 'deepseek'`, it:
  - Resolves API key from `deepseek_api_key ?? llm_api_key`
  - Resolves base URL via `getDeepSeekOpenAICompatibleBaseURL()` → `https://api.deepseek.com/v1`
  - Sets `llm_supports_batch_api: false`
- Falls back to a hardcoded DeepSeek config if DB fetch fails

**`batch-service.ts`** → `submitBatch()` routing:
```typescript
if (config.llm_supports_batch_api) {
    return await submitBatchToOpenAI(products, metadata);  // OpenAI Batch API path
}
// Otherwise → direct_chat_chunks path
```

Since `llm_supports_batch_api` is `false` for DeepSeek, ALL DeepSeek traffic goes through the direct-chat path.

**Fallback chain exists but is LM-Studio-specific:**
```typescript
// In submitBatch():
if (config.llm_provider === 'lmstudio') {
    // preflight failed → fall back to DeepSeek
    return await submitDeepSeekFallbackBatch(...);
}
// In handleDirectChatStatus():
// If items fail in direct-chat, creates DeepSeek fallback batch for failed items
```
The fallback is only triggered for LM Studio → DeepSeek. No fallback from DeepSeek → anything else.

---

## 2. execution_mode: `direct_chat_chunks` vs `batch_api`

**`batch_api`:**
- Uses OpenAI `/v1/batches` endpoint
- Creates JSONL file → uploads → submits batch → polls via `client.batches.retrieve()`
- Requires `llm_supports_batch_api: true` (only OpenAI native)
- Result retrieval via `client.files.content()`
- Tight coupling to OpenAI SDK (`new OpenAI()`, `client.batches.create()`, `client.files.create()`)

**`direct_chat_chunks`:**
- Synthentic batch: creates a `batch_jobs` parent row + individual `batch_job_items` rows
- Processed incrementally via `processDirectChatChunk()`:
  - Claims N pending items atomically
  - For each item: calls `client.chat.completions.create()` (OpenAI SDK, same `new OpenAI()` client)
  - Stores result per item row
- Status aggregated via `aggregateDirectChatStatus()` (sums item-level statuses)
- Fallback: if items fail, creates a DeepSeek fallback batch automatically
- No actual batch API call—it's simulated batching via individual chat completions

**Key difference:** `batch_api` is true asynchronous batch submission; `direct_chat_chunks` is synchronous-per-chunk but batched in the DB layer.

---

## 3. submitBatch → createDirectChatBatch → processDirectChatChunk → aggregateDirectChatStatus Flow

### submitBatch (entry point)
1. Calls `getConfiguredBatchRuntime(false)` → loads config
2. If `llm_supports_batch_api`: routes to `submitBatchToOpenAI()` (OpenAI native path)
3. Otherwise:
   a. Runs `preflightModels()` → GET `/v1/models`
   b. If preflight fails and provider is 'lmstudio' → falls back to DeepSeek via `submitDeepSeekFallbackBatch()`
   c. Calls `submitDirectChatBatchToRuntime()` → which calls `createDirectChatBatch()`

### createDirectChatBatch (in direct-chat-service.ts)
1. Generates `batchId` (UUID) + `providerBatchId` ("direct_<uuid>")
2. Builds `batch_content_jsonl` via `createBatchContent()` (same JSONL format as OpenAI batch)
3. Inserts `batch_jobs` row with `execution_mode: 'direct_chat_chunks'`
4. Parses JSONL → one `batch_job_items` row per product/SKU
5. Batch-inserts items
6. Marks products as `pipeline_status: 'consolidating'`
7. Returns `batch_id`

### getBatchStatus → handleDirectChatStatus (called repeatedly by polling)
1. Checks `execution_mode` from DB
2. If `direct_chat_chunks`:
   a. Calls `processDirectChatChunk(batchId, { limit: 1 })` - processes ONE item per poll cycle
   b. Aggregates via `aggregateDirectChatStatus()`
   c. If batch complete and has failures: gets failed SKUs → creates DeepSeek fallback batch for them
   d. If fallback batch exists: merges fallback status into parent status
3. Returns aggregated `BatchStatus`

### processDirectChatChunk (processes N items at a time)
1. Claims N pending items (atomic `pending → running`)
2. For each item:
   a. Builds OpenAI SDK `chat.completions.create()` call (uses OpenAISDK even for DeepSeek!)
   b. Calls LLM endpoint
   c. Parses response via `parseStructuredConsolidationText()`
   d. Updates item as `completed` or `failed`

### aggregateDirectChatStatus
1. Loads parent + all items
2. Counts: total, completed, failed, running, pending
3. Determines aggregate status based on terminal/completion ratios
4. Sums prompt/completion tokens from each item's response
5. Syncs counts to parent `batch_jobs` row

---

## 4. Provider Abstraction

**There is no clean provider abstraction used by the consolidation pipeline.**

The `lib/providers/` directory defines `LLMClient` and `BatchProvider` interfaces but:

- **`lib/providers/` is completely orphaned from the consolidation pipeline.** Zero imports from `lib/consolidation/` into `lib/providers/` or vice versa.
- The `GeminiBatch` implementation (`gemini-batch.ts`) and `GeminiClient` (`gemini-client.ts`) are unused dead code.
- The consolidation pipeline uses the `OpenAI` SDK directly for ALL providers:
  - `new OpenAI({ apiKey, baseURL })` with DeepSeek's base URL
  - `client.chat.completions.create()` for direct-chat (DeepSeek)
  - `client.batches.create/retrieve()` for batch API (OpenAI only)
  - The `openai` npm package is the de facto abstractor—DeepSeek's API compatibility makes this work

Tight coupling points:
- `openai-client.ts` imports `OpenAI` from `openai` package
- `batch-service.ts` calls `getOpenAIClient()` creating an OpenAI SDK instance
- `submitBatchToOpenAI()` uses OpenAI-specific batch API calls (files, batches)
- `direct-chat-service.ts` dynamically imports `openai` module inside `processDirectChatChunk()`
- All error handling, retry logic is OpenAI SDK's default behavior

---

## 5. What Needs to Change for DeepSeek-Only

### Must-change:

1. **Rename `getOpenAIClient()` → `getLLMClient()`** and return a generic OpenAI-compatible client. The function already resolves DeepSeek configs correctly.

2. **Remove the OpenAI Batch API code path** (`submitBatchToOpenAI()`, `submitBatchToProvider()`, `persistBatchJobRecord()`). With DeepSeek as the only provider, `llm_supports_batch_api` will always be `false`.

3. **Remove LM-Studio fallback hooks.** The `if (config.llm_provider === 'lmstudio')` branches in `submitBatch()` and `handleDirectChatStatus()` are dead or will become dead.

4. **Clean up `openai-client.ts`:** Remove `LEGACY_OPENAI_MODEL`, `CONSOLIDATION_CONFIG.model` (already `DEEPSEEK_CHAT`), remove OpenAI-specific key resolution branching (`effectiveProvider === 'openai'` branches).

5. **Remove the entire `lib/providers/` directory** (gemini-batch, gemini-client, interfaces) since obsolete.

6. **Fix pricing catalog** (`shared/ai-pricing/pricing-catalog.json`): Add DeepSeek model entries (`deepseek-chat`, `deepseek-reasoner`). Currently `calculateAICost()` returns 0 for all DeepSeek models.

7. **Update `validation/consolidation-schemas.ts`:** Add `'deepseek'` to the provider enums (currently only `['openai', 'openai_compatible', 'gemini', 'lmstudio']`).

8. **Remove `normalizeBatchProvider()` dead code** recognizing `'gemini'` (line 349 of batch-service.ts). Still has `'gemini'` as a valid path even though it's never produced.

### Should-change (cleanup):

9. **Eliminate `openai_batch_id` column usage** in batch_jobs table—it's always null now.
10. **Rename `openai_batch_id` references** in `BatchHistorySection.tsx` component and `listBatchJobs()`.
11. **Simplify `getOpenAIClient()` caching** — the `lastClientSignature` caching is fine for DeepSeek.
12. **Remove `completion_window` config** (only applies to OpenAI Batch API).
13. **Remove `forceProvider: 'openai'`** from `submitBatchToOpenAI()` call in `batch-service.ts:1227`.

### Keep:

14. **The direct-chat execution path stays** — it's the correct architecture for DeepSeek. Just rename references.
15. **The DB schema stays** — `batch_jobs` and `batch_job_items` tables work fine for both modes.
16. **The prompt builder, result normalizer, taxonomy validator stay** — they're provider-neutral.
17. **The admin UI pipeline monitoring stays** — the polling/apply UX works regardless of provider.
18. **`parallel-runs.ts` stays** — useful for A/B comparisons if needed later.

---

## 6. Admin UI Surface for Consolidation

| UI Component | File | What it Does |
|---|---|---|
| **Pipeline page** | `app/admin/pipeline/page.tsx` | Main ingestion pipeline with consolidation tab |
| **Monitoring page** | `app/admin/pipeline/monitoring/page.tsx` | Real-time monitoring of scraper runs + consolidation batches |
| **Active Consolidations Tab** | `components/admin/pipeline/ActiveConsolidationsTab.tsx` | Lists active/in-progress batches, allows cancel/sync-status/apply |
| **Consolidation Job Card** | `components/admin/pipeline/consolidation/ConsolidationJobCard.tsx` | Individual batch card with status, progress, actions |
| **Batch History Section** | `components/admin/pipeline/consolidation/BatchHistorySection.tsx` | Completed batch history with apply button |
| **AI Consolidation Settings Card** | `components/admin/settings/AIConsolidationSettingsCard.tsx` | Settings form: DeepSeek API key, model selection, status display |
| **Settings page** | `app/admin/settings/page.tsx` | Root settings page with "External AI stack finalized" DeepSeek alert |
| **API: submit** | `app/api/admin/consolidation/submit/route.ts` | POST: submit SKUs for consolidation → calls `submitBatch()` |
| **API: settings** | `app/api/admin/consolidation/settings/route.ts` | GET/POST: read/write consolidation defaults + API keys |

The UI already reflects the DeepSeek transition—settings page shows DeepSeek as primary, Gemini/OpenAI as deprecated.

---

## 7. Gemini-Specific Code Paths Still Active

**Zero active Gemini code in the consolidation pipeline.** The `lib/providers/gemini-batch.ts` and `lib/providers/gemini-client.ts` files exist but are **completely unimported** by any consolidation module. No `import` from `@google/genai` package in consolidation code.

Remaining Gemini artifacts (all safe to ignore or remove):
- `lib/ai-scraping/models.ts`: `DEFAULT_GEMINI_MODEL`, `GEMINI_MODEL_OPTIONS`, etc. — marked as "Legacy Gemini default retained for historical compatibility only"
- `lib/ai-scraping/credentials.ts`: `'gemini'` still in `LLMProvider` type and `SITE_SETTINGS_COMPATIBLE_PROVIDERS` — all normalized away to DeepSeek at runtime
- `consolidation/batch-service.ts` line 349: `'gemini'` still in `normalizeBatchProvider()` switch
- `consolidation/parallel-runs.ts` line 27: `'gemini'` still in `normalizeProvider()` switch
- `validation/consolidation-schemas.ts`: `'gemini'` still in Zod enums
- `lib/consolidation/taxonomy-validator.ts` line 171: comment mentions Gemini
- `lib/consolidation/AGENTS.md`: stale docs mention "Gemini (migration in progress)"
- `lib/consolidation/__tests__/` Python scripts: test harnesses that reference Gemini (not production code)
- `lib/consolidation/docs/`: historical docs referencing Gemini strategy (informational only)

---

## Architecture Summary

```
User clicks "Consolidate" in Pipeline UI
  ↓
POST /api/admin/consolidation/submit
  ↓
submitBatch(products, metadata)
  ↓
  ├─ llm_supports_batch_api=true  → submitBatchToOpenAI() [DEAD PATH - never hits for DeepSeek]
  │    ├─ createBatchContent() → JSONL
  │    ├─ upload file via OpenAI SDK
  │    ├─ client.batches.create()
  │    └─ persist batch_jobs row
  │
  └─ llm_supports_batch_api=false → submitDirectChatBatchToRuntime() [ACTIVE PATH]
       ├─ preflightModels() → GET /v1/models
       ├─ createBatchContent() → JSONL
       ├─ createDirectChatBatch()
       │    ├─ insert batch_jobs (execution_mode='direct_chat_chunks')
       │    └─ insert batch_job_items (one per SKU)
       └─ returns batch_id

Polling loop (via getBatchStatus):
  └─ handleDirectChatStatus()
       ├─ processDirectChatChunk() → processes 1 item
       │    └─ client.chat.completions.create() [OpenAI SDK → DeepSeek]
       ├─ aggregateDirectChatStatus() → computes batch-level status
       └─ if failures: submitDeepSeekFallbackBatch() for failed items

User clicks "Apply":
  POST /api/admin/consolidation/{id}/apply
    → retrieveResults() → parseLLM responses
    → applyConsolidationResults() → upsert products_ingestion.consolidated
```

## Pain Points

1. **Misleading naming** — "OpenAI" permeates every file/function/type despite DeepSeek being the provider
2. **Dead dual-path complexity** — `batch_api` vs `direct_chat_chunks` branching adds ~500 lines of dead code
3. **Orphaned provider abstraction** — `lib/providers/` defines clean interfaces but they're completely unused
4. **Pricing gap** — `calculateAICost()` returns $0 for `deepseek-chat` because pricing catalog has no DeepSeek entries
5. **Provider validation gap** — Zod schemas in `consolidation-schemas.ts` don't include `'deepseek'`
6. **LM Studio fallback complexity** — the `lmstudio → deepseek` fallback chain adds ~100 lines for a provider no longer in active use
7. **Test mocks outdated** — `__mocks__/openai-client.ts` mocks the OpenAI SDK directly
