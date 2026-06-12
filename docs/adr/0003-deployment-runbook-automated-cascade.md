# Automated Source Cascade — Deployment Runbook

## Pre-deployment checklist

- [ ] All Phase 1-4 changes merged to a deployment branch
- [ ] TypeScript compiles (`cd apps/web && bun run tsc --noEmit`)
- [ ] All focused tests pass (`bun run web test`)
- [ ] Python files parse (`python3 -c "import ast; ast.parse(open('apps/scraper/...').read())"`)
- [ ] DB migration reviewed (`apps/web/supabase/migrations/20260611120000_automated_source_cascade.sql`)

## Deployment order

### 1. Pause scraper runners

Stop all Python scraper daemons/workers BEFORE deploying DB changes:

```bash
# On each runner host:
systemctl stop baystate-scraper  # or equivalent
# Verify no running processes:
ps aux | grep daemon.py
```

### 2. Drain or cancel in-flight enrichment jobs

Let active jobs complete naturally (~5 min grace period), or cancel them:

```bash
# Via admin UI: Admin → Pipeline → Extracting tab → Cancel active jobs
# Or via API:
curl -X DELETE "https://<host>/api/admin/enrichment/jobs?id=<job-id>" \
  -H "Authorization: Bearer <admin-token>"
```

### 3. Deploy database migration

```bash
cd apps/web
supabase db push  # or supabase migration up
```

Verify:
- `needs_attention` exists in `pipeline_status_five` enum
- `enrichment_source_attempts` table exists with correct schema
- `brands.source_cascade_configured_at` column exists
- `brand_sources.search_mode` constraint accepts `upc_search`

### 4. Deploy web application

```bash
# Deploy to production (Vercel, etc.)
git push origin main  # or merge deployment PR
```

Verify:
- Admin pipeline loads without errors
- Brand settings page shows "Cascade" column
- All existing tabs (Imported, Extracting, Processed, etc.) still work

### 5. Deploy scraper runner

```bash
# On each runner host:
git pull origin main
# Restart:
systemctl start baystate-scraper
```

Verify:
- Runners heartbeat successfully
- Extraction jobs are claimed and executed

### 6. Post-deployment verification

- [ ] Create a test brand, configure its Source Cascade in Brand Settings
- [ ] Import a test product, assign the brand
- [ ] Click "Start Extraction" — verify job is created without dialog
- [ ] Verify extraction runs the full cascade
- [ ] Check Needs Attention tab appears and shows errors (if any)
- [ ] Verify processed products can be re-extracted (incremental)
- [ ] Verify unconfigured brands block extraction with clear message

## Rollback plan

If issues are found:

1. **Revert web deployment** — deploy previous commit
2. **Revert database migration** — requires manual SQL:
   ```sql
   -- Drop new table
   DROP TABLE IF EXISTS enrichment_source_attempts;
   -- Remove columns from brands
   ALTER TABLE brands DROP COLUMN IF EXISTS source_cascade_configured_at;
   ALTER TABLE brands DROP COLUMN IF EXISTS source_cascade_configured_by;
   -- Note: cannot remove enum value from pipeline_status_five
   -- (Postgres doesn't support removing enum values)
   -- Workaround: leave the value, it's harmless if unused
   ```
3. **Revert runner** — deploy previous commit, restart

## Known migration effects

- **Existing brands are NOT auto-configured** — admins must configure each brand's Source Cascade before extraction can run for that brand. Configure via Admin → Brands → Edit → Source Cascade section.
- **Existing `enrichment_config.enabled_sources` data is ignored** — stays in the database but no longer affects source plans. Can be cleaned up later.
- **In-flight products in `extracting` status** — if any remain after draining, they can be reset via Admin → Pipeline → Reset Stuck Products, or the `/api/admin/enrichment/reset` endpoint.
