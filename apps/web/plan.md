# Implementation Plan

## Goal
Revamp Pipeline Consolidation so DeepSeek consolidation is presented and executed as a local direct-chat queue: reads are read-only, processing is explicit, and the UI no longer behaves like a provider Batch API sync screen.

## Tasks
1. **Make status reads read-only in consolidation service**
   - File: `lib/consolidation/batch-service.ts`
   - Changes: Split current `getBatchStatus()` behavior so it no longer calls `processDirectChatChunk()` for `direct_chat_chunks` jobs. Replace `handleDirectChatStatus()` with a read-only status path that only loads local `batch_jobs` + `batch_job_items` state. Remove/fence any remaining provider `client.batches.retrieve()` fallback for active DeepSeek jobs; status should come from local DB.
   - Acceptance: Calling `GET /api/admin/consolidation/[batchId]` does not create DeepSeek requests and does not advance pending `batch_job_items`.

2. **Add a read-only direct-chat status helper**
   - File: `lib/consolidation/direct-chat-service.ts`
   - Changes: Add `getDirectChatStatusSnapshot(batchDbId)` or refactor `aggregateDirectChatStatus(batchDbId, { persist?: boolean })` so read paths do not write. Keep a persist-capable aggregate helper for processing paths after chunks are processed.
   - Acceptance: Unit test can assert read-only helper returns counts from item statuses without calling `update()` on `batch_jobs`.

3. **Add explicit per-job queue processing service**
   - File: `lib/consolidation/batch-service.ts`
   - Changes: Export `processBatchQueue(batchId, options?: { limit?: number; timeoutMs?: number })`. It should resolve the DB job id, validate it is `direct_chat_chunks`, call `processDirectChatChunk()`, then aggregate/persist status. Return `{ processed, completed, failed, status }` or a `BatchErrorResponse`.
   - Acceptance: Service processes pending items only when this explicit function is called.

4. **Export processing API from consolidation index**
   - File: `lib/consolidation/index.ts`
   - Changes: Export `processBatchQueue` alongside `getBatchStatus`, `submitBatch`, `retrieveResults`, etc.
   - Acceptance: API routes can import processing function from `@/lib/consolidation`.

5. **Add per-job process endpoint**
   - File: `app/api/admin/consolidation/[batchId]/process/route.ts`
   - Changes: New authenticated `POST` route. Parse optional `{ limit?: number }`, clamp limit (recommended default `5`, max `25`), call `processBatchQueue(batchId, { limit })`, return processing counts and updated status.
   - Acceptance: `POST /api/admin/consolidation/{id}/process` is the only per-job route that sends pending items to DeepSeek.

6. **Make batch status endpoint read-only and rename copy**
   - File: `app/api/admin/consolidation/[batchId]/route.ts`
   - Changes: Keep `GET` and `DELETE`; update comments and error strings from provider batch language to queue/job language. `GET` must call read-only `getBatchStatus()` only. Keep optional results preview for completed jobs, but ensure retrieval is read-only.
   - Acceptance: GET response still includes `{ status, resultsPreview? }`, but no processing happens.

7. **Repurpose sync route as process-all queue endpoint**
   - File: `app/api/admin/consolidation/sync/route.ts`
   - Changes: Keep route path for compatibility, but update implementation/comment to "process queue". Load active non-terminal `direct_chat_chunks` jobs by DB `id`, call `processBatchQueue(id, { limit })` for each. Return `processed_job_count`, `processed_item_count`, `completed_item_count`, `failed_item_count`, `errors`; optionally keep `synced_count` as deprecated alias for compatibility during UI migration.
   - Acceptance: `POST /api/admin/consolidation/sync` mutates only by explicitly processing queue items, not by pretending to sync remote provider status.

8. **Keep jobs/history route read-only**
   - File: `app/api/admin/consolidation/jobs/route.ts`
   - Changes: Update comments/error strings from "batch provider" to "consolidation queue". No processing calls. Continue using `listBatchJobs()`.
   - Acceptance: Loading archive never sends DeepSeek requests.

9. **Improve active consolidation status source**
   - File: `app/api/admin/pipeline/active-consolidations/route.ts`
   - Changes: Keep GET read-only. Include `provider`, `provider_batch_id`, `execution_mode`, and, if practical, `pendingCount`/`runningCount` derived from `batch_job_items` for direct-chat jobs. If counts are derived from parent row only, document dependency on process endpoint persisting aggregate counts.
   - Acceptance: Pipeline tab can render queue-specific counts without triggering processing.

