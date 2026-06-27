## Review
- Correct: Clean for MVP0 — I found no blockers or must-fix issues before MVP1 in the requested files.
- Correct: The prior string-primitive V2 crash is fixed. `apps/web/app/api/scraper/v1/enrichment-callback/route.ts:256-273` keeps `finalStatus` as a status string and stores V2 metadata in a separate `v2ResolutionPayload`; there is no remaining `__v2ResolutionUpdate` mutation path.
- Correct: Empty V2 callbacks now fail closed. The route runs `buildV2ResolutionUpdate(sourceResults, upc)` whenever V2 is active (`apps/web/app/api/scraper/v1/enrichment-callback/route.ts:260-265`), and the builder maps non-publishable statuses, including empty `unresolved`, to `needs_attention` (`apps/web/lib/upc-resolution/source-results.ts:156-169`). Route/reducer tests cover this at `apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts:379-416` and `apps/web/lib/upc-resolution/__tests__/source-results.test.ts:147-153`.
- Correct: Facet extraction and GTIN equivalence are wired into the authoritative gate path. `extractObservedGtin()` reads top-level identifier fields plus `facets` entries (`apps/web/lib/upc-resolution/upc.ts:261-300`), and `classifySourceEvidence()` uses `extractObservedGtin()` plus `compareGtin()` before the check-digit acceptance gate (`apps/web/lib/upc-resolution/gates.ts:112-145`). Tests cover top-level/facet identifiers and equivalence behavior (`apps/web/lib/upc-resolution/__tests__/upc.test.ts:249-350`, `apps/web/lib/upc-resolution/__tests__/gates.test.ts:189-328`).
- Correct: `resolutionStage` is now honored before source-type normalization (`apps/web/lib/upc-resolution/gates.ts:117-121`), with tests for override priority, `serp_discovery`, and `licensed_feed` aliases (`apps/web/lib/upc-resolution/__tests__/gates.test.ts:331-387`).
- Correct: Event evidence/source alignment is fixed for MVP0. The callback now classifies each source result directly when building each event row (`apps/web/app/api/scraper/v1/enrichment-callback/route.ts:358-375`) instead of indexing into sorted reducer evidence.
- Correct: Legacy behavior remains unchanged by default. V2 only activates for `upc_resolution_policy: "proof_required"` or `upc_resolution_v2: true` (`apps/web/lib/upc-resolution/types.ts:162-173`), and the route falls back to legacy found-wins status when inactive (`apps/web/app/api/scraper/v1/enrichment-callback/route.ts:260-280`; legacy rules in `apps/web/lib/scraper-callback/enrichment-result.ts:396-424`). The additive migration leaves legacy rows nullable/defaulted (`apps/web/supabase/migrations/20260624064000_upc_resolution_v2.sql:13-29`).
- Correct: Tests are meaningful enough for MVP0. The focused suite now covers V2 route success and empty fail-closed behavior, UPC/facet utilities, gates, reducer decisions, schema tolerance, and legacy-vs-V2 helper behavior. I reran `bun run web test -- --testPathPatterns="upc-resolution|enrichment-result|enrichment-callback-route"`; it passed 6 suites / 176 tests.
- Fixed: None. Review-only; I did not modify project/source files.
- Blocker: None.
- Note: Residual/deferred risks remain but are not MVP0 blockers: `determineV2Status()` is still an unused, simplified helper that diverges from the authoritative reducer (`apps/web/lib/scraper-callback/enrichment-result.ts:450-497`); V2 event inserts are non-fatal and still write `source_attempt_id: null` before source attempts are inserted (`apps/web/app/api/scraper/v1/enrichment-callback/route.ts:371-388`); exact-UPC evidence below the configured confidence minimum remains fail-closed at the reducer level but can still carry an exact-upc kind/gate in evidence (`apps/web/lib/upc-resolution/gates.ts:145-182`, acceptance check at `apps/web/lib/upc-resolution/gates.ts:276-283`); route tests do not yet assert event row payloads/source-attempt linkage; the SQL migration was not executed against a live Supabase instance.

