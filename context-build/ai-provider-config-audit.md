# AI Provider Configuration Architecture — Audit Report

**Date:** 2026-05-18  
**Scope:** `ai_provider_configs` schema/migration, `lib/ai-scraping/credentials.ts`, enrichment job API, `config_id` tracing, active-profile selection, tests.

---

## 1. Schema & Migration

**File:** `supabase/migrations/20260518220000_add_ai_provider_configs.sql`

| Aspect | Detail |
|--------|--------|
| Table | `public.ai_provider_configs` |
| Enum type | `ai_provider_type` = `'deepseek'`, `'openai'`, `'openai_compatible'`, `'gemini'`, `'lmstudio'` |
| Columns | `id UUID PK`, `name TEXT NOT NULL`, `provider_type`, `base_url`, `default_model`, `encrypted_key TEXT NOT NULL`, `iv TEXT NOT NULL`, `auth_tag TEXT NOT NULL`, `key_version INT DEFAULT 1`, `is_active BOOLEAN DEFAULT false`, `created_at`, `updated_at`, `updated_by UUID → auth.users(id)` |
| Index | `idx_ai_provider_configs_is_active` (partial, `WHERE is_active = true`) |
| RLS | Enabled; admin-only policy via `is_admin()` |
| Data migration | `DO $$` block copies from legacy `ai_provider_credentials` table, merging with `site_settings.ai_scraping_defaults` to determine `is_active` flag |

### Migration risks

1. **Hardcoded admin lookup**: The migration does `SELECT id FROM auth.users WHERE email = 'admin@example.com'`. If that user doesn't exist or was deleted, it falls back to `SELECT id FROM auth.users LIMIT 1`, which could pick the wrong user.
2. **No FK from configs to credentials**: The migration copies data from `ai_provider_credentials` but there's no referential integrity constraint to ensure consistency between old and new records.
3. **`is_admin()` function dependency**: The RLS policy calls `is_admin()` which must exist in the DB. If the project was migrated from a different Supabase project, this function might have a different signature.

---

## 2. Active Config Resolution (`credentials.ts`)

**File:** `apps/web/lib/ai-scraping/credentials.ts`

### Core function: `getActiveAIProviderConfig()` (line 785)

Queries `ai_provider_configs` WHERE `is_active = true` with `.maybeSingle()`. Returns `AIProviderConfig | null`.

### Consumer 1: `getAIScrapingRuntimeCredentials()` (line 810)

```
flowchart:
  getAIScrapingDefaults()          → legacy site_settings path
  getActiveAIProviderConfig()      → new ai_provider_configs path
  getAIScrapingProviderSecret('deepseek') → legacy credential
  getAIScrapingProviderSecret('serpapi') → search API key

  IF activeConfig:
    llm_provider     = activeConfig.provider_type
    llm_model        = activeConfig.default_model
    llm_base_url     = activeConfig.base_url (normalized via getDeepSeekOpenAICompatibleBaseURL)
    llm_api_key      = decrypted(activeConfig.encrypted_key)
    config_id        = activeConfig.id
    deepseek_api_key = decrypted key (if deepseek)
  ELSE:
    llm_provider     = defaults.llm_provider
    llm_model        = defaults.llm_model
    llm_base_url     = defaults.llm_base_url (normalized)
    config_id        = undefined (not set)
```

### Consumer 2: `getAIConsolidationRuntimeConfig()` (line 875)

Same pattern but additionally fetches OpenAI key for batch fallback. Active config overrides provider/model/url/key.

### Critical behavior: dual-path fallback

When `getActiveAIProviderConfig()` returns `null` (no `is_active=true` row), the functions silently fall back to the legacy `site_settings` path. This means:
- **Both paths can be independently configured**, leading to confusion if an admin sets up `ai_provider_configs` but forgets to mark one as `is_active = true`
- **No warning is logged** when falling back to defaults despite having rows in `ai_provider_configs` (just none active)
- **`config_id` is only set when activeConfig is found**, creating inconsistency in traces

