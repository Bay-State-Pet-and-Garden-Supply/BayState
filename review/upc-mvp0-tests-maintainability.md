## Review

- Correct: The pure UPC-resolution tests are meaningful for the core reducer/gate cases: `source-results.test.ts` covers confirmed proof, no-proof `not_stocked`/`skipped`, candidate, and conflict paths (`apps/web/lib/upc-resolution/__tests__/source-results.test.ts:36-180`), and `enrichment-result.test.ts` explicitly compares legacy found-wins vs V2 no-proof behavior (`apps/web/lib/upc-resolution/__tests__/enrichment-result.test.ts:183-220`). Focused tests pass.
- Correct: The migration is additive and feature-flagged, with nullable `products_ingestion.upc_resolution_*` columns, value/confidence checks, and an event table/indexes (`apps/web/supabase/migrations/20260624064000_upc_resolution_v2.sql:13-100`).
- Correct: The public feature flag names are clear and documented in both code and ADR: `upc_resolution_policy: "proof_required"` and `upc_resolution_v2: true` (`apps/web/lib/upc-resolution/types.ts:147-173`, `docs/adr/0006-upc-resolution-proof-required.md:48-53`).
- Fixed: None. Review-only; no project/source files were modified.

### Must-fix findings

1. **Blocker — V2 callbacks will throw before persistence.**  
   `finalStatus` is a string (`apps/web/app/api/scraper/v1/enrichment-callback/route.ts:255-259`), but the V2 branch assigns `__v2ResolutionUpdate` onto that primitive (`route.ts:270-271`) and later reads it back (`route.ts:334-338`). In strict-mode JS/Next server code, assigning a property to a string throws `TypeError: Cannot create property ... on string`, so V2-enabled callbacks with source results will return 500 before source data, V2 columns, or events are written.  
   **Smallest safe fix:** keep a separate local `let v2ResolutionUpdate: ... | null = null` and assign/read that object directly; type `finalStatus` as the pipeline status string only. This also removes the new `as any` lint warnings around this path.

2. **High — production proof extraction does not match the runner payload shape or GTIN equivalence behavior.**  
   The gate reads only `sourceResult.product?.upc` or `.gtin` at the top level (`apps/web/lib/upc-resolution/gates.ts:94-98`) and checks exact digit equality (`gates.ts:121-124`). Existing web callback code already accounts for the runner's nested `core`/`facets` product shape and extracts facet values to top-level payload keys (`apps/web/lib/scraper-callback/enrichment-result.ts:201-230`), and `compareGtin()` was added specifically for zero-padded UPC/GTIN equivalence (`apps/web/lib/upc-resolution/upc.ts:202-215`) but is not used by the authoritative reducer. This means real exact UPC evidence represented as a facet, or as UPC-A vs EAN/GTIN with leading zero, can be reduced to `candidate`/`conflict` instead of `confirmed`. The tests use flat `{ product: { upc } }` fixtures (`apps/web/lib/upc-resolution/__tests__/gates.test.ts:36-75`) and only test zero-padding on the unused `determineV2Status()` helper (`apps/web/lib/upc-resolution/__tests__/enrichment-result.test.ts:156-165`).  
   **Smallest safe fix:** add a small `extractObservedGtin(product)` helper that supports top-level `upc`/`gtin`, nested facets with `definition_slug: "upc"|"gtin"`, and safe string/number coercion; use `compareGtin()` for identity equivalence while still validating the observed normalized GTIN check digit. Add reducer/gate tests for nested facets and UPC-A/EAN-13 equivalence.

3. **High — optional V2 stage metadata is accepted but ignored, which can misclassify sources.**  
   `SourceResultInfoSchema` accepts `resolutionStage`/`resolutionEvidence` (`apps/web/lib/scraper-callback/enrichment-result.ts:60-66`), but `classifySourceEvidence()` derives stage from only the caller override or `sourceType` (`apps/web/lib/upc-resolution/gates.ts:100-102`). ADR 0006 distinguishes official-brand proof from SERP proof and warns that SERP without exact UPC must not advance (`docs/adr/0006-upc-resolution-proof-required.md:11-14`, `docs/adr/0006-upc-resolution-proof-required.md:73-86`). Ignoring `resolutionStage` leaves follow-up workers without a clean integration point and risks treating legacy source type labels as proof stages.  
   **Smallest safe fix:** resolve stage as `stageOverride ?? sourceResult.resolutionStage ?? normalizeStage(sourceResult.sourceType, sourceResult.sourceSlug)`, with aliases such as `licensed_feed -> licensed` and `serp_discovery -> serp`, then test official-brand high-confidence/no-UPC separately from SERP no-UPC.

