# Implementation Plan

## Goal
Add an AI-driven `grouping` stage that classifies products into manufacturer Product Groups, lets operators review/edit groups, then consolidates each approved Product Group in one multi-product LLM call.

## Tasks

1. **Validate current schema assumptions and create the primary DB migration**
   - File: `apps/web/supabase/migrations/<timestamp>_product_line_grouping_stage.sql`
   - Changes:
     - Verify actual schema before writing SQL: generated types currently show `products_ingestion.product_line` but no `product_line_id`; design says `product_line_id` exists. If the column is absent, add `product_line_id uuid null` and keep `product_line text` as a denormalized/backcompat display label.
     - Create `public.product_lines` with stable UUID `id`, `canonical_name`, `normalized_key`, optional `brand_id`, optional category/facet metadata, `created_at`, `updated_at`, and unique constraint/index for canonical identity (recommend `unique (brand_id, normalized_key)`).
     - Add FK from `products_ingestion.product_line_id` to `product_lines.id`.
     - Add grouping metadata to `products_ingestion`: `product_line_confidence numeric`, `product_line_assignment_source text check ('ai','manual','migration')`, `product_line_raw_label text`, `product_line_rationale text`, and optional `product_line_review_required boolean default false`.
     - Add indexes on `products_ingestion(product_line_id)`, `products_ingestion(pipeline_status, product_line_id)`, and `product_lines(normalized_key)`.
     - Add `grouping` to enum `pipeline_status_five`.
     - Update `batch_jobs_execution_mode_check` to include `product_line_classification`.
     - Add `batch_job_items` subject metadata for group-level work items: `item_kind text default 'upc' check ('upc','product_group','subproduct_group')`, `subject_key text`, and backfill `subject_key = upc` for existing rows. Decide in this migration whether `upc` remains non-null or becomes nullable for group items; recommended: make `upc` nullable and use `(batch_job_id, subject_key)` uniqueness for new item kinds while preserving the legacy `(batch_job_id, upc)` index for per-UPC items.
   - Acceptance: local Supabase migration applies cleanly; generated `database.types.ts` can represent `grouping`, `product_lines`, product-line metadata, and the updated batch item shape.

2. **Regenerate and update Supabase/database types**
   - File: `apps/web/lib/supabase/database.types.ts`
   - Changes: Regenerate after migration so `pipeline_status_five`, `products_ingestion`, `product_lines`, `batch_jobs.execution_mode`, and `batch_job_items` match DB schema.
   - Acceptance: TypeScript sees `grouping`, `product_line_id`, grouping metadata fields, `product_lines`, and `product_line_classification` without casts.

3. **Add `grouping` to pipeline status plumbing**
   - File: `apps/web/lib/pipeline/types.ts`
   - Changes: Add `grouping` to `PERSISTED_PIPELINE_STATUSES`, `PIPELINE_TABS`, `STAGE_CONFIG`, and `PipelineProduct` fields (`product_line_id`, denormalized `product_line`, confidence/source/raw label/rationale/review flag).
   - File: `apps/web/lib/pipeline/core.ts`
   - Changes: Update `STATUS_TRANSITIONS` to allow `processed -> grouping`, `grouping -> merging`, `grouping -> processed`, and `grouping -> failed`; remove direct `processed -> merging` for normal UI flow unless retained as legacy singleton/backcompat path.
   - File: `apps/web/lib/pipeline/derivation.ts`
   - Changes: Add `grouping` to `WORKFLOW_PIPELINE_TABS`, tab derivation, and active-job concepts if grouping jobs should show as active.
   - File: `apps/web/lib/validation/pipeline-schemas.ts`
   - Changes: Ensure Zod schemas accept `grouping` and new product-line fields.
   - Acceptance: pipeline status tests pass and a product with `pipeline_status: 'grouping'` renders/validates as a first-class stage.

