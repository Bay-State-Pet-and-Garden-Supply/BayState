# Migration Plan: Runner Payload Optimization

## Current State
The `/api/scraper/v1/job` endpoint currently fetches the `scrape_jobs` row and bundles the entire array of SKUs (`job.skus`) directly into the `JobConfigResponse`. While this is currently functional, as the Bay State product catalog scales, bundling tens of thousands of SKUs directly into a single synchronous API response risks Vercel serverless timeouts (typically 10-15s max on standard plans) and excessive memory overhead on both the Node.js API and the Python runner.

## Target Architecture
The `/job` endpoint should act purely as a **Metadata and Configuration** endpoint. The actual data payload (SKUs) should be exclusively pulled via the `/claim-chunk` endpoint in manageable, paginated sizes.

### Next.js API Changes (`apps/web/app/api/scraper/v1/job/route.ts`)
1. Remove `skus` from the `JobConfigResponse` interface.
2. Modify the Supabase query to exclude the `skus` array from the `select('*')` call if possible, or omit it before returning the JSON response.
3. Replace the `skus` array with a `total_skus` count integer to provide the runner with progress tracking context.

### Python Runner Changes
1. Update the `JobConfig` Pydantic model to expect `total_skus` instead of `skus`.
2. Ensure the runner's main loop strictly relies on `/claim-chunk` to request the next batch of SKUs (e.g., chunks of 100).
3. The runner should continue looping and calling `/claim-chunk` until it receives an empty array or a specific `status: "complete"` signal.

## Deployment Strategy
To prevent downtime during the migration:
1. **Phase 1 (Backward Compatible):** Update the Next.js API to return *both* the full `skus` array and a new `total_skus` field. Ensure `/claim-chunk` is fully robust and capable of serving the SKUs.
2. **Phase 2 (Runner Update):** Deploy the updated Python runners that ignore the `skus` array in the `/job` response and exclusively use `/claim-chunk`.
3. **Phase 3 (Cleanup):** Remove the `skus` array from the `/job` API response to realize the performance and memory benefits.