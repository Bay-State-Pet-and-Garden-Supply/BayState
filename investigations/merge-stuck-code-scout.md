# Investigation: Products Stuck in `pipeline_status='merging'`

## Summary

Five distinct mechanisms in the consolidation pipeline can leave products permanently in `pipeline_status='merging'` after a consolidation run is submitted. Two are the most likely for a 10-product run: the **missing `applyResults` call** in the primary flow from the Grouping tab, and the **silent try/catch around auto-apply** in the per-UPC submit flow.

---

## Root Cause 1 (PRIMARY): Missing `applyResults` in `POST /api/admin/grouping/consolidate`

**File:** `apps/web/app/api/admin/grouping/consolidate/route.ts` (lines 64-67, 86-93, 115-124)

This is the endpoint called by the Grouping tab UI (`GroupingResultsView.tsx` line 433). It is the main entry point when a user selects approved product groups and clicks "Consolidate".

```typescript
// Line 64-67: Sets status to 'merging'
await supabase
    .from('products_ingestion')
    .update({ pipeline_status: 'merging', updated_at: new Date().toISOString() })
    .in('upc', allUpcs);

// Line 86-93: Submits batch (creates batch_jobs + batch_job_items, sets status to 'merging' again)
const result = await submitBatch(productSources, batchMetadata);

// Lines 115-124: Processes items in a loop
for (let i = 0; i < maxIterations; i++) {
    const pr = await processBatchQueue(result.batch_id, { limit: chunkSize });
    ...
}

// ❌ NEVER calls applyResults()
```

**Flow completes but products remain in 'merging' with no transition to 'reviewing' or 'processed'.** The only way out is a manual "Apply" click in the ActiveConsolidationsTab or a manual call to `POST /api/admin/consolidation/[batchId]/apply`.

**Evidence:** The route ends by returning a JSON response after processing items. There is no `applyResults()` call anywhere after the processing loop.

---

## Root Cause 2: Missing `applyResults` in group-based consolidation via `POST /api/admin/consolidation/submit`

**File:** `apps/web/app/api/admin/consolidation/submit/route.ts` (lines 42-112)

The UI `PipelineClient.tsx` `handleConsolidateGroups` (line ~660) calls this endpoint with `groups` parameter. This path:

1. Calls `submitGroupConsolidationBatch()` — which does **NOT** set `pipeline_status` at all (no 'merging' status change)
2. Processes group items in a loop
3. ❌ Does **NOT** call `applyResults()`
4. Returns response

**Products never leave their original status** (likely 'grouping'). The UI toast says "Results are live in the Merging tab" but the backend never moved them.

**Evidence:** `submitGroupConsolidationBatch()` in `batch-service.ts` (line 1227+) creates `batch_jobs` + `batch_job_items` rows but has zero `pipeline_status` updates on `products_ingestion`.

---

## Root Cause 3: Silent auto-apply failure in per-UPC submit path

**File:** `apps/web/app/api/admin/consolidation/submit/route.ts` (lines 274-286)

For the legacy per-UPC submit path (used when `upcs` are passed, e.g. from `PipelineClient.tsx` `handleConsolidate`), auto-apply runs after processing but is wrapped in a silent try/catch:

```typescript
try {
    const applyResult = await applyResults(result.batch_id);
    if (applyResult && typeof applyResult === 'object' && 'success_count' in applyResult) {
        appliedCount = applyResult.success_count as number;
    }
    if ('success' in applyResult && !applyResult.success) {
        console.warn('[Consolidation API] Auto-apply warning:', applyResult.error);
    }
} catch (applyError) {
    console.warn('[Consolidation API] Auto-apply failed (non-fatal):', applyError);
}
```

If `applyResults()` throws or returns `success: false`, the **error is only logged via `console.warn`** — no error is returned to the UI, no toast is shown. The API response still says `auto_applied: true` with potentially stale `appliedCount`. The user sees success, but products stay in 'merging'.

**Evidence:** The try/catch is silent (no user-facing error). The response on line 298 includes `auto_applied: true` regardless of whether the apply call succeeded.

---

## Root Cause 4: No auto-apply trigger on batch completion in queue processing

**Files:**
- `apps/web/lib/consolidation/batch-service.ts` — `processAllQueues()` (line 1714+)
- `apps/web/app/api/admin/consolidation/sync/route.ts` — `POST /sync` endpoint
- `apps/web/app/api/admin/grouping/consolidate/[batchId]/route.ts` — polling progress endpoint

None of these processing paths check `batch_jobs.auto_apply` to call `applyResults()` after items complete.

**The `batch_jobs.auto_apply` column is stored but never consumed in an automated way.** It is only read in:
1. `webhook/route.ts` line 165 — for external batch completion webhooks (OpenAI batches only)
2. `BatchHistorySection.tsx` line 96 — UI display only

If the initial submit loop doesn't process all items (e.g., due to chunk size limits), subsequent sync/poll calls process remaining items but never trigger auto-apply. Users must manually click "Apply" in the Merging tab.

**Evidence:** `processAllQueues()` returns `{ processed_job_count, processed_item_count, completed_item_count, failed_item_count, errors }` — no apply logic. The sync route passes these directly to the response.

---

## Root Cause 5: Optimistic lock contention causes partial apply failure

**File:** `apps/web/lib/consolidation/apply-service.ts` (lines 905-970)

The per-product update loop uses an optimistic lock on `updated_at`:

```typescript
if (typeof latestRow.updated_at === 'string' && latestRow.updated_at.length > 0) {
    updateQuery = updateQuery.eq('updated_at', latestRow.updated_at);
}
```