4. **Replace cohort-shaped pipeline queries with Product Group queries**
   - File: `apps/web/lib/pipeline.ts`
   - Changes:
     - Replace `cohort_batches(...)` joins and `cohort_id` filters with `product_lines(...)` joins and `product_line_id` filters.
     - Keep `product_line` string filter temporarily mapped to `product_lines.canonical_name` or `products_ingestion.product_line` for backward-compatible URLs.
     - Update hydration helpers (`normalizeCohortMetadata`, `withCohortBatchMetadata`, etc.) into Product Line equivalents.
   - File: `apps/web/lib/pipeline/queries.ts`
   - Changes: Include product-line metadata and support filtering/counting by `product_line_id`.
   - Acceptance: imported/processed/grouping/reviewing product queries no longer require `cohort_batches`, and URL filters can target Product Lines.

5. **Update consolidation type contracts**
   - File: `apps/web/lib/consolidation/types.ts`
   - Changes:
     - Extend `BatchExecutionMode` with `product_line_classification`.
     - Add `ProductLineClassificationInput`, `ProductLineClassificationResult`, `ProductGroupSubmission`, `GroupConsolidationResult`, and `GroupConsolidationPayload` types.
     - Update `BatchJobItem` to include `item_kind`, `subject_key`, nullable `upc`, and group-level parsed result shape.
     - Remove or mark `productLineContext` as deprecated; it is replaced by persisted Product Groups.
   - Acceptance: new services can type classification and group consolidation without `Record<string, unknown>` everywhere.

6. **Build Product Line taxonomy and dedup utilities**
   - New File: `apps/web/lib/consolidation/product-lines.ts`
   - Changes: Add helpers to load known `product_lines`, normalize labels, upsert product lines, assign products to a line, mark manual assignments, and preserve denormalized display label.
   - New File: `apps/web/lib/consolidation/product-line-dedup.ts`
   - Changes: Implement post-classification fuzzy dedup: normalize labels, compute similarity, auto-merge high-confidence near duplicates, flag ambiguous merges (<0.95 similarity) for operator review.
   - Acceptance: unit tests cover exact match, punctuation/case variants, high-similarity auto-merge, and ambiguous non-merge.

7. **Create classification prompt and parser**
   - New File: `apps/web/lib/consolidation/product-line-classification.ts`
   - Changes:
     - Build minimal evidence from sources/input: highest-signal name, brand, category, and explicit family/product-line fields.
     - Include known `product_lines` taxonomy in prompt as allowed vocabulary.
     - Output/parse JSON `{ product_line, confidence, rationale }`.
     - Apply 0.80 threshold: confidence below threshold becomes `Ungrouped`/singleton metadata, not a Product Group assignment.
     - Use `getConsolidationConfig()` so provider follows the consolidation provider setting.
   - New File: `apps/web/lib/consolidation/product-line-classification.test.ts` or `apps/web/lib/consolidation/__tests__/product-line-classification.test.ts`
   - Acceptance: parser rejects invalid JSON/missing fields/out-of-range confidence and threshold behavior is tested.

8. **Add classification batch execution using `batch_jobs`**
   - File: `apps/web/lib/consolidation/batch-service.ts`
   - Changes:
     - Add `submitProductLineClassificationBatch(products, metadata)` that creates `batch_jobs.execution_mode = 'product_line_classification'` and one `batch_job_items` row per UPC.
     - Add routing/status/retrieval helpers for classification jobs.
     - Ensure classification jobs do not use consolidation parsers or apply service.
   - File: `apps/web/lib/consolidation/direct-chat-service.ts`
   - Changes: Add processing path for `product_line_classification` items using classification prompt/parser, with retry behavior parallel to consolidation.
   - File: `apps/web/lib/consolidation/gemini-batch-service.ts`
   - Changes: Add classification payload preparation/retrieval when provider is Gemini, or explicitly route provider-compatible classification through the same provider abstraction used by consolidation.
   - Acceptance: a classification batch can be submitted, processed/synced, and persists product-line assignments and metadata.

9. **Implement grouping apply/finalization service**
   - New File: `apps/web/lib/consolidation/grouping-service.ts`
   - Changes:
     - Orchestrate classification results: parse item outputs, run fuzzy dedup, upsert `product_lines`, update `products_ingestion.product_line_id` and metadata, and set `pipeline_status = 'grouping'` for processed products.
     - Preserve existing `product_line_id` on re-extraction unless operator manually changes it.
     - Provide manual operations: move UPCs to product line, merge product lines, split/create product line, rename product line.
   - Acceptance: service supports AI assignment and manual override without touching consolidated product data.

