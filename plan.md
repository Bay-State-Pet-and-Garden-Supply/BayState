# Implementation Plan

## Goal
Redesign the Grouping pipeline frontend as a persisted, async workflow from Processed classification through Grouping review/edit/consolidation to Merging, with clear progress, run separation, singleton handling, and group-origin visibility.

## Tasks
1. **Add grouping run semantics to the pipeline run contract**
   - File: `apps/web/lib/pipeline/run-types.ts`
   - Changes: Add `"grouping"` to `PipelineRunKind`, add `PIPELINE_RUN_KIND_LABELS.grouping = "Product Grouping"`, and add a grouping-specific stage label helper for product-line classification runs.
   - File: `apps/web/app/api/admin/pipeline/runs/route.ts`
   - Changes: Map `batch_jobs.execution_mode === "product_line_classification"` to `kind: "grouping"` instead of `"consolidation"`; label it `Product Grouping`; keep normal consolidation/group-consolidation jobs as `kind: "consolidation"`; include `executionMode`, counts, progress, and `nextAction` appropriate to grouping (`wait`, `review_errors`, no `apply_results`).
   - Acceptance: `/api/admin/pipeline/runs` returns classification jobs with `kind: "grouping"`; `ActiveConsolidationsTab` no longer receives them because it filters `kind === "consolidation"`.

2. **Filter grouping batches out of consolidation history**
   - File: `apps/web/app/api/admin/consolidation/jobs/route.ts`
   - File: `apps/web/lib/consolidation/batch-service.ts`
   - Changes: Ensure `listBatchJobs()` or the route filters out `execution_mode === "product_line_classification"` by default; optionally add an explicit mode filter if grouping history needs a separate caller later.
   - Acceptance: Classification/grouping batches do not appear in Merging history and cannot expose an Apply button there.

3. **Make classification submission truly async**
   - File: `apps/web/app/api/admin/grouping/submit/route.ts`
   - Changes: Stop processing all classification items and finalizing inside submit. Validate UPCs, create the `product_line_classification` batch, persist useful metadata (`source_upcs`, `brand_id`, `workflow: "grouping"`), and return `{ success, batch_id, product_count, status }` immediately.
   - File: `apps/web/app/api/admin/grouping/[batchId]/route.ts`
   - Changes: Keep GET as the progress endpoint that processes a bounded chunk via `processBatchQueue`, returns aggregate status, and includes per-item statuses (`upc`, `status`, `error_message`). When all items are complete, finalize idempotently and return `finalize_summary` with assigned/group/ungrouped counts. Mark finalization in `batch_jobs.metadata.grouping_finalized_at`/`grouping_finalize_summary` to survive reloads and avoid duplicate finalization.
   - Acceptance: POST `/api/admin/grouping/submit` returns quickly with a batch id; polling GET advances progress in chunks; refresh/navigation can recover progress from `batch_jobs` and `batch_job_items`.

4. **Move ungrouped products into the Grouping stage**
   - File: `apps/web/lib/consolidation/product-lines.ts`
   - Changes: Update `assignProductToLine()` so products currently in `processed` move to `pipeline_status = "grouping"` even when `productLineId` is `null`; preserve `product_line_id = null` for Ungrouped/Singleton candidates; set review metadata from the caller.
   - File: `apps/web/lib/consolidation/grouping-service.ts`
   - Changes: Ensure all low-confidence, failed, or missing-label classification branches call `assignProductToLine(..., null, { reviewRequired: true, ... })` so Ungrouped products appear in Grouping as Needs Review.
   - Acceptance: Low-confidence/failed classifications leave `product_line_id = null` but have `pipeline_status = "grouping"` and appear from `/api/admin/grouping/groups` under `ungrouped`.

