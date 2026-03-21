# Plan: Fix Active Runs Status Display

## Objective
Fix the issue where completed and failed scraper runs are displayed as "Pending" in the Active Runs tab.

## Root Cause
The backend API (`/api/admin/pipeline/active-runs`) correctly queries for `scrape_jobs` from the last 24 hours, which includes jobs in `completed` and `failed` states. However, both the frontend component (`ActiveRunsTab.tsx`) and the backend route define the `ActiveJob` interface's `status` type strictly as `'pending' | 'running'`.

When the frontend receives jobs with a `completed` status, it incorrectly typecasts them and the default UI rendering logic falls back to displaying the "Pending" badge.

## Proposed Changes

1. **Update API Route Type Definition**
   - **File:** `apps/web/app/api/admin/pipeline/active-runs/route.ts`
   - **Change:** Expand the `status` field in the `ActiveJob` interface to include `'completed'`, `'failed'`, and `'cancelled'`.

2. **Update Frontend Component Type & Rendering**
   - **File:** `apps/web/components/admin/pipeline/ActiveRunsTab.tsx`
   - **Change:** 
     - Update the local `ActiveJob` interface similarly.
     - Add `CheckCircle` to the `lucide-react` imports.
     - Remove the strict `as 'pending' | 'running'` typecasting when iterating through jobs and realtime updates.
     - Expand the status badge rendering logic to explicitly support `completed` (green with `CheckCircle`) and `failed`/`cancelled` (red with `AlertCircle`).

## Verification
- Load the Active Runs dashboard and verify that recently completed runs show a green "Completed" badge rather than "Pending".
- Ensure that the timeline view properly reflects these statuses (the TimelineView component already natively supports them).