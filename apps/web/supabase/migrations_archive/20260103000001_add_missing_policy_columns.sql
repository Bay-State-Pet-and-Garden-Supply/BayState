-- Backfill: Add columns referenced by downstream migration policies.
-- profiles.auth_user_id and profiles.organization_id are referenced by
-- 20260131000003_test_lab_extensions.sql policies.
-- scrapers.organization_id is also referenced by those policies.
-- These columns were bootstrapped outside the migration system.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.scrapers ADD COLUMN IF NOT EXISTS organization_id uuid;
