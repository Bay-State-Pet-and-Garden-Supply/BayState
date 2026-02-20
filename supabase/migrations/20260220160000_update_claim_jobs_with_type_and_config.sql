-- Migration: Update claim functions to return type and config for discovery jobs

DROP FUNCTION IF EXISTS claim_next_pending_job(TEXT);

CREATE OR REPLACE FUNCTION claim_next_pending_job(p_runner_name TEXT)
RETURNS TABLE (
    job_id UUID,
    skus TEXT[],
    scrapers TEXT[],
    test_mode BOOLEAN,
    max_workers INTEGER,
    type TEXT,
    config JSONB
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
        COALESCE(sj.max_workers, 3) AS max_workers,
        sj.type,
        sj.config
    FROM scrape_jobs sj
    WHERE sj.id = v_job_id;
END;
$$;

COMMENT ON FUNCTION claim_next_pending_job IS 'Atomically claims the next pending job for a runner, now returning job type and config.';

DROP FUNCTION IF EXISTS claim_next_pending_chunk(TEXT);

CREATE OR REPLACE FUNCTION claim_next_pending_chunk(p_runner_name text)
RETURNS TABLE (
  chunk_id uuid,
  job_id uuid,
  chunk_index integer,
  skus text[],
  scrapers text[],
  test_mode boolean,
  max_workers integer,
  type text,
  config jsonb,
  lease_token uuid,
  lease_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_chunk_id uuid;
  v_job_id uuid;
BEGIN
  SELECT c.id, c.job_id
  INTO v_chunk_id, v_job_id
  FROM public.scrape_job_chunks c
  INNER JOIN public.scrape_jobs sj ON sj.id = c.job_id
  WHERE c.status = 'pending'
    AND sj.status IN ('pending', 'running')
    AND (sj.backoff_until IS NULL OR sj.backoff_until <= now())
    AND sj.attempt_count <= sj.max_attempts
  ORDER BY sj.created_at ASC, c.chunk_index ASC
  LIMIT 1
  FOR UPDATE OF c, sj SKIP LOCKED;

  IF v_chunk_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.scrape_job_chunks
  SET status = 'running',
      claimed_by = p_runner_name,
      claimed_at = now(),
      started_at = COALESCE(started_at, now()),
      updated_at = now()
  WHERE id = v_chunk_id;

  UPDATE public.scrape_jobs
  SET status = 'running',
      runner_name = p_runner_name,
      started_at = COALESCE(started_at, now()),
      updated_at = now(),
      heartbeat_at = now()
  WHERE id = v_job_id
    AND status = 'pending';

  RETURN QUERY
  SELECT c.id,
         c.job_id,
         c.chunk_index,
         c.skus,
         c.scrapers,
         COALESCE(sj.test_mode, false) AS test_mode,
         COALESCE(sj.max_workers, 3) AS max_workers,
         sj.type,
         sj.config,
         sj.lease_token,
         sj.lease_expires_at
  FROM public.scrape_job_chunks c
  INNER JOIN public.scrape_jobs sj ON sj.id = c.job_id
  WHERE c.id = v_chunk_id;
END;
$$;

COMMENT ON FUNCTION claim_next_pending_chunk IS 'Atomically claims one pending scrape work unit for a runner, now returning type and config.';
