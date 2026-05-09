# DeepSeek Consolidation Overhaul Plan

**Date:** 2026-05-09  
**Status:** Implementation in progress — see per-phase status below  
**Oracle rulings applied:** 05-09 (keep Gemini types, keep openai_batch_id compat, compact prompt, retry before fallback removal)

**Goal:** Remove OpenAI Batch API dependency entirely. DeepSeek becomes sole consolidation provider with direct-chat-chunks architecture. Clean up all misleading naming, dead code paths, and provider abstractions.

---

## DeepSeek API Summary (from api-docs.deepseek.com)

| Attribute | Value |
|-----------|-------|
| Base URL | `https://api.deepseek.com` |
| Chat endpoint | `POST /v1/chat/completions` (OpenAI-compatible) |
| Auth | `Authorization: Bearer <api_key>` |
| Models | `deepseek-chat` (64K ctx), `deepseek-reasoner` (64K ctx) |
| JSON mode | `response_format: { type: "json_object" }` — **NOT** `json_schema` or `strict: true` |
| Function calling | Supported via `tools` param |
| Batch API | **None.** No `/v1/batches` endpoint. Batch pricing is enterprise custom only. |
| Pricing (chat) | $0.14/M input, $0.28/M output |
| Pricing (reasoner) | $0.55/M input, $2.19/M output (reasoning tokens included) |
| Cache pricing | ~10% of standard input ($0.014/M for chat) |
| Rate limits | 500 RPM / 100K TPM (default tier) |

### Critical Finding: `response_format` incompatibility

Current code uses `buildOpenAIResponseFormat()` which produces:
```json
{ "type": "json_schema", "json_schema": { "name": "...", "strict": true, "schema": {...} } }
```
DeepSeek only supports `{ "type": "json_object" }`. The `json_schema` + `strict` are OpenAI-only features. This MUST be changed to `json_object` and the schema instructions moved into the system prompt.

---

## Phase 1: Critical Fix — Response Format (P0) [✅ DONE]

### 1.1 Fix `buildOpenAIResponseFormat` → `buildJSONResponseFormat`

**File:** `lib/consolidation/taxonomy-validator.ts`

**Status:** ✅ Done. Function renamed to `buildJSONResponseFormat()`, returns `{ type: 'json_object' }` instead of OpenAI `json_schema` strict mode.

### 1.2 Update `createBatchContent()` response_format

**File:** `lib/consolidation/batch-service.ts`

**Status:** ✅ Done. All references updated. `jsonResponseFormat` used instead of `openAIResponseFormat`.

### 1.3 Update `buildPromptContext()` to include compact output contract

**File:** `lib/consolidation/prompt-builder.ts`

**Status:** ✅ Done. `generateSystemPrompt()` now appends a compact JSON output contract with required fields, data types, and allowed `product_on_pages` / category values (with token guard at 50 categories).

---

## Phase 2: Compact Output Contract + Item-Level Retry (P1)

> **ORACLE RULING:** Do NOT paste raw full schema dump into prompt. Use compact output contract.
> Do NOT remove fallback without adding retry first. Keep Gemini in global types.
> Do NOT remove openai_batch_id read compatibility.

### 2.1 Add compact JSON output contract to system prompt

**File:** `lib/consolidation/prompt-builder.ts`

Add a compact output contract section to `generateSystemPrompt()`:
- Required fields with types and descriptions
- Example JSON output
- Allowed `product_on_pages` values (from SHOPSITE_PAGES)
- Category values with token guard (truncate if >100 categories)

### 2.2 Add item-level retry in `processDirectChatChunk()`

**File:** `lib/consolidation/direct-chat-service.ts`

Add retry logic before terminal failure:
- Retry retryable HTTP errors: 429, 408, 503, 502, 500, timeout, network
- Max 3 attempts per item with exponential backoff (250ms, 500ms, 1000ms)
- Mark terminal `failed` only after max retries exhausted

### 2.3 Keep fallback for now (defer removal)

> **ORACLE RULING:** Keep fallback mechanism until retry is proven. Remove in a follow-up pass.

---

## Phase 3: Rename — Fix Misleading "OpenAI" Naming (P1)

### 3.1 `openai-client.ts` → `llm-client.ts`

