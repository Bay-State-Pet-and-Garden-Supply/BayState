# Scraper Callback Persistence Hardening for Multi-Source Payloads

## TL;DR

> **Quick Summary**: Harden both scraper callback endpoints so successful production scrape results are reliably persisted to `products_ingestion`, while malformed payloads are rejected with 4xx and missing SKUs fail strictly (no partial writes).
>
> **Deliverables**:
> - Unified callback validation + persistence semantics across `/api/admin/scraping/callback` and `/api/scraper/v1/chunk-callback`
> - Heterogeneous payload-safe source merging (preserve unknown fields in `sources`)
> - TDD coverage for malformed payloads, strict missing-SKU failure, idempotency/replay, and local auth parity
>
> **Estimated Effort**: Medium-Large
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 2 → Task 7 → Task 10 → Task 14/15

---

## Context

### Original Request
Scraper run from admin pipeline found products (Bradley Caldwell) but results were not saved to pipeline products. Need endpoint behavior that supports multiple source payload shapes, persists successful scrapes, and still stores to DB in local runs.

### Interview Summary
**Key Discussions**:
- Runs are production persistence runs (not test-only).
- Missing SKU policy is **strict fail** (no auto-upsert).
- Malformed payload policy is **reject with 4xx** (no partial writes).
- Local auth policy is **strict API key auth always**.
- Callback path for failing run is unknown, so plan must harden both callback routes.
- Test strategy is **TDD**.

**Research Findings**:
- Admin callback currently performs per-SKU updates and can log errors without deterministic callback failure.
- Chunk callback can mark jobs completed while persistence failures are only logged.
- `sources` storage is permissive for heterogeneous payload fields; downstream consolidated schema is stricter.
- Pipeline UI defaults to `staging`; scrape completion sets `pipeline_status='scraped'`.

### Metis Review
**Identified Gaps (addressed)**:
- Missing deterministic semantics when persistence fails after completion flow starts.
- Missing explicit idempotency/replay behavior.
- Missing acceptance criteria for “no partial writes” under missing SKU and malformed payload cases.

---

## Work Objectives

### Core Objective
Make scraper callback persistence deterministic, strict, and source-agnostic so successful production callbacks always write to `products_ingestion` (or explicitly fail), regardless of source payload variations.

### Concrete Deliverables
- Hardened callback logic in both route handlers.
- Shared validation/persistence utilities used by both routes.
- Idempotent replay behavior for duplicate callbacks.
- Regression-safe source filtering behavior for heterogeneous `sources` shapes in pipeline queries.
- TDD tests covering happy-path and failure-path scenarios.

### Definition of Done
- [ ] Both callback routes reject malformed payloads with explicit 4xx.
- [ ] Missing SKU in production callback causes strict failure and zero partial writes.
- [ ] Successful production callbacks persist source data and set `pipeline_status='scraped'`.
- [ ] Duplicate callbacks are replay-safe and do not duplicate side effects.
- [ ] `CI=true npm test` passes with new callback coverage.

### Must Have
- Deterministic success/failure semantics for persistence.
- Strict auth in all environments.
- Heterogeneous source payload support without schema fragility at ingest boundary.
- TDD implementation sequence.

### Must NOT Have (Guardrails)
- No auto-upsert creation for missing `products_ingestion` rows.
- No partial writes on malformed payload or strict-fail validation errors.
- No relaxing auth for local-only bypass.
- No global pipeline redesign outside callback/persistence scope.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (Jest)
- **Automated tests**: TDD
- **Framework**: Jest (`CI=true npm test`)
- **TDD mode**: RED → GREEN → REFACTOR per task

### QA Policy
Every task includes agent-executed QA scenarios (happy + failure path), with evidence in `.sisyphus/evidence/task-{N}-{scenario}.{ext}`.

| Deliverable Type | Verification Tool | Method |
|---|---|---|
| API route behavior | Bash (test command) | Run targeted Jest tests and assert status/DB call behavior |
| Callback auth behavior | Bash (test command) | Assert 401 with invalid/missing key in route tests |
| Source merge behavior | Bash (test command) | Assert unknown fields preserved in merged `sources` |
| Pipeline query behavior | Bash (test command) | Assert source filter works for heterogeneous source value shapes |

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (foundation, can start immediately):
1, 2, 3, 4, 5