---

## 3. Enrichment Job API (`enrichment/jobs/route.ts`)

**File:** `apps/web/app/api/admin/enrichment/jobs/route.ts` (POST handler, line 256-300)

### What it does:

```typescript
const [activeConfig, aiRuntimeCreds] = await Promise.all([
  getActiveAIProviderConfig(),
  getAIScrapingRuntimeCredentials(),
]);

// On enrichment_jobs:
{
  config: jobConfig,
  ai_credentials: aiRuntimeCreds,   // snapshot of runtime creds
  config_id: activeConfig?.id ?? null,
}

// On each enrichment_attempt:
{
  config_id: activeConfig?.id ?? null,
}
```

### Observations

- **`ai_credentials` stores a full runtime snapshot** including decrypted API keys. This is a **security concern** — the entire `AIScrapingRuntimeCredentials` object (including `llm_api_key`, `deepseek_api_key`, `serper_api_key`) is serialized into the `enrichment_jobs.ai_credentials` JSONB column in plaintext. Any admin or staff who can read `enrichment_jobs` rows via the API or DB can extract API keys.
- **`config_id` is stored but never read downstream.** The enrichment pipeline (claim-enrichment, enrichment-callback, progress routes) doesn't reference `config_id` at all. It's written for traceability but unused during processing.

---

## 4. `config_id` Tracing — Complete Analysis

