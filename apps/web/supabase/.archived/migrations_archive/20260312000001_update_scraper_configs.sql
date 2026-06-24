-- ============================================================================
-- UPDATE: Scraper Configs for YAML-Based Workflow
-- Created: 2026-03-12
-- ============================================================================
-- This migration updates scraper_configs for the simplified YAML-based workflow:
-- 1. Adds file_path column to store path to YAML config file
-- 2. Populates file_path for all existing configs
-- 3. Drops unused columns (current_version_id, scraper_type, base_url, domain, schema_version, created_by)
-- 4. Renames display_name to name for consistency
-- ============================================================================

-- =============================================================================
-- STEP 1: Add file_path column
-- =============================================================================
-- Add as nullable first, will populate, then can enforce NOT NULL if needed
ALTER TABLE public.scraper_configs 
ADD COLUMN IF NOT EXISTS file_path TEXT;

-- =============================================================================
-- STEP 2: Populate file_path for all existing configs
-- =============================================================================
-- Pattern: scrapers/configs/{slug}.yaml (e.g., scrapers/configs/amazon.yaml)
UPDATE public.scraper_configs 
SET file_path = 'scrapers/configs/' || slug || '.yaml'
WHERE file_path IS NULL;

-- =============================================================================
-- STEP 3: Drop unused columns
-- =============================================================================
-- current_version_id: No longer needed - runner reads from YAML directly
ALTER TABLE public.scraper_configs DROP COLUMN IF EXISTS current_version_id;

-- scraper_type: Can be derived from YAML file presence (ai-{slug}.yaml = agentic)
ALTER TABLE public.scraper_configs DROP COLUMN IF EXISTS scraper_type;

-- base_url: Now stored in YAML config file
ALTER TABLE public.scraper_configs DROP COLUMN IF EXISTS base_url;

-- domain: Now stored in YAML config file  
ALTER TABLE public.scraper_configs DROP COLUMN IF EXISTS domain;

-- schema_version: Now stored in YAML config file
ALTER TABLE public.scraper_configs DROP COLUMN IF EXISTS schema_version;

-- created_by: Audit trail not needed for simplified read-only panel
ALTER TABLE public.scraper_configs DROP COLUMN IF EXISTS created_by;

-- =============================================================================
-- STEP 4: Rename display_name to name
-- =============================================================================
-- For consistency with simplified schema (name vs display_name)
ALTER TABLE public.scraper_configs RENAME COLUMN display_name TO name;

-- =============================================================================
-- STEP 5: Set file_path as NOT NULL
-- =============================================================================
-- Now that all rows are populated, enforce NOT NULL
ALTER TABLE public.scraper_configs ALTER COLUMN file_path SET NOT NULL;

-- =============================================================================
-- STEP 6: Add comments for documentation
-- =============================================================================
COMMENT ON TABLE public.scraper_configs IS 'Scraper configuration registry - simplified for YAML-based workflow. Each config references a YAML file in scrapers/configs/.';
COMMENT ON COLUMN public.scraper_configs.slug IS 'Unique identifier matching YAML filename (e.g., amazon, ai-phillips)';
COMMENT ON COLUMN public.scraper_configs.name IS 'Human-readable display name';
COMMENT ON COLUMN public.scraper_configs.file_path IS 'Relative path to YAML config file (e.g., scrapers/configs/amazon.yaml)';
COMMENT ON COLUMN public.scraper_configs.created_at IS 'Timestamp when config was originally created';
COMMENT ON COLUMN public.scraper_configs.updated_at IS 'Timestamp of last update';

-- =============================================================================
-- STEP 7: Verification
-- =============================================================================
-- Verify the migration worked correctly
SELECT 
    id, 
    slug, 
    name, 
    file_path, 
    created_at, 
    updated_at 
FROM public.scraper_configs 
ORDER BY slug;

-- Check column count (should be 6)
SELECT COUNT(*) as column_count 
FROM information_schema.columns 
WHERE table_name = 'scraper_configs' 
AND table_schema = 'public';