5. **Expose derived review/ready state from the grouping groups API**
   - File: `apps/web/app/api/admin/grouping/groups/route.ts`
   - Changes: Return groups split or annotated as `ready` vs `needs_review` using the resolved rule: a group is ready when every product has `product_line_review_required === false` and a non-null `product_line_assignment_source`; Ungrouped products are always Needs Review until accepted as Singletons. Include counts: `ready_group_count`, `needs_review_group_count`, `accepted_singleton_count`, `needs_review_singleton_count`, `total_grouped`, `total_ungrouped`.
   - Acceptance: Grouping UI can render Review sections without reimplementing readiness rules inconsistently.

6. **Add grouping review actions for approve and singleton acceptance**
   - File: `apps/web/app/api/admin/grouping/groups/[productLineId]/route.ts`
   - File: `apps/web/lib/consolidation/grouping-service.ts`
   - Changes: Add actions:
     - `approve`: clear `product_line_review_required` for all products in a Product Group or selected UPCs.
     - `accept_singleton`: for Ungrouped UPCs, keep `product_line_id = null`, set `product_line_review_required = false`, set `product_line_assignment_source = "manual"`, and keep `pipeline_status = "grouping"`.
     - Keep existing `reassign`, `ungroup`, `merge`, `split`, `rename` actions.
   - Acceptance: A flagged group can become Ready without adding DB columns; an Ungrouped product can become an accepted Singleton and be included in consolidation.

7. **Support mixed Group + Singleton consolidation from Grouping**
   - File: `apps/web/app/api/admin/grouping/consolidate/route.ts` (new)
   - Changes: Add a dedicated Grouping consolidation endpoint that accepts `{ product_line_ids?: string[], singleton_upcs?: string[] }` or derives all approved groups/singletons when requested. Validate that selected groups/singletons are Ready, warn/skip remaining Needs Review items, submit one persisted consolidation batch, and move approved products to `pipeline_status = "merging"` when the consolidation run starts.
   - File: `apps/web/lib/consolidation/batch-service.ts`
   - Changes: Extend `submitGroupConsolidationBatch()` or add `submitGroupingConsolidationBatch()` to create a single `batch_jobs` run containing `item_kind: "product_group"` items for Product Groups and `item_kind: "upc"` items for accepted Singletons. Preserve backend per-UPC consolidation for Singletons; do not remove legacy backend functions.
   - File: `apps/web/app/api/admin/consolidation/submit/route.ts`
   - Changes: Stop using synchronous group-processing for the Grouping UI path, or delegate grouping-origin submissions to the new endpoint. Keep legacy `upcs[]` mode for backend Singleton fallback and compatibility.
   - Acceptance: Clicking “Consolidate All Approved (M groups + S singletons)” creates one trackable run; groups and accepted Singletons are included; Needs Review items are skipped with a warning payload.

8. **Make group consolidation progress pollable from Grouping**
   - File: `apps/web/app/api/admin/grouping/consolidate/[batchId]/route.ts` (new) or reuse `apps/web/app/api/admin/consolidation/[batchId]/process/route.ts`
   - Changes: Provide a Grouping-friendly progress response for consolidation runs: aggregate status, per-item status, item labels (`Product Line Label` for groups, UPC for Singletons), counts, and completion summary. For DeepSeek/direct-chat, process bounded chunks via `processBatchQueue`; for other modes, report provider status without blocking.
   - Acceptance: Grouping tab can show “Consolidating group 2 of 4…” with per-group completion and survive reload/navigation through persisted `batch_jobs`/`batch_job_items`.

9. **Refactor Processed tab action model to one primary Consolidate path**
   - File: `apps/web/components/admin/pipeline/FloatingActionsBar.tsx`
   - Changes: Rename Processed bulk action label from `Group selected` to `Consolidate selected`; remove the Processed fallback that calls legacy `onConsolidate`; rename props as needed so the primary action calls the grouping submission path only.
   - File: `apps/web/components/admin/pipeline/PipelineClient.tsx`
   - Changes: Replace Processed-stage keyboard shortcut `c` to start grouping classification, not legacy per-UPC consolidation. Remove Processed UI wiring that exposes the old frontend path, while keeping backend per-UPC APIs intact for Singletons.
   - File: `apps/web/components/admin/pipeline/ProcessedResultsView.tsx`
   - Changes: Remove/replace single-product “Merge” and bulk “Start Merging” dialogs that call `/api/admin/consolidation/submit`; any Processed consolidation action should submit to grouping classification.
   - Acceptance: In Processed, operators see one clear “Consolidate” action and no competing “Merge”/legacy consolidation path.

