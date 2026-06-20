# Merge-Stuck DB Scout: Batch Job Investigation

**Batch:** `dd86fef6-42eb-4adb-94f3-ed46021d49da`
**Time:** 2026-06-20 11:37:55 UTC
**Products:** 10

## SQL Evidence

### 1. `batch_jobs` parent row — completed successfully

```sql
SELECT id, status, description, total_requests, completed_requests, failed_requests,
       created_at, updated_at, completed_at, webhook_received_at,
       execution_mode, provider
FROM batch_jobs
WHERE id = 'dd86fef6-42eb-4adb-94f3-ed46021d49da';
```

| Column                | Value                                       |
|-----------------------|---------------------------------------------|
| id                    | dd86fef6-42eb-4adb-94f3-ed46021d49da        |
| **status**            | **completed**                               |
| description           | Group consolidation: 10 products            |
| total_requests        | 10                                          |
| completed_requests    | 10                                          |
| failed_requests       | 0                                           |
| created_at            | 2026-06-20 11:37:55.206308+00               |
| updated_at            | 2026-06-20 11:38:32.466556+00               |
| completed_at          | 2026-06-20 11:38:32.459+00                  |
| **webhook_received_at** | **NULL**                                  |
| execution_mode        | direct_chat_chunks                          |
| provider              | deepseek                                    |

**`webhook_received_at IS NULL`** → the webhook-based completion trigger never fired.

---

### 2. `batch_job_items` — all 10 items completed with parsed results

```sql
SELECT id, upc, status, error_message, attempt_count, created_at, completed_at
FROM batch_job_items
WHERE batch_job_id = 'dd86fef6-42eb-4adb-94f3-ed46021d49da'
ORDER BY created_at;
```

| UPC            | Status    | Error | Attempts | Created_at                    | Completed_at                 |
|----------------|-----------|-------|----------|-------------------------------|------------------------------|
| 018214859819   | completed | NULL  | 1        | 2026-06-20 11:37:55.32286+00  | 2026-06-20 11:37:59.123+00  |
| 850068922604   | completed | NULL  | 1        | 2026-06-20 11:37:55.32286+00  | 2026-06-20 11:38:02.552+00  |
| 018214859468   | completed | NULL  | 1        | 2026-06-20 11:37:55.32286+00  | 2026-06-20 11:38:05.582+00  |
| 018214859482   | completed | NULL  | 1        | 2026-06-20 11:37:55.32286+00  | 2026-06-20 11:38:08.723+00  |
| 018214859529   | completed | NULL  | 1        | 2026-06-20 11:37:55.32286+00  | 2026-06-20 11:38:11.979+00  |
| 018214859451   | completed | NULL  | 1        | 2026-06-20 11:37:55.32286+00  | 2026-06-20 11:38:15.724+00  |
| 810132876066   | completed | NULL  | 1        | 2026-06-20 11:37:55.32286+00  | 2026-06-20 11:38:19.074+00  |
| 810132876035   | completed | NULL  | 1        | 2026-06-20 11:37:55.32286+00  | 2026-06-20 11:38:22.46+00   |
| 810132876011   | completed | NULL  | 1        | 2026-06-20 11:37:55.32286+00  | 2026-06-20 11:38:25.951+00  |
| 018214859437   | completed | NULL  | 1        | 2026-06-20 11:37:55.32286+00  | 2026-06-20 11:38:29.168+00  |

**All items:** status = `completed`, error = NULL, attempt_count = 1.

All items also have non-null `parsed_result` and `response_payload` (verified via length check):

| UPC            | Has parsed_result | parsed_len | Has response_payload |
|----------------|-------------------|------------|----------------------|
| 018214859437   | true              | 907        | true                 |
| 018214859451   | true              | 969        | true                 |
| 018214859468   | true              | 919        | true                 |
| 018214859482   | true              | 954        | true                 |
| 018214859529   | true              | 936        | true                 |
| 018214859819   | true              | 936        | true                 |
| 810132876011   | true              | 1106       | true                 |
| 810132876035   | true              | 965        | true                 |
| 810132876066   | true              | 1125       | true                 |
| 850068922604   | true              | 1052       | true                 |

**→ AI output is fully available in batch_job_items. The apply can be retriggered.**

---

### 3. `products_ingestion` — stuck on 'merging', no consolidated data

```sql
SELECT upc, consolidated, pipeline_status, consolidation_review_status,
       active_consolidation_review_id, error_message, created_at, updated_at
FROM products_ingestion
WHERE upc IN ('018214859819','850068922604','018214859468','018214859482','018214859529',
              '018214859451','810132876066','810132876035','810132876011','018214859437')
ORDER BY upc;
```

