## Review

- Correct: Legacy behavior is still gated off from V2 in the intended path: `apps/web/app/api/scraper/v1/enrichment-callback/route.ts:226-240` only activates V2 through `isUpcResolutionV2Enabled(job.config)`, and `apps/web/lib/scraper-callback/enrichment-result.ts:60-66` makes the new callback evidence fields optional. Focused legacy callback tests passed (`bun run web test -- --testPathPatterns="enrichment-callback-route"`, 7/7), and focused UPC tests passed (`bun run web test -- --testPathPatterns="upc-resolution|enrichment-result"`, 135/135).
- Correct: The migration is additive in shape: new `products_ingestion` columns use `ADD COLUMN IF NOT EXISTS`, and `upc_resolution_events` uses `CREATE TABLE IF NOT EXISTS` in `apps/web/supabase/migrations/20260624064000_upc_resolution_v2.sql:11-76`.
- Fixed: None. Review-only task; I did not modify source files.

- Blocker: V2 callbacks with any `source_results` currently throw before persistence. In `apps/web/app/api/scraper/v1/enrichment-callback/route.ts:255-271`, `finalStatus` is assigned the string `v2Update.pipeline_status`, then line 271 tries to attach `__v2ResolutionUpdate` to that string. Next/TS modules run strict JavaScript, and assigning a property to a string primitive throws (`TypeError: Cannot create property '__v2ResolutionUpdate' on string 'processed'`). This happens before source persistence (`route.ts:284-297`) and before V2 resolution/event writes (`route.ts:335-386`), so every V2 callback with evidence returns 500 and MVP0 V2 cannot work. Smallest safe fix: keep `finalStatus` as only the pipeline status string and store V2 fields in a separate local `v2ResolutionUpdate` variable; add a route test for a `proof_required` job with one exact proof.

- Blocker: V2 can still fail open when `source_results` is empty. The route only enters proof-required status logic when `upcResolutionV2Active && sourceResults.length > 0` (`apps/web/app/api/scraper/v1/enrichment-callback/route.ts:256`); a V2 callback with `source_results: []` and top-level `status: "success"` or `"partial"` falls through to `finalStatus = "processed"` at `route.ts:274-275`. That violates the plan’s fail-closed rule for “no proof after exhausted stages” and could advance a V2 job with no UPC evidence. Smallest safe fix: when `upcResolutionV2Active` is true, always use `buildV2ResolutionUpdate(sourceResults, upc)` even for an empty array, persist `unresolved` with empty evidence, and return `needs_attention`.

- High: The proof gate does not read the current runner’s serialized UPC shape and does not use the GTIN equivalence utility, so real exact proofs can be downgraded to candidate/conflict. `classifySourceEvidence` only checks `sourceResult.product?.upc` and `.gtin` (`apps/web/lib/upc-resolution/gates.ts:93-98`), but the scraper model stores identifier fields such as `upc` as facets (`apps/scraper/scrapers/ai_search/enrichment_models.py:286-304`) and sends `product=prod` in `SourceResultInfo` (`apps/scraper/scrapers/ai_search/enrichment_models.py:600-608`). Also, exact-match testing uses raw normalized string equality (`gates.ts:121-123`) instead of the implemented zero-padding equivalence helper (`apps/web/lib/upc-resolution/upc.ts:202-215`), so an equivalent UPC-A/EAN-13 representation can become `conflicting_upc` at `gates.ts:178-185`. This is fail-closed, but it prevents the acceptance case “one proof-gated found sets confirmed” for likely real callback payloads and causes false manual-review conflicts. Smallest safe fix: add a shared `extractObservedGtin(product)` that reads flat `upc`/`gtin` plus facet entries (`upc`, `gtin`, `barcode`), then use validated GTIN equivalence (`compareGtin` plus check-digit validation) in the accepted-proof path. Add tests for facet-shaped products and leading-zero equivalent GTINs.