10. **Add Processed tab classification progress UI**
   - File: `apps/web/components/admin/pipeline/PipelineClient.tsx`
   - Changes: Track active grouping runs from `/api/admin/pipeline/runs` and the latest submitted `batch_id`; poll `/api/admin/grouping/[batchId]` for item statuses and finalization summary; refresh counts when products move from `processed` to `grouping`.
   - File: `apps/web/components/admin/pipeline/ProcessedResultsView.tsx`
   - Changes: Add props for `classificationRun`, `classifyingUpcs`, `classificationSummary`, and `onViewGroups`; render an inline banner above the product list with progress text “Classifying N of M products...” and a progress bar. On completion, transform it into “✅ N products → M groups, U ungrouped [View Groups →]”.
   - File: `apps/web/components/admin/pipeline/ProductTable.tsx` or `ProcessedResultsView.tsx`
   - Changes: Render an in-row “Classifying...” spinner/status for UPCs whose batch item status is `pending` or `running`; remove the row or refresh list after finalization moves it out of Processed.
   - Acceptance: While a grouping run is active, the Processed tab shows persisted progress and each in-flight selected row is visibly classifying.

11. **Redesign GroupingResultsView as a step-based workspace**
   - File: `apps/web/components/admin/pipeline/GroupingResultsView.tsx`
   - Changes: Replace the flat card list with a three-phase layout: `Review`, `Edit`, `Consolidate`. Use “Needs Review” terminology only; do not use “Needs Attention” in Grouping UI. Render a summary header with ready groups, groups needing review, accepted Singletons, and unaccepted Ungrouped products.
   - New Files:
     - `apps/web/components/admin/pipeline/grouping/GroupingStepHeader.tsx` - step labels and counts.
     - `apps/web/components/admin/pipeline/grouping/GroupingReviewStep.tsx` - Needs Review and Ready sections.
     - `apps/web/components/admin/pipeline/grouping/GroupingEditStep.tsx` - direct editing workspace.
     - `apps/web/components/admin/pipeline/grouping/GroupingConsolidateStep.tsx` - approved payload summary and consolidation CTA.
     - `apps/web/components/admin/pipeline/grouping/GroupingRunProgress.tsx` - classification/consolidation run banner and per-item status.
   - Acceptance: The Grouping tab visibly guides operators through Review → Edit → Consolidate and no longer feels like a dead-end list.

12. **Implement Review phase behavior**
   - File: `apps/web/components/admin/pipeline/grouping/GroupingReviewStep.tsx` (new)
   - Changes: Show two sections: `Needs Review` for Ungrouped/Singleton candidates and flagged groups; `Ready` for auto-approved groups. Add controls to approve flagged groups, accept Ungrouped products as Singletons, manually assign an Ungrouped product to an existing group, or create a new group via split/create flow.
   - File: `apps/web/components/admin/pipeline/GroupingResultsView.tsx`
   - Changes: Wire review actions to the API actions from Task 6, then refetch group data and counts.
   - Acceptance: Operators can clear all Needs Review items without leaving the Grouping tab.

13. **Implement Edit phase behavior with accessible alternatives**
   - File: `apps/web/components/admin/pipeline/grouping/GroupingEditStep.tsx` (new)
   - Changes: Provide drag-and-drop reassignment using native drag events or existing primitives (avoid adding a DnD dependency unless explicitly approved). Also provide checkbox selection and a bulk action toolbar for keyboard/accessibility: move selected to group, ungroup selected, split selected into new group, merge group into another, approve selected/group. Use inline click-to-rename for Product Line Labels and dialogs for merge/split confirmations.
   - File: `apps/web/app/api/admin/grouping/groups/[productLineId]/route.ts`
   - Changes: Ensure existing `rename`, `merge`, `split`, `reassign`, and `ungroup` responses are sufficient for the new UI; add detailed error bodies where missing.
   - Acceptance: All drag/drop actions have an equivalent bulk/keyboard path; group names can be edited inline; destructive merge/split actions require explicit confirmation.