10. **Redesign prompt building for group consolidation**
    - File: `apps/web/lib/consolidation/prompt-builder.ts`
    - Changes:
      - Keep existing single-product prompt builders for singleton fallback.
      - Add `generateGroupConsolidationSystemPrompt(categories, vocabulary)` with multi-product output contract: `{ "products": { "UPC": { ...existing fields... } } }`.
      - Add `buildGroupUserPrompt(productLine, productsWithEvidence)` that includes all source evidence for all UPCs in a Product Group and instructions for consistent brand/category/name/description patterns.
      - Add oversized-group prompt support for explicit Subproduct Group splitting only when group has >30 UPCs.
    - File: `apps/web/lib/consolidation/__tests__/prompt-builder.test.ts`
    - Changes: Add tests for group output contract, source evidence inclusion, and no use of obsolete `productLineContext` sibling hints.
    - Acceptance: group prompts include every UPC and require every UPC in output.

11. **Add group result parser with completeness validation**
    - New File: `apps/web/lib/consolidation/group-result-parsing.ts`
    - Changes:
      - Parse `{ products: { [upc]: result } }`.
      - Validate every input UPC appears exactly once; reject partial/extra/duplicate outputs.
      - Reuse `normalizeConsolidationResult`, taxonomy validation, and `RawConsolidationSchema` logic from `result-parsing.ts` per UPC.
      - Return flattened `ConsolidationResult[]` for downstream apply.
    - File: `apps/web/lib/consolidation/result-parsing.ts`
    - Changes: Export shared raw schema/helpers currently private if needed.
    - Acceptance: parser tests cover complete group, missing UPC, extra UPC, invalid per-UPC schema, and category normalization.

12. **Implement group consolidation execution**
    - File: `apps/web/lib/consolidation/batch-service.ts`
    - Changes:
      - Add `submitGroupConsolidationBatch(groups, metadata)` accepting `{ groups: [{ product_line_id, upcs }] }`.
      - Create one batch item per Product Group/subgroup with `item_kind = 'product_group'` or `subproduct_group`, `subject_key = product_line_id` or subgroup key, and `product_source` containing all UPC sources.
      - Route Product Groups >30 UPCs to explicit subgroup detection before creating consolidation items.
      - Keep singleton fallback path for products without accepted Product Group assignment.
    - File: `apps/web/lib/consolidation/direct-chat-service.ts`
    - Changes: For group-consolidation items, call group prompt and parse with `parseGroupConsolidationText`; store group parsed result on the item.
    - File: `apps/web/lib/consolidation/gemini-batch-service.ts`
    - Changes: Ensure Gemini batch preparation supports one request per group item and can retrieve/parse group JSON output.
    - Acceptance: a group batch with 2+ UPCs stores one item and later retrieves flattened per-UPC results.

13. **Update retrieval and apply to flatten group outputs**
    - File: `apps/web/lib/consolidation/batch-service.ts`
    - Changes: Update `retrieveResults(batchId)` to detect group-consolidation items (via `item_kind` or metadata) and flatten parsed group outputs to `ConsolidationResult[]`.
    - File: `apps/web/lib/consolidation/apply-service.ts`
    - Changes:
      - Keep per-UPC apply logic mostly intact by consuming flattened results.
      - Add safety that group-consolidated products move from `merging` to `reviewing` only if every UPC in the group passed validation; otherwise failed UPCs return to `grouping` or `processed` with `error_message` according to agreed UX.
      - Preserve `product_line_id` and grouping metadata during apply.
    - Acceptance: apply works for legacy singleton results and group-consolidated results; partial group output never reaches apply.

