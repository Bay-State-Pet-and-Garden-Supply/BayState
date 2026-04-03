# Pipeline Status Normalization

## TL;DR
> **Summary**: Normalize `apps/web` so persisted ingestion state, pipeline queries, and admin pipeline tabs all follow the current workflow model without legacy dual-vocabulary drift. Keep `published` derived from storefront/export state rather than persisted in `products_ingestion.pipeline_status`.
> **Deliverables**:
> - Canonical persisted status contract and shared transition helpers
> - Supabase migration/backfill removing status drift and retiring compatibility scaffolding
> - Refactored readers, writers, admin tabs, and publish/export derivation
> - Regression tests for transitions, readers/writers, publish/export derivation, and tab counts
> **Effort**: Large
> **Parallel**: YES - 3 waves
> **Critical Path**: 1 -> 2 -> 4 -> 5 -> 8

## Context
### Original Request
Create a plan to refactor pipeline status usages so they align with the actual current pipeline workflow and stop the DB/UI/schema inconsistency.

### Interview Summary
- User wants a work plan, not implementation.
- User wants status names to match the actual pipeline headings/workflow rather than keeping a confusing translation layer.
- User explicitly chose `published` to be derived from export/storefront state rather than persisted on `products_ingestion.pipeline_status`.
- Planning default: target the visible workflow vocabulary for admin pipeline behavior while keeping monitoring/action tabs non-persisted.

### Metis Review (gaps addressed)
- Guard against drift between `pipeline_status` and `pipeline_status_new` by defining one source of truth and a time-boxed compatibility layer.
- Treat monitoring/action tabs as derived UI views only; never persist them.
- Make the transition matrix explicit, including rework/retry semantics and `failed` handling.
- Verify published derivation and legacy-row migration with dedicated tests and a data audit.

## Work Objectives
### Core Objective
Refactor `apps/web` so the product ingestion lifecycle uses one canonical persisted status model that matches the current admin workflow, while `published` becomes a derived storefront/export state and operational tabs remain derived views.

### Deliverables
- Shared canonical status module and transition matrix.
- Supabase migration/backfill plan covering legacy values and `pipeline_status_new` retirement.
- Refactored ingestion writers, readers, publish/export flows, and admin pipeline UI.
- Updated tests for transitions, counts, routes, onboarding, and derived published behavior.

### Definition of Done (verifiable conditions with commands)
- `products_ingestion.pipeline_status` accepts only the canonical persisted statuses after migration.
- No `apps/web` code writes legacy statuses or `published` into `products_ingestion.pipeline_status`.
- Admin pipeline tabs/counts display the canonical workflow states and operational tabs without dual-vocabulary translation.
- Published/export views derive storefront presence from `products`/export state rather than `products_ingestion.pipeline_status = 'published'`.
- Commands: `bun run web test -- --runInBand pipeline`, `bun run web test -- --runInBand publish`, `bun x tsc --noEmit`, `bun run web build`.

### Must Have
- Canonical persisted statuses documented and centralized.
- Deterministic mapping for existing legacy rows and compatibility inputs.
- Explicit retry/rework semantics: review rejection is `finalized -> scraped`; processing failures persist as `failed`; admin retry resets `failed -> imported`.
- Removal plan for `pipeline_status_new` and legacy compatibility helpers.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- No new third vocabulary layered on top of the existing two.
- No persisted operational tab states such as `monitoring`, `consolidating`, `active-runs`, `active-consolidations`, `images`, or `export`.
- No scraper-runner protocol redesign outside proven `apps/web` boundary contracts.
- No UI redesign beyond status naming/derivation changes required for correctness.

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: tests-after using existing Jest/RTL + route/service tests in `apps/web`
- QA policy: Every task includes agent-executed scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: status contract + schema inventory + migration scaffold + transition/tests foundation
Wave 2: writer/reader refactors + published derivation + admin tab/query refactors
Wave 3: compatibility removal + regression hardening + performance/consistency audit

### Dependency Matrix (full, all tasks)
- 1 blocks 2, 3, 4, 5, 6, 7, 8, 9, 10
- 2 blocks 4, 5, 6, 7, 8, 9
- 3 blocks 4, 5, 6, 7, 8, 10
- 4 blocks 7, 8, 9
- 5 blocks 7, 8, 9
- 6 blocks 7, 8, 9
- 7 blocks 9, 10
- 8 blocks 9, 10
- 9 blocks 10