14. **Implement Consolidate phase and progress handoff**
   - File: `apps/web/components/admin/pipeline/grouping/GroupingConsolidateStep.tsx` (new)
   - Changes: Render “Consolidate All Approved (M groups + S singletons)” with a warning summary for skipped Needs Review items. On click, call the new grouping consolidation endpoint, then show progress inside the Grouping tab instead of auto-navigating.
   - File: `apps/web/components/admin/pipeline/grouping/GroupingRunProgress.tsx` (new)
   - Changes: Show “Consolidating group X of Y...” and per-group/singleton completion indicators. On completion, show “Results ready in Merging →” and call `onStageChange("merging")` only when the operator clicks.
   - File: `apps/web/components/admin/pipeline/PipelineClient.tsx`
   - Changes: Remove the old `handleConsolidateGroups` synchronous wait/autonavigate behavior and replace it with batch start/progress state passed into GroupingResultsView.
   - Acceptance: Consolidation progress stays visible in Grouping, and completion copy says “Results ready in Merging,” not “in review.”

15. **Show Product Group origin in Merging**
   - File: `apps/web/lib/consolidation/batch-service.ts`
   - Changes: Store group-origin metadata on group consolidation jobs/items: Product Line Label, `product_line_id`, and member UPCs; for Singletons, store singleton origin.
   - File: `apps/web/app/api/admin/pipeline/runs/route.ts`
   - Changes: Include recent item metadata for group-origin consolidation runs so the Merging UI can render group labels.
   - File: `apps/web/components/admin/pipeline/ActiveConsolidationsTab.tsx`
   - File: `apps/web/components/admin/pipeline/consolidation/DirectConsolidationJobView.tsx`
   - File: `apps/web/components/admin/pipeline/consolidation/BatchConsolidationJobView.tsx`
   - File: `apps/web/components/admin/pipeline/consolidation/BatchHistorySection.tsx`
   - Changes: Render origin badges like `Group: Blue Buffalo Life Protection` or `Singleton` for group-origin jobs/items. Keep Apply behavior unchanged.
   - Acceptance: Merging clearly shows where group-consolidated products came from and still applies results through the existing Apply flow.

16. **Update stage copy and status badges for the new workflow**
   - File: `apps/web/lib/pipeline/types.ts`
   - Changes: Update `processed`, `grouping`, and `merging` descriptions to match the new flow: Processed sends products to Grouping, Grouping reviews Product Groups/Singletons, Merging contains consolidation results ready to apply.
   - File: `apps/web/components/admin/pipeline/StageTabs.tsx`
   - File: `apps/web/components/admin/pipeline/StatusBadge.tsx`
   - Changes: Ensure the Grouping badge/description uses “Grouping” and “Needs Review” copy where appropriate; avoid “Needs Attention” except for extraction status.
   - Acceptance: Hover/help text matches the workflow and does not conflate Grouping review with the later `reviewing` pipeline stage.

17. **Add focused tests for workflow contracts and UI states**
   - File: `apps/web/__tests__/lib/consolidation/batch-service.test.ts`
   - Changes: Add tests for mixed group+singleton batch construction and metadata.
   - File: `apps/web/__tests__/lib/pipeline.test.ts` or new `apps/web/__tests__/lib/pipeline-runs.test.ts`
   - Changes: Test `product_line_classification` maps to `kind: "grouping"` and does not request `apply_results`.
   - New Files:
     - `apps/web/__tests__/components/admin/pipeline/grouping-results-view.test.tsx` - Review/Edit/Consolidate sections, Needs Review vs Ready derived states, accept singleton/approve actions.
     - `apps/web/__tests__/components/admin/pipeline/processed-grouping-progress.test.tsx` - inline progress banner and in-row “Classifying...” state.
   - Acceptance: Tests cover the UX contract decisions and prevent classification jobs from reappearing in Merging.

