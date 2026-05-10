-- Drop validate_runner_api_key function so 20260119150000 can change its return type.
-- PostgreSQL CREATE OR REPLACE FUNCTION does not allow changing the return type,
-- so we must DROP first. The function is recreated in 20260119150000 with the
-- new 4-column return signature including allowed_scrapers text[].

DROP FUNCTION IF EXISTS public.validate_runner_api_key(api_key text) CASCADE;
