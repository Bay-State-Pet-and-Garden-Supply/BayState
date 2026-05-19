-- Create a view that projects published products from the ingestion pipeline
-- into a storefront-friendly format

CREATE OR REPLACE VIEW products_published AS
SELECT
  -- Use SKU as the unique identifier
  sku AS id,
  
  -- Prefer consolidated data, fall back to input data
  COALESCE(
    consolidated->>'name',
    input->>'name'
  ) AS name,
  
  -- Generate slug from name
  LOWER(REGEXP_REPLACE(
    COALESCE(consolidated->>'name', input->>'name', sku),
    '[^a-zA-Z0-9]+', '-', 'g'
  )) AS slug,
  
  -- Description from consolidated or empty
  COALESCE(consolidated->>'description', '') AS description,
  
  -- Price: prefer consolidated, fall back to input
  COALESCE(
    (consolidated->>'price')::numeric,
    (input->>'price')::numeric,
    0
  ) AS price,
  
  -- Images array from consolidated, or empty array
  COALESCE(
    consolidated->'images',
    '[]'::jsonb
  ) AS images,
  
  -- Stock status: default to 'in_stock' if not specified
  COALESCE(
    consolidated->>'stock_status',
    'in_stock'
  ) AS stock_status,
  
  -- Brand ID from consolidated (nullable)
  (consolidated->>'brand_id')::uuid AS brand_id,
  
  -- Is featured flag
  COALESCE((consolidated->>'is_featured')::boolean, false) AS is_featured,
  
  -- Timestamps
  created_at,
  updated_at,
  
  -- Keep reference to pipeline status
  pipeline_status

FROM products_ingestion
WHERE pipeline_status = 'published';

-- Create index on the base table for performance
CREATE INDEX IF NOT EXISTS idx_products_ingestion_pipeline_status 
ON products_ingestion(pipeline_status);

-- Add comment for documentation
COMMENT ON VIEW products_published IS 'Projects published products from ingestion pipeline into storefront-friendly format';
