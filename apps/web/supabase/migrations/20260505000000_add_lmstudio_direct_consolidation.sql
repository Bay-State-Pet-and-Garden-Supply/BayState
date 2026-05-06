-- Migration: Add LM Studio direct-chat consolidation support
-- Created: 2026-05-05
-- Purpose: Add execution mode to batch_jobs, create per-SKU items table,
--          and add 'lmstudio' to relevant provider check constraints.

-- =============================================================================
-- 1. Add execution_mode to batch_jobs
-- =============================================================================

ALTER TABLE public.batch_jobs
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'batch_api';

ALTER TABLE public.batch_jobs
  DROP CONSTRAINT IF EXISTS batch_jobs_execution_mode_check;

ALTER TABLE public.batch_jobs
  ADD CONSTRAINT batch_jobs_execution_mode_check
  CHECK (execution_mode IN ('batch_api', 'direct_chat_chunks'));

COMMENT ON COLUMN public.batch_jobs.execution_mode IS
  'Execution path: batch_api for provider Batch API, direct_chat_chunks for LM Studio direct chat completion calls.';

-- =============================================================================
-- 2. Update batch_jobs provider check to include lmstudio
-- =============================================================================

ALTER TABLE public.batch_jobs
  DROP CONSTRAINT IF EXISTS batch_jobs_provider_check;

ALTER TABLE public.batch_jobs
  ADD CONSTRAINT batch_jobs_provider_check
  CHECK (provider IN ('openai', 'openai_compatible', 'gemini', 'lmstudio'));

COMMENT ON COLUMN public.batch_jobs.provider IS
  'LLM provider that owns this batch job (openai, openai_compatible, gemini, lmstudio).';

-- =============================================================================
-- 3. Update ai_provider_credentials provider check to include lmstudio
-- =============================================================================

ALTER TABLE public.ai_provider_credentials
  DROP CONSTRAINT IF EXISTS ai_provider_credentials_provider_check;

ALTER TABLE public.ai_provider_credentials
  ADD CONSTRAINT ai_provider_credentials_provider_check
  CHECK (provider IN ('openai', 'openai_compatible', 'gemini', 'lmstudio', 'serpapi', 'brave'));

COMMENT ON TABLE public.ai_provider_credentials IS
  'Encrypted provider API keys for AI scraping runtime (OpenAI/OpenAI-compatible/Gemini/LM Studio/SerpAPI/Brave).';

-- =============================================================================
-- 4. Update llm_parallel_runs provider checks to include lmstudio
-- =============================================================================

ALTER TABLE public.llm_parallel_runs
  DROP CONSTRAINT IF EXISTS llm_parallel_runs_primary_provider_check;

ALTER TABLE public.llm_parallel_runs
  ADD CONSTRAINT llm_parallel_runs_primary_provider_check
  CHECK (primary_provider IN ('openai', 'openai_compatible', 'gemini', 'lmstudio'));

ALTER TABLE public.llm_parallel_runs
  DROP CONSTRAINT IF EXISTS llm_parallel_runs_shadow_provider_check;

ALTER TABLE public.llm_parallel_runs
  ADD CONSTRAINT llm_parallel_runs_shadow_provider_check
  CHECK (shadow_provider IN ('openai', 'openai_compatible', 'gemini', 'lmstudio'));

-- =============================================================================
-- 5. Create batch_job_items table for per-SKU direct-chat tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.batch_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_job_id uuid NOT NULL REFERENCES public.batch_jobs(id) ON DELETE CASCADE,
  sku text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  request_payload jsonb NOT NULL DEFAULT '{}',
  response_payload jsonb,
  parsed_result jsonb,
  product_source jsonb NOT NULL DEFAULT '{}',
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  fallback_batch_id uuid REFERENCES public.batch_jobs(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT batch_job_items_status_check
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT batch_job_items_unique_batch_sku
    UNIQUE (batch_job_id, sku)
);

-- =============================================================================
-- 6. Indexes for batch_job_items
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_batch_jobs_execution_mode
  ON public.batch_jobs(execution_mode);

CREATE INDEX IF NOT EXISTS idx_batch_job_items_batch_id_status
  ON public.batch_job_items(batch_job_id, status);

CREATE INDEX IF NOT EXISTS idx_batch_job_items_sku
  ON public.batch_job_items(sku);

CREATE INDEX IF NOT EXISTS idx_batch_job_items_fallback_batch_id
  ON public.batch_job_items(fallback_batch_id)
  WHERE fallback_batch_id IS NOT NULL;

-- =============================================================================
-- 7. RLS policies for batch_job_items
-- =============================================================================

ALTER TABLE public.batch_job_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read batch job items" ON public.batch_job_items;
CREATE POLICY "Allow authenticated users to read batch job items"
  ON public.batch_job_items
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert batch job items" ON public.batch_job_items;
CREATE POLICY "Allow authenticated users to insert batch job items"
  ON public.batch_job_items
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update batch job items" ON public.batch_job_items;
CREATE POLICY "Allow authenticated users to update batch job items"
  ON public.batch_job_items
  FOR UPDATE
  TO authenticated
  USING (true);

-- =============================================================================
-- 8. Updated_at trigger for batch_job_items
-- =============================================================================

DROP TRIGGER IF EXISTS batch_job_items_updated_at ON public.batch_job_items;

CREATE TRIGGER batch_job_items_updated_at
  BEFORE UPDATE ON public.batch_job_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_batch_jobs_updated_at();

-- =============================================================================
-- 9. Comments
-- =============================================================================

COMMENT ON TABLE public.batch_job_items IS
  'Per-SKU work items for synthetic direct-chat consolidation batches. Tracks request payloads, responses, retries, and optional fallback to OpenAI Batch.';

COMMENT ON COLUMN public.batch_job_items.batch_job_id IS
  'Parent batch job this item belongs to.';

COMMENT ON COLUMN public.batch_job_items.sku IS
  'Product SKU for this consolidation item.';

COMMENT ON COLUMN public.batch_job_items.status IS
  'Current item status: pending, running, completed, failed, cancelled.';

COMMENT ON COLUMN public.batch_job_items.request_payload IS
  'Full JSON request body sent to the chat completions endpoint for this SKU.';

COMMENT ON COLUMN public.batch_job_items.response_payload IS
  'Raw JSON response from the chat completions endpoint.';

COMMENT ON COLUMN public.batch_job_items.parsed_result IS
  'Normalized consolidation result after parseStructuredConsolidationText processing.';

COMMENT ON COLUMN public.batch_job_items.product_source IS
  'Source evidence payload used to build the request, stored for auditing/retry.';

COMMENT ON COLUMN public.batch_job_items.error_message IS
  'Error message if the item failed.';

COMMENT ON COLUMN public.batch_job_items.attempt_count IS
  'Number of times this item has been attempted.';

COMMENT ON COLUMN public.batch_job_items.fallback_batch_id IS
  'If this item was retried via OpenAI Batch fallback, the child batch ID.';
