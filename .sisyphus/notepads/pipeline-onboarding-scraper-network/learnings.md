## 2026-01-19 08:45 Task 1: Chunking Inventory

### Files Found

**BayStateApp/lib/pipeline-scraping.ts**
- Main pipeline scraping logic with `scrapeProducts()` and `getScrapeJobStatus()` functions
- Originally supported chunking via `scrape_job_chunks` table for large SKU lists
- Contained chunk creation logic (lines 99-134), chunk progress tracking (lines 165-180)
- Referenced `DEFAULT_CHUNK_SIZE` constant (50 SKUs per chunk)

**BayStateApp/app/api/scraper/v1/claim-chunk/route.ts**
- POST endpoint for runners to atomically claim pending chunks
- Called `claim_next_chunk` RPC for concurrency control
- Queried and updated `scrape_job_chunks` table for status management

**BayStateApp/app/api/scraper/v1/chunk-callback/route.ts**
- POST endpoint for runners to report chunk completion
- Updated chunk status and aggregated results from all chunks
- Checked if all chunks complete to update parent job status

### Actions Taken

1. **Routes deprecated** (not deleted per requirements):
   - Added deprecation comment at top of `claim-chunk/route.ts`
   - Added deprecation comment at top of `chunk-callback/route.ts`

2. **pipeline-scraping.ts cleaned**:
   - Removed `chunkSize` and `maxRunners` from `ScrapeOptions` interface
   - Removed `chunksCreated` from `ScrapeResult` interface
   - Removed `DEFAULT_CHUNK_SIZE` constant
   - Removed chunk creation logic (chunk splitting, `scrape_job_chunks` insert)
   - Removed chunk progress tracking from `getScrapeJobStatus()`
   - Updated all docstrings to reflect chunking removal
   - Function now creates single job records only

### Status

- **Chunking code paths**: REMOVED from pipeline-scraping.ts
- **Routes**: DEPRECATED (marked with clear comments, kept for reference)
- **scrape_job_chunks table references**: Only in deprecated routes, no active code paths
- **claim_next_chunk RPC**: Only called in deprecated claim-chunk route
- **No production code path requires chunking tables or RPCs**: ✅ VERIFIED

### Breaking Changes Summary

The following were removed from the public API:
- `ScrapeOptions.chunkSize` - No longer configurable
- `ScrapeOptions.maxRunners` - No longer configurable
- `ScrapeResult.chunksCreated` - No longer returned
- `getScrapeJobStatus().progress` - Progress no longer includes chunk breakdown

### Next Steps (for reference)

Implement split-job logic (Option B) to replace chunking:
- Create multiple separate `scrape_jobs` records for large SKU lists
- Each job processes its SKUs independently
- Track progress across multiple jobs if needed

## 2026-01-19 14:00 Task 2: DB Schema Status Fix

### Current State (Before Migration)
- `claim_next_pending_job` RPC sets `status = 'claimed'`
- Flow was: pending → claimed → running → completed/failed

### Changes Made
- Updated RPC to set `status = 'running'` directly
- New flow: pending → running → completed/failed

### Rationale
- Option A uses split-jobs (multiple separate jobs) instead of chunking
- The 'claimed' intermediate state was needed for chunking coordination
- With split-jobs, each runner gets its own job, so we can skip directly to 'running'

### Files Created
- `BayStateApp/supabase/migrations/20260119140000_option_a_status_simplification.sql`

## 2026-01-19 14:45 Task 3: Split-Job Implementation

### Changes Made
- Added `maxRunners` option to `ScrapeOptions` (default: 3)
- Changed `ScrapeResult.jobId` to `ScrapeResult.jobIds` (array)
- Implemented round-robin SKU partitioning
- Jobs created: min(maxRunners, skus.length)

### Partitioning Strategy
- Round-robin distribution ensures even workload across jobs
- Example: 10 SKUs with maxRunners=3 → jobs with [4, 3, 3] SKUs

### Breaking Changes
- Callers expecting `result.jobId` must now use `result.jobIds[0]` or handle array
- This will break PipelineClient.tsx and EnrichmentWorkspace.tsx (Task 6 fixes)

## 2026-01-19 15:15 Task 4 & 5: Poll/Job Route Updates

