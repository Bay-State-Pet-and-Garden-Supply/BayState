-- Migration: Create scrape_jobs and scrape_results tables
-- Purpose: Track web scraping operations from GitHub Actions self-hosted runners

-- Create scrape_jobs table
CREATE TABLE IF NOT EXISTS public.scrape_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skus text[],
  scrapers text[],
  test_mode boolean NOT NULL DEFAULT false,
  max_workers integer NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  github_run_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_message text,
  created_by uuid REFERENCES auth.users(id)
);

-- Create scrape_results table
CREATE TABLE IF NOT EXISTS public.scrape_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.scrape_jobs(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}',
  runner_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON public.scrape_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_created_at ON public.scrape_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_results_job_id ON public.scrape_results(job_id);

-- Enable RLS
ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for scrape_jobs
-- Admin/Staff can view all jobs
CREATE POLICY "Admin can view all scrape jobs"
  ON public.scrape_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'staff')
    )
  );

-- Admin/Staff can insert jobs
CREATE POLICY "Admin can create scrape jobs"
  ON public.scrape_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'staff')
    )
  );

-- Service role can update jobs (for GitHub Actions)
CREATE POLICY "Service role can update scrape jobs"
  ON public.scrape_jobs
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- RLS Policies for scrape_results
-- Admin/Staff can view results
CREATE POLICY "Admin can view scrape results"
  ON public.scrape_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'staff')
    )
  );

-- Service role can insert results (for GitHub Actions)
CREATE POLICY "Service role can insert scrape results"
  ON public.scrape_results
  FOR INSERT
  WITH CHECK (true);
