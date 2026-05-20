-- Add gemini_batch to batch_jobs execution_mode check constraint
-- This allows provider='gemini' batches with execution_mode='gemini_batch'

ALTER TABLE public.batch_jobs
DROP CONSTRAINT IF EXISTS batch_jobs_execution_mode_check;

ALTER TABLE public.batch_jobs
ADD CONSTRAINT batch_jobs_execution_mode_check
CHECK (execution_mode = ANY (ARRAY['batch_api'::text, 'direct_chat_chunks'::text, 'gemini_batch'::text]));

COMMENT ON COLUMN public.batch_jobs.execution_mode IS 'Execution path: batch_api for provider Batch API, direct_chat_chunks for LM Studio/DeepSeek direct chat, gemini_batch for Gemini Batch API with File API.';