18. **Run validation and manual QA**
   - File: no code file; validation commands only.
   - Changes: Run `bun run web typecheck`; run focused Jest suites with `bun run web test -- --testPathPatterns="pipeline|grouping|consolidation"`; run `bun run web build` if type/tests pass.
   - Acceptance: Typecheck/tests pass; manual QA verifies: Processed submit returns quickly, progress survives refresh, Ungrouped appears in Grouping, Needs Review can be cleared, consolidation progress appears in Grouping, Merging shows group-origin badges, and Apply still moves products onward as before.

## Files to Modify
- `apps/web/lib/pipeline/run-types.ts` - add `grouping` run kind and grouping stage labels.
- `apps/web/app/api/admin/pipeline/runs/route.ts` - map classification runs separately and expose group-origin item metadata.
- `apps/web/app/api/admin/consolidation/jobs/route.ts` - exclude grouping/classification runs from Merging history.
- `apps/web/lib/consolidation/batch-service.ts` - async grouping metadata, mixed group+singleton batch creation, group-origin metadata.
- `apps/web/app/api/admin/grouping/submit/route.ts` - make classification submit async and return a batch id immediately.
- `apps/web/app/api/admin/grouping/[batchId]/route.ts` - process/poll/finalize classification batches with persisted summary and per-item status.
- `apps/web/lib/consolidation/product-lines.ts` - move null-product-line Ungrouped products into `grouping` status.
- `apps/web/lib/consolidation/grouping-service.ts` - ensure Ungrouped review flags, approve actions, accept singleton behavior, and manual assignment semantics.
- `apps/web/app/api/admin/grouping/groups/route.ts` - return derived Ready/Needs Review group/singleton data and counts.
- `apps/web/app/api/admin/grouping/groups/[productLineId]/route.ts` - add `approve` and `accept_singleton` actions and harden edit responses.
- `apps/web/app/api/admin/consolidation/submit/route.ts` - keep legacy backend per-UPC path but stop using synchronous group UI flow; delegate grouping-origin submissions as needed.
- `apps/web/components/admin/pipeline/PipelineClient.tsx` - orchestrate active grouping/classification and group-consolidation progress, remove frontend legacy Processed consolidation path.
- `apps/web/components/admin/pipeline/FloatingActionsBar.tsx` - make Processed primary action “Consolidate selected” and route it to grouping.
- `apps/web/components/admin/pipeline/ProcessedResultsView.tsx` - remove legacy Merge dialogs/buttons, add classification progress banner and in-row state props.
- `apps/web/components/admin/pipeline/ProductTable.tsx` - render “Classifying...” row status for in-flight UPCs if row rendering is centralized there.
- `apps/web/components/admin/pipeline/GroupingResultsView.tsx` - refactor into step-based workspace and wire new subcomponents/actions.
- `apps/web/components/admin/pipeline/ActiveConsolidationsTab.tsx` - consume only consolidation runs and pass group-origin metadata into job cards.
- `apps/web/components/admin/pipeline/consolidation/DirectConsolidationJobView.tsx` - display group/singleton origin badges for direct-chat group consolidation jobs.
- `apps/web/components/admin/pipeline/consolidation/BatchConsolidationJobView.tsx` - display group/singleton origin badges for batch-style jobs if applicable.
- `apps/web/components/admin/pipeline/consolidation/BatchHistorySection.tsx` - keep grouping history out and show group-origin badges for real consolidation history.
- `apps/web/lib/pipeline/types.ts` - update stage descriptions.
- `apps/web/components/admin/pipeline/StageTabs.tsx` - ensure tab descriptions/counts fit the new flow.
- `apps/web/components/admin/pipeline/StatusBadge.tsx` - ensure Grouping/Merging visual status remains clear.