4. **High — `upc_resolution_events.evidence` can be attached to the wrong source.**  
   `reduceSourceResults()` sorts the evidence array by stage/priority and confidence (`apps/web/lib/upc-resolution/source-results.ts:71-76`), but the callback builds event rows by indexing that sorted array with the original `sourceResults.map()` index (`apps/web/app/api/scraper/v1/enrichment-callback/route.ts:361-377`). If source results arrive in a different order than the reducer sort, event rows will persist another source's evidence under the current `source_slug`, undermining the MVP0 audit/instrumentation goal.  
   **Smallest safe fix:** classify evidence per source result when constructing event rows, or carry an unsorted per-source evidence list keyed by `sourceSlug`/result identity before sorting decision evidence.

5. **Medium — V2 with empty `source_results` is not fail-closed.**  
   The route only applies V2 proof-required status when `upcResolutionV2Active && sourceResults.length > 0` (`apps/web/app/api/scraper/v1/enrichment-callback/route.ts:255-272`). For a V2 job with no `source_results`, `success`/`partial` still falls through to `processed` (`route.ts:274-275`) and no `upc_resolution_*` fields are persisted. The ADR's V2 matrix says unresolved/no evidence should be `needs_attention` (`docs/adr/0006-upc-resolution-proof-required.md:32-40`).  
   **Smallest safe fix:** if V2 is active, call the V2 reducer/update path even for an empty array and persist `upc_resolution_status='unresolved'`, `stage='none'`, `confidence=0`, `pipeline_status='needs_attention'`.

### Optional polish / maintainability

- The route import graph is server-runtime safe (pure lib imports and `@/*` aliases), and `bun run web typecheck` reported only the known pre-existing `logs.test.ts` type error. However, `bun run web lint` now warns on the new `as any` casts in `enrichment-callback/route.ts:271`, `296`, and `337`; the blocker fix above should remove most of these.
- `determineV2Status()` is currently unused outside tests (`apps/web/lib/scraper-callback/enrichment-result.ts:450-488`) and diverges from the production reducer (it has zero-padding behavior that `classifySourceEvidence()` does not). Prefer deleting it, or making it a thin wrapper around `buildV2ResolutionUpdate()`, so tests exercise the authoritative status path.
- Add at least one V2 callback route test. Existing route tests cover auth/lease/legacy found-wins but no V2 job config path (`apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts:214-312`), which is why the string-property blocker was not caught.

## Review question answers

1. **Tests:** Meaningful for pure UPC utilities/gates/reducer and legacy-vs-V2 helper behavior, but they miss the V2 callback route, real runner product shape, event persistence, empty `source_results`, and production GTIN equivalence.
2. **Helper names/types:** Mostly cohesive. The overbuilt piece is `determineV2Status()`, which duplicates and diverges from the reducer while being unused in production.
3. **Callback route cleanliness:** Imports are appropriate for a Next.js server route, but the current V2 persistence implementation is not runtime-safe because it mutates a string primitive.
4. **Lint/type risks:** No new TypeScript compiler errors were observed beyond the known pre-existing `logs.test.ts` failure. Lint has pre-existing failures elsewhere and new warnings from `any` casts in the callback route.
5. **Docs/flags:** Clear enough for follow-up workers; the ADR and code agree on `upc_resolution_policy: "proof_required"` and `upc_resolution_v2: true`.

## Validation

