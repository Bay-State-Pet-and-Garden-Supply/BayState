ALTER TABLE public.batch_jobs
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS provider_batch_id text,
  ADD COLUMN IF NOT EXISTS provider_input_file_id text,
  ADD COLUMN IF NOT EXISTS provider_output_file_id text,
  ADD COLUMN IF NOT EXISTS provider_error_file_id text;

ALTER TABLE public.batch_jobs
  DROP CONSTRAINT IF EXISTS batch_jobs_provider_check;

ALTER TABLE public.batch_jobs
  ADD CONSTRAINT batch_jobs_provider_check
  CHECK (provider IN ('openai', 'openai_compatible', 'gemini'));

UPDATE public.batch_jobs
SET provider = COALESCE(NULLIF(metadata->>'llm_provider', ''), 'openai')
WHERE provider IS NULL OR provider = 'openai';

UPDATE public.batch_jobs
SET
  provider_batch_id = COALESCE(provider_batch_id, openai_batch_id),
  provider_input_file_id = COALESCE(provider_input_file_id, input_file_id),
  provider_output_file_id = COALESCE(provider_output_file_id, output_file_id),
  provider_error_file_id = COALESCE(provider_error_file_id, error_file_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_jobs_provider_batch_id
  ON public.batch_jobs(provider, provider_batch_id)
  WHERE provider_batch_id IS NOT NULL;

COMMENT ON COLUMN public.batch_jobs.provider IS 'LLM provider that owns this batch job (openai, openai_compatible, gemini).';
COMMENT ON COLUMN public.batch_jobs.provider_batch_id IS 'Provider-native batch identifier or resource name (e.g. OpenAI batch ID or Gemini batches/* resource).';
COMMENT ON COLUMN public.batch_jobs.provider_input_file_id IS 'Provider-native input file identifier used to create the batch.';
COMMENT ON COLUMN public.batch_jobs.provider_output_file_id IS 'Provider-native output file identifier for successful results.';
COMMENT ON COLUMN public.batch_jobs.provider_error_file_id IS 'Provider-native file identifier for provider-side error output, when available.';