Wave 2 (route hardening, depends on Wave 1):
6, 7, 8, 9, 10

Wave 3 (idempotency + query robustness + TDD suites, depends on Wave 2):
11, 12, 13, 14, 15

Wave FINAL (independent review, parallel):
F1, F2, F3, F4

Critical Path: 1 → 2 → 7 → 10 → 14/15
Parallel Speedup: ~60-70% versus sequential execution

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|---|---|---|---|
| 1 | — | 6,9,13,14,15 | 1 |
| 2 | — | 7,10,14,15 | 1 |
| 3 | — | 7,10,13 | 1 |
| 4 | — | 11,13 | 1 |
| 5 | — | 6,8,9,10,14,15 | 1 |
| 6 | 1,5 | 7,8,14 | 2 |
| 7 | 2,3,6 | 8,14 | 2 |
| 8 | 6,7 | 11,14 | 2 |
| 9 | 1,5 | 10,15 | 2 |
| 10 | 2,3,9 | 11,15 | 2 |
| 11 | 4,8,10 | 14,15 | 3 |
| 12 | 3 | 15 | 3 |
| 13 | 1,3,4 | 14,15 | 3 |
| 14 | 5,6,7,8,11,13 | F1-F4 | 3 |
| 15 | 5,9,10,11,12,13 | F1-F4 | 3 |

### Agent Dispatch Summary

