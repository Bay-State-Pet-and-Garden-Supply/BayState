-- Drop scraper_workflow_steps table as part of YAML migration cleanup
-- Workflow steps are now stored in YAML files
DROP TABLE IF EXISTS scraper_workflow_steps;