14. **Expose grouping and group consolidation APIs**
    - New File: `apps/web/app/api/admin/grouping/submit/route.ts`
    - Changes: Authenticated endpoint to submit selected processed UPCs for Product Line classification.
    - New File: `apps/web/app/api/admin/grouping/[batchId]/route.ts`
    - Changes: Return classification batch status and summary.
    - New File: `apps/web/app/api/admin/grouping/groups/route.ts`
    - Changes: List Product Groups and Ungrouped/Singleton products for the `grouping` stage.
    - New File: `apps/web/app/api/admin/grouping/groups/[productLineId]/route.ts`
    - Changes: Rename/merge/split/reassign products; mark assignments manual.
    - File: `apps/web/app/api/admin/consolidation/submit/route.ts`
    - Changes:
      - Change primary request body to `{ groups: [{ product_line_id, upcs }] }`.
      - Keep legacy `{ upcs }` path only for singleton fallback/backward compatibility and mark as deprecated in comments.
      - Stop reading `productLineContext` from request body.
    - File: `apps/web/app/api/admin/consolidation/scraped/route.ts`
    - Changes: Remove or rewrite; current route depends on `TwoPhaseConsolidationService` and `input.productLineContext`.
    - Acceptance: admin can submit grouping, inspect groups, edit groups, and submit selected groups to consolidation via APIs.

15. **Add big-bang backfill script for non-published products**
    - New File: `apps/web/scripts/backfill-product-lines.ts`
    - Changes:
      - Select all non-published products (`exported_at is null`) across active pipeline statuses.
      - Submit classification batches in chunks, process/sync until complete, run dedup, persist Product Lines, and move appropriate products to `grouping` if they are at/after `processed` and not currently in a protected active state.
      - Add `--dry-run`, `--limit`, `--status`, and `--resume-batch-id` options.
      - Log estimated cost/counts before execution.
    - File: `apps/web/package.json`
    - Changes: Add package-level script such as `"product-lines:backfill": "bun scripts/backfill-product-lines.ts"`.
    - Acceptance: dry run reports counts without writes; real run can resume and does not classify `exported_at` products.

16. **Replace cohort utilities and routes with Product Line equivalents**
    - New File: `apps/web/lib/admin/product-line-utils.ts`
    - Changes: Product Line assignment/filter helpers replacing `groupUpcsByPrefix` and cohort assignment.
    - File: `apps/web/lib/admin/cohort-utils.ts`
    - Changes: Deprecate or remove after callers migrate.
    - File: `apps/web/lib/pipeline/cohorts.ts`
    - Changes: Replace `recohortProducts` usage with Product Line preservation/reassignment logic, or delete after callers migrate.
    - Files: `apps/web/app/api/admin/cohorts/route.ts`, `apps/web/app/api/admin/cohorts/[id]/route.ts`, `apps/web/app/api/admin/cohorts/[id]/process/route.ts`, `apps/web/app/api/admin/cohorts/recommendations/route.ts`
    - Changes: Remove, redirect, or replace with Product Line grouping APIs after frontend migration.
    - File: `apps/web/lib/pipeline-scraping.ts`
    - Changes: Replace cohort lookups with durable `brand_id`, `product_line_id`, and/or Product Line metadata so extraction/source planning no longer depends on cohorts.
    - Acceptance: no production code path requires `cohort_batches` or `cohort_members` for pipeline operation.

17. **Remove TwoPhaseConsolidationService and consistency-rule references**
    - Files: `apps/web/lib/consolidation/two-phase-service.ts`, `apps/web/lib/consolidation/consistency-rules.ts`
    - Changes: Delete or leave only if tests/legacy routes still need temporary compatibility; target is removal.
    - File: `apps/web/lib/consolidation/index.ts`
    - Changes: Stop exporting `TwoPhaseConsolidationService` and `buildDefaultConsistencyRules`.
    - Files: `apps/web/lib/consolidation/__tests__/consistency-rules.test.ts` and any two-phase tests
    - Changes: Remove tests or replace with group-output completeness/schema validation tests.
    - Acceptance: grep for `TwoPhaseConsolidationService` and `buildDefaultConsistencyRules` returns no active imports.