## Commands run
- `git status --short -- apps/web/lib/upc-resolution apps/web/lib/scraper-callback/enrichment-result.ts apps/web/app/api/scraper/v1/enrichment-callback/route.ts apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts apps/web/supabase/migrations/20260624064000_upc_resolution_v2.sql docs/adr/0006-upc-resolution-proof-required.md && git diff --stat -- ... && git diff --cached --name-only` — inspected requested MVP0 file status/stat; no staged files reported.
- `bun run web test -- --testPathPatterns="upc-resolution|enrichment-result|enrichment-callback-route"` — passed: 6 suites / 176 tests.
- `git diff --check -- apps/web/lib/upc-resolution apps/web/lib/scraper-callback/enrichment-result.ts apps/web/app/api/scraper/v1/enrichment-callback/route.ts apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts apps/web/supabase/migrations/20260624064000_upc_resolution_v2.sql docs/adr/0006-upc-resolution-proof-required.md && git diff --cached --name-only` — passed: no whitespace errors; no staged files reported.
- `git diff --cached --name-only && git status --short -- review/upc-mvp0-final.md` — no staged files; required review artifact is untracked.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Severity-ranked review provided with file/line evidence. No blockers or must-fix issues found; prior blockers verified fixed in route.ts, gates.ts, upc.ts, source-results.ts, and focused tests."
    }
  ],
  "changedFiles": [
    "review/upc-mvp0-final.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git status --short -- apps/web/lib/upc-resolution apps/web/lib/scraper-callback/enrichment-result.ts apps/web/app/api/scraper/v1/enrichment-callback/route.ts apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts apps/web/supabase/migrations/20260624064000_upc_resolution_v2.sql docs/adr/0006-upc-resolution-proof-required.md && git diff --stat -- ... && git diff --cached --name-only",
      "result": "passed",
      "summary": "Inspected requested MVP0 file status/stat; no staged files reported."
    },
    {
      "command": "bun run web test -- --testPathPatterns=\"upc-resolution|enrichment-result|enrichment-callback-route\"",
      "result": "passed",
      "summary": "6 test suites and 176 tests passed."
    },
    {
      "command": "git diff --check -- apps/web/lib/upc-resolution apps/web/lib/scraper-callback/enrichment-result.ts apps/web/app/api/scraper/v1/enrichment-callback/route.ts apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts apps/web/supabase/migrations/20260624064000_upc_resolution_v2.sql docs/adr/0006-upc-resolution-proof-required.md && git diff --cached --name-only",
      "result": "passed",
      "summary": "No whitespace errors; no staged files reported."
    },
    {
      "command": "git diff --cached --name-only && git status --short -- review/upc-mvp0-final.md",
      "result": "passed",
      "summary": "No staged files; required review artifact is untracked."
    }
  ],
  "validationOutput": [
    "Focused tests: PASS lib/upc-resolution/__tests__/gates.test.ts; PASS __tests__/app/api/scraper/v1/enrichment-callback-route.test.ts; PASS lib/upc-resolution/__tests__/upc.test.ts; PASS lib/upc-resolution/__tests__/enrichment-result.test.ts; PASS lib/upc-resolution/__tests__/source-results.test.ts; PASS __tests__/lib/scraper-callback/enrichment-result.test.ts. Test Suites: 6 passed, 6 total; Tests: 176 passed, 176 total.",
    "git diff --check on requested MVP0 files produced no output.",
    "Post-artifact status check: no staged files; review/upc-mvp0-final.md is untracked.",
    "Parent-reported typecheck remains exit 1 only due the pre-existing logs.test.ts mock type error; I did not rerun full typecheck."
  ],
  "residualRisks": [
    "determineV2Status() remains an unused simplified helper and can diverge from the authoritative reducer if reused directly.",
    "upc_resolution_events inserts remain non-fatal and source_attempt_id remains null in MVP0.",
    "Exact UPC evidence below the configured confidence minimum is fail-closed for status, but the evidence kind/gate can still read like accepted proof; consider tightening before admin audit UI relies on it.",
    "Route tests cover V2 status/persistence fields but do not yet assert event insert payloads or source-attempt linkage.",
    "Migration not executed against a live Supabase database during this review."
  ],
  "noStagedFiles": true,
  "diffSummary": "Final review only. MVP0 implementation under review adds lib/upc-resolution utilities/gates/reducer/tests, an additive UPC-resolution migration and ADR, plus feature-flagged enrichment callback/schema changes and route tests. No source edits made by this reviewer.",
  "reviewFindings": [
    "blocker: none — clean for MVP0",
    "correct: apps/web/app/api/scraper/v1/enrichment-callback/route.ts:256-273 fixes the V2 string primitive crash with a separate v2ResolutionPayload variable",
    "correct: apps/web/app/api/scraper/v1/enrichment-callback/route.ts:260-265 and apps/web/lib/upc-resolution/source-results.ts:156-169 make empty V2 source_results fail closed to needs_attention/unresolved",
    "correct: apps/web/lib/upc-resolution/upc.ts:261-300 and apps/web/lib/upc-resolution/gates.ts:112-145 address facet extraction and GTIN equivalence in the authoritative gate path",
    "correct: apps/web/lib/upc-resolution/gates.ts:117-121 uses resolutionStage before normalized sourceType aliases",
    "correct: apps/web/app/api/scraper/v1/enrichment-callback/route.ts:358-375 classifies per source result when inserting V2 events, preserving source/evidence alignment",
    "note: apps/web/lib/scraper-callback/enrichment-result.ts:450-497 determineV2Status remains simplified/unused; keep reducer path authoritative",
    "note: apps/web/app/api/scraper/v1/enrichment-callback/route.ts:371-388 event inserts are non-fatal and source_attempt_id remains null; deferred beyond MVP0"
  ],
  "manualNotes": "No project/source files were modified; only the required review artifact was written. Focused tests passed locally."
}
```