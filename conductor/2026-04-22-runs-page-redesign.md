# Scraper Runs Page Redesign Plan

## Objective
Update the "Scraper Runs" page (`/admin/scrapers/runs`) to utilize the new architecture and "Modern Farm Utilitarian" styling recently introduced in the Pipeline's "Scraping" tab (`ActiveRunsTab.tsx`). This includes adopting the live `JobCard` components, real-time log/job subscriptions, and abandoning the generic Shadcn `Table` layout in favor of the custom, blocky, high-contrast UI.

## Scope & Impact
- **Affected Page:** `/admin/scrapers/runs`
- **Core Changes:** Rewrite `ScraperRunsClient.tsx` to match `ActiveRunsTab.tsx` visually and functionally, while retaining its ability to display paginated historical runs alongside live active ones.
- **Architectural Alignment:** Ensures the app-wide consistency of scraper job visualization, ensuring both the Pipeline tab and the dedicated Scrapers tab use identical real-time data flows and visual components.

## Key Files & Context
- `apps/web/components/admin/scrapers/ScraperRunsClient.tsx` (Target for rewrite)
- `apps/web/app/admin/scrapers/runs/page.tsx` (Parent server component)
- `apps/web/components/admin/pipeline/ActiveRunsTab.tsx` (Source of architectural patterns: `useJobSubscription`, `useLogSubscription`, `toActiveJob`, etc.)
- `apps/web/components/admin/pipeline/ChunkStatusTable.tsx`, `TimelineView.tsx`, `ProgressBar.tsx` (Shared UI components to be imported)

## Implementation Steps

### 1. Extract Shared UI Components & Helpers
- In `apps/web/components/admin/pipeline/ActiveRunsTab.tsx`, extract the following into a shared utility/component file (e.g., `apps/web/components/admin/pipeline/job-utils.tsx`) or simply `export` them so they can be imported by `ScraperRunsClient`:
  - `toActiveJob(job: JobAssignment): ActiveJob`
  - `LogLevelBadge`
  - `ConnectionIndicator`
  - `JobLogPanel`
  - `JobStatusBadge`
  - `JobCard`
- Ensure all required types (`ActiveJob`, `ExpandPanel`, `TimeRange`) are exported.

### 2. Rewrite `ScraperRunsClient.tsx`
- **Hooks & State:** Replace the static state array with `useJobSubscription` and `useLogSubscription` to provide live updates for pending/running jobs. Maintain a merged state of historical API runs and real-time updates.
- **Header & Stats:** Redesign the header and stats cards (Total Jobs, Running, Completed, Failed) to use the "Modern Farm Utilitarian" styling (e.g., `border-4 border-zinc-950 shadow-[8px_8px_0px_rgba(0,0,0,1)] rounded-none`).
- **Active Runs View:** For jobs that are `pending` or `running`, render the `JobCard` component, allowing users to expand chunks and logs inline just like the pipeline tab.
- **Historical Runs View:** For completed, failed, or cancelled jobs, render them using the same `JobCard` layout (or a highly condensed utilitarian list) instead of the old, generic Shadcn `Table`.
- **Actions:** Update the existing `cancelScraperRun` and `retryScraperRun` server actions to be triggered via the new UI patterns (e.g., `onCancelClick` in `JobCard`).

### 3. Polish & Cleanup
- Ensure that the "View All Runs" and "Timeline/List" toggles behave consistently.
- Remove outdated icons or generic soft-rounded UI elements from `ScraperRunsClient`.
- Verify the page handles empty states and errors using the modern blocky style.

### 4. Backend: Fix 1006 WebSocket Error Leak
- **Log Leak:** In `apps/scraper/utils/logging_handlers.py`, update `IGNORED_LOGGER_PREFIXES` to include `"realtime._async"`, `"websocket"`, and `"websockets"` so internal 1006 disconnects don't leak into the scrape job logs.
- **Stability:** In `apps/scraper/core/realtime_manager.py`, pass `hb_interval=10` to the `_AsyncRealtimeClient` initialization to keep connections alive behind proxies.

## Verification & Testing
- Load the `/admin/scrapers/runs` page and verify the layout exactly matches the pipeline's Scraping tab style.
- Trigger a new scraper run and ensure the new job appears real-time via the WebSocket subscription without a page refresh.
- Expand a running job to verify that chunks and live logs stream correctly.
- Ensure that the "WebSocket connection closed with code: 1006" errors no longer appear in the job's live logs.
- Verify that historical runs (fetched server-side and passed via props) render properly below or alongside the live runs.
- Test the "Retry" and "Cancel" buttons on both historical and live runs to ensure they execute successfully.
