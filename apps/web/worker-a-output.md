Here's the implementation summary:

## Done: DeepSeek Consolidation P0/P1

### P0 Critical Fix (Response Format)
- **`buildOpenAIResponseFormat()` → `buildJSONResponseFormat()`** in `taxonomy-validator.ts` — now returns `{ type: "json_object" }` instead of OpenAI's `json_schema` strict mode
- Updated all imports and call sites in `batch-service.ts` and `direct-chat-service.ts`
- Removed unused `responseSchema` parameter from `createDirectChatBatch()`

### Output Contract in Prompt
- `generateSystemPrompt()` now appends a **compact JSON output contract** with all 9 required fields, allowed ShopSite pages, and category list (with 50-entry token guard)
- This replaces the old static structured output constraint — DeepSeek doesn't support OpenAI's strict JSON schema mode

### Already Present (Verified)
- ✅ Item-level retry (3 attempts, exponential backoff) in `direct-chat-service.ts`
- ✅ DeepSeek pricing entries in `pricing-catalog.json`
- ✅ `deepseek` already in validation schema provider enums
- ✅ `isBatch: false` already set for sync pricing

### Files Changed
| File | Change |
|------|--------|
| `lib/consolidation/taxonomy-validator.ts` | Response format function renamed |
| `lib/consolidation/prompt-builder.ts` | Compact output contract added |
| `lib/consolidation/batch-service.ts` | Import + usage updated |
| `lib/consolidation/direct-chat-service.ts` | Import + param cleaned up |
| `lib/consolidation/AGENTS.md` | Full rewrite for DeepSeek architecture |
| `__tests__/...taxonomy-validator.test.ts` | Updated for new function |
| `lib/consolidation/__tests__/prompt-builder.test.ts` | Updated for new prompt text |

### Validation
- **80 tests pass** across 12 suites
- **0 new type errors** (3 pre-existing unrelated)
- **0 new lint warnings** (15 pre-existing unrelated)

### What Was NOT Touched (Per Oracle)
- `lib/providers/` directory (Gemini dead code)
- `LLMProvider` type (kept `gemini`)
- `openai_batch_id` read compatibility
- OpenAI Batch API dead code removal (incomplete cleanup pass)
- File renames (`openai-client.ts` → `llm-client.ts`)

### Recommended Next Step
Phase 2 cleanup pass: remove OpenAI Batch API dead code (`submitBatchToOpenAI`, `persistBatchJobRecord`, `llm_supports_batch_api` branching), rename `openai-client.ts` → `llm-client.ts`, remove LM Studio fallback (after retry proven in prod).