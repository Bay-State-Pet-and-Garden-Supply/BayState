## 2026-03-26 - Unresolved problems

- Full scraper test suite is not green due to pre-existing import-path issue in antibot unit tests; Task 2 code changes were validated with targeted image-handler tests only.
- No dedicated unit tests for new structured error metadata classifications (401/404/timeout/cors) are present yet in this commit.

## 2026-03-26 - Task 5 unresolved problems

- `ImageRetryProcessor` ships with a dependency-injected capture hook and a guarded default that throws; production wiring to a concrete scraper image recapture endpoint/client still needs Task 6 integration work.

## 2026-03-26 - Task 6 unresolved problems

- Full web-app build verification still depends on the unrelated `archiver` typing fix outside this task's files.

## 2026-03-26 - Task 7 unresolved problems

- The retry queue still has no first-class `priority` column, so urgent browser-detected 404s are only approximated by rescheduling them for immediate processing.

## 2026-03-26 - Task 8 unresolved problems

- Direct execution of `node apps/web/scripts/backfill-login-protected-images-logic.ts --dry-run` requires Supabase env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) to be present; local verification without secrets can only cover argument parsing and startup behavior.
ImageRetryProcessorpriority

- Unresolved: no production wiring for periodic ImageRetryProcessor polling, no priority column/support despite plan requirements, and most task evidence files are absent.