| Wave | # Parallel | Tasks → Agent Category |
|---|---:|---|
| 1 | **5** | T1-T5 → `quick`/`unspecified-high` |
| 2 | **5** | T6-T10 → `deep`/`unspecified-high` |
| 3 | **5** | T11-T15 → `deep`/`quick` |
| FINAL | **4** | F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep` |

---

## TODOs

---

- [x] 1. Define shared callback payload contract + type guards

  **What to do**:
  - Add shared validator utilities for callback payloads (admin + chunk routes).
  - Enforce required fields and object-shape checks for `results.data` in production completion paths.
  - Add failing tests first (malformed JSON/body shapes).

  **Must NOT do**:
  - Do not loosen auth or test-mode semantics.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: tight utility extraction and tests.
  - **Skills**: [`vercel-react-best-practices`]
    - `vercel-react-best-practices`: Helps maintain clean TypeScript patterns in Next route modules.
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not UI-related.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 6, 9, 13, 14, 15
  - **Blocked By**: None

  **References**:
  - `BayStateApp/app/api/admin/scraping/callback/route.ts` - Current payload parsing/auth flow to refactor safely.
  - `BayStateApp/app/api/scraper/v1/chunk-callback/route.ts` - Parallel callback contract alignment.
  - `BayStateApp/types/scraper.ts` - Existing scraper type conventions.

  **Acceptance Criteria**:
  - [ ] Invalid payload shapes return 4xx with deterministic error code/message.
  - [ ] Valid heterogeneous source payloads pass validation.

  **QA Scenarios**:
  ```
  Scenario: Valid completion payload accepted
    Tool: Bash (test command)
    Steps:
      1. Run: cd BayStateApp && CI=true npm test -- --testPathPatterns="callback"
      2. Assert test case for valid payload passes.
    Expected Result: Payload contract tests green.
    Evidence: .sisyphus/evidence/task-1-valid-contract.txt

  Scenario: Malformed payload rejected
    Tool: Bash (test command)
    Steps:
      1. Run same test suite with malformed fixtures.
      2. Assert response status is 400/422 (as specified), no persistence calls invoked.
    Expected Result: Strict 4xx behavior confirmed.
    Evidence: .sisyphus/evidence/task-1-malformed-reject.txt
  ```

- [x] 2. Define strict missing-SKU policy helper (pre-write guard)

  **What to do**:
  - Introduce helper to pre-validate all target SKUs exist in `products_ingestion` before any write.
  - Ensure missing SKU triggers strict failure path (no partial updates).
  - Write RED tests for mixed existing/missing SKU sets.

  **Must NOT do**:
  - No auto-insert/upsert fallback.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: atomicity and strict failure semantics.
  - **Skills**: [`vercel-react-best-practices`]
    - `vercel-react-best-practices`: Type-safe utility/API patterns.
  - **Skills Evaluated but Omitted**:
    - `agent-browser`: No browser interaction required.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 7, 10, 14, 15
  - **Blocked By**: None

  **References**:
  - `BayStateApp/app/api/scraper/v1/chunk-callback/route.ts` (`persistChunkResultsToPipeline`) - Existing missing-row behavior.
  - `BayStateApp/app/api/admin/scraping/callback/route.ts` - Current per-SKU write loop needing atomic precheck.

  **Acceptance Criteria**:
  - [ ] Any missing SKU causes callback strict fail and zero writes.
  - [ ] Behavior is shared across both routes.

  **QA Scenarios**:
  ```
  Scenario: All SKUs exist
    Tool: Bash (test command)
    Steps:
      1. Run callback unit tests with existing SKU fixtures.
      2. Assert writes occur and success response returned.
    Evidence: .sisyphus/evidence/task-2-all-skus-exist.txt

  Scenario: One SKU missing
    Tool: Bash (test command)
    Steps:
      1. Run test fixture with one missing SKU.
      2. Assert strict failure response and zero update invocations.
    Evidence: .sisyphus/evidence/task-2-missing-sku-fail.txt
  ```

- [x] 3. Standardize production vs test-mode branch semantics

  **What to do**:
  - Make branch rules explicit and consistent: production persists, test-mode skips product persistence.
  - Add tests to ensure no accidental production skip.

  **Must NOT do**:
  - Do not alter business rule that test-mode avoids normal pipeline writes.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`vercel-react-best-practices`]
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Non-UI task.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 7, 10, 12, 13
  - **Blocked By**: None

  **References**:
  - `BayStateApp/app/api/admin/scraping/callback/route.ts` (`isTestJob` branch).
  - `BayStateApp/app/api/scraper/v1/chunk-callback/route.ts` (`isTestJob` and consolidation skip).

  **Acceptance Criteria**:
  - [ ] Production callbacks always attempt persistence after validation.
  - [ ] Test callbacks never mutate `products_ingestion`.

  **QA Scenarios**:
  ```
  Scenario: Production mode persists
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-3-prod-persists.txt

  Scenario: Test mode does not persist
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-3-test-skip.txt
  ```

- [x] 4. Add idempotency key strategy for callback replay safety

  **What to do**:
  - Define replay-safe keying strategy (job/chunk + payload identity) and guard duplicate side effects.
  - Add tests for duplicate callback submissions.

  **Must NOT do**:
  - No duplicate `scrape_results` inserts for same logical callback event.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`vercel-react-best-practices`]
  - **Skills Evaluated but Omitted**:
    - `dev-browser`: Not needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 11, 13
  - **Blocked By**: None

  **References**:
  - `BayStateApp/app/api/admin/scraping/callback/route.ts` (scrape_results insertion point).
  - `BayStateApp/app/api/scraper/v1/chunk-callback/route.ts` (aggregation + scrape_results insertion).

  **Acceptance Criteria**:
  - [ ] Duplicate callback is no-op for persistence side effects.
  - [ ] Consolidation is not redundantly triggered by duplicates.

  **QA Scenarios**:
  ```
  Scenario: First callback processes
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-4-first-process.txt

  Scenario: Duplicate callback no-op
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-4-duplicate-noop.txt
  ```

- [x] 5. Create shared callback auth test harness (strict in local/prod)

  **What to do**:
  - Add route tests ensuring invalid/missing key is 401 in all env contexts.
  - Confirm no local bypass behavior exists.

  **Must NOT do**:
  - Do not add local auth bypass flag.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`vercel-react-best-practices`]
  - **Skills Evaluated but Omitted**:
    - `agent-browser`: API route tests only.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 6, 8, 9, 10, 14, 15
  - **Blocked By**: None

  **References**:
  - `BayStateApp/lib/scraper-auth.ts` - Canonical auth behavior.
  - `BayStateApp/app/api/admin/scraping/callback/route.ts` + `.../chunk-callback/route.ts` - Route-level enforcement points.

  **Acceptance Criteria**:
  - [ ] Missing key -> 401.
  - [ ] Invalid key format -> 401.
  - [ ] Same behavior in local/prod test environments.

  **QA Scenarios**:
  ```
  Scenario: Valid key authenticates
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-5-valid-auth.txt

  Scenario: Invalid key rejected
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-5-invalid-auth.txt
  ```

- [x] 6. Refactor admin callback to use shared validation/auth primitives

  **What to do**:
  - Wire Task 1/5 helpers into `/api/admin/scraping/callback`.
  - Ensure malformed body/path cases fail before any state mutation.

  **Must NOT do**:
  - No behavior drift in retry/lease logic outside callback persistence scope.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`vercel-react-best-practices`]
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not relevant.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 7, 8, 14
  - **Blocked By**: 1, 5

  **References**:
  - `BayStateApp/app/api/admin/scraping/callback/route.ts` - Main refactor target.

  **Acceptance Criteria**:
  - [ ] Admin callback rejects malformed payloads with 4xx pre-write.

  **QA Scenarios**:
  ```
  Scenario: Admin callback valid flow still succeeds
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-6-admin-valid.txt

  Scenario: Admin callback malformed fails pre-write
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-6-admin-malformed.txt
  ```

- [x] 7. Enforce atomic strict-fail persistence in admin callback

  **What to do**:
  - Pre-validate SKU existence for all target SKUs.
  - Apply write strategy that guarantees no partial update on strict-fail conditions.
  - Fail callback explicitly when any SKU is missing.

  **Must NOT do**:
  - No partial writes when missing SKU detected.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`vercel-react-best-practices`]
  - **Skills Evaluated but Omitted**:
    - `dev-browser`: Not needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 8, 14
  - **Blocked By**: 2, 3, 6

  **References**:
  - `BayStateApp/app/api/admin/scraping/callback/route.ts` (per-SKU update loop).

  **Acceptance Criteria**:
  - [ ] Missing SKU returns deterministic 4xx/409 (as chosen by implementation), zero writes.
  - [ ] Fully valid set writes all SKUs and marks `scraped`.

  **QA Scenarios**:
  ```
  Scenario: All SKUs valid writes all rows
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-7-admin-all-valid.txt

  Scenario: One missing SKU aborts all writes
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-7-admin-missing-abort.txt
  ```

- [x] 8. Gate admin consolidation trigger on confirmed persistence success

  **What to do**:
  - Ensure `onScraperComplete` only runs when persistence criteria are fully satisfied.
  - Add explicit failure logging + response behavior when persistence fails.

  **Must NOT do**:
  - No consolidation trigger after failed persistence.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`vercel-react-best-practices`]
  - **Skills Evaluated but Omitted**:
    - `agent-browser`: No UI scope.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 11, 14
  - **Blocked By**: 6, 7

  **References**:
  - `BayStateApp/app/api/admin/scraping/callback/route.ts` (`onScraperComplete` invocation).
  - `BayStateApp/lib/consolidation/batch-service.ts` - downstream dependency.

  **Acceptance Criteria**:
  - [ ] Consolidation submission occurs only after successful persistence.
  - [ ] Persistence failure path does not enqueue consolidation.

  **QA Scenarios**:
  ```
  Scenario: Persistence success triggers consolidation call
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-8-consolidation-trigger.txt

  Scenario: Persistence failure suppresses consolidation
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-8-consolidation-suppressed.txt
  ```

- [x] 9. Refactor chunk callback to shared validation/auth primitives

  **What to do**:
  - Apply shared payload/auth handling to `/api/scraper/v1/chunk-callback`.
  - Validate chunk result shape before aggregation and write flow.

  **Must NOT do**:
  - No drift from strict auth policy.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`vercel-react-best-practices`]
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not relevant.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 10, 15
  - **Blocked By**: 1, 5

  **References**:
  - `BayStateApp/app/api/scraper/v1/chunk-callback/route.ts` - main target.

  **Acceptance Criteria**:
  - [x] Chunk callback malformed payloads fail with 4xx pre-write.

  **QA Scenarios**:
  ```
  Scenario: Chunk callback valid payload accepted
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-9-chunk-valid.txt

  Scenario: Chunk callback malformed payload rejected
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-9-chunk-malformed.txt
  ```

- [x] 10. Enforce atomic strict-fail persistence + job-status consistency in chunk callback

  **What to do**:
  - Ensure all-SKU pre-validation before any write in chunk aggregation flow.
  - Guarantee job status semantics reflect persistence outcome (no false "completed" when persistence fails).

  **Must NOT do**:
  - No partial writes on missing SKU.
  - No terminal success state after persistence failure.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`vercel-react-best-practices`]
  - **Skills Evaluated but Omitted**:
    - `dev-browser`: Not needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 11, 15
  - **Blocked By**: 2, 3, 9

  **References**:
  - `BayStateApp/app/api/scraper/v1/chunk-callback/route.ts` (`persistChunkResultsToPipeline`, job completion branch).

  **Acceptance Criteria**:
  - [x] Missing SKU strict-fails with no partial writes.
  - [x] Job outcome reflects persistence failure deterministically.

  **QA Scenarios**:
  ```
  Scenario: Chunk aggregated persist succeeds
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-10-chunk-persist-success.txt

  Scenario: Missing SKU causes strict fail + no terminal success
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-10-chunk-missing-fail.txt
  ```
  Scenario: Chunk aggregated persist succeeds
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-10-chunk-persist-success.txt

  Scenario: Missing SKU causes strict fail + no terminal success
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-10-chunk-missing-fail.txt
  ```

