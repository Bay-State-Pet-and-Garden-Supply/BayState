# Merging Tab: Context for Implementation

## Two Core Issues

### 1. Forced Shared Model
**The active AI provider config drives both extraction AND consolidation.** There's no way to set a separate model for each.

**Key code paths:**
- `apps/web/lib/ai-scraping/credentials.ts:1007` — `getAIScrapingRuntimeCredentials()` reads ONLY `getActiveAIProviderConfig()` (single `is_active=true` row in `ai_provider_configs`)
- `apps/web/lib/ai-scraping/credentials.ts:1040` — `getAIConsolidationRuntimeConfig()` also reads `getActiveAIProviderConfig()` for non-Gemini providers
- Gemini IS independent: when `defaults.llm_provider === 'gemini'` (line 1046), it resolves Gemini key separately from `getAIScrapingProviderSecret('gemini')`
- Consolidation defaults stored at `site_settings` key `ai_consolidation_defaults` — already has `llm_provider`, `llm_model`, `llm_base_url`, `confidence_threshold`, `llm_supports_batch_api`
- Admin settings UI (`AIProviderProfilesCard.tsx`) confirms: "The active profile drives scraping and consolidation workflows"
- Settings page (`apps/web/app/admin/settings/page.tsx`) alert: "that active profile will automatically drive scraping, consolidation, and the Finalization Copilot"

**Consolidation submission flow:**
```
PipelineClient.tsx:681 handleConsolidate()
 → POST /api/admin/consolidation/submit  (route.ts)
 → submitBatch() in batch-service.ts:1080
   → getConfiguredBatchRuntime()  → getConsolidationConfig()  → getAIConsolidationRuntimeConfig()
   → Routes to gemini_batch or direct_chat_chunks based on provider
   → For DeepSeek: processBatchQueue() loops with 5-item chunks
```

### 2. Merging Tab Uses Single Batch API UI
**`ActiveConsolidationsTab` renders ALL jobs identically regardless of execution_mode.**

- `ActiveConsolidationsTab.tsx` — Fetches `PipelineRunSummary[]`, maps all to `ConsolidationJob`, single `ConsolidationJobCard`
- `ConsolidationJobCard.tsx` — Checks `executionMode === "direct_chat_chunks"` for label but identical UX for all modes
- 30s polling — no real-time subscriptions
- `execution_mode` values from `batch-service.ts`: `batch_api`, `direct_chat_chunks`, `gemini_batch`

**Reference (extraction tab):**
- `ActiveEnrichmentsTab.tsx` — Real-time subscriptions via `useJobSubscription`, `useAttemptsSubscription`; rich per-item progress, live console logs

**Key types** (`consolidation/shared.tsx`):
- `ConsolidationJob` — id, status, execution_mode, provider, metadata (holds llm_model), progress, counts
- `BatchHistoryJob` — history for archive view

## Files to Modify

### Model Decoupling:
| File | Change |
|------|--------|
| `lib/ai-scraping/credentials.ts` | Add `consolidation_provider`, `consolidation_model` to `AIConsolidationDefaults`; update `getAIConsolidationRuntimeConfig()` |
| `lib/consolidation/openai-client.ts` | Pass new consolidation config through `getConsolidationConfig()` |
| `lib/consolidation/batch-service.ts` | Accept model/provider overrides in `submitBatch()` |
| `app/api/admin/consolidation/settings/route.ts` | GET/POST handle new fields |
| `app/api/admin/consolidation/submit/route.ts` | Accept optional `model`, `provider` in body |
| `components/admin/settings/AIProviderProfilesCard.tsx` | Add "Consolidation Model" section or new card |
| `app/admin/settings/page.tsx` | Add new consolidation card |

### UI Differentiation:
| File | Change |
|------|--------|
| `components/admin/pipeline/ActiveConsolidationsTab.tsx` | Route by execution_mode to different views |
| `components/admin/pipeline/consolidation/ConsolidationJobCard.tsx` | Split into `DirectConsolidationJobView` + `BatchConsolidationJobView` |
| `components/admin/pipeline/PipelineClient.tsx` | Pass model info through submission, add dialog |
| `components/admin/pipeline/FloatingActionsBar.tsx` | Optional model selection in "Merge selected" |

## Constraints
- Don't break legacy credential paths (`ai_provider_credentials`)
- Don't store decrypted API keys in JSONB
- State machine (`processed→merging→reviewing→publishing`) must stay intact
- Gemini independent path must remain functional
- All admin API routes use `requireAdminAuth`

## Validation Commands
```bash
bun run web typecheck
bun run web test -- --testPathPattern="credentials"
bun run web test -- --testPathPattern="PipelineClient.operational-tabs"
```

## Key Evidence Sources
- `lib/ai-scraping/credentials.ts:1007-1018` — scraping reads active config only
- `lib/ai-scraping/credentials.ts:1040-1076` — consolidation reads active config + defaults mix
- `lib/ai-scraping/credentials.ts:576-616` — `getAIConsolidationDefaults()`
- `lib/consolidation/batch-service.ts:1080-1200` — `submitBatch()`, routing logic
- `lib/consolidation/openai-client.ts:101-170` — `getConsolidationConfig()`, `getConsolidationConfig()`
- `components/admin/pipeline/ActiveConsolidationsTab.tsx` — full tab component (254 lines)
- `components/admin/pipeline/consolidation/ConsolidationJobCard.tsx` — single card component
- `components/admin/settings/AIProviderProfilesCard.tsx` — current AI provider settings UI
- `components/admin/pipeline/FloatingActionsBar.tsx` — shows "Merge selected" button
- `app/api/admin/consolidation/submit/route.ts` — submit endpoint

See `handoff/final-handoff-plan.md` for full implementation plan and meta-prompt.