### Agent Dispatch Summary (wave -> task count -> categories)
- Wave 1 -> 3 tasks -> `unspecified-high`, `deep`
- Wave 2 -> 5 tasks -> `unspecified-high`, `deep`, `quick`
- Wave 3 -> 2 tasks -> `unspecified-high`, `deep`

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Freeze Canonical Status Contract

  **What to do**: Create one shared status contract that distinguishes persisted ingestion statuses from derived admin tabs. Persisted set must be `imported | scraped | finalized | failed`. Derived/UI-only set must cover `monitoring`, `consolidating`, `published`, `images`, and `export`. Update shared type modules so every downstream import depends on this contract instead of local unions.
  **Must NOT do**: Do not keep `registered`/`enriched` as first-class persisted statuses after the refactor. Do not let `published` remain part of the persisted ingestion enum.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Cross-cutting domain model refactor across types, transitions, and callers.
  - Skills: [] — Shared repo patterns are more relevant than external library docs.
  - Omitted: [`turborepo`] — Not a monorepo task-pipeline problem.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2, 3, 4, 5, 6, 7, 8, 9, 10 | Blocked By: none

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/lib/pipeline/types.ts:7` — Current shared status/type definition still encodes the legacy workflow vocabulary.
  - Pattern: `apps/web/lib/pipeline/core.ts:11` — Current transition matrix still uses legacy lifecycle states.
  - Pattern: `apps/web/lib/pipeline-tabs.ts:11` — Existing split between status tabs and non-status tabs should be preserved conceptually.
  - Pattern: `apps/web/app/admin/pipeline/page.tsx:23` — Server route currently treats stage names as UI-level workflow values.
  - External: `apps/web/app/admin/AGENTS.md:44` — Admin guidance documents the intended user-facing pipeline progression.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Shared type/constant module exports a canonical persisted status set and a separate derived/admin tab set.
  - [ ] No file under `apps/web/lib/pipeline*` defines its own divergent pipeline status union.
  - [ ] Typecheck confirms all imports compile against the centralized contract.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Canonical status contract compiles
    Tool: Bash
    Steps: Run `bun x tsc --noEmit` in `apps/web` after updating shared types.
    Expected: No type errors referencing stale pipeline status literals in the shared contract files.
    Evidence: .sisyphus/evidence/task-1-freeze-canonical-status-contract.txt

  Scenario: Legacy literals rejected in shared contract
    Tool: Bash
    Steps: Run `grep -R "type PipelineStatus\|PIPELINE_STATUS_VALUES" apps/web/lib/pipeline*` and inspect the updated definitions.
    Expected: Shared contract no longer defines `registered`, `enriched`, `published`, `consolidated`, or `approved` as persisted statuses.
    Evidence: .sisyphus/evidence/task-1-freeze-canonical-status-contract-error.txt
  ```

  **Commit**: YES | Message: `refactor(pipeline): centralize canonical status contract` | Files: [`apps/web/lib/pipeline/types.ts`, `apps/web/lib/pipeline/core.ts`, `apps/web/lib/pipeline.ts`]

- [x] 2. Land Schema Migration And Row Backfill

  **What to do**: Add a new Supabase migration that converts persisted ingestion statuses to `imported | scraped | finalized | failed`, remaps existing `registered -> imported` and `enriched -> scraped`, handles any surviving `consolidated/approved/published/staging` rows deterministically, retires `pipeline_status_new`, and enforces the final DB constraint/index set.
  **Must NOT do**: Do not leave both `pipeline_status` and `pipeline_status_new` as live domain fields after cutover. Do not silently drop unrecognized rows without explicit mapping or failure handling.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: Migration ordering, data safety, and rollback clarity are critical.
  - Skills: [] — Repo migration patterns are sufficient.
  - Omitted: [`data-pipeline`] — This is schema normalization, not ETL automation.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4, 5, 6, 7, 8, 9 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/supabase/migrations/20260314120000_add_pipeline_status_new.sql:14` — Transitional column scaffold that must be retired.
  - Pattern: `apps/web/supabase/migrations/20260315000000_pipeline_redesign_statuses.sql:21` — Existing remap/constraint migration that currently enforces `registered|enriched|finalized|failed`.
  - Pattern: `apps/web/lib/scraper-callback/products-ingestion.ts:120` — Dual-write path currently emits both legacy and transitional statuses.
  - Pattern: `apps/web/lib/pipeline/publish.ts:127` — Existing persisted `published` write must be eliminated and accounted for in data migration/backfill.

  **Acceptance Criteria** (agent-executable only):
  - [ ] New migration deterministically maps all known historical status values into the canonical persisted set.
  - [ ] Migration removes or deprecates `pipeline_status_new` so application code no longer depends on it.
  - [ ] DB constraint after migration allows only `imported`, `scraped`, `finalized`, `failed`.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Migration yields only canonical statuses
    Tool: Bash
    Steps: Apply migration to a local/dev database fixture, then query distinct `pipeline_status` values from `products_ingestion`.
    Expected: Distinct set is exactly `imported`, `scraped`, `finalized`, `failed`.
    Evidence: .sisyphus/evidence/task-2-land-schema-migration-and-row-backfill.txt

  Scenario: Transitional column retired cleanly
    Tool: Bash
    Steps: Inspect schema after migration using the project DB introspection command or SQL query for `information_schema.columns`.
    Expected: `pipeline_status_new` is absent or explicitly marked unused per migration plan, and no code references remain by end of refactor.
    Evidence: .sisyphus/evidence/task-2-land-schema-migration-and-row-backfill-error.txt
  ```

  **Commit**: YES | Message: `chore(supabase): normalize pipeline status schema` | Files: [`apps/web/supabase/migrations/*pipeline*status*.sql`]

