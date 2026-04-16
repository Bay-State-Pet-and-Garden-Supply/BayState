# Fix: Search Bar Focus Loss in Pipeline Workspace

The search bars in the "Scraped" and "Finalizing" tabs of the admin pipeline lose focus on every keystroke. This is caused by the component unmounting and remounting during the search-triggered loading state.

## Analysis
1.  **Unmount on Loading**: In `PipelineClient.tsx`, the content area is replaced by a "Loading..." div whenever `isLoading` or `isNavigating` is true.
2.  **Immediate Fetch**: The `useEffect` that handles search changes calls `fetchProducts` immediately, which sets `isLoading(true)`.
3.  **Redundant Fetches**: Both a manual `fetchProducts` and a `router.replace` (which triggers a server-side re-render) are used, often causing multiple renders and focus losses.

## Proposed Changes

### 1. `apps/web/components/admin/pipeline/PipelineClient.tsx`
- **Debounce Search Fetch**: Add a 300ms debounce to the search `useEffect` that calls `fetchProducts`.
- **Silent Search Fetch**: Use the `silent: true` flag in `fetchProducts` when triggered by search to avoid setting the global `isLoading` state, which causes the UI to unmount.
- **Non-Destructive Loading UI**: Refactor the content area to keep current components mounted during `isLoading` or `isNavigating`. Use an overlay or opacity change instead of replacing the entire content with a "Loading..." div.
- **Unified Navigation**: Use `startTransition` (via `startNavigation`) for all filter-related URL updates to ensure Next.js treats them as transitions, keeping the current UI interactive.

### 2. `apps/web/components/admin/pipeline/PipelineSearchField.tsx`
- **Optional Loading State**: (Optional) Add a loading spinner to the search field to provide feedback when a search is in progress.

## Verification Plan

### Manual Testing
1.  Navigate to the Admin Pipeline.
2.  Go to the "Scraped" tab.
3.  Type slowly in the search bar and verify focus is maintained.
4.  Type quickly in the search bar and verify focus is maintained and results update after the debounce.
5.  Repeat for the "Finalizing" tab.
6.  Verify that other stages (Imported, Exporting) also maintain focus and show the new loading UI.

### Automated Testing
1.  Run existing Jest tests for `PipelineClient` if they exist.
2.  Add a regression test in Playwright to verify that the search input remains focused after typing.
