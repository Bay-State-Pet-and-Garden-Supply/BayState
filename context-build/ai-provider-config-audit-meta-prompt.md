# Meta-Prompt: AI Provider Configuration — Remediation & Next Steps

## Goal

Safely complete the AI Provider Configuration architecture so it is:
- Fully functional (configs can be managed, activated, and traced through the enrichment pipeline)
- Tested (active config resolution, fallback behavior, API endpoints)
- Secure (no plaintext API keys in JSONB columns)
- Reliable (migration covers all necessary DDL)

## Context/Evidence

See companion `ai-provider-config-audit.md` for full analysis. Key facts:

- **Migration exists** but does NOT add `config_id` or `ai_credentials` columns to `enrichment_jobs` / `enrichment_attempts` (ref: `apps/web/app/api/admin/enrichment/jobs/route.ts` lines 278, 300)
- **`database.types.ts` is stale** — enrichment table types lack the new columns (ref: `apps/web/lib/supabase/database.types.ts` lines 943-1122)
- **No admin CRUD API** exists for `ai_provider_configs`; the table can only be managed via SQL
- **`ai_credentials` stores decrypted API keys** in a JSONB column (ref: `apps/web/app/api/admin/enrichment/jobs/route.ts` line 277)
- **`getActiveAIProviderConfig()` has zero test coverage** (ref: `apps/web/__tests__/lib/ai-scraping/credentials.test.ts`)
- **Dual-path fallback** — active config overrides but if `null`, silently falls through to `site_settings` with no warning (ref: `apps/web/lib/ai-scraping/credentials.ts` lines 822-860)
- **Data migration targets hardcoded admin email** (ref: `supabase/migrations/20260518220000_add_ai_provider_configs.sql` line 39)

## Success Criteria

Before the next agent can finish, ALL of the following must be true:

1. ✅ A **new migration** exists that adds `config_id UUID` and `ai_credentials JSONB` to `enrichment_jobs`, and `config_id UUID` to `enrichment_attempts`, with FK references and indexes
2. ✅ **`database.types.ts` is regenerated** or manually updated to include the new columns on both tables
3. ✅ **Admin API routes** exist for CRUD operations on `ai_provider_configs` (at minimum: GET list, POST create/update, PATCH toggle active)
4. ✅ **`ai_credentials` no longer stores decrypted keys** — either stores only `config_id` + metadata, or the blob is encrypted
5. ✅ **Tests** cover `getActiveAIProviderConfig()`, the active-config branch in both runtime credential functions, and the enrichment jobs API's config_id/ai_credentials insertion
6. ✅ **Migration is idempotent** (can be re-run without errors) and safe against missing admin users
7. ✅ **No regressions** in legacy credential path — existing tests pass

## Hard Constraints

- **Do NOT edit files in `actions-runner/`** — that's a CI workspace copy
- **Migration filenames must follow the timestamp convention** (e.g., `20260519000000_add_config_id_to_enrichment.sql`)
- **All new API routes must use `requireAdminAuth`** for authorization
- **Encrypted columns** in `ai_provider_configs` use AES-256-GCM via `encryptSecret()`/`decryptSecret()` in `lib/ai-scraping/credentials.ts`
- **Do not remove or modify the existing `ai_provider_credentials` table or legacy credential paths** until a deprecation/migration plan is approved — the UI depends on them
- **RLS on `ai_provider_configs`** must remain admin-only via `is_admin()` policy

## Suggested Approach

1. **First, write the migration** (`supabase/migrations/20260519000000_add_config_id_to_enrichment.sql`):
   ```sql
   ALTER TABLE public.enrichment_jobs
     ADD COLUMN IF NOT EXISTS config_id UUID REFERENCES public.ai_provider_configs(id) ON DELETE SET NULL,
     ADD COLUMN IF NOT EXISTS ai_credentials JSONB;
   ALTER TABLE public.enrichment_attempts
     ADD COLUMN IF NOT EXISTS config_id UUID REFERENCES public.ai_provider_configs(id) ON DELETE SET NULL;
   CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_config_id ON public.enrichment_jobs(config_id);
   CREATE INDEX IF NOT EXISTS idx_enrichment_attempts_config_id ON public.enrichment_attempts(config_id);
   ```

