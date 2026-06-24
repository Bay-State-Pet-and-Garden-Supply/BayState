-- Migration: Scrape job leases, heartbeat tracking, and retry metadata
-- Purpose: Make runner job claims idempotent and recoverable via lease tokens

ALTER TABLE public.scrape_jobs
ADD COLUMN IF NOT EXISTS runner_name text,
ADD COLUMN IF NOT EXISTS started_at timestamptz,
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
ADD COLUMN IF NOT EXISTS lease_token uuid,
ADD COLUMN IF NOT EXISTS leased_at timestamptz,
ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS backoff_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_leaseable
ON public.scrape_jobs(status, created_at)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_lease_expiry
ON public.scrape_jobs(status, lease_expires_at)
WHERE status = 'running';

CREATE OR REPLACE FUNCTION claim_next_pending_job(p_runner_name TEXT)
RETURNS TABLE (
    job_id UUID,
    skus TEXT[],
    scrapers TEXT[],
    test_mode BOOLEAN,
    max_workers INTEGER,
    lease_token UUID,
    lease_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_job_id UUID;
    v_lease_token UUID;
    v_lease_expires_at TIMESTAMPTZ;
BEGIN
    -- Atomically select and lock the oldest leaseable pending job
    SELECT id INTO v_job_id
    FROM public.scrape_jobs
    WHERE status = 'pending'
      AND (backoff_until IS NULL OR backoff_until <= NOW())
      AND attempt_count < max_attempts
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_job_id IS NULL THEN
        RETURN;
    END IF;

    v_lease_token := gen_random_uuid();
    v_lease_expires_at := NOW() + INTERVAL '5 minutes';

    UPDATE public.scrape_jobs
    SET
        status = 'running',
        runner_name = p_runner_name,
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW(),
        lease_token = v_lease_token,
        leased_at = NOW(),
        lease_expires_at = v_lease_expires_at,
        heartbeat_at = NOW(),
        attempt_count = attempt_count + 1
    WHERE id = v_job_id;

    RETURN QUERY
    SELECT
        sj.id AS job_id,
        sj.skus,
        sj.scrapers,
        COALESCE(sj.test_mode, FALSE) AS test_mode,
        COALESCE(sj.max_workers, 3) AS max_workers,
        sj.lease_token,
        sj.lease_expires_at
    FROM public.scrape_jobs sj
    WHERE sj.id = v_job_id;
END;
$$;

COMMENT ON FUNCTION claim_next_pending_job IS 'Atomically claims next pending scrape job with lease token + expiry for runner ownership enforcement.';