- [x] 11. Add replay/idempotency behavior tests for both callbacks

  **What to do**:
  - Create tests that submit duplicate callback payloads and assert single side-effect execution.
  - Cover both admin and chunk routes.

  **Must NOT do**:
  - No duplicated scrape_results insertion for same logical callback.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`vercel-react-best-practices`]
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not applicable.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 14, 15
  - **Blocked By**: 4, 8, 10

  **References**:
  - Callback route files + existing scrape_results insert points.

  **Acceptance Criteria**:
  - [ ] Duplicate callback is idempotent for persistence + downstream triggers.

  **QA Scenarios**:
  ```
  Scenario: First delivery writes state
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-11-first-delivery.txt

  Scenario: Replay delivery no-op side effects
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-11-replay-noop.txt
  ```

- [x] 12. Harden pipeline source-filter behavior for heterogeneous source values

  **What to do**:
  - Update source filter logic so it works even when source value is not `{}`-compatible object shape.
  - Add tests for mixed source value structures.

  **Must NOT do**:
  - No broad query regressions for existing filter behavior.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`vercel-react-best-practices`]
  - **Skills Evaluated but Omitted**:
    - `agent-browser`: API/data-layer scope only.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 15
  - **Blocked By**: 3

  **References**:
  - `BayStateApp/lib/pipeline.ts` (`contains('sources', { [source]: {} })` assumption).

  **Acceptance Criteria**:
  - [ ] Source filtering works for heterogeneous source JSON value shapes.

  **QA Scenarios**:
  ```
  Scenario: Object-shaped source value filtered correctly
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-12-object-source-filter.txt

  Scenario: Non-object source value still discoverable by source key logic
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-12-nonobject-source-filter.txt
  ```