18. **Build Grouping stage frontend**
    - New File: `apps/web/components/admin/pipeline/GroupingResultsView.tsx`
    - Changes: Workspace view showing Product Group cards, Ungrouped bucket, confidence/rationale, review-required flags, product previews, and selected group actions.
    - New Files (as needed): `GroupingGroupCard.tsx`, `GroupingReassignDialog.tsx`, `GroupingMergeDialog.tsx`, `GroupingSplitDialog.tsx`, `GroupingRenameDialog.tsx` under `apps/web/components/admin/pipeline/grouping/`.
    - File: `apps/web/components/admin/pipeline/PipelineClient.tsx`
    - Changes:
      - Render `GroupingResultsView` when `currentStage === 'grouping'`.
      - Add `handleGroupProducts(upcs)` on Processed tab to call `/api/admin/grouping/submit`.
      - Add `handleConsolidateGroups(groups)` on Grouping tab to call `/api/admin/consolidation/submit` with `{ groups }`.
      - Remove cohort edit state from grouping/processed flows once Product Line UI replaces it.
    - File: `apps/web/components/admin/pipeline/ProcessedResultsView.tsx`
    - Changes: Replace direct “Consolidate/Merge selected” action with “Group Products” for normal selected processed products; keep singleton consolidation only for explicit ungrouped fallback if required.
    - File: `apps/web/components/admin/pipeline/StageTabs.tsx`, `StatusBadge.tsx`, `PipelineFilters.tsx`
    - Changes: Add `Grouping` tab/status and product-line filters based on `product_line_id`.
    - Acceptance: operator can select processed products, submit grouping, review/edit groups, and consolidate selected groups.

19. **Update active job monitoring and run displays**
    - Files: `apps/web/components/admin/pipeline/ActiveRunsTab.tsx`, `ActiveConsolidationsTab.tsx`, `components/admin/pipeline/consolidation/*`, `apps/web/lib/pipeline/run-types.ts`
    - Changes: Display product-line classification jobs and group-consolidation jobs with correct counts (`group_count`, `product_count`, failed group/item counts). Avoid labeling group items as UPCs.
    - API Files: `apps/web/app/api/admin/consolidation/jobs/route.ts` and pipeline run endpoints if present.
    - Acceptance: Merging tab and run history distinguish classification, singleton consolidation, and group consolidation.

20. **Update generated docs/comments and remove stale productLineContext assumptions**
    - File: `apps/web/lib/consolidation/AGENTS.md`
    - Changes: Update data flow, structure list, output contract, and anti-patterns for grouping, group item granularity, and Product Line classification.
    - File: `apps/web/app/admin/AGENTS.md`
    - Changes: Update pipeline vocabulary to include `grouping` and Product Groups instead of cohorts.
    - Acceptance: internal docs match implemented flow and no longer claim consolidation is one request per SKU in the normal grouped path.

21. **Update tests for schema, pipeline, services, and UI**
    - Files: `apps/web/lib/pipeline/core.test.ts`, `derivation.test.ts`, `types.test.ts`, `queries.test.ts`
    - Changes: Add `grouping` status, transitions, tab derivation, and product-line filtering tests.
    - Files: `apps/web/lib/consolidation/__tests__/product-line-classification.test.ts`, `product-line-dedup.test.ts`, `group-result-parsing.test.ts`, `prompt-builder.test.ts`
    - Changes: Cover classification parsing, threshold, taxonomy label selection, fuzzy dedup, group prompt, and partial-output rejection.
    - Files: `apps/web/__tests__/app/api/admin/pipeline/route.test.ts`, existing cohort tests, and new grouping API tests
    - Changes: Replace cohort expectations with Product Line grouping behavior; add API tests for submit/list/edit/consolidate groups.
    - Files: `apps/web/components/admin/pipeline/__tests__/*` or colocated tests if pattern exists
    - Changes: Add UI tests for Grouping tab rendering and actions.
    - Acceptance: `bun run web test -- --testPathPatterns="pipeline|consolidation|grouping"` passes.

22. **Run focused validation and rollout checklist**
    - File: no code file; release checklist in PR description or `docs/adr/0004-group-based-consolidation.md` if desired.
    - Changes:
      - Run `bun run web typecheck` and focused Jest suites.
      - Run DB migration on local Supabase reset.
      - Run backfill script in `--dry-run`, then on a small `--limit` sample.
      - Validate one DeepSeek and one Gemini provider path if both are configured.
      - Verify exported/published products are not classified by the big-bang backfill.
    - Acceptance: sample Product Group reaches `grouping`, is manually edited, submits group consolidation, rejects partial output if simulated, and applies to `reviewing`.

