-- Add current_version_id column to scrapers table for 20260221100000 migration
-- which references scrapers.current_version_id.

ALTER TABLE public.scrapers ADD COLUMN IF NOT EXISTS current_version_id UUID;
