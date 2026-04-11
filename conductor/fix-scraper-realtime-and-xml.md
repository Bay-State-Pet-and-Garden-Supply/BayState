# Fix Scraper Realtime & XML Export Error

## Objective
Fix the 500 error from the XML export on the Scraping tab and restore Supabase Realtime updates for Scraper Jobs and Logs.

## Key Files & Context
- `apps/web/components/admin/pipeline/PipelineClient.tsx`
- `apps/web/lib/realtime/useJobSubscription.ts`
- `apps/web/lib/realtime/useLogSubscription.ts`

## Implementation Steps
1. **Remove Unconditional XML Fetch:** In `PipelineClient.tsx`, remove the `useEffect` that calls `getPublishedSkus()` unconditionally on mount. This prevents the heavy `/api/admin/pipeline/export-xml` endpoint from executing and timing out.
2. **Fix Job Realtime Subscription:** In `useJobSubscription.ts` (`ensureSharedJobChannel`), append `-pg` to the `channelName` and call `channel.subscribe()`. This ensures the `postgres_changes` listener connects to Supabase without conflicting with the broadcast channel.
3. **Fix Log Realtime Subscription:** In `useLogSubscription.ts` (`ensureSharedLogChannel`), append `-pg` to the `channelName` and call `channel.subscribe()`. This restores real-time streaming of scraper logs.

## Verification & Testing
- Load the Admin Pipeline "Scraping" tab and confirm no 500 errors occur for the XML export.
- Start a scraper job and confirm that jobs and logs stream in real-time without having to refresh the page.
