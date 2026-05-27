-- Add missing modes to enrichment_jobs check constraint
-- The API now supports 'distributor_only' and 'ai_only' modes which were missing from the database constraint.

BEGIN;
ALTER TABLE public.enrichment_jobs
DROP CONSTRAINT IF EXISTS enrichment_jobs_mode_check;
ALTER TABLE public.enrichment_jobs
ADD CONSTRAINT enrichment_jobs_mode_check
CHECK (mode = ANY (ARRAY['structured'::text, 'metadata'::text, 'llm'::text, 'mixed'::text, 'distributor_only'::text, 'ai_only'::text]));
COMMIT;
