-- Migration: Option A Status Simplification
-- Purpose: Simplify job status flow to pending → running → completed/failed
-- Context: We're using split-job (Option A) instead of chunking. Jobs are claimed
--          and immediately start running, so we skip the 'claimed' intermediate state.

CREATE OR REPLACE FUNCTION claim_next_pending_job(p_runner_name TEXT)
RETURNS TABLE (
    job_id UUID,
    skus TEXT[],
    scrapers TEXT[],
    test_mode BOOLEAN,
    max_workers INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_job_id UUID;
BEGIN
    -- Atomically select and lock the oldest pending job
    SELECT id INTO v_job_id
    FROM scrape_jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- No pending jobs available
    IF v_job_id IS NULL THEN
        RETURN;
    END IF;

    -- OPTION A: Set status directly to 'running' (skip 'claimed')
    -- This simplifies the status flow: pending → running → completed/failed
    UPDATE scrape_jobs
    SET 
        status = 'running',
        runner_name = p_runner_name,
        started_at = NOW(),
        updated_at = NOW()
    WHERE id = v_job_id;

    -- Return the job details
    RETURN QUERY
    SELECT 
        sj.id AS job_id,
        sj.skus,
        sj.scrapers,
        COALESCE(sj.test_mode, FALSE) AS test_mode,
        COALESCE(sj.max_workers, 3) AS max_workers
    FROM scrape_jobs sj
    WHERE sj.id = v_job_id;
END;
$$;

COMMENT ON FUNCTION claim_next_pending_job IS 'Atomically claims the next pending job for a runner. Uses FOR UPDATE SKIP LOCKED to prevent race conditions. Option A: Sets status directly to running (no claimed state).';