- Medium: V2 audit/event persistence is not idempotent and can misattribute evidence. `buildV2ResolutionUpdate` sorts its evidence list by stage/confidence (`apps/web/lib/upc-resolution/source-results.ts:71-76`), but the callback maps that sorted array back to unsorted `sourceResults` by index (`apps/web/app/api/scraper/v1/enrichment-callback/route.ts:361-380`), so event rows can attach the wrong evidence to a source. Events are inserted before `enrichment_source_attempts` are delete/reinserted (`route.ts:383-405`) and before the attempt is marked terminal (`route.ts:447-457`); the new table has only a random primary key and no attempt-level uniqueness (`apps/web/supabase/migrations/20260624064000_upc_resolution_v2.sql:66-78`). A retry after partial failure or a concurrent callback can duplicate V2 events, and `source_attempt_id` remains null despite the comment at `route.ts:377`. Smallest safe fix: classify evidence per source result when building each event row, write source attempts first, attach their IDs, and make event writes idempotent for the attempt/source pair (or add an `attempt_id` column/unique key). Consider treating V2 resolution-field/event write failures as fatal or fail-closed rather than logging after the product status has already been advanced (`route.ts:352-358`, `route.ts:388-394`).

## Review-question answers

1. Legacy callback behavior appears unchanged when V2 config is absent; focused legacy callback tests still pass. Residual risk: if job-config lookup fails for a V2 job, the route silently treats it as legacy (`route.ts:229-240`).
2. V2 no-proof/conflict reducer logic is mostly fail-closed, but the route has a fail-open empty-`source_results` path and V2 currently crashes before applying the reducer.
3. UPC check-digit validation is broadly correct for standard lengths in tests, but equivalence is not used by gates and actual facet-shaped UPCs are not extracted.
4. The migration is additive and consistent with the named callback columns/table, but callback writes need the runtime/idempotency fixes above.
5. Yes: event writes are not idempotent/atomic, sorted evidence can be mapped to the wrong source, and V2 audit failures are non-fatal after status advancement.
6. Yes: fix the two blockers before proceeding to MVP1; also fix UPC extraction/equivalence before relying on V2 confirmation rates.

## Commands run

- `git status --short && git diff --stat -- <MVP0 files>` — inspected relevant dirty files; no staged files shown.
- `bun run web test -- --testPathPatterns="upc-resolution|enrichment-result"` — passed: 5 suites, 135 tests.
- `bun run web test -- --testPathPatterns="enrichment-callback-route"` — passed: 1 suite, 7 tests.
- `bun run web typecheck` — failed with pre-existing unrelated `__tests__/app/api/scraper/v1/logs.test.ts(39,7)` mock type error reported by worker.
- `git diff --check -- <MVP0 files>` — passed: no whitespace errors.
- `node -e '"use strict"; let finalStatus="processed"; ...'` — reproduced the primitive-property `TypeError` that applies to `route.ts:271`.
- `git diff --cached --name-only` — no output after artifact write.

## Residual risks