2. **Update `database.types.ts`** — add the columns to the `Insert`, `Row`, `Update` types for both tables.

3. **Create admin API** at `apps/web/app/api/admin/ai-scraping/provider-configs/route.ts`:
   - `GET` → list all configs (or single by ID via searchParam)
   - `POST` → create/update a config (encrypt key, set `encrypted_key`/`iv`/`auth_tag`)
   - `PATCH` → toggle `is_active` (deactivate others, activate one — enforce singleton active)
   - `DELETE` → delete a config

4. **Fix `ai_credentials` snapshot** in `enrichment/jobs/route.ts`:
   - Instead of storing the full `AIScrapingRuntimeCredentials` (which includes decrypted keys), store only: `{ config_id, provider, model }`
   - The enrichment runner can re-derive the key from `config_id` when needed

5. **Update `credentials.ts`**: add a warning log when `ai_provider_configs` has rows but none are active.

6. **Write tests**:
   - `credentials.test.ts`: add test for `getActiveAIProviderConfig()` with mock `ai_provider_configs` row
   - `credentials.test.ts`: add test for active-config branch in `getAIScrapingRuntimeCredentials()`
   - `credentials.test.ts`: add test for active-config branch in `getAIConsolidationRuntimeConfig()`
   - `jobs-route.test.ts`: add test for `config_id` and `ai_credentials` insertion

## Validation

Run these sequentially:

```bash
# 1. TypeScript compilation
bun run web typecheck

# 2. Unit tests
bun run web test -- --testPathPattern="credentials"
bun run web test -- --testPathPattern="jobs-route"

# 3. Integration tests
bun run web test -- --testPathPattern="scraper-qa-flow"

# 4. Migration dry-run (against a dev db)
#   Apply the new migration and verify columns exist:
#   SELECT column_name FROM information_schema.columns
#   WHERE table_name IN ('enrichment_jobs','enrichment_attempts')
#   AND column_name IN ('config_id','ai_credentials');
```

## Stop/Escalation Rules

- **If the `is_admin()` function is not present** or has a different signature in the target database → ask via `contact_supervisor` with `reason: "need_decision"` — do not assume the function exists
- **If `ai_provider_credentials` table has a check constraint that blocks new providers** (the existing code handles this via `isProviderConstraintError` / site_settings compat) → verify the constraint still exists before adding new provider types to `ai_provider_configs`
- **If the enrichment callback or claim routes DO reference config_id** (current audit says they don't, but verify after updates) → update the audit

## Resolved Questions & Assumptions

| Question | Resolution |
|----------|-----------|
| Does `config_id` already exist on `enrichment_jobs`/`enrichment_attempts` in the live DB? | Not in any migration. Likely added via dashboard ALTER TABLE. Must be formalized. |
| Is `ai_credentials` encrypted? | No — it's plain JSONB containing decrypted API keys. Must be fixed. |
| Does any code read config_id from enrichment rows? | No downstream code reads it. It's write-only trace data. |
| Is there an FK from enrichment tables → ai_provider_configs? | No FK exists in any migration. |
| Does the admin UI need a CRUD page for ai_provider_configs? | Not required for this scope — API routes are sufficient for programmatic/script access. A future UI task can build the frontend. |
| Is the `ai_provider_configs` migration batch-safe? | The migration uses `DO $$` with sequential inserts inside a single transaction. If any provider row fails, the entire migration rolls back. Consider splitting into separate DO blocks per provider. |

## Output Expectations

The next agent should deliver:
1. **Migration file** in `supabase/migrations/` with the ALTER TABLE + index statements
2. **Updated `database.types.ts`** with the new columns
3. **Admin API route** at `apps/web/app/api/admin/ai-scraping/provider-configs/route.ts`
4. **Updated `enrichment/jobs/route.ts`** with secure `ai_credentials` payload
5. **Updated `credentials.ts`** with warning log for orphaned configs
6. **Test updates** in the credentials and jobs-route test files
7. **Updated audit** (this document) reflecting the changes made

Each file path + 1-line description is the expected return format.
