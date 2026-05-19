-- Migration: add 'queued' status to integration_sync_runs
-- Enables sync-run correlation between frontend and GitHub Actions dispatches.

BEGIN;

ALTER TABLE public.integration_sync_runs
    DROP CONSTRAINT IF EXISTS integration_sync_runs_status_check;

ALTER TABLE public.integration_sync_runs
    ADD CONSTRAINT integration_sync_runs_status_check
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'partial'));

COMMIT;
