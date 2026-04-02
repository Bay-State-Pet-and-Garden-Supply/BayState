## 2026-04-02 — Task 8

- `bun x tsc --noEmit` is currently blocked by a pre-existing syntax error in `apps/web/__tests__/app/api/scraper/v1/login-forwarding.test.ts` (`TS1005` on line 84), outside Task 8 scope.
- Task 8 removed active runtime references to `pipeline_status_new` from the pipeline export boundary, consolidation scraped route, and B2B ingestion insert path.
- The temporary rollout shim is now centralized in `apps/web/app/api/admin/pipeline/status-compat.ts` and emits a warning when legacy `registered`/`enriched` route inputs are still used.
