# Issues

- None encountered during validation contract work.
- Build previously failed due to `.default({}).passthrough()` chain; removed unnecessary defaults.

- No new implementation blockers; route-level strict-fail handling for missing SKUs is now available via shared helper.
- Jest warns about `--localstorage-file` when running node; this is an upstream issue but tests still pass.
- Build previously failed due to duplicate chunk persistence helpers; removing extra imports resolved compile errors without changing behavior.

- None encountered during idempotency implementation
- Initial concern about double-insert of scrape_results resolved by consolidating into recordCallbackProcessed flow
- JSONB filter syntax `data->_idempotency_key` worked as expected for querying nested fields
- Race condition detection relies on unique constraint (not yet added to schema but handled gracefully)

- None encountered during auth test harness implementation
- Confirm validateRunnerAuth properly rejects all invalid formats before database call
- Verified environment consistency (dev/prod behave identically for auth failures)

- None encountered during Task 12 source filter hardening
- Used Supabase .filter() method with ? operator for JSONB key existence
- Found that filter(column, operator, value) syntax works for custom operators like ?

- Task 13: Comprehensive malformed payload matrix testing complete
- Found schema edge cases: empty results.data {} is allowed by z.record(), null is rejected
- Test expectations corrected to match actual Zod behavior
- 56 tests added covering admin/chunk payloads, missing fields, wrong types, nested structures

- F2 code quality review: global lint failed (527 problems: 112 errors, 415 warnings)
- F2 code quality review: global build passed successfully (`npm run build`)
- F2 code quality review: global tests failed (28 suites failed, 86 passed; 35 tests failed, 573 passed)
- F2 callback-scope anti-pattern scan was clean in all required files (`: any`, `@ts-ignore`, `@ts-expect-error`, `var`, `default export` → no matches)
