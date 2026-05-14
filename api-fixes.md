# API Fixes - Completed

## Files Modified

| File | What Changed |
|------|-------------|
| `apps/scraper/scrapers/ai_search/enrichment_models.py` | Added `EnrichmentResultStatus` type alias, `EnrichmentMode` type alias, and `build_v1_from_extraction_result()` function. Changed mode regex from `structured\|metadata\|llm\|mixed` to `json_ld\|metadata\|llm\|mixed` to match TS contract. |
| `apps/scraper/core/api_client.py` | **claim_enrichment()**: Changed to parse `response.get("attempts", [])` instead of `response.get("attempt")`. Maps fields: `id`→`attempt_id`, `source_url`→`target_url`, `config`→`job_config`.  **submit_enrichment_result()**: Now sends full `EnrichmentResultV1` JSON as the request body with `_attempt_id` and `_lease_token` embedded in the body (Zod strips them). Added `lease_token` parameter. |
| `apps/web/app/api/scraper/v1/claim-enrichment/route.ts` | Replaced `authenticateRequest()` env-var check with `validateRunnerAuth()` from `@/lib/scraper-auth`. Replaced user-context `createClient()` with service-role `getSupabaseAdmin()`. Added `domain`, `target_id`, `ai_credentials`, `lease_expires_at`, `test_mode` to response. |
| `apps/web/app/api/scraper/v1/enrichment-callback/route.ts` | Replaced auth with `validateRunnerAuth()` + `getSupabaseAdmin()`. Now reads `_attempt_id` and `_lease_token` from payload body (stripped by Zod during validation). Fixed type handling for `safeValidateEnrichmentResultV1` return type. |
| `apps/web/app/api/admin/enrichment/jobs/route.ts` | POST: Uses `requireAdminAuth()` + `createAdminClient()`. GET: Now properly authenticated with `requireAdminAuth()`. |
| `apps/web/lib/enrichment/validation.ts` | Replaced `safeValidateEnrichmentResultV1` to return `{ success, data, error }` shape matching what the callback route expects. |

## Contract Alignment

### Claim (web → Python)
- Web returns `{ attempts: [{ id, job_id, sku, source_url, domain, mode, model, target_id, config, ai_credentials, lease_token, lease_expires_at, test_mode }] }`
- Python parses `attempts` array, maps `id`→`attempt_id`, `source_url`→`target_url`, `config`→`job_config`

### Callback (Python → web)
- Python sends full `EnrichmentResultV1` JSON as body with `_attempt_id` and `_lease_token` embedded
- Web validates body with `safeValidateEnrichmentResultV1` (Zod strips unknown fields)
- Web reads `_attempt_id` and `_lease_token` from `rawBody` before validation

## Remaining TypeScript Errors (not in scope)
- `ProcessedResultsView.tsx` — implicit any types
- `fallback-orchestration.ts` — old statuses (Phase 8 delete candidate)
- 35+ other files with old status tests

## Validation
- All fixed web files pass `bun run web tsc --noEmit`
- All modified Python files pass `ast.parse()` syntax check
