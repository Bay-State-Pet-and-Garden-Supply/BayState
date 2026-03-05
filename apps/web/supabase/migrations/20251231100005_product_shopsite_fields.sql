-- Align products table with ShopSite XML export fields
-- Adds new columns for better product data fidelity and filtering

-- Sale pricing
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price numeric(10, 2);

-- Product identifiers (ShopSite internal & barcode)
ALTER TABLE products ADD COLUMN IF NOT EXISTS gtin text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shopsite_product_id text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shopsite_guid text;

-- Status and availability
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_disabled boolean DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS availability text;

-- Inventory controls
ALTER TABLE products ADD COLUMN IF NOT EXISTS minimum_quantity integer DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold integer;

-- SEO and legacy fields
ALTER TABLE products ADD COLUMN IF NOT EXISTS legacy_filename text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_keywords text;

-- ============================================================================
-- Indexes for common queries
-- ============================================================================

-- GTIN (barcode) lookup
CREATE INDEX IF NOT EXISTS idx_products_gtin ON products(gtin) WHERE gtin IS NOT NULL;

-- Quick filtering by availability
CREATE INDEX IF NOT EXISTS idx_products_availability ON products(availability);

-- Filtering active vs disabled products
CREATE INDEX IF NOT EXISTS idx_products_is_disabled ON products(is_disabled);

-- Unique constraint on ShopSite GUID for upsert operations
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_shopsite_guid ON products(shopsite_guid) 
  WHERE shopsite_guid IS NOT NULL;

-- ShopSite product ID lookup
CREATE INDEX IF NOT EXISTS idx_products_shopsite_product_id ON products(shopsite_product_id)
  WHERE shopsite_product_id IS NOT NULL;
