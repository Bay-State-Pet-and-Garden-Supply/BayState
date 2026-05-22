-- Add missing modes to enrichment_attempts check constraint
-- The API now supports 'distributor_only' and 'ai_only' modes which were missing from the database constraint.

BEGIN;
ALTER TABLE public.enrichment_attempts
  DROP CONSTRAINT IF EXISTS enrichment_attempts_mode_check;
ALTER TABLE public.enrichment_attempts
  ADD CONSTRAINT enrichment_attempts_mode_check
  CHECK (mode = ANY (ARRAY['structured'::text, 'metadata'::text, 'llm'::text, 'mixed'::text, 'distributor_only'::text, 'ai_only'::text]));
COMMIT;