10. **Split UI refresh from processing all jobs**
    - File: `components/admin/pipeline/ActiveConsolidationsTab.tsx`
    - Changes: Replace current `handleSyncAll()` with two explicit handlers: `handleRefresh()` only calls `fetchJobs()`/`fetchHistory()`, and `handleProcessQueue()` calls `POST /api/admin/consolidation/sync`. Toolbar should show separate `Refresh` and `Process Queue` buttons. Rename state from `syncingAll` to `processingQueue` or similar.
    - Acceptance: Clicking Refresh never sends DeepSeek requests; clicking Process Queue does.

11. **Split per-card refresh from per-card process**
    - File: `components/admin/pipeline/ActiveConsolidationsTab.tsx`
    - Changes: Replace `handleSyncStatus()` with `handleRefreshJob()` (read-only `GET /api/admin/consolidation/[batchId]`) and add `handleProcessJob()` (`POST /api/admin/consolidation/[batchId]/process`). Track separate `refreshingId` and `processingId` state.
    - Acceptance: Per-card buttons have distinct behavior and toasts: "Status refreshed" vs "Processed N item(s)".

12. **Update consolidation job card actions and labels**
    - File: `components/admin/pipeline/consolidation/ConsolidationJobCard.tsx`
    - Changes: Rename props from `onSyncStatus/syncingId` to `onRefresh/refreshingId`; add `onProcess/processingId`. Keep refresh icon button read-only. Add a visible `Process Next Chunk` or `Process Job` button for non-terminal jobs. Add/display `Direct Chat Queue` badge using `job.execution_mode`. Keep Apply button for completed jobs.
    - Acceptance: Card no longer implies provider sync. User can explicitly process one job.

13. **Expand queue job types**
    - File: `components/admin/pipeline/consolidation/shared.tsx`
    - Changes: Add `execution_mode?: string`, `provider?: string | null`, `provider_batch_id?: string | null`, `pendingCount?: number`, `runningCount?: number` to `ConsolidationJob`. Consider renaming comments/types from batch to queue where local-only.
    - Acceptance: TypeScript supports new UI fields without `unknown` casts in card code.

14. **Update history section wording only**
    - File: `components/admin/pipeline/consolidation/BatchHistorySection.tsx`
    - Changes: Keep apply ID resolver. Rename remaining section comments/labels from batch/history to "Recent Consolidation Jobs" / "Archive" where visible. Do not add process actions to terminal history rows.
    - Acceptance: Archive remains read-only except Apply Results for completed unapplied jobs.

15. **Update two-phase consolidation polling dependency**
    - File: `lib/consolidation/two-phase-service.ts`
    - Changes: Since `getBatchStatus()` becomes read-only, add an injectable `processBatchFn` dependency defaulting to `processBatchQueue`. In `runPhase1`, call process before/around polling when waiting on direct-chat jobs, or explicitly document that an external queue processor is required. Preferred: process one or more chunks in the loop to preserve current self-contained test behavior.
    - Acceptance: Existing two-phase tests can be updated to mock processing and still complete deterministically.

16. **Add/update tests for read-only vs mutating behavior**
    - Files: `__tests__/lib/consolidation/batch-service.test.ts`, `__tests__/lib/consolidation/two-phase-service.test.ts`
    - Changes: Add test that `getBatchStatus()` for direct-chat job does not call `processDirectChatChunk()`. Add test for `processBatchQueue()` calling `processDirectChatChunk()` and persisting aggregate status. Update two-phase tests for new processing dependency.
    - Acceptance: Focused consolidation tests pass.

17. **Add API route tests for process endpoints**
    - Files: `__tests__/app/api/admin/consolidation/[batchId]/process.route.test.ts` (new), optionally `__tests__/app/api/admin/consolidation/sync.route.test.ts` (new)
    - Changes: Mock auth and consolidation service. Verify unauthorized handling, validation/clamping of `limit`, success response shape, and service error handling.
    - Acceptance: Route tests prove process endpoints are explicit mutation boundaries.

18. **Update active consolidation API/UI tests**
    - Files: `__tests__/api/admin/pipeline/active-consolidations.test.ts`, component tests if present/added for `ActiveConsolidationsTab`
    - Changes: Update expected fields for `execution_mode`, provider, pending/running counts if added. Add a component test or route-level test confirming refresh path does not call `/sync`.
    - Acceptance: Existing active-consolidations tests pass with new queue semantics.