| UPC            | consolidated | pipeline_status | consolidation_review_status | active_consolidation_review_id | error_message | updated_at                   |
|----------------|--------------|-----------------|-----------------------------|--------------------------------|---------------|------------------------------|
| 018214859437   | NULL         | **merging**     | none                        | NULL                           | NULL          | 2026-06-20 11:37:55.446695+00 |
| 018214859451   | NULL         | **merging**     | none                        | NULL                           | NULL          | 2026-06-20 11:37:55.446695+00 |
| 018214859468   | NULL         | **merging**     | none                        | NULL                           | NULL          | 2026-06-20 11:37:55.446695+00 |
| 018214859482   | NULL         | **merging**     | none                        | NULL                           | NULL          | 2026-06-20 11:37:55.446695+00 |
| 018214859529   | NULL         | **merging**     | none                        | NULL                           | NULL          | 2026-06-20 11:37:55.446695+00 |
| 018214859819   | NULL         | **merging**     | none                        | NULL                           | NULL          | 2026-06-20 11:37:55.446695+00 |
| 810132876011   | NULL         | **merging**     | none                        | NULL                           | NULL          | 2026-06-20 11:37:55.446695+00 |
| 810132876035   | NULL         | **merging**     | none                        | NULL                           | NULL          | 2026-06-20 11:37:55.446695+00 |
| 810132876066   | NULL         | **merging**     | none                        | NULL                           | NULL          | 2026-06-20 11:37:55.446695+00 |
| 850068922604   | NULL         | **merging**     | none                        | NULL                           | NULL          | 2026-06-20 11:37:55.446695+00 |

**All 10:** `consolidated = NULL`, `pipeline_status = 'merging'`, `consolidation_review_status = 'none'`.
`updated_at` (11:37:55) matches the batch submission time, never updated since.

---

## Root Cause Analysis

### Pipeline transition path

The 8-stage pipeline is: `imported → extracting → processed → grouping → merging → reviewing → publishing → failed`

Products reach `merging` when a group consolidation batch is submitted. The batch processes each item's AI enrichment (via direct-chat-chunks to DeepSeek). After all items complete, `applyResults()` must be called to write the AI output into `products_ingestion.consolidated` and advance the status to `reviewing` (finalized) or `processed` (rejected).

### Two consolidation submission paths

| Route | Location | Calls `applyResults()`? |
|-------|----------|------------------------|
| **Grouping → Consolidate** | `apps/web/app/api/admin/grouping/consolidate/route.ts` | **❌ NO** |
| **Direct Consolidation Submit** | `apps/web/app/api/admin/consolidation/submit/route.ts` | **✅ YES** (line 277) |

### What happened

1. User clicked "Consolidate" from the Grouping pipeline tab.
2. `POST /api/admin/grouping/consolidate` was called.
3. Products were moved to `pipeline_status = 'merging'`.
4. The batch was submitted with `auto_apply: true` in metadata (relevant only for webhook-based OpenAI Batch API, not for `direct_chat_chunks`).
5. Items were processed via `processBatchQueue()` — all 10 completed successfully.
6. **The route returned without ever calling `applyResults()`.**

The `applyResults()` call is present in the parallel `/api/admin/consolidation/submit` route (line 277) but was never added to the `/api/admin/grouping/consolidate` route. This appears to be a code omission/bug.

The webhook route (`POST /api/admin/consolidation/webhook`) could also trigger auto-apply, but `webhook_received_at IS NULL` — no webhook was received because direct-chat-chunks doesn't use external webhooks (they're for OpenAI Batch API only).

### Summary

```
batch_jobs:  status = completed ✓
items:       10/10 completed with parsed results ✓
products_ingestion: 10 rows stuck at 'merging' with consolidated=NULL ✗
                     applyResults() was never called
```

## Remedy

The apply can be retriggered — all parsed results are present in `batch_job_items`. Two options:

1. **API call:** `POST /api/admin/consolidation/dd86fef6-42eb-4adb-94f3-ed46021d49da/apply`  
   This calls `applyResults(batchId)` which reads parsed results and writes to `products_ingestion.consolidated`.

2. **Code fix:** Add `applyResults(result.batch_id)` call at the end of the processing loop in  
   `apps/web/app/api/admin/grouping/consolidate/route.ts` (matching the pattern in `apps/web/app/api/admin/consolidation/submit/route.ts` lines 277-287).

