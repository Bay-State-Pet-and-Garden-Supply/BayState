-- Add missing fields from ShopSite XML to products table
-- Aligning schema for better inventory and categorization tracking

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS quantity_on_hand integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS out_of_stock_limit integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS google_product_category text,
ADD COLUMN IF NOT EXISTS shopsite_pages jsonb DEFAULT '[]'::jsonb;

-- Comment for documentation
COMMENT ON COLUMN products.shopsite_pages IS 'JSON array of page names from ShopSite <ProductOnPages> section';
