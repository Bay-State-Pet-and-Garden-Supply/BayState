## 2026-04-02 — Task 8

- `bun x tsc --noEmit` is currently blocked by a pre-existing syntax error in `apps/web/__tests__/app/api/scraper/v1/login-forwarding.test.ts` (`TS1005` on line 84), outside Task 8 scope.
- Task 8 removed active runtime references to `pipeline_status_new` from the pipeline export boundary, consolidation scraped route, and B2B ingestion insert path.
- The temporary rollout shim is now centralized in `apps/web/app/api/admin/pipeline/status-compat.ts` and emits a warning when legacy `registered`/`enriched` route inputs are still used.

## 2026-04-02 — Task 10

- Live Supabase audit for project `fapnuczapctelxxmrail` showed only canonical row values in `products_ingestion.pipeline_status` (`imported`, `scraped`), but the schema still includes `pipeline_status_new` and currently exposes no active `pipeline_status` check constraint.
- Published/export derivation remains correct in `apps/web/lib/shopsite/export-builder.ts`: published SKUs come from `products`, then ingestion rows are loaded by SKU, so the export path does not rely on persisted `published` or slug-only matching.
- Admin pipeline published view is still regressed: `apps/web/components/admin/pipeline/StageTabs.tsx` has no derived published count source, and `apps/web/components/admin/pipeline/PipelineClient.tsx` clears products/counts for `published` instead of loading a derived dataset.
- Background stale-string audit found active runtime legacy drift outside the main pipeline page in files including `apps/web/lib/pipeline/publish.ts`, `apps/web/lib/quality.ts`, `apps/web/lib/analytics.ts`, `apps/web/lib/consolidation/types.ts`, `apps/web/lib/validation/pipeline-schemas.ts`, `apps/web/components/admin/dashboard/pipeline-status.tsx`, `apps/web/components/admin/quality/QualityIssueTable.tsx`, `apps/web/components/admin/pipeline/BulkToolbar.tsx`, and `apps/web/lib/design-tokens.ts`.
- Playwright pipeline verification is still blocked in this environment by missing authenticated Supabase session state; failure screenshot was captured for Task 10 evidence.

## 2026-04-02 — Task 10a

- Added `apps/web/supabase/migrations/20260402103000_cleanup_pipeline_status.sql` to retire `products_ingestion.pipeline_status_new`, remove its legacy enum/index, remap any surviving historical statuses into the canonical four-state set, and recreate `products_ingestion_pipeline_status_check` idempotently.
- The cleanup migration intentionally raises a clear exception if any unexpected or NULL `pipeline_status` values remain, so constraint enforcement never masks bad data.

## 2026-04-02 — Task 10c

- Cleaned the nine stale runtime targets so their pipeline status logic now uses canonical ingestion statuses (`imported`, `scraped`, `finalized`, `failed`) instead of legacy review-state literals.
- `apps/web/components/admin/dashboard/pipeline-status.tsx` now renders canonical intake buckets, which leaves `__tests__/components/admin/dashboard/pipeline-status.test.tsx` failing because the test still expects legacy UI labels/count keys (`Enhanced`, `Ready for Review`, `Verified`, `Live`). Tests were not edited per task constraints.
- `bunx tsc --noEmit` is still blocked by the pre-existing syntax error in `apps/web/__tests__/app/api/scraper/v1/login-forwarding.test.ts` (`TS1005` on line 84), outside Task 10c scope.
- `bun run build` passed after the cleanup, and LSP diagnostics were clean for every changed file.

## 2026-04-02 — Task 10b

- The admin published tab now derives storefront membership from the published/export path instead of `products_ingestion.pipeline_status`, then hydrates ingestion rows back by SKU for the finalizing view.
- `StageTabs.tsx` now renders an explicit derived `published` badge entry so the operational tab no longer appears count-less while waiting on persisted-status counts.
- `bunx tsc --noEmit` remains blocked by the same unrelated pre-existing syntax error in `apps/web/__tests__/app/api/scraper/v1/login-forwarding.test.ts` (`TS1005` on line 84), outside Task 10b scope.
