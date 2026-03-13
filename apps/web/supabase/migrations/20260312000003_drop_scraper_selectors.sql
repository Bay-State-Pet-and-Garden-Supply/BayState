-- Drop scraper_selectors table as part of YAML migration cleanup
-- Selectors are now stored in YAML files
DROP TABLE IF EXISTS scraper_selectors;
