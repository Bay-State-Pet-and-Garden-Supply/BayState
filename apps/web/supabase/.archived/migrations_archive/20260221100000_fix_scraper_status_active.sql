-- Migration: Fix scraper status - set active for scrapers with published versions
-- Date: 2026-02-21
-- Issue: Static scrapers failing with "No valid scraper configurations" because
--         scrapers.status defaults to 'draft' but API queries for 'active'
-- Solution: Update scrapers.status to 'active' for all scrapers that have
--           a published version in scraper_config_versions

-- Update scrapers that have published versions to active status
UPDATE scrapers s
SET status = 'active'
WHERE s.status = 'draft'
AND EXISTS (
    SELECT 1 
    FROM scraper_config_versions cv 
    WHERE cv.config_id = s.id 
    AND cv.status = 'published'
);

-- Also update any scrapers that were manually set to 'validated' but not published
UPDATE scrapers s
SET status = 'active'
WHERE s.status = 'draft'
AND s.current_version_id IS NOT NULL;

-- Verification query
SELECT 
    s.name,
    s.status,
    s.current_version_id,
    cv.status as version_status
FROM scrapers s
LEFT JOIN scraper_config_versions cv ON s.current_version_id = cv.id
ORDER BY s.name;
