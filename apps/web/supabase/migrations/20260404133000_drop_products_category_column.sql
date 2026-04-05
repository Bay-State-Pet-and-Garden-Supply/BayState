-- Drop legacy category and product_type columns from products table
-- and drop the product_types table since we're now using hierarchical categories

BEGIN;

-- Drop category column if it exists
ALTER TABLE public.products
DROP COLUMN IF EXISTS category;

-- Drop product_type column if it exists
ALTER TABLE public.products
DROP COLUMN IF EXISTS product_type;

-- Drop product_types table with CASCADE to remove dependent foreign keys
DROP TABLE IF EXISTS public.product_types CASCADE;

COMMIT;