## Files to Modify

- `apps/web/supabase/migrations/<timestamp>_product_line_grouping_stage.sql` - schema for Product Lines, grouping status, batch item subject metadata, execution mode.
- `apps/web/lib/supabase/database.types.ts` - regenerated Supabase types.
- `apps/web/lib/pipeline/types.ts` - `grouping` status, Product Line fields, stage config.
- `apps/web/lib/pipeline/core.ts` - status transitions.
- `apps/web/lib/pipeline/derivation.ts` - tab derivation and workflow tabs.
- `apps/web/lib/validation/pipeline-schemas.ts` - validation for new status/fields.
- `apps/web/lib/pipeline.ts` - replace cohort joins/filters with Product Line joins/filters.
- `apps/web/lib/pipeline/queries.ts` - Product Line filtering and query hydration.
- `apps/web/lib/pipeline-scraping.ts` - remove cohort dependency from extraction/source-plan context.
- `apps/web/lib/consolidation/types.ts` - new execution mode, group/classification types, batch item subject metadata.
- `apps/web/lib/consolidation/batch-service.ts` - classification submit/status/retrieve and group consolidation submit/retrieve.
- `apps/web/lib/consolidation/direct-chat-service.ts` - process classification items and group consolidation items.
- `apps/web/lib/consolidation/gemini-batch-service.ts` - support provider-following classification and group consolidation for Gemini.
- `apps/web/lib/consolidation/prompt-builder.ts` - group prompt and output contract.
- `apps/web/lib/consolidation/result-parsing.ts` - export shared per-UPC validation helpers.
- `apps/web/lib/consolidation/apply-service.ts` - consume flattened group outputs, preserve Product Line assignment.
- `apps/web/lib/consolidation/index.ts` - export new services and remove two-phase exports.
- `apps/web/app/api/admin/consolidation/submit/route.ts` - accept `{ groups }` and deprecate `upcs` normal path.
- `apps/web/app/api/admin/consolidation/scraped/route.ts` - remove/rewrite legacy two-phase route.
- `apps/web/app/api/admin/cohorts/**` - remove/replace with Product Line grouping routes.
- `apps/web/lib/admin/cohort-utils.ts` - deprecate/remove after Product Line replacement.
- `apps/web/lib/pipeline/cohorts.ts` - remove/replace recohorting logic.
- `apps/web/components/admin/pipeline/PipelineClient.tsx` - add grouping flow and render Grouping view.
- `apps/web/components/admin/pipeline/ProcessedResultsView.tsx` - trigger grouping instead of direct consolidation.
- `apps/web/components/admin/pipeline/StageTabs.tsx` - add Grouping tab.
- `apps/web/components/admin/pipeline/StatusBadge.tsx` - add Grouping badge.
- `apps/web/components/admin/pipeline/PipelineFilters.tsx` - Product Line filter by `product_line_id`.
- `apps/web/components/admin/pipeline/ActiveRunsTab.tsx`, `ActiveConsolidationsTab.tsx`, `components/admin/pipeline/consolidation/*` - display classification/group job types.
- `apps/web/package.json` - add package-level backfill script.
- `apps/web/lib/consolidation/AGENTS.md`, `apps/web/app/admin/AGENTS.md` - update local guidance.
- Existing tests under `apps/web/lib/pipeline/*.test.ts`, `apps/web/lib/consolidation/__tests__/*.test.ts`, and `apps/web/__tests__/**` - update expectations.

## New Files

