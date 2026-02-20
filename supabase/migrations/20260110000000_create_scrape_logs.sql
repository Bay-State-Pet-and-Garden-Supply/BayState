-- Migration: Create scrape_job_logs table
-- Purpose: Store real-time execution logs from scraper runners

CREATE TABLE IF NOT EXISTS public.scrape_job_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.scrape_jobs(id) ON DELETE CASCADE,
  level text NOT NULL,
  message text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrape_job_logs_job_id_created_at ON public.scrape_job_logs(job_id, created_at ASC);

ALTER TABLE public.scrape_job_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view scrape logs"
  ON public.scrape_job_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'staff')
    )
  );

CREATE POLICY "Service role can insert scrape logs"
  ON public.scrape_job_logs
  FOR INSERT
  WITH CHECK (true);

COMMENT ON COLUMN public.scrape_job_logs.details IS 'Optional structured JSON details from runner logs';

ALTER PUBLICATION supabase_realtime ADD TABLE public.scrape_job_logs;