If any concurrent process touches the product's row between the read and write, the update fails. After 3 retries the function **returns early**:

```typescript
if (attempt === maxAttempts) {
    return {
        success: false,
        error: `Failed to apply consolidation for ${row.upc}: concurrent update contention`,
    };
}
```

This is an early return — **no further products are processed**, and all previously-updated products' status changes are committed but all remaining products stay in 'merging'. No cleanup or partial rollback.

Other early-return failure points in `applyConsolidationResults()` that leave remaining products in 'merging':
- Line 145: Invalid results format
- Line 163-164: Failed to load batch metadata
- Line 175-176: Failed to load existing products
- Line 369: Failed to load latest products_ingestion row
- Line 393: Unknown apply state

---

## Flow Diagram

```
User clicks "Consolidate" in Grouping tab
  │
  ├─► POST /api/admin/grouping/consolidate
  │   ├─► Sets pipeline_status = 'merging'
  │   ├─► submitBatch() → createDirectChatBatch() → sets 'merging' again
  │   ├─► processBatchQueue (processes items)
  │   └─► ❌ NO applyResults()
  │   Result: Stuck in 'merging' ← PRIMARY BUG
  │
  ├─► POST /api/admin/consolidation/submit (groups parameter)
  │   ├─► submitGroupConsolidationBatch()
  │   │   └─► ❌ Does NOT set pipeline_status (stays in 'grouping')
  │   ├─► processBatchQueue (processes items)
  │   └─► ❌ NO applyResults()
  │   Result: Products stay in 'grouping'
  │
  └─► POST /api/admin/consolidation/submit (upcs parameter)
      ├─► submitBatch() → createDirectChatBatch() → sets 'merging'
      ├─► processBatchQueue (processes items)
      ├─► applyResults() ← wrapped in silent try/catch
      │   └─► If fails → console.warn only, no user feedback
      └─► Returns auto_applied: true regardless
      Result: Stuck in 'merging' if apply fails ← SECONDARY BUG
```

## Most Likely Scenario for 10-Product Stuck Run

The user submitted a 10-product consolidation through the **Grouping tab** (the primary workflow path). This hits `POST /api/admin/grouping/consolidate` which:

1. Sets `pipeline_status = 'merging'`
2. Processes all items successfully
3. ❌ Never calls `applyResults()` → products stay in `merging` indefinitely
4. UI polling completes, shows "Consolidation Complete!", user clicks "View in Merging"
5. The Merging tab shows products but they're stuck until operator clicks the manual "Apply" button

**Alternative scenario:** User submitted from the Processed tab (per-UPC path), but `applyResults()` hit an error:
- A product had a concurrent update between read and write (optimistic lock failure)
- A product was deleted between batch submission and apply
- The batch metadata lookup failed
- The `existingRowsResponse` query timed out or returned an error

## Files That Need Changes

| Priority | File | Issue |
|----------|------|-------|
| **HIGH** | `apps/web/app/api/admin/grouping/consolidate/route.ts` | Add `applyResults()` call after processing loop |
| **HIGH** | `apps/web/app/api/admin/consolidation/submit/route.ts` (group path) | Add `applyResults()` call OR set `pipeline_status='merging'` in `submitGroupConsolidationBatch()` |
| **MEDIUM** | `apps/web/app/api/admin/consolidation/submit/route.ts` (lines 274-286) | Surface auto-apply failure to the UI instead of silent `console.warn` |
| **MEDIUM** | `apps/web/lib/consolidation/batch-service.ts` (`processAllQueues`) | Optionally: check `auto_apply` on completed batches and trigger `applyResults` |
| **LOW** | `apps/web/lib/consolidation/apply-service.ts` (lines 905-970) | Consider partial-apply resilience: continue processing remaining products instead of early-return on contention |

## Files Retrieved (for reference)

1. `apps/web/app/api/admin/grouping/consolidate/route.ts` (entire file) - PRIMARY bug location
2. `apps/web/app/api/admin/consolidation/submit/route.ts` (lines 37-298) - Both group and per-UPC paths
3. `apps/web/lib/consolidation/apply-service.ts` (entire file) - Status transitions + silent failure modes
4. `apps/web/lib/consolidation/batch-service.ts` (lines 1643-1718, 1714-1776) - Queue processing + sync
5. `apps/web/lib/consolidation/direct-chat-service.ts` (lines 175-210, 648-757) - 'merging' status set + results retrieval
6. `apps/web/app/api/admin/grouping/consolidate/[batchId]/route.ts` (entire file) - Polling endpoint (processes items, no apply)
7. `apps/web/app/api/admin/consolidation/sync/route.ts` (entire file) - ProcessAllQueues wrapper (no apply)
8. `apps/web/lib/consolidation/gemini-batch-service.ts` (lines 155-170) - Also sets 'merging' during Gemini batch creation
9. `apps/web/lib/pipeline/types.ts` (lines 1-50) - Valid status transitions: merging → reviewing, processed, failed
10. `apps/web/lib/pipeline/core.ts` (lines 13-36) - Pipeline state machine definition
11. `apps/web/app/api/admin/consolidation/reset/route.ts` (entire file) - Existing reset mechanism for stuck products
12. `apps/web/components/admin/pipeline/GroupingResultsView.tsx` (lines 392-457) - UI consolidation flow
13. `apps/web/components/admin/pipeline/PipelineClient.tsx` (lines 580-700) - UI per-UPC + group consolidation flows
14. `apps/web/components/admin/pipeline/consolidation/ActiveConsolidationsTab.tsx` (lines 252-260) - Manual apply button