- `apps/web/lib/consolidation/product-lines.ts` - Product Line taxonomy load/upsert/assignment helpers.
- `apps/web/lib/consolidation/product-line-dedup.ts` - fuzzy dedup and ambiguity flagging.
- `apps/web/lib/consolidation/product-line-classification.ts` - evidence extraction, prompt, parser, classification orchestration helpers.
- `apps/web/lib/consolidation/grouping-service.ts` - apply/finalize classification results and manual group edits.
- `apps/web/lib/consolidation/group-result-parsing.ts` - parse and validate multi-product group outputs.
- `apps/web/lib/consolidation/subgroup-detection.ts` - explicit subgroup split only for oversized Product Groups.
- `apps/web/lib/admin/product-line-utils.ts` - admin Product Line assignment/filter utilities replacing cohorts.
- `apps/web/app/api/admin/grouping/submit/route.ts` - submit Product Line classification job.
- `apps/web/app/api/admin/grouping/[batchId]/route.ts` - grouping job status/summary.
- `apps/web/app/api/admin/grouping/groups/route.ts` - list grouping-stage Product Groups and Ungrouped bucket.
- `apps/web/app/api/admin/grouping/groups/[productLineId]/route.ts` - rename/merge/split/reassign Product Groups.
- `apps/web/components/admin/pipeline/GroupingResultsView.tsx` - Grouping stage workspace.
- `apps/web/components/admin/pipeline/grouping/GroupingGroupCard.tsx` - Product Group card UI.
- `apps/web/components/admin/pipeline/grouping/GroupingReassignDialog.tsx` - manual product reassignment.
- `apps/web/components/admin/pipeline/grouping/GroupingMergeDialog.tsx` - merge Product Lines.
- `apps/web/components/admin/pipeline/grouping/GroupingSplitDialog.tsx` - split Product Line from selected UPCs.
- `apps/web/components/admin/pipeline/grouping/GroupingRenameDialog.tsx` - rename Product Line.
- `apps/web/scripts/backfill-product-lines.ts` - big-bang non-published classification/backfill runner.
- New tests: `product-line-classification.test.ts`, `product-line-dedup.test.ts`, `group-result-parsing.test.ts`, grouping API tests, Grouping UI tests.

## Dependencies

- Tasks 1-2 must land before any TypeScript service or UI changes that reference `grouping`, `product_lines`, or `product_line_id`.
- Task 3 must land before frontend routes/tabs can safely navigate to `grouping`.
- Tasks 6-9 depend on schema/types from Tasks 1-2.
- Tasks 10-13 depend on group/classification types from Task 5.
- Task 14 depends on Tasks 8-13.
- Task 18 depends on Tasks 3, 4, and 14.
- Task 15 should run only after Tasks 6-9 are implemented and tested.
- Task 16 (cohort removal) should be last among functional changes because cohorts are still used by import, extraction, admin routes, and tests.
- Task 17 can occur once `scraped/route.ts` and all two-phase imports are removed/replaced.
- Task 21 spans all implementation phases and should be updated alongside each feature task.

## Risks

- **Schema mismatch:** documentation says `product_line_id` exists, but current generated types show only `product_line`. The first implementation step must verify the live schema and either repurpose an existing ID column or add it idempotently.
- **Big-bang migration cost:** classifying all non-published products can be expensive and slow, especially if Gemini is configured. The backfill script needs dry-run counts, chunking, resumability, and operator-visible cost estimates.
- **Provider-following classification latency:** if the admin setting points to Gemini batch, grouping may take much longer than direct DeepSeek. UI copy and job monitoring must make this clear.
- **Batch item model change:** making `batch_job_items` support group subjects may affect existing direct-chat/Gemini assumptions. Legacy per-UPC paths need regression tests.
- **Cohort dependency spread:** cohorts are used outside consolidation. Removing them before replacing import/extraction/admin callers can break source planning and filters.
- **Partial LLM output:** one group response can omit UPCs. Parser must reject partial outputs before apply; otherwise products silently remain inconsistent.
- **Fuzzy dedup false merges:** similar Product Line Labels can represent distinct lines. Ambiguous dedup must be reviewable and reversible.
- **Renames and stable identity:** `product_lines.id` should be the durable identity; denormalized labels must not become source-of-truth in new code.
- **Status enum migrations:** adding Postgres enum values can be irreversible in some environments. Migration order must add enum value before any data writes.
- **TwoPhase removal:** removing post-hoc consistency checks is acceptable only if group-output schema/completeness validation is strong and tested.