- [x] 13. Add comprehensive malformed payload matrix tests (admin + chunk)

  **What to do**:
  - Expand test matrix: missing required fields, wrong types, empty data on completed production callback.
  - Assert strict 4xx with no persistence side effects.

  **Must NOT do**:
  - No partial persistence in malformed cases.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`vercel-react-best-practices`]
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not relevant.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 14, 15
  - **Blocked By**: 1, 3, 4

  **References**:
  - Both callback route files + new shared validator utilities.

  **Acceptance Criteria**:
  - [ ] Malformed payload matrix fully covered.
  - [ ] Each malformed class returns expected 4xx response.

  **QA Scenarios**:
  ```
  Scenario: Missing required keys returns 400
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-13-missing-required.txt

  Scenario: Wrong type/nested shape returns 422/400
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-13-wrong-type.txt
  ```

- [ ] 14. Execute integrated TDD regression suite for callback persistence

  **What to do**:
  - Run targeted and full tests after route refactors.
  - Ensure no regressions in callback auth, persistence, and consolidation trigger logic.

  **Must NOT do**:
  - No merge until suite is stable and deterministic.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`vercel-react-best-practices`]
  - **Skills Evaluated but Omitted**:
    - `agent-browser`: Not needed.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential in Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: 5, 6, 7, 8, 11, 13

  **References**:
  - `BayStateApp/package.json` test scripts.

  **Acceptance Criteria**:
  - [ ] Targeted callback suites pass.
  - [ ] `CI=true npm test` passes.

  **QA Scenarios**:
  ```
  Scenario: Targeted callback tests pass
    Tool: Bash (test command)
    Steps:
      1. cd BayStateApp && CI=true npm test -- --testPathPatterns="scraping/callback|chunk-callback"
    Evidence: .sisyphus/evidence/task-14-targeted-tests.txt

  Scenario: Full test suite pass
    Tool: Bash (test command)
    Steps:
      1. cd BayStateApp && CI=true npm test
    Evidence: .sisyphus/evidence/task-14-full-tests.txt
  ```

