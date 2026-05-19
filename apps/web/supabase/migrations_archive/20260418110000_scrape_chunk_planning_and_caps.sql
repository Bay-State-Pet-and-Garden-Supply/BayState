-- Migration: add chunk planning metadata and per-job active chunk caps
-- Purpose: support SKU-slice x site-group planning, expose chunk labels in admin UI,
-- and enforce a per-job active chunk concurrency cap in claim_next_pending_chunk.

ALTER TABLE public.scrape_job_chunks
ADD COLUMN IF NOT EXISTS sku_slice_index integer;

ALTER TABLE public.scrape_job_chunks
ADD COLUMN IF NOT EXISTS site_group_key text;

ALTER TABLE public.scrape_job_chunks
ADD COLUMN IF NOT EXISTS site_group_label text;

ALTER TABLE public.scrape_job_chunks
ADD COLUMN IF NOT EXISTS site_domain text;

ALTER TABLE public.scrape_job_chunks
ADD COLUMN IF NOT EXISTS planned_work_units integer NOT NULL DEFAULT 0;

ALTER TABLE public.scrape_job_chunks
ADD COLUMN IF NOT EXISTS work_units_processed integer NOT NULL DEFAULT 0;

ALTER TABLE public.scrape_job_chunks
ADD CONSTRAINT scrape_job_chunks_planned_work_units_nonnegative
CHECK (planned_work_units >= 0);

ALTER TABLE public.scrape_job_chunks
ADD CONSTRAINT scrape_job_chunks_work_units_processed_nonnegative
CHECK (work_units_processed >= 0);

COMMENT ON COLUMN public.scrape_job_chunks.sku_slice_index IS
'Zero-based SKU slice index used by the chunk planner.';

COMMENT ON COLUMN public.scrape_job_chunks.site_group_key IS
'Stable planner key for the scraper site/domain group assigned to this chunk.';

COMMENT ON COLUMN public.scrape_job_chunks.site_group_label IS
'Human-readable planner label for the scraper site/domain group assigned to this chunk.';

COMMENT ON COLUMN public.scrape_job_chunks.site_domain IS
'Normalized site/domain associated with this chunk when available.';

COMMENT ON COLUMN public.scrape_job_chunks.planned_work_units IS
'Planned work units for this chunk (typically SKU count multiplied by scraper count).';

COMMENT ON COLUMN public.scrape_job_chunks.work_units_processed IS
'Processed work units reported by the runner for this chunk.';

CREATE INDEX IF NOT EXISTS idx_scrape_job_chunks_job_slice_group
ON public.scrape_job_chunks (job_id, sku_slice_index, site_group_key, chunk_index);

DROP FUNCTION IF EXISTS claim_next_pending_chunk(TEXT);

CREATE OR REPLACE FUNCTION claim_next_pending_chunk(
    p_runner_name TEXT,
    p_job_id UUID DEFAULT NULL
)
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
  lease_expires_at timestamptz,
  sku_slice_index integer,
  site_group_key text,
  site_group_label text,
  site_domain text,
  planned_work_units integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_chunk_id uuid;
  v_job_id uuid;
  v_runner_enabled boolean;
  v_runner_status text;
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
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS active_count
    FROM public.scrape_job_chunks running_chunks
    WHERE running_chunks.job_id = c.job_id
      AND running_chunks.status = 'running'
  ) active_chunks ON true
  WHERE c.status = 'pending'
    AND sj.status IN ('pending', 'running')
    AND (p_job_id IS NULL OR c.job_id = p_job_id)
    AND (sj.backoff_until IS NULL OR sj.backoff_until <= now())
    AND sj.attempt_count <= sj.max_attempts
    AND (
      NOT (COALESCE(sj.metadata, '{}'::jsonb) ? 'max_concurrent_chunks')
      OR COALESCE(active_chunks.active_count, 0) < GREATEST(1, ((sj.metadata ->> 'max_concurrent_chunks')::integer))
    )
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
         sj.lease_expires_at,
         c.sku_slice_index,
         c.site_group_key,
         c.site_group_label,
         c.site_domain,
         c.planned_work_units
  FROM public.scrape_job_chunks c
  INNER JOIN public.scrape_jobs sj ON sj.id = c.job_id
  WHERE c.id = v_chunk_id;
END;
$$;

COMMENT ON FUNCTION claim_next_pending_chunk IS
'Atomically claims one pending scrape chunk for a runner, optionally filtered to a single job, while enforcing per-job active chunk caps from scrape_jobs.metadata.max_concurrent_chunks.';
