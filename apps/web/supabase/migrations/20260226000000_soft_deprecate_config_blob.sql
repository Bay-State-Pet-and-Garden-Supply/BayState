-- ============================================================================
-- MIGRATION: Soft-Deprecate Config JSONB Blob
-- Created: 2026-02-26
-- ============================================================================
-- Phase 1 of 2: Soft deprecation via column rename
--
-- This migration renames the legacy `config` JSONB column to `config_legacy`
-- to preserve data for rollback safety while marking it as deprecated.
--
-- IMPORTANT: The code still references this column in several places.
-- DO NOT drop this column until all code references are migrated to use
-- the normalized tables (scraper_selectors, scraper_workflow_steps, 
-- version columns on scraper_configs).
--
-- Phase 2 (future): Drop the column after code migration is complete
--
-- Rollback (if needed):
--   ALTER TABLE scraper_config_versions RENAME COLUMN config_legacy TO config;
-- ============================================================================

-- Rename the legacy config column to config_legacy
ALTER TABLE scraper_config_versions 
RENAME COLUMN config TO config_legacy;

-- Add deprecation comment
COMMENT ON COLUMN scraper_config_versions.config_legacy IS 
'DEPRECATED: This column is preserved for rollback safety. Use normalized tables (scraper_selectors, scraper_workflow_steps, version columns) instead. Will be dropped in Phase 2.';

-- Verify the rename worked
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'scraper_config_versions' 
AND column_name IN ('config', 'config_legacy');
