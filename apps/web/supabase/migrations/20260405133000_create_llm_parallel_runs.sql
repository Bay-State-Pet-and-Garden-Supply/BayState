CREATE TABLE IF NOT EXISTS public.llm_parallel_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow text NOT NULL DEFAULT 'consolidation',
  subject_key text NOT NULL,
  primary_provider text NOT NULL,
  primary_batch_id text NOT NULL,
  shadow_provider text NOT NULL,
  shadow_batch_id text,
  sample_percent integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  primary_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  shadow_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  comparison jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT llm_parallel_runs_workflow_check CHECK (workflow IN ('consolidation')),
  CONSTRAINT llm_parallel_runs_primary_provider_check CHECK (primary_provider IN ('openai', 'openai_compatible', 'gemini')),
  CONSTRAINT llm_parallel_runs_shadow_provider_check CHECK (shadow_provider IN ('openai', 'openai_compatible', 'gemini')),
  CONSTRAINT llm_parallel_runs_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  CONSTRAINT llm_parallel_runs_sample_percent_check CHECK (sample_percent >= 0 AND sample_percent <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_parallel_runs_batch_pair
  ON public.llm_parallel_runs(workflow, primary_provider, primary_batch_id, shadow_provider, shadow_batch_id);

CREATE INDEX IF NOT EXISTS idx_llm_parallel_runs_status_created_at
  ON public.llm_parallel_runs(status, created_at DESC);

ALTER TABLE public.llm_parallel_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read llm parallel runs" ON public.llm_parallel_runs;
CREATE POLICY "Allow authenticated users to read llm parallel runs"
  ON public.llm_parallel_runs
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert llm parallel runs" ON public.llm_parallel_runs;
CREATE POLICY "Allow authenticated users to insert llm parallel runs"
  ON public.llm_parallel_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update llm parallel runs" ON public.llm_parallel_runs;
CREATE POLICY "Allow authenticated users to update llm parallel runs"
  ON public.llm_parallel_runs
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.update_llm_parallel_runs_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS llm_parallel_runs_updated_at ON public.llm_parallel_runs;
CREATE TRIGGER llm_parallel_runs_updated_at
  BEFORE UPDATE ON public.llm_parallel_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_llm_parallel_runs_updated_at();

COMMENT ON TABLE public.llm_parallel_runs IS 'Stores provider-vs-provider shadow runs for Gemini migration monitoring.';
COMMENT ON COLUMN public.llm_parallel_runs.subject_key IS 'Stable hash or routing key used for traffic sampling.';
COMMENT ON COLUMN public.llm_parallel_runs.primary_batch_id IS 'Provider-native batch identifier for the user-facing batch.';
COMMENT ON COLUMN public.llm_parallel_runs.shadow_batch_id IS 'Provider-native batch identifier for the sampled shadow batch.';
COMMENT ON COLUMN public.llm_parallel_runs.comparison IS 'Computed comparison metrics between primary and shadow run outputs.';
