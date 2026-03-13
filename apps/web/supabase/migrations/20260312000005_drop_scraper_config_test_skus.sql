-- Drop scraper_config_test_skus table as part of YAML migration cleanup
-- Test SKUs are now stored in YAML files (data archived in Task 5.2)
DROP TABLE IF EXISTS scraper_config_test_skus;