- [x] 3. Codify Transition And Retry Semantics

  **What to do**: Replace the legacy transition graph with the canonical 4-state persisted transition model, then encode retry/rework behavior explicitly: `imported -> scraped`, `scraped -> finalized`, `finalized -> scraped` for review rejection/rework, automatic processing failures at any active stage move to `failed`, and the only supported retry path out of `failed` is an explicit admin reset to `imported`. Update helpers used by bulk moves, reset actions, and validation errors.
  **Must NOT do**: Do not leave transition rules embedded independently in UI components, routes, and helper modules. Do not keep `published` or `consolidated` in the canonical persisted transition matrix.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Shared business rules with broad downstream impact.
  - Skills: [] — Internal code references are sufficient.
  - Omitted: [`playwright-best-practices`] — This task is domain logic first, not browser testing.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4, 5, 6, 7, 8, 9 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/lib/pipeline/core.ts:11` — Primary transition helper to rewrite.
  - Pattern: `apps/web/lib/pipeline.ts:59` — Secondary transition helper and bulk update validation logic to keep in sync.
  - Pattern: `apps/web/components/admin/pipeline/FinalizingResultsView.tsx:599` — Review rejection currently sends products back to `scraped`.
  - Pattern: `apps/web/lib/pipeline.ts:427` — Reset logic currently assumes `imported` and `scraped` clear different payload fields.

  **Acceptance Criteria** (agent-executable only):
  - [ ] One executable transition matrix exists and is consumed by bulk/update helpers.
  - [ ] Review rejection uses `finalized -> scraped`, failures persist as `failed`, and retry uses `failed -> imported` only.
  - [ ] Validation errors mention canonical target states only.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Valid transitions pass
    Tool: Bash
    Steps: Run the targeted pipeline transition unit tests after updating the matrix.
    Expected: Tests cover allowed transitions such as `imported -> scraped`, `scraped -> finalized`, and approved rework/retry paths.
    Evidence: .sisyphus/evidence/task-3-codify-transition-and-retry-semantics.txt

  Scenario: Invalid transitions fail with canonical error text
    Tool: Bash
    Steps: Execute a unit/route test that attempts forbidden transitions like `imported -> finalized` or persisting `published`.
    Expected: Request/helper fails with deterministic canonical-status error output.
    Evidence: .sisyphus/evidence/task-3-codify-transition-and-retry-semantics-error.txt
  ```

  **Commit**: YES | Message: `test(pipeline): codify canonical transition matrix` | Files: [`apps/web/lib/pipeline/core.ts`, `apps/web/lib/pipeline.ts`, `apps/web/__tests__/**/*pipeline*`]