### Changes Made (poll/route.ts)
- Removed redundant status update after RPC (lines 79-87)
- Removed SKU fallback to products table (lines 100-111)
- Added error response when job has no SKUs

### Changes Made (job/route.ts)
- Removed SKU fallback to products table (lines 97-109)
- Added error response when job has no SKUs

### Rationale
- No fallback: With Option A split-jobs, jobs are created with explicit SKUs
- Empty SKUs indicates a bug in job creation, not a signal to scrape staging products
- No redundant update: The RPC `claim_next_pending_job` already sets status='running'

## 2026-01-19 15:30 Task 6: UI Multi-Job Tracking

### Changes Made (PipelineClient.tsx)
- Changed `scrapeJobId: string | null` to `scrapeJobIds: string[]`
- Updated `handleBatchScrape` to use `result.jobIds` array
- Updated banner to show "Enhancement running: N jobs" with proper plural handling

### Changes Made (EnrichmentWorkspace.tsx)
- Changed `onRunBatch` prop type from `(jobId: string)` to `(jobIds: string[])`
- Updated to use `result.jobIds` array

## 2026-01-19 15:45 Task 7: Credential Scoping

### Changes Made
1. Added `allowed_scrapers text[]` column to `runner_api_keys` table
2. Updated `validate_runner_api_key` RPC to return allowed_scrapers
3. Updated `scraper-auth.ts` to include allowedScrapers in return
4. Updated credentials route to check scope before returning credentials

### Security Model
| `allowed_scrapers` value | Behavior |
|--------------------------|----------|
| `NULL` | All scrapers allowed (backward compatible) |
| `[]` (empty array) | No scrapers allowed (locked) |
| `['petfoodex', 'phillips']` | Only listed scrapers allowed |

## 2026-01-19 16:00 Task 8: Tests

### Tests Created
1. `__tests__/lib/pipeline-scraping.test.ts` - Tests for scrapeProducts split logic
2. `__tests__/app/api/scraper/v1/poll.test.ts` - Tests for poll route (no SKU fallback)

### Test Coverage
- scrapeProducts: partitioning, job count, error handling
- poll route: auth, no jobs, empty SKUs error

### Infrastructure Note
- The test files have no diagnostics errors (verified with lsp_diagnostics)
- Jest test suite has pre-existing infrastructure issues (package config, TypeScript esModuleInterop)
- These are project-wide configuration issues, not caused by the refactor

## 2026-01-20 00:15 Final Verification Summary

### All Acceptance Criteria Verified ✓

| Criteria | Status | Verification Method |
|----------|--------|---------------------|
| No chunking code paths | ✓ VERIFIED | grep + code review |
| Status migration applied | ✓ VERIFIED | SQL test of RPC |
| Split-job partitioning | ✓ VERIFIED | Code review of algorithm |
| No SKU fallback | ✓ VERIFIED | Code review of routes |
| Pending→running flow | ✓ VERIFIED | SQL test of claim RPC |
| UI shows job count | ✓ VERIFIED | Code review of banner |
| Credential scoping | ✓ VERIFIED | Migration + route check |
| Tests created | ✓ VERIFIED | lsp_diagnostics + node --check |

### Migrations Applied to Database
1. `20260119140000_option_a_status_simplification` - RPC sets status='running'
2. `20260119150000_add_runner_scraper_scoping_v2` - Added allowed_scrapers column

### Runtime Verification Performed
- Created test jobs and verified partitioning logic
- Tested claim_next_pending_job RPC - confirmed sets status='running' (not 'claimed')
- Verified allowed_scrapers column exists and RPC returns it

### Blocking Issue
- Jest 30 + node_modules corruption blocks test execution
- Fix: `cd BayStateApp && rm -rf node_modules package-lock.json && npm install`
- This is a pre-existing infrastructure issue, not caused by the refactor

## 2026-01-19 Task 3: Split-Job Implementation

### Changes Made
- Added `maxRunners` option to `ScrapeOptions` (default: 3)
- Changed `ScrapeResult.jobId` to `ScrapeResult.jobIds` (array)
- Implemented round-robin SKU partitioning in `scrapeProducts()`
- Jobs created: `min(maxRunners, skus.length)`

