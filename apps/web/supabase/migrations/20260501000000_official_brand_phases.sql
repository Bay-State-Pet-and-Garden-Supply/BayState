-- Split Official Brand enrichment into durable discovery and extraction phases.

ALTER TABLE public.scrape_jobs
DROP CONSTRAINT IF EXISTS scrape_jobs_type_check;

ALTER TABLE public.scrape_jobs
ADD CONSTRAINT scrape_jobs_type_check
CHECK (
  type IN (
    'standard',
    'ai_search',
    'official_brand_url_discovery',
    'official_brand_extraction'
  )
);

CREATE TABLE IF NOT EXISTS public.official_brand_url_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL REFERENCES public.products_ingestion(sku) ON DELETE CASCADE,
  cohort_id uuid REFERENCES public.cohort_batches(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  url text NOT NULL,
  normalized_url text NOT NULL,
  normalized_domain text NOT NULL,
  candidate_source text NOT NULL CHECK (candidate_source IN ('serper', 'manual')),
  selection_status text NOT NULL DEFAULT 'candidate' CHECK (
    selection_status IN ('candidate', 'selected', 'rejected', 'extracted', 'failed')
  ),
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  rank integer CHECK (rank IS NULL OR rank > 0),
  title text,
  snippet text,
  discovery_job_id uuid REFERENCES public.scrape_jobs(id) ON DELETE SET NULL,
  extraction_job_id uuid REFERENCES public.scrape_jobs(id) ON DELETE SET NULL,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sku, normalized_url)
);

CREATE INDEX IF NOT EXISTS idx_official_brand_url_candidates_sku_status
ON public.official_brand_url_candidates (sku, selection_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_official_brand_url_candidates_cohort_status
ON public.official_brand_url_candidates (cohort_id, selection_status, updated_at DESC)
WHERE cohort_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_official_brand_url_candidates_discovery_job
ON public.official_brand_url_candidates (discovery_job_id)
WHERE discovery_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_official_brand_url_candidates_extraction_job
ON public.official_brand_url_candidates (extraction_job_id)
WHERE extraction_job_id IS NOT NULL;

ALTER TABLE public.official_brand_url_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read official brand URL candidates"
  ON public.official_brand_url_candidates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'staff')
    )
  );

CREATE POLICY "Admin can manage official brand URL candidates"
  ON public.official_brand_url_candidates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'staff')
    )
  );

CREATE POLICY "Service role can manage official brand URL candidates"
  ON public.official_brand_url_candidates
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.official_brand_url_candidates IS
'Reviewable URL candidate workspace for Official Brand discovery and manual URL extraction.';

COMMENT ON COLUMN public.official_brand_url_candidates.selection_status IS
'Candidate lifecycle: candidate, selected, rejected, extracted, or failed.';