19. **Run focused validation**
    - File: N/A
    - Changes: Run `node scripts/run-jest.cjs -- __tests__/lib/consolidation __tests__/api/admin/pipeline/active-consolidations.test.ts` plus new route tests. Run `npx tsc --noEmit --pretty` or project-approved focused type check.
    - Acceptance: Tests pass; no new TypeScript errors in touched files.

## Files to Modify
- `lib/consolidation/batch-service.ts` - make `getBatchStatus` read-only; add `processBatchQueue`; remove status-time processing.
- `lib/consolidation/direct-chat-service.ts` - add read-only status snapshot or aggregate option; keep chunk processing explicit.
- `lib/consolidation/index.ts` - export explicit queue processor.
- `app/api/admin/consolidation/[batchId]/route.ts` - read-only GET copy/behavior.
- `app/api/admin/consolidation/sync/route.ts` - repurpose as process-all queue route.
- `app/api/admin/consolidation/jobs/route.ts` - read-only copy cleanup.
- `app/api/admin/pipeline/active-consolidations/route.ts` - expose queue fields/counts read-only.
- `components/admin/pipeline/ActiveConsolidationsTab.tsx` - split Refresh and Process Queue UX.
- `components/admin/pipeline/consolidation/ConsolidationJobCard.tsx` - separate refresh/process controls.
- `components/admin/pipeline/consolidation/shared.tsx` - queue-specific type fields.
- `components/admin/pipeline/consolidation/BatchHistorySection.tsx` - archive wording only.
- `lib/consolidation/two-phase-service.ts` - adapt to read-only status polling.
- Relevant tests under `__tests__/lib/consolidation`, `__tests__/api/admin/pipeline`, and new `__tests__/app/api/admin/consolidation` route tests.

## New Files
- `app/api/admin/consolidation/[batchId]/process/route.ts` - explicit per-job queue processing endpoint.
- `__tests__/app/api/admin/consolidation/[batchId]/process.route.test.ts` - route coverage for explicit process endpoint.
- `__tests__/app/api/admin/consolidation/sync.route.test.ts` - optional coverage for process-all queue endpoint if no existing test exists.

## Dependencies
- Tasks 1-4 must land before API/UI changes because routes and components need explicit read/process service functions.
- Task 5 depends on Task 3 and Task 4.
- Task 7 depends on Task 3.
- Tasks 10-13 depend on Tasks 5, 7, and 9 for final endpoint/response shapes.
- Task 15 depends on Task 3 because two-phase needs the explicit processor.
- Tests in Tasks 16-18 depend on implementation tasks but should be written alongside each worker's changes.

## Risks
- Current `getBatchStatus()` processing side effect may be relied on by polling flows besides Pipeline UI, especially `TwoPhaseConsolidationService`; must update those flows or provide a background/explicit processor.
- If `aggregateDirectChatStatus()` remains writeful and is called by GET routes, GET will still not be strictly read-only. Decide whether local count persistence on GET is allowed; recommended plan makes GET no-write.
- Existing `/api/admin/consolidation/sync` route name is misleading. Keeping path avoids breaking callers, but UI and comments must call it Process Queue. A future migration can add `/process-queue` and deprecate `/sync`.
- Processing too many items per request can hit Next.js route timeouts or DeepSeek rate limits. Clamp `limit` and default to small chunks (5; max 25).
- Concurrent processing clicks could double-claim items if the claim query is not fully atomic. Verify `processDirectChatChunk()` claim logic after `batch_job_id` fixes; consider DB RPC/transaction follow-up if races appear.

## Worker Task Breakdown
1. **Worker A — Service split**: `batch-service.ts`, `direct-chat-service.ts`, `index.ts`; implement read-only status helper and `processBatchQueue`; add service tests.
2. **Worker B — API routes**: `[batchId]/route.ts`, new `[batchId]/process/route.ts`, `sync/route.ts`, `jobs/route.ts`; add route tests.
3. **Worker C — Pipeline UI**: `ActiveConsolidationsTab.tsx`, `ConsolidationJobCard.tsx`, `shared.tsx`, `BatchHistorySection.tsx`; update active-consolidations tests/UI tests.
4. **Worker D — Compatibility flow/tests**: `two-phase-service.ts` and related tests; run focused test matrix and report any hidden callers of `getBatchStatus()` that expected processing side effects.
