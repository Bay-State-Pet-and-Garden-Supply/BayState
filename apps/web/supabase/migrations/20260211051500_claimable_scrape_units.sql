CREATE TABLE IF NOT EXISTS public.scrape_job_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.scrape_jobs(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  skus text[] NOT NULL DEFAULT '{}',
  scrapers text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  claimed_by text,
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  results jsonb NOT NULL DEFAULT '{}',
  skus_processed integer NOT NULL DEFAULT 0,
  skus_successful integer NOT NULL DEFAULT 0,
  skus_failed integer NOT NULL DEFAULT 0,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_scrape_job_chunks_status
  ON public.scrape_job_chunks(status, updated_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scrape_job_chunks_job_status
  ON public.scrape_job_chunks(job_id, status);

ALTER TABLE public.scrape_job_chunks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scrape_job_chunks'
      AND policyname = 'Service role can manage scrape job chunks'
  ) THEN
    CREATE POLICY "Service role can manage scrape job chunks"
      ON public.scrape_job_chunks
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION claim_next_pending_chunk(p_runner_name text)
RETURNS TABLE (
  chunk_id uuid,
  job_id uuid,
  chunk_index integer,
  skus text[],
  scrapers text[],
  test_mode boolean,
  max_workers integer,
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
         sj.lease_token,
         sj.lease_expires_at
  FROM public.scrape_job_chunks c
  INNER JOIN public.scrape_jobs sj ON sj.id = c.job_id
  WHERE c.id = v_chunk_id;
END;
$$;

COMMENT ON FUNCTION claim_next_pending_chunk IS 'Atomically claims one pending scrape work unit for a runner using SKIP LOCKED.';
