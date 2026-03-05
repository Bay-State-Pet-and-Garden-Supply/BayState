-- Clean up products table by consolidating internal ShopSite fields into JSONB
-- Use SKU as the primary shared identifier.

BEGIN;

-- 1. Ensure shopsite_data exists and is initialized
-- (Already exists from previous migrations, but safe-guarding)

-- 2. Preserve and consolidate internal/legacy data into shopsite_data
UPDATE products 
SET shopsite_data = shopsite_data || jsonb_build_object(
    'shopsite_id', shopsite_product_id,
    'shopsite_guid', shopsite_guid,
    'product_type', shopsite_product_type,
    'legacy_filename', legacy_filename,
    'upc', upc
);

-- 3. Rename columns to be more generic and cleaner
ALTER TABLE products RENAME COLUMN shopsite_cost TO cost;
ALTER TABLE products RENAME COLUMN shopsite_pages TO categories;

-- 4. Drop redundant internal columns
-- Drop indexes first (Supabase usually handles this but it's cleaner)
DROP INDEX IF EXISTS idx_products_shopsite_product_id;
DROP INDEX IF EXISTS idx_products_shopsite_guid;
DROP INDEX IF EXISTS idx_products_shopsite_product_type;
DROP INDEX IF EXISTS products_shopsite_guid_key;
DROP INDEX IF EXISTS products_shopsite_guid_unique;

ALTER TABLE products DROP COLUMN IF EXISTS shopsite_product_id;
ALTER TABLE products DROP COLUMN IF EXISTS shopsite_guid;
ALTER TABLE products DROP COLUMN IF EXISTS shopsite_product_type;
ALTER TABLE products DROP COLUMN IF EXISTS legacy_filename;
ALTER TABLE products DROP COLUMN IF EXISTS upc;

-- 5. Add updated_at if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='updated_at') THEN
        ALTER TABLE products ADD COLUMN updated_at timestamptz DEFAULT now();
    END IF;
END $$;

COMMIT;