- [x] 4. Refactor Pipeline Writers To Canonical Persisted Statuses

  **What to do**: Update every write path into `products_ingestion` so it only emits canonical persisted statuses. This includes onboarding/manual add/import, scraper callback persistence, consolidation success/failure handling, and any server action/route that patches `pipeline_status` directly.
  **Must NOT do**: Do not leave any writer dual-writing `pipeline_status_new`. Do not patch `published`, `registered`, `enriched`, or `consolidated` into `products_ingestion.pipeline_status`.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Multiple write paths must be changed consistently without introducing data drift.
  - Skills: [] — Internal service and test references are the key guides.
  - Omitted: [`requesting-code-review`] — Review belongs in final verification, not implementation steps.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 7, 8, 9 | Blocked By: 1, 2, 3

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/lib/admin/integra-sync.ts:119` — Onboarding/manual-add writer currently maps into the transitional DB vocabulary.
  - Pattern: `apps/web/lib/scraper-callback/products-ingestion.ts:118` — Scraper callback writer currently emits `scraped` plus `pipeline_status_new: 'enriched'`.
  - Pattern: `apps/web/lib/consolidation/batch-service.ts` — Consolidation writer(s) flagged by Oracle as current status mutators.
  - Pattern: `apps/web/app/admin/pipeline/actions.ts` — Manual add action documentation and action path should align with the canonical write target.
  - Test: `apps/web/__tests__/lib/admin/integra-sync.test.ts:23` — Existing onboarding writer test to update.

  **Acceptance Criteria** (agent-executable only):
  - [ ] All application writers persist only canonical statuses.
  - [ ] No write path references `pipeline_status_new`.
  - [ ] Onboarding/manual add, scraper callback, and consolidation flows are covered by regression tests.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Onboarding and scraping writers persist canonical statuses
    Tool: Bash
    Steps: Run targeted Jest tests for onboarding/import and scraper callback persistence paths.
    Expected: Assertions show `imported`, `scraped`, `finalized`, or `failed` only; no `registered`, `enriched`, `published`, or `pipeline_status_new` writes remain.
    Evidence: .sisyphus/evidence/task-4-refactor-pipeline-writers-to-canonical-persisted-statuses.txt

  Scenario: Writer rejects non-canonical status writes
    Tool: Bash
    Steps: Run route/service tests that attempt to patch legacy or derived statuses into ingestion records.
    Expected: Request/helper fails or is prevented by type system/tests; no DB write succeeds with a forbidden status.
    Evidence: .sisyphus/evidence/task-4-refactor-pipeline-writers-to-canonical-persisted-statuses-error.txt
  ```

  **Commit**: YES | Message: `refactor(pipeline): migrate status writers to canonical model` | Files: [`apps/web/lib/admin/integra-sync.ts`, `apps/web/lib/scraper-callback/products-ingestion.ts`, `apps/web/lib/consolidation/batch-service.ts`, `apps/web/app/admin/pipeline/actions.ts`, `apps/web/__tests__/**/*integra*`, `apps/web/__tests__/**/*scraper-callback*`]

- [x] 5. Refactor Readers, Counts, And Bulk APIs

  **What to do**: Update all read/query paths so filtering, counts, selection, and bulk actions use the canonical persisted statuses and no longer special-case `consolidated`, `published`, or transitional mappings. Make list/count endpoints derive operational tabs separately from persisted statuses.
  **Must NOT do**: Do not keep merging `consolidated` into `finalized` counts once the canonical set is in place. Do not let bulk APIs accept or emit non-canonical persisted statuses except through an explicit temporary compatibility shim.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Shared query semantics affect page loads, counts, and admin bulk actions.
  - Skills: [] — Internal route/query patterns are enough.
  - Omitted: [`honest-review`] — This is implementation, not audit.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 7, 8, 9 | Blocked By: 1, 2, 3

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/lib/pipeline.ts:163` — `getProductsByStatus` currently translates between legacy and transitional statuses.
  - Pattern: `apps/web/lib/pipeline.ts:240` — `getSkusByStatus` mirrors the same mapping issues.
  - Pattern: `apps/web/lib/pipeline.ts:306` — `getStatusCounts` currently counts `imported/monitoring/scraped/consolidated/finalized/published` and merges `consolidated` into `finalized`.
  - Pattern: `apps/web/app/admin/pipeline/page.tsx:23` — Initial stage parsing and data fetch behavior depends on stage names.
  - Pattern: `apps/web/components/admin/pipeline/PipelineClient.tsx:552` — Bulk action route payloads and stage handling currently rely on legacy stages.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Reader/count helpers return canonical persisted states only for ingestion data.
  - [ ] Bulk APIs validate canonical statuses and keep operational tabs out of persisted updates.
  - [ ] Admin page/server props load without any legacy status translation layer.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Counts and list endpoints reflect canonical statuses
    Tool: Bash
    Steps: Run targeted route/service tests for pipeline list/count endpoints with seeded canonical rows.
    Expected: Counts/list payloads align with `imported`, `scraped`, `finalized`, `failed` and operational tabs are computed separately.
    Evidence: .sisyphus/evidence/task-5-refactor-readers-counts-and-bulk-apis.txt

  Scenario: Bulk endpoint rejects legacy or derived statuses
    Tool: Bash
    Steps: Execute route tests that call bulk/status endpoints with `registered`, `enriched`, `published`, `monitoring`, and `consolidating` as persisted targets.
    Expected: Requests fail or are compatibility-mapped only at the documented boundary; no persisted write uses those values.
    Evidence: .sisyphus/evidence/task-5-refactor-readers-counts-and-bulk-apis-error.txt
  ```

  **Commit**: YES | Message: `refactor(pipeline): normalize readers counts and bulk apis` | Files: [`apps/web/lib/pipeline.ts`, `apps/web/app/admin/pipeline/page.tsx`, `apps/web/app/api/admin/pipeline/**/*.ts`, `apps/web/__tests__/**/*pipeline*route*`]

