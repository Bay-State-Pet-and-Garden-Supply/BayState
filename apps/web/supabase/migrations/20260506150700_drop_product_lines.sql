-- Drop Product Lines Table and associated infrastructure
-- This table is no longer used and the feature is being deprecated.

BEGIN;

-- Drop trigger first
DROP TRIGGER IF EXISTS update_product_lines_updated_at ON product_lines;

-- Drop function
DROP FUNCTION IF EXISTS update_product_lines_updated_at();

-- Drop table
DROP TABLE IF EXISTS product_lines CASCADE;

COMMIT;