- I did not execute the SQL migration against a Supabase database.
- Python scraper-side MVP1 stage emission is out of scope; I inspected the existing runner model only to verify callback payload shape.
- The worktree contains unrelated dirty/untracked files from other tasks; I reviewed only the requested MVP0 files plus directly relevant model context.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Reviewed the requested UPC Resolution V2 MVP0 implementation without modifying project/source files; findings are limited to correctness/regression risks in the listed MVP0 scope."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "Findings cite exact files/lines, commands run, validation output, changed files inspected, tests added by the worker, residual risks, and no-staged-files evidence."
    }
  ],
  "changedFiles": [
    "apps/web/supabase/migrations/20260624064000_upc_resolution_v2.sql",
    "apps/web/lib/upc-resolution/types.ts",
    "apps/web/lib/upc-resolution/upc.ts",
    "apps/web/lib/upc-resolution/gates.ts",
    "apps/web/lib/upc-resolution/source-results.ts",
    "apps/web/lib/upc-resolution/__tests__/upc.test.ts",
    "apps/web/lib/upc-resolution/__tests__/gates.test.ts",
    "apps/web/lib/upc-resolution/__tests__/source-results.test.ts",
    "apps/web/lib/upc-resolution/__tests__/enrichment-result.test.ts",
    "apps/web/lib/scraper-callback/enrichment-result.ts",
    "apps/web/app/api/scraper/v1/enrichment-callback/route.ts",
    "docs/adr/0006-upc-resolution-proof-required.md"
  ],
  "testsAddedOrUpdated": [
    "apps/web/lib/upc-resolution/__tests__/upc.test.ts",
    "apps/web/lib/upc-resolution/__tests__/gates.test.ts",
    "apps/web/lib/upc-resolution/__tests__/source-results.test.ts",
    "apps/web/lib/upc-resolution/__tests__/enrichment-result.test.ts"
  ],
  "commandsRun": [
    {
      "command": "git status --short && git diff --stat -- <MVP0 files>",
      "result": "passed",
      "summary": "Confirmed requested MVP0 files are dirty/untracked; also observed unrelated dirty worktree files."
    },
    {
      "command": "bun run web test -- --testPathPatterns=\"upc-resolution|enrichment-result\"",
      "result": "passed",
      "summary": "5 test suites passed; 135 tests passed."
    },
    {
      "command": "bun run web test -- --testPathPatterns=\"enrichment-callback-route\"",
      "result": "passed",
      "summary": "Legacy callback route suite passed; 7 tests passed."
    },
    {
      "command": "bun run web typecheck",
      "result": "failed",
      "summary": "Failed on pre-existing unrelated logs.test.ts mock typing error: TS2353 at __tests__/app/api/scraper/v1/logs.test.ts:39."
    },
    {
      "command": "git diff --check -- <MVP0 files>",
      "result": "passed",
      "summary": "No whitespace errors."
    },
    {
      "command": "node -e '\"use strict\"; let finalStatus=\"processed\"; finalStatus.__v2ResolutionUpdate = {x:1}'",
      "result": "failed",
      "summary": "Reproduced TypeError proving route.ts line 271 crashes when assigning a property to a string primitive."
    },
    {
      "command": "git diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files."
    }
  ],
  "validationOutput": [
    "UPC/enrichment focused tests: Test Suites: 5 passed, 5 total; Tests: 135 passed, 135 total.",
    "Legacy enrichment-callback-route tests: Test Suites: 1 passed, 1 total; Tests: 7 passed, 7 total.",
    "Typecheck: command exited 2 on pre-existing __tests__/app/api/scraper/v1/logs.test.ts(39,7) TS2353 mock typing error.",
    "Primitive-property reproduction: TypeError: Cannot create property '__v2ResolutionUpdate' on string 'processed'.",
    "git diff --check: no output."
  ],
  "residualRisks": [
    "Migration was reviewed but not executed against Supabase.",
    "V2 route behavior lacks callback-route tests; current tests are helper-level plus legacy route tests.",
    "Existing unrelated dirty/untracked worktree files were not reviewed."
  ],
  "noStagedFiles": true,
  "diffSummary": "MVP0 adds an additive UPC resolution schema, new UPC resolution TS modules/tests, optional callback schema fields, V2 callback persistence, and an ADR. Review found two blockers in V2 callback routing plus gate/persistence follow-ups.",
  "reviewFindings": [
    "blocker: apps/web/app/api/scraper/v1/enrichment-callback/route.ts:255-271 - V2 callback throws by attaching __v2ResolutionUpdate to a string primitive.",
    "blocker: apps/web/app/api/scraper/v1/enrichment-callback/route.ts:256,274-275 - V2 empty source_results can still advance to processed instead of failing closed.",
    "high: apps/web/lib/upc-resolution/gates.ts:93-123 and apps/scraper/scrapers/ai_search/enrichment_models.py:286-304 - gates miss real facet-shaped UPCs and do not use GTIN equivalence, causing false candidates/conflicts.",
    "medium: apps/web/app/api/scraper/v1/enrichment-callback/route.ts:361-405 and apps/web/lib/upc-resolution/source-results.ts:71-76 - V2 event evidence can be misattributed and duplicated on retry/concurrency."
  ],
  "manualNotes": "No project/source files were modified. Artifact written to review/upc-mvp0-correctness.md as requested."
}
```