-- Drop claim_next_pending_job so 20260206013000 can change its return type.
-- PostgreSQL CREATE OR REPLACE FUNCTION does not allow changing the return type,
-- so we must DROP first.

DROP FUNCTION IF EXISTS public.claim_next_pending_job(TEXT) CASCADE;