- [ ] 15. Execute agent QA scenarios for local/prod parity semantics

  **What to do**:
  - Validate expected behavior matrix: strict auth always, production persists, test-mode skip, malformed reject, missing SKU strict fail.
  - Capture evidence outputs for each scenario class.

  **Must NOT do**:
  - No manual-only verification; all scenario results must be command-evidenced.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`vercel-react-best-practices`]
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not UI-focused.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential in Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: 5, 9, 10, 11, 12, 13

  **References**:
  - `BayStateApp/lib/scraper-auth.ts`, callback routes, and pipeline query utilities.

  **Acceptance Criteria**:
  - [ ] Behavior matrix is verified end-to-end by automated scenarios.
  - [ ] Evidence files generated for all key success/error paths.

  **QA Scenarios**:
  ```
  Scenario: Production callback with valid payload persists and marks scraped
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-15-prod-persist.txt

  Scenario: Malformed/missing-SKU callback rejects and performs no partial writes
    Tool: Bash (test command)
    Evidence: .sisyphus/evidence/task-15-strict-fail-no-partial.txt
  ```

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Validate each Must Have / Must NOT Have against code + evidence artifacts.

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run type/lint/tests and check for anti-patterns (`any`, suppressed errors, dead code).

- [ ] F3. **Real QA Execution** — `unspecified-high`
  Execute all task QA scenarios and verify evidence files exist.

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify delivered diff matches plan scope exactly (no under/over-build).

---

## Commit Strategy

| After Task(s) | Message | Files | Verification |
|---|---|---|---|
| 1-5 | `refactor(scraping): add shared callback contracts` | shared callback utils + tests | `CI=true npm test -- --testPathPatterns="callback|pipeline"` |
| 6-10 | `fix(scraping): enforce strict persistence semantics` | callback routes + persistence logic | `CI=true npm test -- --testPathPatterns="scraping/callback|chunk-callback"` |
| 11-15 | `test(pipeline): add replay and malformed payload coverage` | tests + query robustness updates | `CI=true npm test` |

---

## Success Criteria

### Verification Commands
```bash
cd BayStateApp && CI=true npm test
cd BayStateApp && npm run lint
```

### Final Checklist
- [ ] All Must Have items implemented
- [ ] All Must NOT Have guardrails satisfied
- [ ] Callback malformed payloads return deterministic 4xx
- [ ] Missing SKU strict-fail behavior verified with no partial writes
- [ ] Duplicate callback replay does not duplicate side effects
- [ ] Local runs with valid key persist; invalid key rejected