- [x] 6. Derive Published State From Storefront/Export Data

  **What to do**: Remove all logic that persists or queries `products_ingestion.pipeline_status = 'published'`. Replace it with a deterministic derivation rule: a pipeline product is considered published when a `products` row exists for the same `sku`; ShopSite export eligibility is loaded from those published storefront-backed rows, not from ingestion status. Use SKU-based joins/lookups rather than slug heuristics. Ensure publish operations copy/update `products` data without mutating the ingestion status to `published`.
  **Must NOT do**: Do not keep slug-only published checks. Do not mark ingestion rows as `published` after successful export/publish.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: Derived state touches publish, export, and admin views and must avoid false positives.
  - Skills: [] — Domain behavior is internal.
  - Omitted: [`data-pipeline`] — Not an ETL problem.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8, 9 | Blocked By: 1, 2

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/lib/pipeline/publish.ts:123` — Current publish flow updates ingestion status to `published`.
  - Pattern: `apps/web/app/api/admin/pipeline/publish/route.ts:81` — Current GET helper derives storefront presence via slug matching instead of SKU-based truth.
  - Pattern: `apps/web/lib/shopsite/export-builder.ts:290` — Export builder currently loads published products via `pipeline_status = 'published'`.
  - Pattern: `apps/web/components/admin/pipeline/FinalizingResultsView.tsx:526` — Finalizing UI publishes then separately patches ingestion status to `published`.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Publish flow no longer writes `published` into ingestion rows.
  - [ ] Published state is derived solely from `products.sku` presence for the corresponding ingestion SKU.
  - [ ] Published/export queries use deterministic SKU-based logic, not slug heuristics alone.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Published state derives from storefront records
    Tool: Bash
    Steps: Run targeted tests for publish route and export builder with seeded `products_ingestion` + `products` rows keyed by SKU.
    Expected: Product is reported/exportable as published when storefront/export source says so, without any ingestion `published` status.
    Evidence: .sisyphus/evidence/task-6-derive-published-state-from-storefront-export-data.txt

  Scenario: Ingestion status remains canonical after publish
    Tool: Bash
    Steps: Run publish service/route tests and inspect the updated ingestion row payload.
    Expected: Publish succeeds but `products_ingestion.pipeline_status` remains `finalized` (or documented canonical value), never `published`.
    Evidence: .sisyphus/evidence/task-6-derive-published-state-from-storefront-export-data-error.txt
  ```

  **Commit**: YES | Message: `refactor(pipeline): derive published state externally` | Files: [`apps/web/lib/pipeline/publish.ts`, `apps/web/app/api/admin/pipeline/publish/route.ts`, `apps/web/lib/shopsite/export-builder.ts`, `apps/web/components/admin/pipeline/FinalizingResultsView.tsx`]

- [x] 7. Align Admin Pipeline Tabs, Labels, And Toolbar Logic

  **What to do**: Refactor the admin pipeline UI so visible workflow headings and route stages align with the chosen workflow model. Persisted ingestion tabs should represent canonical lifecycle states; operational tabs (`monitoring`, `consolidating`, `images`, `export`) should remain derived/action views; published UI should be a derived view, not an ingestion stage. Rename or split labels as needed so the UI never shows stale transitional vocabulary.
  **Must NOT do**: Do not let a single union pretend that persisted statuses and operational/action tabs are the same thing. Do not keep `published` inside the persisted-stage order used for ingestion CRUD flows.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Multiple admin components must be kept behaviorally consistent.
  - Skills: [] — Existing admin components provide the pattern.
  - Omitted: [`frontend-ui-ux`] — This is semantics/state alignment, not a visual redesign.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 9, 10 | Blocked By: 1, 4, 5, 6

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/components/admin/pipeline/StageTabs.tsx:16` — Current tab order mixes persisted and derived stages including `published`.
  - Pattern: `apps/web/components/admin/pipeline/PipelineClient.tsx:46` — Current URL stage parsing and view branching still use the legacy stage model.
  - Pattern: `apps/web/lib/pipeline-tabs.ts:38` — Existing tab config already separates status tabs from monitoring/action tabs and should inform the end-state structure.
  - Pattern: `apps/web/app/admin/pipeline/page.tsx:21` — Server route currently accepts mixed stage/status params.
  - External: `apps/web/app/admin/AGENTS.md:64` — Admin module docs describe the intended pipeline concepts and status-flow expectations.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Admin pipeline tabs and toolbar actions use canonical workflow labels with operational tabs kept separate.
  - [ ] No UI component branches on `published` as if it were a persisted ingestion status.
  - [ ] Route params and client state handling accept the final documented tab names only.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Pipeline page renders canonical tabs and operational views
    Tool: Bash
    Steps: Run targeted component/page tests for `PipelineClient`, `StageTabs`, and pipeline page server props.
    Expected: Tabs display the final workflow/operational model with no stale `registered`, `enriched`, or persisted `published` stage assumptions.
    Evidence: .sisyphus/evidence/task-7-align-admin-pipeline-tabs-labels-and-toolbar-logic.txt

  Scenario: Derived published/export views stay reachable without persisted status
    Tool: Playwright
    Steps: Open admin pipeline, navigate through status and operational tabs, verify finalized and published/export surfaces load with seeded fixtures.
    Expected: Published/export UI loads from derived data and no ingestion-stage navigation requires a persisted `published` status.
    Evidence: .sisyphus/evidence/task-7-align-admin-pipeline-tabs-labels-and-toolbar-logic-error.png
  ```

  **Commit**: YES | Message: `refactor(admin-pipeline): align tabs with canonical workflow` | Files: [`apps/web/components/admin/pipeline/StageTabs.tsx`, `apps/web/components/admin/pipeline/PipelineClient.tsx`, `apps/web/lib/pipeline-tabs.ts`, `apps/web/app/admin/pipeline/page.tsx`]