| Table | Has `config_id` column? | Written by | Read by | Notes |
|-------|------------------------|-----------|---------|-------|
| `enrichment_jobs` | **YES** (not in baseline migration, likely added via ALTER TABLE) | `POST /api/admin/enrichment/jobs` | **Nowhere** | Stored as `activeConfig?.id ?? null` |
| `enrichment_attempts` | **YES** (same) | `POST /api/admin/enrichment/jobs` | **Nowhere** | Stored per-attempt for trace |
| `ai_provider_configs` | N/A (it's the FK target) | Migration + future admin UI | `getActiveAIProviderConfig()` | |
| `scraper_config_versions` | Different config_id (points to `scraper_configs.id`, not `ai_provider_configs.id`) | Scraper operations | Scraper operations | Separate system entirely |

**BIGGEST GAP:** The `config_id` column on `enrichment_jobs` and `enrichment_attempts` **does not exist in the baseline migration** (`20250101000000_baseline.sql`) and **is absent from `database.types.ts`**. It may have been added via an un-tracked `ALTER TABLE` or via the Supabase dashboard schema editor. This means:
- TypeScript compilation may quietly pass because the code uses `as any` casts or the Supabase client's loose typing
- The column might not exist on a fresh database built from migrations
- No migration script documents this column addition

---

## 5. Type Definitions Mismatch

| Types file | Has `config_id` on `enrichment_jobs`? | Has `ai_credentials` on `enrichment_jobs`? | Has `config_id` on `enrichment_attempts`? |
|-----------|--------------------------------------|------------------------------------------|------------------------------------------|
| `database.types.ts` (lines 1071-1122) | ❌ No | ❌ No | ❌ No |
| `types/supabase.ts` (auto-generated) | ❌ Not present (table not in generated types) | ❌ Not present | ❌ Not present |

The code compiles because the Supabase JS client uses `as unknown` patterns or because TypeScript's structural typing doesn't enforce the exact schema. But this is fragile.

---

## 6. Admin UI Integration

### Existing admin endpoints

| Route | Purpose | Uses ai_provider_configs? |
|-------|---------|-------------------------|
| `GET/POST /api/admin/ai-scraping/credentials` | Read/write legacy credentials + defaults | ❌ No — still operates on `ai_provider_credentials` + `site_settings` |
| `GET /api/admin/ai-scraping/models` | Fetch available models for a provider | ❌ No — uses `getAIScrapingProviderSecret()` legacy path |
| `GET/POST /api/admin/consolidation/settings` | Read/write consolidation settings | ❌ No — uses `getAIIAIConsolidationDefaults()` legacy path |

**There is NO admin API to:**
- List/create/update/delete rows in `ai_provider_configs`
- Set or toggle `is_active` on a config
- Read back which config is active

The table is only manageable via direct SQL or the Supabase Dashboard.

---

## 7. Tests Coverage

| Test file | What it tests | Covers ai_provider_configs? |
|-----------|--------------|---------------------------|
| `__tests__/lib/ai-scraping/credentials.test.ts` | Legacy compat layer (deepseek fallback to site_settings) | ❌ No tests for `getActiveAIProviderConfig()` |
| `__tests__/app/api/admin/ai-scraping/credentials.route.test.ts` | Admin credentials API | ❌ No (tests legacy path only) |
| `__tests__/lib/ai-scraping/pricing.test.ts` | Pricing calculation | ❌ No |
| `__tests__/lib/brand-scraper-mappings.test.ts` | Brand-scraper mappings | ❌ Separate concern |
| `__tests__/integration/scraper-qa-flow.test.ts` | QA flow with mock enrichment jobs | ❌ Uses mock `config_id` (different — scraper_configs FK) |
| `__tests__/app/api/admin/enrichment/jobs-route.test.ts` | Enrichment jobs API | ❌ Does NOT test `config_id` or `ai_credentials` insertion |

**`getActiveAIProviderConfig()` has zero test coverage.**
**`getAIScrapingRuntimeCredentials()` tests skip the active config path** (no `ai_provider_configs` row in the test mocks).

---

## 8. Production Blocker Assessment

### Critical (fix before deploying)

1. **Missing migration for enrichment_jobs/enrichment_attempts columns**  
   `config_id` and `ai_credentials` columns on `enrichment_jobs` and `config_id` on `enrichment_attempts` are not in any migration file. If the DB is rebuilt from scratch, the POST handler will throw Postgres column-not-found errors.

2. **API keys stored in plaintext JSONB column**  
   `ai_credentials` on `enrichment_jobs` contains decrypted API keys (`llm_api_key`, `deepseek_api_key`, `serper_api_key`, `serpapi_api_key`). Any admin or staff user who can read the table via API or SQL can extract secrets. Consider storing a `config_id` FK reference instead of the decrypted payload, or encrypting the blob.

3. **No admin API for the new table**  
   The only way to activate or manage `ai_provider_configs` is via direct SQL. The admin credentials UI won't know about the new table. If someone runs the migration, then later saves credentials through the admin UI (which writes to `ai_provider_credentials`), the active config and the stored credential can diverge.

### High (fix before shipping to customers)

4. **Dual-config confusion (silent fallback)**  
   If `getActiveAIProviderConfig()` returns `null`, the code silently falls back to `site_settings`. No logging or warning. An admin might think their new config is active when it's actually not marked `is_active`.

5. **`database.types.ts` is out of sync**  
   The type definitions don't include the new columns. This will cause runtime errors if someone regenerates types from the schema without adding the columns to a migration.

6. **Migration targets a potentially non-existent admin user**  
   The `DO $$` block's admin lookup is fragile.

### Medium

7. **No FK constraint from enrichment_jobs.config_id → ai_provider_configs.id**  
   `config_id` is stored as a text/UUID with no referential integrity. An orphaned config_id won't be detected.

8. **No index on enrichment_jobs.config_id or enrichment_attempts.config_id**  
   If these columns become queried later, there's no index support.

9. **`config_id` on enrichment rows is written but never consumed**  
   Not a blocker, but wasteful writes that accumulate stale data if the feature isn't completed.

---

## 9. Validation Checks

Run these to verify the current state:

```bash
# 1. Check if enrichment tables have config_id columns
psql -d "$SUPABASE_DB" -c "
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name IN ('enrichment_jobs', 'enrichment_attempts')
  AND column_name IN ('config_id', 'ai_credentials');
"

# 2. Check ai_provider_configs table exists and has data
psql -d "$SUPABASE_DB" -c "
  SELECT id, name, provider_type, is_active FROM public.ai_provider_configs;
"

# 3. Check if migration has been applied
psql -d "$SUPABASE_DB" -c "
  SELECT * FROM supabase_migrations.schema_migrations
  WHERE version = '20260518220000';
"

# 4. Check for enrichment rows with config_id populated
psql -d "$SUPABASE_DB" -c "
  SELECT COUNT(*) AS with_config_id FROM enrichment_jobs WHERE config_id IS NOT NULL;
  SELECT COUNT(*) AS with_ai_creds FROM enrichment_jobs WHERE ai_credentials IS NOT NULL;
"

# 5. Verify is_admin() function exists
psql -d "$SUPABASE_DB" -c "
  SELECT proname, prosrc FROM pg_proc WHERE proname = 'is_admin';
"
```

---

## 10. Suggested Remediation Order

1. **Create a migration** that adds `config_id UUID REFERENCES ai_provider_configs(id) ON DELETE SET NULL` and `ai_credentials JSONB` to `enrichment_jobs`, and `config_id UUID REFERENCES ai_provider_configs(id) ON DELETE SET NULL` to `enrichment_attempts`. Add indexes.

2. **Regenerate `database.types.ts`** from the updated schema.

3. **Add an admin CRUD API** for `ai_provider_configs` (GET to list, POST to create/update, DELETE, PATCH to toggle `is_active`).

4. **Remove decrypted keys from `ai_credentials` snapshot** — store only `config_id` plus non-sensitive metadata (provider, model), or encrypt the blob.

5. **Add tests** for `getActiveAIProviderConfig()`, the active-config branches in `getAIScrapingRuntimeCredentials()` and `getAIConsolidationRuntimeConfig()`, and the enrichment jobs API's config_id handling.

6. **Add a health check** or warning log when `ai_provider_configs` has rows but none active.

---

## 11. Source File Index

| File | Lines of Interest | Role |
|------|-------------------|------|
| `supabase/migrations/20260518220000_add_ai_provider_configs.sql` | Full file | Creates table, enum, index, RLS, data migration |
| `apps/web/lib/ai-scraping/credentials.ts` | 785-795 (getActiveAIProviderConfig), 810-875 (getAIScrapingRuntimeCredentials), 875-940 (getAIConsolidationRuntimeConfig) | Active config resolution, runtime credentials |
| `apps/web/app/api/admin/enrichment/jobs/route.ts` | 256-300 | Enrichment job creation; stores config_id + ai_credentials |
| `apps/web/lib/supabase/database.types.ts` | 943-1122 | Enrichment tables types (**missing config_id**) |
| `apps/web/__tests__/lib/ai-scraping/credentials.test.ts` | Full file | Tests legacy compat, **no active config tests** |
| `apps/web/__tests__/app/api/admin/ai-scraping/credentials.route.test.ts` | Full file | Tests admin credentials API legacy path |
| `apps/web/app/api/admin/ai-scraping/credentials/route.ts` | Full file | Admin credentials management (legacy path) |
| `apps/web/app/api/admin/consolidation/settings/route.ts` | Full file | Consolidation settings (legacy path) |
| `apps/web/lib/consolidation/openai-client.ts` | 1-100 | Uses `getAIConsolidationRuntimeConfig()` — indirectly uses active config |
| `apps/web/lib/consolidation/batch-service.ts` | Full (2330 lines) | Batch submission/retrieval; uses openai-client |
| `apps/web/app/api/scraper/v1/claim-enrichment/route.ts` | Full file | Claims attempts (does NOT read config_id) |
| `apps/web/app/api/scraper/v1/enrichment-callback/route.ts` | Full file | Submits enrichment results (does NOT read config_id) |
| `apps/web/lib/admin/scrapers/credentials.ts` | Full file | Different credential system (scraper_login credentials, not AI provider configs) |

---

*End of audit report. See companion `meta-prompt.md` for handoff to next agent.*
