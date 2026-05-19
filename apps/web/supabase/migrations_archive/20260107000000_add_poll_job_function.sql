-- Migration: Add claim_next_pending_job function for daemon polling
-- This enables runners to atomically claim jobs without race conditions

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
    SELECT id INTO v_job_id
    FROM scrape_jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_job_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE scrape_jobs
    SET 
        status = 'claimed',
        runner_name = p_runner_name,
        started_at = NOW(),
        updated_at = NOW()
    WHERE id = v_job_id;

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

ALTER TABLE scraper_runners 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'idle',
ADD COLUMN IF NOT EXISTS current_job_id UUID REFERENCES scrape_jobs(id),
ADD COLUMN IF NOT EXISTS jobs_completed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS memory_usage_mb INTEGER;

COMMENT ON FUNCTION claim_next_pending_job IS 'Atomically claims the next pending job for a runner. Uses FOR UPDATE SKIP LOCKED to prevent race conditions when multiple runners poll simultaneously.';
