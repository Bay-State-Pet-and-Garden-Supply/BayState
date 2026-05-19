-- Migration: Add durable runner enablement controls
-- Purpose: Let admins disable job pickup without revoking API keys or deleting runners.

ALTER TABLE public.scraper_runners
ADD COLUMN IF NOT EXISTS enabled boolean;

UPDATE public.scraper_runners
SET enabled = true
WHERE enabled IS NULL;

ALTER TABLE public.scraper_runners
ALTER COLUMN enabled SET DEFAULT true;

ALTER TABLE public.scraper_runners
ALTER COLUMN enabled SET NOT NULL;

COMMENT ON COLUMN public.scraper_runners.enabled IS
'Controls whether a runner may claim new jobs. Disabled runners keep their API keys and may finish in-flight work.';

ALTER TABLE public.scraper_runners
DROP CONSTRAINT IF EXISTS scraper_runners_status_check;

ALTER TABLE public.scraper_runners
ADD CONSTRAINT scraper_runners_status_check
CHECK (status IN ('online', 'offline', 'busy', 'idle', 'polling', 'paused'));

CREATE INDEX IF NOT EXISTS idx_scraper_runners_enabled
ON public.scraper_runners (enabled);

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
    v_runner_enabled BOOLEAN;
    v_runner_status TEXT;
BEGIN
    SELECT enabled, status
    INTO v_runner_enabled, v_runner_status
    FROM public.scraper_runners
    WHERE name = p_runner_name;

    IF COALESCE(v_runner_enabled, false) = false OR v_runner_status = 'paused' THEN
        RETURN;
    END IF;

    SELECT id INTO v_job_id
    FROM public.scrape_jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_job_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.scrape_jobs
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
    FROM public.scrape_jobs sj
    WHERE sj.id = v_job_id;
END;
$$;

COMMENT ON FUNCTION claim_next_pending_job IS
'Atomically claims the next pending job for an enabled runner. Disabled or paused runners receive no work.';

DROP FUNCTION IF EXISTS claim_next_pending_chunk(TEXT);

CREATE OR REPLACE FUNCTION claim_next_pending_chunk(p_runner_name TEXT)
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
  v_runner_enabled BOOLEAN;
  v_runner_status TEXT;
BEGIN
  SELECT enabled, status
  INTO v_runner_enabled, v_runner_status
  FROM public.scraper_runners
  WHERE name = p_runner_name;

  IF COALESCE(v_runner_enabled, false) = false OR v_runner_status = 'paused' THEN
    RETURN;
  END IF;

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

COMMENT ON FUNCTION claim_next_pending_chunk IS
'Atomically claims one pending scrape work unit for an enabled runner. Disabled or paused runners receive no work.';
