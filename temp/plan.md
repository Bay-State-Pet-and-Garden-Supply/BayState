# Runs View Redesign Plan

## Objective
The current Scraper Runs viewer (`RunDetailsPage` and `LogViewer`) condenses all logs into a single flat list and provides no visibility into the individual "batches" (chunks) that make up a scrape job. Since runs have been refactored to use a chunk-based architecture (`scrape_job_chunks`), the UI needs to be revamped to properly reflect this structure, allowing administrators to monitor progress, identify failed batches, and scope logs to specific chunks.

## Current Architecture Analysis
1. **Job Data**: `RunDetailsPage` fetches `scrape_jobs` data but currently ignores `scrape_job_chunks`.
2. **Log Data**: `LogViewer` fetches all `scrape_job_logs` for a given `job_id`.
3. **Log Context**: Python scraper runners inject `chunk_id` into the `details` JSONB payload of `scrape_job_logs` (via `DETAIL_CONTEXT_FIELDS` in `logging_handlers.py`).

## Proposed Redesign

### 1. Data Layer Enhancements
- **Fetch Chunks**: Create a new server action `getScraperRunChunks(jobId: string)` in `apps/web/app/admin/scrapers/runs/actions.ts` to fetch all `scrape_job_chunks` associated with the job.
- **Log Parsing**: Ensure the `LogViewer` frontend component properly parses `log.details.chunk_id` to associate log entries with their respective batches.

### 2. UI Layout Revamp (`RunDetailsPage`)
We will transition from a single-column scrolling view to a more structured dashboard for each run.

**Top Section: Job Overview & Metrics**
- Status Badge (Running, Completed, Failed).
- Overall Progress Bar.
- Metrics Cards: Total SKUs, Items Found, **Chunks Completed / Total**, Error Count.

**Middle Section: The Batches (Chunks) Data Table**
A new table replacing or sitting above the logs, displaying:
- **Batch ID / Index**: `chunk_index`
- **Status**: Pending, Running, Completed, Failed
- **Runner**: Which runner claimed this batch (`claimed_by`)
- **Work Units**: `work_units_processed` / `planned_work_units`
- **Actions**: "View Logs" button for each chunk.

### 3. LogViewer Component Updates
- **Contextual Filtering**: Modify `LogViewer.tsx` to include a "Batch / Chunk" filter.
- **Dual-Pane or Selection State**: 
  - When no specific batch is selected, show *Job-Level* logs (logs without a `chunk_id`) or *All* logs.
  - When a user clicks "View Logs" on a specific batch from the Batches table, the LogViewer filters strictly to logs where `details.chunk_id === selectedChunkId`.
- **UI Indicators**: Add a small badge on log entries indicating their `chunk_index` so it's clear which batch a log belongs to when viewing "All" logs.

## Implementation Steps

1. **Backend / Actions**
   - Add `getScraperRunChunks` to fetch chunk metadata.
2. **Component: `RunBatchesTable.tsx`**
   - Create a new component to render the chunks list with statuses and progress.
3. **Component: `LogViewer.tsx`**
   - Add `selectedChunkId` prop.
   - Update `filteredLogs` memo to filter by `log.details?.chunk_id === selectedChunkId` when a chunk is selected.
   - Add a dropdown to manually select a batch to filter logs by.
4. **Page Integration (`[id]/page.tsx`)**
   - Redesign the layout to incorporate the new `RunBatchesTable`.
   - Wire up state so clicking a batch in the table updates the selected batch in the `LogViewer`.

## Aesthetic Considerations
- Adhere to the "Modern Farm Utilitarian" brand guidelines.
- Use heavy borders (`border-4 border-zinc-900`), blocky shadows (`shadow-[8px_8px_0px_rgba(0,0,0,1)]`).
- Avoid generic SaaS UI (no soft rounded corners).
- Ensure high-contrast status indicators for Chunk status.
