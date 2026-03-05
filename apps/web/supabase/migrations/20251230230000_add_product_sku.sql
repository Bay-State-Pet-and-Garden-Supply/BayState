-- Add SKU column to products table for ShopSite product matching
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku text;

-- Create unique index on SKU for upsert operations
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique ON products(sku) WHERE sku IS NOT NULL;

-- Add legacy_shopsite_id column for tracking migrated products
ALTER TABLE products ADD COLUMN IF NOT EXISTS legacy_shopsite_id text;