- `bun run web test -- --testPathPatterns="upc-resolution|enrichment-result"` — passed; 5 suites / 135 tests.
- `bun run web typecheck` — failed only on the reported pre-existing `__tests__/app/api/scraper/v1/logs.test.ts(39,7)` error.
- `bun run web test -- --runTestsByPath __tests__/app/api/scraper/v1/enrichment-callback-route.test.ts` — passed; confirms existing route tests are legacy-only.
- `bun run web lint` — failed on pre-existing project lint errors; relevant new route warnings are `@typescript-eslint/no-explicit-any` at `enrichment-callback/route.ts:271`, `296`, `337`.
- `node -e '"use strict"; let s="processed"; try { s.__v2ResolutionUpdate = { ok: true }; console.log("no throw") } catch (e) { console.log(e.name + ": " + e.message) }'` — printed `TypeError: Cannot create property '__v2ResolutionUpdate' on string 'processed'`.
- `git diff --cached --stat --` — no output; no staged files.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Severity-ranked findings include concrete file/line references for the V2 callback crash, proof extraction integration gaps, event evidence mismatch, empty source_results behavior, and test/maintainability gaps."
    }
  ],
  "changedFiles": [
    "review/upc-mvp0-tests-maintainability.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "bun run web test -- --testPathPatterns=\"upc-resolution|enrichment-result\"",
      "result": "passed",
      "summary": "5 suites, 135 tests passed"
    },
    {
      "command": "bun run web typecheck",
      "result": "failed",
      "summary": "Only reported error was the pre-existing __tests__/app/api/scraper/v1/logs.test.ts(39,7) mock typing issue"
    },
    {
      "command": "bun run web test -- --runTestsByPath __tests__/app/api/scraper/v1/enrichment-callback-route.test.ts",
      "result": "passed",
      "summary": "7 existing callback route tests passed; none cover V2 job config"
    },
    {
      "command": "bun run web lint",
      "result": "failed",
      "summary": "Pre-existing project lint errors remain; new callback route warnings are no-explicit-any at lines 271, 296, 337"
    },
    {
      "command": "node -e strict-mode string property assignment check",
      "result": "passed",
      "summary": "Confirmed assigning __v2ResolutionUpdate to a string throws TypeError in strict mode"
    },
    {
      "command": "git diff --cached --stat --",
      "result": "passed",
      "summary": "No staged files"
    }
  ],
  "validationOutput": [
    "Focused UPC/enrichment tests: PASS, 5 suites / 135 tests",
    "Typecheck: failed only on pre-existing logs.test.ts TS2353 error",
    "Callback route tests: PASS, legacy-only coverage",
    "Strict-mode check: TypeError when assigning a property to string primitive"
  ],
  "residualRisks": [
    "I did not execute the SQL migration against Supabase; schema review was static.",
    "I did not modify source files per review-only instruction; blocker fixes remain unapplied.",
    "Full lint has unrelated pre-existing failures, so lint cleanliness of the whole app is not established."
  ],
  "noStagedFiles": true,
  "diffSummary": "Review-only artifact written; source code left unchanged. Inspected the MVP0 migration, UPC-resolution libs/tests, callback parser/route, and ADR.",
  "reviewFindings": [
    "blocker: apps/web/app/api/scraper/v1/enrichment-callback/route.ts:270-271 - V2 path assigns __v2ResolutionUpdate to a string primitive and will throw in strict mode; use a separate local object.",
    "high: apps/web/lib/upc-resolution/gates.ts:94-124 - Proof extraction ignores runner nested facets and compareGtin equivalence, so real exact UPC proof can fail classification; add extractor helper and tests.",
    "high: apps/web/lib/upc-resolution/gates.ts:100-102 - resolutionStage is accepted by schema but ignored, risking source-stage misclassification; prefer resolutionStage and normalize aliases.",
    "high: apps/web/app/api/scraper/v1/enrichment-callback/route.ts:361-377 plus apps/web/lib/upc-resolution/source-results.ts:71-76 - Sorted decision evidence is indexed against unsorted sourceResults for event rows; classify/key per source.",
    "medium: apps/web/app/api/scraper/v1/enrichment-callback/route.ts:255-275 - V2 active with empty source_results can still mark success/partial as processed; fail closed as unresolved/needs_attention.",
    "optional: apps/web/lib/scraper-callback/enrichment-result.ts:450-488 - determineV2Status is unused outside tests and diverges from production reducer; remove or wrap the reducer.",
    "optional: add V2 callback route tests for proof, no proof, conflict, nested runner payload, GTIN zero-padding, and empty source_results."
  ],
  "manualNotes": "Project/source files were not modified. The review artifact itself is the only file written."
}
```