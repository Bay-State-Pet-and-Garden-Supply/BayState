#HK|## 2026-04-02
#JB|- Introduced a split contract in `apps/web/lib/pipeline/types.ts`: persisted ingestion statuses live in `PERSISTED_PIPELINE_STATUSES`, while derived admin-only tabs live in `DERIVED_PIPELINE_TABS` and are merged by `ALL_PIPELINE_STATUSES` for UI use.
#WM|- Kept deprecated compatibility exports (`PipelineStatus`, `PIPELINE_STATUS_VALUES`, legacy pipeline tab aliases, and legacy transition keys) so downstream imports continue compiling while callers migrate off local unions.
#VW|- `apps/web/lib/pipeline/core.ts` now validates transitions against the canonical persisted four-state workflow even though compatibility keys remain exported for older tests and callers.
#RW|- `bun x tsc --noEmit` still fails because of pre-existing unrelated errors in `__tests__/app/api/scraper/v1/login-forwarding.test.ts`; evidence captured in `.sisyphus/evidence/task-1-freeze-canonical-status-contract.txt`.
#YH|- The status-normalization migration drops any legacy `products_ingestion` check constraints that mention `pipeline_status` before remapping rows, then re-adds a single canonical four-state check to avoid old constraints blocking backfills.
#KH|- `published` rows are backfilled to `finalized` in SQL and documented as derived-only thereafter; the `products_published` view now treats finalized ingestion rows as storefront-ready output.
#SV|- Task 3 centralizes the persisted transition graph in `apps/web/lib/pipeline/core.ts` and re-exports it from `apps/web/lib/pipeline.ts`, so bulk moves and API validation share the same 4-state rules: `imported -> scraped -> finalized`, `finalized -> scraped`, and `failed -> imported`.
#YH|- Reset semantics now line up with retry/rework behavior: moving back to `imported` clears scrape + review artifacts, while rework back to `scraped` preserves sources but clears consolidated/image-review fields.
#XT|- Writer normalization follow-up: onboarding now writes `imported` directly, scraper callback persistence no longer dual-writes `pipeline_status_new`, publish no longer persists `published`, and consolidation tests should assert canonical statuses only.
#WH|- Verification note: targeted writer tests passed for onboarding, scraper callback, and consolidation, but the new publish regression test still needs its mock expectation aligned; `bun run web build` is still blocked by an unrelated `BulkActionsToolbar.tsx` type error outside this task.
#XY|- Task 7 UI normalization: `StageTabs.tsx` now renders persisted workflow tabs (`imported`, `scraped`, `finalized`, `failed`) separately from operational tabs (`monitoring`, `consolidating`, `published`, `images`, `export`) so derived views no longer appear inside the canonical ingestion flow.
#QW|- `PipelineClient.tsx` should validate route stages via `isPersistedStatus()`/`isDerivedTab()` instead of hardcoded arrays; that keeps new operational tabs aligned with the shared type contract and prevents `published` from being treated like a persisted API status.
#SB|- `app/admin/pipeline/page.tsx` should only prefetch products for persisted statuses. Derived tabs can still resolve as valid route params, but they must skip server-side `getProductsByStatus()` calls because `/api/admin/pipeline` accepts persisted statuses only.
#T10|- Final Task 10 audit confirmed published/export derivation still works without persisted `published`: `loadPublishedShopSiteExport()` pulls storefront SKUs from `products`, then hydrates ingestion rows by SKU.
#T10|- The migration `20260402103000_cleanup_pipeline_status.sql` is correctly authored to drop `pipeline_status_new`, remap legacy values, and restore canonical `products_ingestion_pipeline_status_check`, but live schema has not applied it yet.
#T10|- Active pipeline runtime still contains legacy route/status strings (notably `ExportWorkspace.tsx` legacy `registered`/`enriched` filters plus compat mappings), so completion gating must treat Task 10 as audit-failed until cleanup lands.

## 2026-04-08
#T6|- Created migration `20260409000002_add_cohort_to_scrape_jobs.sql` to add cohort tracking columns:
  - `cohort_id` (uuid FK to cohort_batches)
  - `is_cohort_batch` (boolean)
  - `cohort_status` (text with check constraint)
  - Indexes for cohort queries
#T6|- Updated TypeScript types in `types/supabase.ts` and `types/scraper.ts` with new cohort fields
#T6|- Supabase MCP tools had issues with project ID - migration file created but needs manual application
#T6|- TypeScript compilation passes for modified files; pre-existing test errors remain unrelated to changes
