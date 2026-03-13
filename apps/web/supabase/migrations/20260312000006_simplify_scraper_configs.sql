-- Simplify scraper_configs table by dropping unused columns
-- Part of YAML migration - keeping only essential columns for audit trail

-- Drop columns that are no longer needed (already migrated to YAML files)
ALTER TABLE scraper_configs 
DROP COLUMN IF EXISTS current_version_id,
DROP COLUMN IF EXISTS schema_version,
DROP COLUMN IF EXISTS scraper_type,
DROP COLUMN IF EXISTS base_url,
DROP COLUMN IF EXISTS selectors,
DROP COLUMN IF EXISTS workflows,
DROP COLUMN IF EXISTS timeout,
DROP COLUMN IF EXISTS retries,
DROP COLUMN IF EXISTS image_quality,
DROP COLUMN IF EXISTS test_skus,
DROP COLUMN IF EXISTS fake_skus,
DROP COLUMN IF EXISTS ai_config,
DROP COLUMN IF EXISTS credentials;

-- Verify final schema
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'scraper_configs' 
ORDER BY ordinal_position;