- [x] 8. Update Compatibility Boundaries And Remove Dual Vocabulary

  **What to do**: Add a temporary, explicitly bounded compatibility shim only where external/older callers still send legacy statuses, then remove long-term dual-vocabulary helpers from the domain model. Centralize any one-release mapping logic and instrument it so stale callers are discoverable. Delete `toNewPipelineStatus`, `toLegacyPipelineStatus`, and other transitional helpers once all direct call sites are migrated.
  **Must NOT do**: Do not leave compatibility mappings in the core domain indefinitely. Do not let internal modules continue importing transitional helper names after the migration.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Cleanup requires careful boundary control across routes and helpers.
  - Skills: [] — Internal status helper graph is the main concern.
  - Omitted: [`refactor`] — Manual control is better for this domain-specific cleanup.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 10 | Blocked By: 1, 2, 4, 5, 6, 7

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/lib/pipeline.ts:16` — Transitional mapping helpers and legacy status aliases to retire.
  - Pattern: `apps/web/lib/pipeline/types.ts:24` — `PipelineStage` currently conflates persisted states and transient UI states.
  - Pattern: `apps/web/lib/scraper-callback/products-ingestion.ts:121` — Dual-write to `pipeline_status_new` that must disappear.
  - Pattern: `apps/web/app/admin/pipeline/page.tsx:21` — Param parsing boundary where one-release compatibility can be concentrated if needed.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Internal domain modules no longer depend on legacy/transitional status aliases.
  - [ ] Any temporary compatibility handling is isolated to documented boundaries and covered by tests.
  - [ ] `pipeline_status_new` and dual-vocabulary helper references are absent from active app code by the end of the refactor.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: No active code references transitional helpers
    Tool: Bash
    Steps: Search the codebase for `pipeline_status_new`, `LegacyPipelineStatus`, `TransitionalPipelineStatus`, `toNewPipelineStatus`, and `toLegacyPipelineStatus` after cleanup.
    Expected: Only intentionally preserved migration/tests/docs references remain; active app/runtime code is clean.
    Evidence: .sisyphus/evidence/task-8-update-compatibility-boundaries-and-remove-dual-vocabulary.txt

  Scenario: Backward-compatible boundary still works during rollout window
    Tool: Bash
    Steps: Run route/service tests that submit one legacy status at the supported boundary.
    Expected: Boundary maps/logs legacy input exactly once and downstream runtime stays canonical.
    Evidence: .sisyphus/evidence/task-8-update-compatibility-boundaries-and-remove-dual-vocabulary-error.txt
  ```

  **Commit**: YES | Message: `refactor(pipeline): remove transitional status compatibility` | Files: [`apps/web/lib/pipeline.ts`, `apps/web/lib/pipeline/types.ts`, `apps/web/app/api/admin/pipeline/**/*.ts`]

