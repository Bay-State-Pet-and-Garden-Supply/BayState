-- Add is_active_for_consolidation column to ai_provider_configs
-- This allows independent provider selection for consolidation vs extraction.
-- Existing is_active remains for extraction (backward compatible).

ALTER TABLE public.ai_provider_configs
  ADD COLUMN IF NOT EXISTS is_active_for_consolidation boolean NOT NULL DEFAULT false;

-- Partial unique index: at most one consolidation-active profile at a time,
-- mirroring the existing idx_ai_provider_configs_one_active for extraction.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_provider_configs_one_active_consolidation
  ON public.ai_provider_configs ((is_active_for_consolidation))
  WHERE is_active_for_consolidation = true;
