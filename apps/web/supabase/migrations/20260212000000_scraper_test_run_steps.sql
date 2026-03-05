-- Migration: Create scraper_test_run_steps table
-- Created: 2026-02-12
-- Purpose: Track individual workflow step execution during test runs
-- Part of: test-lab-step-visibility plan

-- Create the scraper_test_run_steps table
CREATE TABLE IF NOT EXISTS public.scraper_test_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id UUID NOT NULL REFERENCES scraper_test_runs(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_message TEXT,
  extracted_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add unique constraint to prevent duplicate steps per run
ALTER TABLE public.scraper_test_run_steps 
ADD CONSTRAINT unique_test_run_step UNIQUE (test_run_id, step_index);

-- Create index for fast queries by run_id
CREATE INDEX IF NOT EXISTS idx_scraper_test_run_steps_run_id 
ON public.scraper_test_run_steps(test_run_id, step_index);

-- Enable RLS
ALTER TABLE public.scraper_test_run_steps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for scraper_test_run_steps
-- Admin/Staff can view all step data
CREATE POLICY "Admin can view all test run steps"
  ON public.scraper_test_run_steps
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'staff')
    )
  );

-- Service role can insert/update steps (for runners)
CREATE POLICY "Service role can manage test run steps"
  ON public.scraper_test_run_steps
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comment
COMMENT ON TABLE public.scraper_test_run_steps IS 'Tracks individual workflow step execution during test runs. Links to scraper_test_runs via test_run_id foreign key.';
COMMENT ON COLUMN public.scraper_test_run_steps.step_index IS 'Index of step in the workflow (1-based)';
COMMENT ON COLUMN public.scraper_test_run_steps.action_type IS 'Type of action (navigate, click, extract, wait_for, etc.)';
COMMENT ON COLUMN public.scraper_test_run_steps.status IS 'Step status: pending, running, completed, failed, or skipped';
COMMENT ON COLUMN public.scraper_test_run_steps.extracted_data IS 'JSON data extracted during this step';

-- Rollback migration (drop table)
-- DROP TABLE IF EXISTS public.scraper_test_run_steps;