- [x] 9. Expand Regression Coverage For End-To-End Status Semantics

  **What to do**: Add/update Jest/RTL/route tests so the refactor is locked down across onboarding/import, scraper callback persistence, counts/list filtering, publish derivation, finalizing rejection, and admin tab rendering. Seed both legacy and canonical rows where needed to prove migration and compatibility behavior.
  **Must NOT do**: Do not rely on manual QA alone. Do not add tests that encode stale status names as the desired end state.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: Cross-cutting regression net with API + UI + service coverage.
  - Skills: [`playwright-best-practices`] — Useful for precise admin pipeline verification if browser coverage is added.
  - Omitted: [] — No omission needed.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 10 | Blocked By: 2, 4, 5, 6, 7

  **References** (executor has NO interview context — be exhaustive):
  - Test: `apps/web/__tests__/lib/admin/integra-sync.test.ts:23` — Existing onboarding writer regression test.
  - Test: `apps/web/__tests__/components/admin/pipeline/TimelineView.test.tsx` — Existing admin pipeline component test surface.
  - Test: `apps/web/__tests__/components/admin/pipeline/ScrapedResultsView.test.tsx` — Scraped-stage UI behavior surface.
  - Test: `apps/web/__tests__/components/admin/pipeline/RunnerHealthCard.test.tsx` — Operational tab-related admin test surface.
  - Pattern: `apps/web/app/api/admin/pipeline/publish/route.ts:51` — Publish GET/POST behavior requiring route coverage.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Regression tests cover canonical writes, reads/counts, publish derivation, and admin tab rendering.
  - [ ] At least one test proves legacy row/value migration behavior and one proves compatibility-boundary behavior.
  - [ ] CI-relevant web test commands pass with the updated suite.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Targeted regression suites pass
    Tool: Bash
    Steps: Run targeted Jest suites for pipeline services, routes, and admin components after test updates.
    Expected: All updated status-related suites pass with canonical status assertions.
    Evidence: .sisyphus/evidence/task-9-expand-regression-coverage-for-end-to-end-status-semantics.txt

  Scenario: UI regression proves no stale labels remain
    Tool: Playwright
    Steps: Exercise the admin pipeline route with seeded data and capture the visible tab labels, toolbar actions, and publish/finalize flow.
    Expected: Visible labels follow the final workflow vocabulary and operational tabs render separately from persisted status tabs.
    Evidence: .sisyphus/evidence/task-9-expand-regression-coverage-for-end-to-end-status-semantics-error.png
  ```

  **Commit**: YES | Message: `test(pipeline): add workflow status regression coverage` | Files: [`apps/web/__tests__/**/*pipeline*`, `apps/web/__tests__/**/*publish*`, `apps/web/__tests__/**/*integra*`]

- [x] 10. Run Final Data And Performance Audit

  **What to do**: Perform a final audit pass after code changes to confirm there are no invalid statuses, no query regressions in published/export derivation, no double-counting between persisted and operational tabs, and no stale strings left in active code. Capture evidence for schema values, route payloads, and page rendering.
  **Must NOT do**: Do not mark the refactor complete without verifying the real distinct DB status set, published derivation queries, and admin pipeline tab behavior on current fixtures.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: Final consistency/performance audit spans schema, routes, and UI behavior.
  - Skills: [`playwright-best-practices`] — Helpful for deterministic UI verification.
  - Omitted: [] — No omission needed.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: F1, F2, F3, F4 | Blocked By: 7, 8, 9

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `apps/web/lib/shopsite/export-builder.ts:278` — Published/export derivation needs performance and correctness verification.
  - Pattern: `apps/web/components/admin/pipeline/PipelineClient.tsx:674` — Main admin pipeline rendering path to verify after alignment.
  - Pattern: `apps/web/app/admin/pipeline/page.tsx:19` — Server-side entry point for initial data load.
  - Pattern: `apps/web/supabase/migrations/20260315000000_pipeline_redesign_statuses.sql:35` — Prior constraint baseline to supersede/verify against the final schema.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Final DB audit shows only canonical persisted statuses.
  - [ ] Published/export queries work without persisted `published` and do not rely on slug-only matching.
  - [ ] Admin counts/tabs do not double-count or misroute products across persisted and operational views.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Final schema/query audit passes
    Tool: Bash
    Steps: Run the final DB audit query set plus route tests/build/typecheck.
    Expected: Distinct persisted statuses are canonical, published derivation queries succeed, and `bun x tsc --noEmit` plus `bun run web build` pass.
    Evidence: .sisyphus/evidence/task-10-run-final-data-and-performance-audit.txt

  Scenario: Admin pipeline end-to-end audit passes
    Tool: Playwright
    Steps: Navigate through admin pipeline tabs, finalize/reject/publish seeded products, and verify resulting tab placement/count behavior.
    Expected: Operational tabs, canonical persisted tabs, and derived published/export views all behave consistently with no stale status strings visible.
    Evidence: .sisyphus/evidence/task-10-run-final-data-and-performance-audit-error.png
  ```

  **Commit**: NO | Message: `n/a` | Files: [`apps/web`, `.sisyphus/evidence/*`]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle

  **What to do**: Run a read-only audit comparing implemented changes against Tasks 1-10 in this plan and flag any missing deliverable, broken dependency, skipped guardrail, or acceptance criterion miss.
  **Must NOT do**: Do not approve partial work. Do not focus on style-only feedback if scope or contract violations remain.

  **QA Scenarios**:
  ```
  Scenario: Oracle verifies task-by-task compliance
    Tool: Bash
    Steps: Collect implementation diffs/test evidence, then invoke the review agent with this plan file and changed-file list.
    Expected: Oracle explicitly confirms each plan task is satisfied or returns a concrete failure list.
    Evidence: .sisyphus/evidence/f1-plan-compliance-audit.txt

  Scenario: Missing plan item is detected
    Tool: Bash
    Steps: Intentionally compare completed work against the plan checklist before final approval.
    Expected: Any skipped task, acceptance criterion, or guardrail is reported as a blocking failure rather than silently accepted.
    Evidence: .sisyphus/evidence/f1-plan-compliance-audit-error.txt
  ```

