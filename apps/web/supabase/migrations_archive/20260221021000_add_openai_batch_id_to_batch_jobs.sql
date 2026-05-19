BEGIN;

ALTER TABLE public.batch_jobs
ADD COLUMN IF NOT EXISTS openai_batch_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_jobs_openai_batch_id
ON public.batch_jobs(openai_batch_id)
WHERE openai_batch_id IS NOT NULL;

UPDATE public.batch_jobs
SET openai_batch_id = id::text
WHERE openai_batch_id IS NULL;

COMMIT;