## New Files
- `apps/web/app/api/admin/grouping/consolidate/route.ts` - submit approved Product Groups plus accepted Singletons to one trackable consolidation run.
- `apps/web/app/api/admin/grouping/consolidate/[batchId]/route.ts` - optional Grouping-friendly progress wrapper for group consolidation runs if existing consolidation process/status endpoints are insufficient.
- `apps/web/components/admin/pipeline/grouping/GroupingStepHeader.tsx` - Review/Edit/Consolidate step navigation and counts.
- `apps/web/components/admin/pipeline/grouping/GroupingReviewStep.tsx` - Needs Review and Ready review gate UI.
- `apps/web/components/admin/pipeline/grouping/GroupingEditStep.tsx` - drag/drop plus bulk/keyboard editing workspace.
- `apps/web/components/admin/pipeline/grouping/GroupingConsolidateStep.tsx` - approved payload summary and consolidation CTA.
- `apps/web/components/admin/pipeline/grouping/GroupingRunProgress.tsx` - classification/consolidation progress banners and completion handoff.
- `apps/web/__tests__/components/admin/pipeline/grouping-results-view.test.tsx` - Grouping workspace UI contract tests.
- `apps/web/__tests__/components/admin/pipeline/processed-grouping-progress.test.tsx` - Processed tab classification progress tests.
- `apps/web/__tests__/lib/pipeline-runs.test.ts` - run-kind mapping tests if not added to an existing suite.

## Dependencies
- Task 1 must happen before Tasks 2, 10, and 15 so frontend consumers can distinguish grouping runs from consolidation runs.
- Tasks 3 and 4 must happen before Processed progress UI can be correct; otherwise progress is still blocking and Ungrouped products stay invisible.
- Tasks 5 and 6 must happen before the Grouping Review/Edit UI can accurately derive Ready vs Needs Review or accept Singletons.
- Tasks 7 and 8 depend on Tasks 5 and 6 because consolidation must only include approved groups and accepted Singletons.
- Tasks 9 and 10 depend on Task 3 because the Processed tab needs an async batch id and pollable status.
- Tasks 11 through 14 depend on Tasks 5 through 8 because the step UI needs backend actions and progress contracts.
- Task 15 depends on Task 7 because group-origin metadata must be written at submission time.
- Task 17 should be implemented alongside Tasks 1, 3, 5, 6, 7, 10, and 11 rather than left entirely to the end.
- Task 18 depends on all implementation tasks.

## Risks
- **No background worker for direct-chat processing:** Current direct-chat jobs are advanced by explicit processing calls. The progress UI must poll/process in bounded chunks or rely on an existing sync mechanism; otherwise runs will remain pending after async submit.
- **Finalization idempotency:** Auto-finalizing classification from a polling endpoint can run more than once after reloads unless metadata or another guard records completion.
- **Singleton semantics:** Accepted Singletons have `product_line_id = null`; all consolidation payload builders and UI filters must include them intentionally or they will be skipped.
- **Status timing:** Moving approved products to `merging` when consolidation starts will remove them from Grouping counts. The Grouping progress panel must be driven by persisted run state, not just current `pipeline_status`, so progress remains visible.
- **Merging tab shape:** The current Merging tab is a job queue, not a normal product list. “Products show group origin” should be implemented in job item/result cards unless the Merging product-list UI is separately reintroduced.
- **Accessibility:** Drag-and-drop must not be the only editing path. Bulk selection and keyboard-compatible move/merge/split actions are required.
- **Terminology drift:** Do not use “Needs Attention” in Grouping; that term already means extraction errors. Do not say “sent to review” after consolidation; use “Results ready in Merging.”
- **Backend compatibility:** Remove the old per-product Processed button from the frontend only. Keep backend `upcs[]` consolidation for Singleton fallback and any scripts/tests that still depend on it.
- **Realtime vs polling:** Existing realtime channels are consolidation-oriented. If grouping progress relies on polling, ensure intervals are modest and stop after completion to avoid duplicate processing/cost.
