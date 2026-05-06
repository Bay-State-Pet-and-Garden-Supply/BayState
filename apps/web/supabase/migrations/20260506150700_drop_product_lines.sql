-- Drop Product Lines Table and associated infrastructure
-- This table is no longer used and the feature is being deprecated.

BEGIN;

-- Drop table and associated objects (triggers, etc)
DROP TABLE IF EXISTS product_lines CASCADE;

-- Drop function if it exists
DROP FUNCTION IF EXISTS update_product_lines_updated_at();

COMMIT;
