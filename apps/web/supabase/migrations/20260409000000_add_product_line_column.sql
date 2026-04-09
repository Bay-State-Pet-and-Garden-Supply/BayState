-- Add product_line column to products_ingestion for cohort-based processing
ALTER TABLE products_ingestion 
ADD COLUMN IF NOT EXISTS product_line text;

-- Create index for efficient querying by product line
CREATE INDEX IF NOT EXISTS idx_products_ingestion_product_line 
ON products_ingestion(product_line);

-- Add comment for documentation
COMMENT ON COLUMN products_ingestion.product_line IS 'Product line identifier for cohort-based processing';
