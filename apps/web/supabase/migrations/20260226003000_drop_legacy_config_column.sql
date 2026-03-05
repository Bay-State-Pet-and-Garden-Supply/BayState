-- ============================================================================
-- MIGRATION: Drop Legacy Config Column (Phase 2 of 2)
-- Created: 2026-02-26
-- ============================================================================
-- Phase 2: Actually drop the config_legacy column
--
-- Prerequisites (ALL must be complete before running):
-- 1. ✅ All code references to config column removed
-- 2. ✅ API routes updated to use normalized tables
-- 3. ✅ Assembly utility in use for config reconstruction
-- 4. ✅ Application tested and working in production
--
-- WARNING: This action is IRREVERSIBLE. Data in config_legacy will be lost.
-- The column has been renamed from 'config' to 'config_legacy' in Phase 1.
-- This migration completes the deprecation by removing it entirely.
--
-- Rollback: Restore from backup if needed (cannot rollback via SQL)
-- ============================================================================

-- Drop the deprecated config_legacy column
ALTER TABLE scraper_config_versions 
DROP COLUMN config_legacy;

-- Verify column has been removed
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'scraper_config_versions' 
AND column_name = 'config_legacy';
-- Should return 0 rows
