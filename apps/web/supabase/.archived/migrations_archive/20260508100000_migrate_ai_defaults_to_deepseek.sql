-- Migration: Promote DeepSeek to the default Bay State LLM provider
-- Created: 2026-05-08
-- Purpose:
--   1. Add deepseek to provider check constraints used by AI credentials/batches.
--   2. Migrate stored AI defaults from OpenAI/Gemini to DeepSeek.
--   3. Rewrite queued discovery jobs that still reference deprecated hosted providers.

-- =============================================================================
-- 1. Update provider constraints to include deepseek
-- =============================================================================

ALTER TABLE public.batch_jobs
  DROP CONSTRAINT IF EXISTS batch_jobs_provider_check;

ALTER TABLE public.batch_jobs
  ADD CONSTRAINT batch_jobs_provider_check
  CHECK (provider IN ('deepseek', 'openai', 'openai_compatible', 'gemini', 'lmstudio'));

COMMENT ON COLUMN public.batch_jobs.provider IS
  'LLM provider that owns this batch job (deepseek, openai, openai_compatible, gemini, lmstudio).';

ALTER TABLE public.ai_provider_credentials
  DROP CONSTRAINT IF EXISTS ai_provider_credentials_provider_check;

ALTER TABLE public.ai_provider_credentials
  ADD CONSTRAINT ai_provider_credentials_provider_check
  CHECK (provider IN ('deepseek', 'openai', 'openai_compatible', 'gemini', 'lmstudio', 'serpapi', 'brave'));

COMMENT ON TABLE public.ai_provider_credentials IS
  'Encrypted provider API keys for AI scraping runtime (DeepSeek/OpenAI/OpenAI-compatible/Gemini/LM Studio/SerpAPI/Brave).';

ALTER TABLE public.llm_parallel_runs
  DROP CONSTRAINT IF EXISTS llm_parallel_runs_primary_provider_check;

ALTER TABLE public.llm_parallel_runs
  ADD CONSTRAINT llm_parallel_runs_primary_provider_check
  CHECK (primary_provider IN ('deepseek', 'openai', 'openai_compatible', 'gemini', 'lmstudio'));

ALTER TABLE public.llm_parallel_runs
  DROP CONSTRAINT IF EXISTS llm_parallel_runs_shadow_provider_check;

ALTER TABLE public.llm_parallel_runs
  ADD CONSTRAINT llm_parallel_runs_shadow_provider_check
  CHECK (shadow_provider IN ('deepseek', 'openai', 'openai_compatible', 'gemini', 'lmstudio'));

-- =============================================================================
-- 2. Migrate stored admin defaults to DeepSeek
-- =============================================================================

UPDATE public.site_settings
SET
  value = jsonb_set(
    jsonb_set(
      COALESCE(value, '{}'::jsonb),
      '{llm_provider}',
      '"deepseek"'::jsonb,
      true
    ),
    '{llm_model}',
    '"deepseek-chat"'::jsonb,
    true
  ),
  updated_at = now()
WHERE key = 'ai_scraping_defaults'
  AND COALESCE(value->>'llm_provider', 'openai') IN ('openai', 'gemini');

UPDATE public.site_settings
SET
  value = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(value, '{}'::jsonb),
        '{llm_provider}',
        '"deepseek"'::jsonb,
        true
      ),
      '{llm_model}',
      '"deepseek-chat"'::jsonb,
      true
    ),
    '{llm_supports_batch_api}',
    'false'::jsonb,
    true
  ),
  updated_at = now()
WHERE key = 'ai_consolidation_defaults'
  AND COALESCE(value->>'llm_provider', 'openai') IN ('openai', 'gemini');

-- =============================================================================
-- 3. Rewrite queued discovery jobs to use DeepSeek
-- =============================================================================

UPDATE public.scrape_jobs
SET
  config = jsonb_set(
    jsonb_set(
      COALESCE(config, '{}'::jsonb),
      '{llm_provider}',
      '"deepseek"'::jsonb,
      true
    ),
    '{llm_model}',
    '"deepseek-chat"'::jsonb,
    true
  ),
  updated_at = now()
WHERE status IN ('pending', 'running')
  AND COALESCE(config->>'llm_provider', 'openai') IN ('openai', 'gemini');