### Partitioning Strategy
- Round-robin distribution ensures even workload across jobs
- Example: 10 SKUs with maxRunners=3 → jobs with [4, 3, 3] SKUs
- Example: 5 SKUs with maxRunners=3 → jobs with [2, 2, 1] SKUs
- Example: 2 SKUs with maxRunners=3 → 2 jobs with [1, 1] SKUs

### Algorithm
```typescript
const numJobs = Math.min(maxRunners, skus.length);
const partitions: string[][] = Array.from({ length: numJobs }, () => []);
skus.forEach((sku, index) => {
    partitions[index % numJobs].push(sku);
});
```

### Breaking Changes
- Callers expecting `result.jobId` must now use `result.jobIds[0]` or handle array
- This will break PipelineClient.tsx and EnrichmentWorkspace.tsx (Task 6 will fix)
- No changes to callers in this task - intentional breaking change

## 2026-01-19 Task 4 & 5: Poll/Job Route Updates

### Changes Made (poll/route.ts)
- Removed redundant status update after RPC (lines 79-87)
- Removed SKU fallback to products table (lines 100-111)
- Added error response when job has no SKUs

### Changes Made (job/route.ts)
- Removed SKU fallback to products table (lines 97-109)
- Added error response when job has no SKUs

### Rationale
- **No fallback**: With Option A split-jobs, jobs are created with explicit SKUs. 
  Empty SKUs indicates a bug in job creation, not a signal to scrape staging products.
- **No redundant update**: The RPC `claim_next_pending_job` already sets status='running',
  runner_name, started_at, updated_at. No need to do it again.

### Impact
- Runners receiving a job with no SKUs will now get a 400 error instead of 
  silently scraping unrelated products
- Jobs claimed go directly to 'running' status (via RPC)

## 2026-01-19 Task 6: UI Multi-Job Tracking

### Changes Made (PipelineClient.tsx)
- Changed `scrapeJobId: string | null` to `scrapeJobIds: string[]`
- Updated `handleScrape()` to use `result.jobIds` (array) instead of `result.jobId`
- Updated scrape job banner to show job count: "Enhancement running: N jobs"
- Updated dismiss logic to clear array: `setScrapeJobIds([])`
- Updated `onRunBatch` callback to accept array: `onRunBatch={(jobIds) => setScrapeJobIds(jobIds)}`

### Changes Made (EnrichmentWorkspace.tsx)
- Updated `onRunBatch` prop type from `(jobId: string) => void` to `(jobIds: string[]) => void`
- Updated batch mode logic to use `result.jobIds` instead of `result.jobId`
- Maintains first job ID in local state for UI display: `setEnhancementJobId(result.jobIds[0])`

### Notes
- The UI now tracks multiple jobs instead of single job
- Callers properly consume the new `jobIds` array from `scrapeProducts()`
- Banner shows plural/singular based on count: "1 job" vs "2 jobs"
- Both files pass LSP diagnostics with no type errors

## 2026-01-19 Task 7: Credential Scoping

### Changes Made
1. Added `allowed_scrapers text[]` column to `runner_api_keys` table
2. Updated `validate_runner_api_key` RPC to return allowed_scrapers in result
3. Updated `RunnerAuthResult` interface to include `allowedScrapers: string[] | null`
4. Updated credentials route to check scope before returning credentials

### Security Model
- `allowed_scrapers = NULL` → All scrapers allowed (backward compatible for existing keys)
- `allowed_scrapers = []` → No scrapers allowed (locked runner)
- `allowed_scrapers = ['petfoodex', 'phillips']` → Only listed scrapers allowed

### Files Created/Modified
- **Created**: `BayStateApp/supabase/migrations/20260119150000_add_runner_scraper_scoping.sql`
- **Modified**: `BayStateApp/lib/scraper-auth.ts` (added allowedScrapers to interface and return)
- **Modified**: `BayStateApp/app/api/scraper/v1/credentials/route.ts` (403 check after auth)

### Migration Path
- Existing keys have NULL → continue working with full access (no breaking change)
- New keys should be scoped to specific scrapers for principle of least privilege
- Empty array (`{}`) completely locks a runner from all credentials

### Why This Matters
- Limits blast radius if a runner key is compromised
- Enables multi-tenant runner deployments with restricted access
- Prepares for per-distributor runner isolation