- [ ] F2. Code Quality Review — unspecified-high

  **What to do**: Review the changed code for type safety, duplication, dead compatibility paths, fragile published derivation logic, and schema/query correctness.
  **Must NOT do**: Do not limit review to lint/style. Do not approve if legacy status drift remains in active runtime code.

  **QA Scenarios**:
  ```
  Scenario: Code review approves canonical status implementation
    Tool: Bash
    Steps: Run a review pass over the final diff plus `bun x tsc --noEmit` and targeted test output.
    Expected: Reviewer confirms no active code writes or depends on forbidden status values.
    Evidence: .sisyphus/evidence/f2-code-quality-review.txt

  Scenario: Review catches legacy drift
    Tool: Bash
    Steps: Search the final tree for legacy/transitional status literals and compare against the changed files.
    Expected: Any remaining runtime dependency on `registered`, `enriched`, `published`, `pipeline_status_new`, or stale helpers is flagged as blocking.
    Evidence: .sisyphus/evidence/f2-code-quality-review-error.txt
  ```

- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)

  **What to do**: Execute the admin pipeline workflow end-to-end using seeded fixtures: onboarding/import, scrape progression, finalizing rejection, publish, and export/published views.
  **Must NOT do**: Do not rely on unit tests alone. Do not skip the published/export surfaces.

  **QA Scenarios**:
  ```
  Scenario: End-to-end admin workflow passes
    Tool: Playwright
    Steps: Open `/admin/pipeline`, move seeded products through imported -> scraped -> finalized, reject one back to scraped, publish one to storefront, and verify derived published/export views.
    Expected: UI labels, counts, and product placement match the canonical workflow with published derived externally.
    Evidence: .sisyphus/evidence/f3-real-manual-qa.png

  Scenario: Invalid state does not surface in UI
    Tool: Playwright
    Steps: Attempt to trigger legacy/forbidden states via route params, bulk actions, and publish flow.
    Expected: UI never displays or persists forbidden legacy statuses, and any invalid request path fails gracefully.
    Evidence: .sisyphus/evidence/f3-real-manual-qa-error.png
  ```

- [ ] F4. Scope Fidelity Check — deep

  **What to do**: Confirm the final change set stays within scope: status normalization, published derivation, compatibility cleanup, and tests only.
  **Must NOT do**: Do not approve if unrelated product, scraper, or admin redesign work slipped in.

  **QA Scenarios**:
  ```
  Scenario: Scope review confirms no unrelated expansion
    Tool: Bash
    Steps: Review final diff grouped by directory and compare against the plan scope boundaries.
    Expected: All changed files map directly to status normalization, published derivation, compatibility cleanup, or verification work.
    Evidence: .sisyphus/evidence/f4-scope-fidelity-check.txt

  Scenario: Scope creep is flagged
    Tool: Bash
    Steps: Inspect final diff for unrelated feature work, visual redesign, or scraper protocol changes outside `apps/web`.
    Expected: Any out-of-scope modification is reported as a blocking issue requiring removal or a separate plan.
    Evidence: .sisyphus/evidence/f4-scope-fidelity-check-error.txt
  ```

## Commit Strategy
- Commit 1: `test(pipeline): codify canonical workflow statuses`
- Commit 2: `refactor(pipeline): centralize canonical status model`
- Commit 3: `refactor(pipeline): migrate writers and readers`
- Commit 4: `refactor(admin-pipeline): derive published and operational tabs`
- Commit 5: `chore(supabase): remove legacy status compatibility`

## Success Criteria
- One canonical persisted status model exists and is the only value set written to `products_ingestion.pipeline_status`.
- `published` appears correctly in admin/export flows without being persisted in `products_ingestion.pipeline_status`.
- Legacy helpers, dual-write logic, and stale labels are removed or explicitly time-boxed for rollback.
- Tests, typecheck, and build all pass with evidence attached.
