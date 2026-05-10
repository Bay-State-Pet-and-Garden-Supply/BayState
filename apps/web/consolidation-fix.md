# Consolidation AGENTS.md Fix — Completed

## Corrections Applied

| # | Fix | Status |
|---|-----|--------|
| 1 | Structure table: `llm-client.ts` → `openai-client.ts` | ✅ |
| 2 | RENAMING NOTES: Removed false "completed renames" claims. Replaced with accurate "planned, not executed" note referencing `DEEPSEEK_OVERHAUL_PLAN.md` | ✅ |
| 3 | Removed phantom rename claims (`getOpenAIClient→getLLMClient`, `isOpenAIConfigured→isLLMConfigured`). Noted `getLLMClient()` is from `lib/ai-scraping/credentials.ts` external to this module | ✅ |
| 4 | Added `evaluation.ts` to structure listing (confirmed it exists at that path) | ✅ |
| 5 | API Routes: 6 → 13 endpoints. Added: `[batchId]/process`, `models`, `reset`, `review`, `scraped`, `webhook`, `ws` | ✅ |
| 6 | Removed hardcoded DeepSeek pricing ($0.14/$0.28). Replaced with: "Loaded dynamically from `lib/ai-scraping/pricing.ts`" | ✅ |
| 7 | WHERE TO LOOK: LLM Config row now points to `openai-client.ts` and lists both `getConsolidationConfig()` and `CONSOLIDATION_CONFIG` | ✅ |

## Verification
- `llm-client.ts` does NOT exist on disk → rename never happened → doc now correct
- `openai-client.ts` exports: `getConsolidationConfig()`, `CONSOLIDATION_CONFIG`, `getOpenAIClient()`, `isOpenAIConfigured()` → all now referenced in doc
- `evaluation.ts` exists at `lib/consolidation/evaluation.ts` → doc includes it
- API routes verified: 13 route.ts files under `app/api/admin/consolidation/` → doc lists all 13
- `lib/ai-scraping/pricing.ts` exists → pricing reference is valid

## File Changed
- `apps/web/lib/consolidation/AGENTS.md` — 6 targeted edit blocks applied
