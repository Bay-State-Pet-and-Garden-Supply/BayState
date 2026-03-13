-- Drop scraper_config_versions table as part of YAML migration cleanup
-- Data has been archived to YAML files and is no longer needed
DROP TABLE IF EXISTS scraper_config_versions;