Rename file and update all imports (batch-service.ts, direct-chat-service.ts, index.ts, __tests__/, __mocks__/).

### 3.2 Rename functions

| Old Name | New Name | File |
|----------|----------|------|
| `getOpenAIClient()` | `getLLMClient()` | `llm-client.ts` |
| `isOpenAIConfigured()` | `isLLMConfigured()` | `llm-client.ts` |
| `CONSOLIDATION_CONFIG` | Keep (provider-neutral name) | `llm-client.ts` |
| `LEGACY_OPENAI_MODEL` | Remove entirely | `llm-client.ts` |
| `buildOpenAIResponseFormat()` | `buildJSONResponseFormat()` | `taxonomy-validator.ts` |
| `openai_batch_id` column references | `provider_batch_id` | batch-service.ts, types.ts |

### 3.3 Rename type references

**File:** `lib/consolidation/types.ts`

- `BatchJob.openai_batch_id` → already `provider_batch_id` is the primary; deprecate `openai_batch_id`
- `BatchStatus.provider` → update Zod to include `'deepseek'`

---

## Phase 4: Pricing Catalog — Add DeepSeek Entries (P2)

> **ORACLE RULING:** Add DeepSeek entries, use sync pricing for direct_chat_chunks.

### 4.1 Add DeepSeek models to `shared/ai-pricing/pricing-catalog.json`

```json
{
    "provider": "deepseek",
    "model": "deepseek-chat",
    "mode": "sync",
    "input_price": 0.14,
    "output_price": 0.28,
    "effective_date": "2025-12-01",
    "source_url": "https://api-docs.deepseek.com/quick_start/pricing"
},
{
    "provider": "deepseek",
    "model": "deepseek-reasoner",
    "mode": "sync",
    "input_price": 0.55,
    "output_price": 2.19,
    "effective_date": "2025-12-01",
    "source_url": "https://api-docs.deepseek.com/quick_start/pricing"
}
```

### 4.2 Switch to sync pricing for direct-chat

**File:** `lib/consolidation/batch-service.ts` — In `getBatchStatus()`, change `isBatch: true` → `isBatch: false` for direct-chat mode (no batch discount for individual chat completions).

---

## Phase 5: Validation Schemas — Add `deepseek` Provider (P2)

> **ORACLE RULING:** Add `deepseek` to Zod enums. Keep `gemini` and `openai` in enums for backward compat.

### 5.1 Update Zod enums

**File:** `lib/validation/consolidation-schemas.ts`

Add `'deepseek'` to:
- `BatchStatusSchema.provider`: `z.enum(['deepseek', 'openai', 'openai_compatible', 'gemini', 'lmstudio'])`
- `BatchJobSchema.provider`: same change

Keep `'gemini'` — oracle ruling: do not remove from global types in this pass.

---

## Phase 6: Admin UI Updates (P2)

### 6.1 `AIConsolidationSettingsCard.tsx`

**File:** `components/admin/settings/AIConsolidationSettingsCard.tsx`

- Remove any Gemini/OpenAI provider options from dropdowns
- Default provider should be `deepseek`
- Update model dropdown to show only DeepSeek models (`deepseek-chat`, `deepseek-reasoner`)
- Add docs link to https://api-docs.deepseek.com/

### 6.2 Settings page

**File:** `app/admin/settings/page.tsx`

- The "External AI stack finalized" alert is already DeepSeek-focused. Verify no stale OpenAI/Gemini references.

### 6.3 Monitoring page & ActiveConsolidationsTab

**File:** `components/admin/pipeline/ActiveConsolidationsTab.tsx`

- Remove "OpenAI" labels/badges. Show "DeepSeek" provider badge instead.
- Remove `openai_batch_id` display (use `provider_batch_id`).

### 6.4 BatchHistorySection

**File:** `components/admin/pipeline/consolidation/BatchHistorySection.tsx`

- Same: rename OpenAI references to DeepSeek.

---

## Phase 7: Documentation & Tests (P3)

### 7.1 Update `lib/consolidation/AGENTS.md`

- Remove all OpenAI Batch API references
- Replace with DeepSeek direct-chat architecture
- Update data flow diagram
- Update "Batch Processing" section → "Direct Chat Processing"

