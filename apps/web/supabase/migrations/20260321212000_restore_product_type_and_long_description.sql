ALTER TABLE products
ADD COLUMN IF NOT EXISTS long_description text,
ADD COLUMN IF NOT EXISTS product_type text;

COMMENT ON COLUMN products.long_description IS 'Detailed ShopSite MoreInformationText content for product detail pages.';
COMMENT ON COLUMN products.product_type IS 'ShopSite ProductField25 subtype used for storefront/admin filtering.';
