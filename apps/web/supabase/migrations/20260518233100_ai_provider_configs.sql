-- AI provider profiles used by scraping/enrichment/consolidation jobs.
-- Keeps secret material encrypted in the coordinator DB and traces the exact
-- provider profile used by each queued enrichment job/attempt via config_id.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE public.ai_provider_type AS ENUM (
    'deepseek',
    'openai',
    'openai_compatible',
    'gemini',
    'lmstudio'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.ai_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider_type public.ai_provider_type NOT NULL,
  base_url text,
  default_model text NOT NULL,
  encrypted_key text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.ai_provider_configs
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS provider_type public.ai_provider_type,
  ADD COLUMN IF NOT EXISTS base_url text,
  ADD COLUMN IF NOT EXISTS default_model text,
  ADD COLUMN IF NOT EXISTS encrypted_key text,
  ADD COLUMN IF NOT EXISTS iv text,
  ADD COLUMN IF NOT EXISTS auth_tag text,
  ADD COLUMN IF NOT EXISTS key_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_provider_configs_is_active
  ON public.ai_provider_configs (is_active)
  WHERE is_active = true;

-- Enforce the runtime assumption used by getActiveAIProviderConfig(): at most
-- one active provider profile at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_provider_configs_one_active
  ON public.ai_provider_configs ((is_active))
  WHERE is_active = true;

ALTER TABLE public.enrichment_jobs
  ADD COLUMN IF NOT EXISTS config_id uuid REFERENCES public.ai_provider_configs(id) ON DELETE SET NULL;

ALTER TABLE public.enrichment_attempts
  ADD COLUMN IF NOT EXISTS config_id uuid REFERENCES public.ai_provider_configs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_config_id
  ON public.enrichment_jobs (config_id);

CREATE INDEX IF NOT EXISTS idx_enrichment_attempts_config_id
  ON public.enrichment_attempts (config_id);

-- Correct early profile seeds that accidentally reused the DeepSeek model for
-- OpenAI-compatible provider rows.
UPDATE public.ai_provider_configs
SET default_model = 'gpt-4o-mini',
    updated_at = now()
WHERE provider_type = 'openai'
  AND (default_model IS NULL OR default_model = '' OR default_model = 'deepseek-chat');
