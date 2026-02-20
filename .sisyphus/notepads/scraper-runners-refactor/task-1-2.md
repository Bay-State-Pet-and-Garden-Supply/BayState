# Task 1.2: Create unified enrichment job endpoint

## Context
Create a new API endpoint that the enrichment UI will call to submit jobs. This endpoint delegates to the `scrapeProducts()` function we just modified in Task 1.1.

## Implementation Notes
- File: `BayStateApp/app/api/admin/enrichment/jobs/route.ts`
- POST handler only
- Input validation required
- Must call `scrapeProducts()` with correct parameters
- Return format: `{ jobId, chunkCount, statusUrl }`

## References
- Look at existing API patterns in `app/api/admin/scraping/`
- Use the updated `scrapeProducts()` from Task 1.1

## Acceptance Criteria
- POST endpoint accepts `{ skus[], method, config, chunkSize, maxWorkers }`
- Returns `{ jobId, chunkCount, statusUrl }`
- 400 for invalid input
- 500 for server errors
- Requires authentication

## QA Notes
- Test with curl: POST to /api/admin/enrichment/jobs
- Verify 200 with valid data
- Verify 400 with empty SKUs

## Implementation Completed

### Files Created
- `BayStateApp/app/api/admin/enrichment/jobs/route.ts`

### Implementation Details
- POST handler with authentication via `requireAdminAuth()`
- Input validation:
  - `skus`: must be non-empty array
  - `method`: must be 'scrapers' or 'discovery'
- Calls `scrapeProducts()` with mapped options:
  - Maps `method` to `enrichment_method`
  - Passes `scrapers` config when method is 'scrapers'
  - Passes `discoveryConfig` when method is 'discovery'
  - Supports `chunkSize` and `maxWorkers` options
- Returns `{ jobId, chunkCount, statusUrl }` on success (200)
- Returns 400 for validation errors (empty SKUs, invalid method, invalid JSON)
- Returns 500 for server errors
- Status URL constructed as `/admin/scrapers/runs/${jobId}`

### Dependencies
- Imports from `@/lib/admin/api-auth` (authentication)
- Imports from `@/lib/pipeline-scraping` (scrapeProducts function)
- TypeScript interfaces defined inline for request body
