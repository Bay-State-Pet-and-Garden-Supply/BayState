# Worker C — Pricing + Schemas + Pricing Mode Switch

## Changes Made

### 1. `shared/ai-pricing/pricing-catalog.json`
Added DeepSeek pricing entries:
- `deepseek-chat`: $0.14/M input, $0.28/M output
- `deepseek-reasoner`: $0.55/M input, $2.19/M output  
Both `mode: "sync"` (no batch API). Inserted between OpenAI and Gemini entries.

### 2. `lib/validation/consolidation-schemas.ts`
Added `'deepseek'` as first value in both provider Zod enums:
- `BatchStatusSchema.provider`: `z.enum(['deepseek', 'openai', 'openai_compatible', 'gemini', 'lmstudio'])`
- `BatchJobSchema.provider`: same
Kept all legacy values (`openai`, `openai_compatible`, `gemini`, `lmstudio`) for backward compat.

### 3. `lib/consolidation/batch-service.ts` (line 1540)
Switched `calculateAICost()` pricing mode from `isBatch: true` → `isBatch: false` in `getBatchStatus()`. Since DeepSeek has no batch API discount, direct-chat chunks use sync pricing.

## Verification

- Pricing catalog JSON: valid, DeepSeek entries present
- Validation schemas: `deepseek` added to both enums
- Batch service: `isBatch: false` applied
- Pre-existing TS errors from `buildOpenAIResponseFormat` rename (worker A's scope) — not caused by my changes