### 7.2 Update test mocks

**File:** `lib/consolidation/__mocks__/openai-client.ts` → rename to `llm-client.ts`

- Mock should provide DeepSeek-compatible responses
- Use `json_object` response format instead of `json_schema`

### 7.3 Update test assertions

- Any test referencing OpenAI batch IDs or OpenAI-specific behavior needs update
- Ensure tests validate `json_object` format works with DeepSeek

---

## Phase 8: Future Considerations (P3)

### 8.1 Concurrent chunk processing

Currently `processDirectChatChunk()` processes only 1 item per poll cycle. Consider processing multiple items concurrently using `Promise.all()` with a configurable concurrency limit (e.g., 5-10 parallel requests). DeepSeek's rate limit is 500 RPM, so we have headroom.

### 8.2 Retry at item level

Instead of the fallback batch mechanism, implement retry logic directly in `processDirectChatChunk()` for failed items (exponential backoff, max 3 attempts).

### 8.3 Streaming consideration

For UI feedback, consider using streaming responses (`stream: true`) in future to show live consolidation progress per item. DeepSeek supports SSE streaming.

### 8.4 `deepseek-reasoner` for hard cases

Add a feature flag to use `deepseek-reasoner` for products with low confidence scores in phase 1. The reasoner costs ~4x but may produce better taxonomy classification and attribute extraction.

### 8.5 Prefix caching optimization

DeepSeek automatically caches identical prefix content. The system prompt is identical across all items in a batch — ensure it's always prepended (not embedded differently) to maximize cache hits. This gives ~90% input cost reduction on cached tokens.

---

## Implementation Order

```
Phase 1: Critical Fix (response_format) ← MUST DO FIRST
Phase 2: Dead code removal
Phase 3: Rename OpenAi → LLM
Phase 4: Pricing catalog
Phase 5: Validation schemas
Phase 6: Admin UI
Phase 7: Docs & Tests
Phase 8: Future features
```

**Estimated effort:** 4-6 hours for phases 1-7.

---

## Files Affected (Complete List)

### Delete:
- `lib/providers/gemini-batch.ts`
- `lib/providers/gemini-client.ts`
- `lib/providers/interfaces.ts`

### Rename:
- `lib/consolidation/openai-client.ts` → `llm-client.ts`
- `lib/consolidation/__mocks__/openai-client.ts` → `__mocks__/llm-client.ts`

### Heavily modify:
- `lib/consolidation/batch-service.ts` (remove ~200 lines dead code)
- `lib/consolidation/taxonomy-validator.ts` (response format + schema in prompt)
- `lib/consolidation/direct-chat-service.ts` (remove fallback logic)
- `lib/consolidation/types.ts` (deprecate openai_batch_id)
- `lib/consolidation/index.ts` (update exports)

### Lightly modify:
- `lib/consolidation/prompt-builder.ts` (add schema text to system prompt)
- `lib/ai-scraping/models.ts` (remove Gemini stubs)
- `lib/ai-scraping/pricing.ts` (add DeepSeek models)
- `lib/ai-scraping/credentials.ts` (remove gemini from LLMProvider type)
- `lib/ai-scraping/deepseek.ts` (no changes, already correct)
- `lib/validation/consolidation-schemas.ts` (add deepseek, remove gemini)
- `shared/ai-pricing/pricing-catalog.json` (add DeepSeek entries)
- `lib/consolidation/AGENTS.md` (documentation update)
- `components/admin/settings/AIConsolidationSettingsCard.tsx`
- `components/admin/pipeline/ActiveConsolidationsTab.tsx`
- `components/admin/pipeline/consolidation/BatchHistorySection.tsx`

### No changes needed:
- `lib/consolidation/result-normalizer.ts` (provider-neutral)
- `lib/consolidation/two-phase-service.ts` (provider-neutral)
- `lib/consolidation/consistency-rules.ts` (provider-neutral)
- `lib/consolidation/parallel-runs.ts` (provider-neutral)
- `lib/consolidation/evaluation.ts` (provider-neutral)
- `lib/consolidation/result-parsing.ts` (provider-neutral)
- `supabase/migrations/` (schema already migrated)
