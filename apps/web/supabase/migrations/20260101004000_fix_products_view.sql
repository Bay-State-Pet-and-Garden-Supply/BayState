-- Fix products_published view to include all required fields
-- Adds: sku field, category_id, and ensures proper field types

DROP VIEW IF EXISTS public.products_published;

CREATE VIEW public.products_published AS
SELECT
  pi.sku AS id,
  pi.sku,  -- Include sku explicitly for admin tables
  COALESCE(pi.consolidated->>'name', pi.input->>'name') AS name,
  LOWER(REGEXP_REPLACE(
    COALESCE(pi.consolidated->>'name', pi.input->>'name', pi.sku),
    '[^a-zA-Z0-9]+', '-', 'g'
  )) AS slug,
  COALESCE(pi.consolidated->>'description', '') AS description,
  COALESCE((pi.consolidated->>'price')::numeric, (pi.input->>'price')::numeric, 0) AS price,
  COALESCE(pi.consolidated->'images', '[]'::jsonb) AS images,
  COALESCE(pi.consolidated->>'stock_status', 'in_stock') AS stock_status,
  (pi.consolidated->>'brand_id')::uuid AS brand_id,
  (pi.consolidated->>'category_id')::uuid AS category_id,
  COALESCE((pi.consolidated->>'is_featured')::boolean, false) AS is_featured,
  pi.created_at,
  pi.updated_at,
  pi.pipeline_status,
  -- Include brand data directly to avoid N+1 queries
  b.name AS brand_name,
  b.slug AS brand_slug,
  b.logo_url AS brand_logo_url,
  -- Include category data
  c.name AS category_name,
  c.slug AS category_slug
FROM products_ingestion pi
LEFT JOIN brands b ON (pi.consolidated->>'brand_id')::uuid = b.id
LEFT JOIN categories c ON (pi.consolidated->>'category_id')::uuid = c.id
WHERE pi.pipeline_status = 'published';

-- Create/update index for performance
CREATE INDEX IF NOT EXISTS idx_products_ingestion_pipeline_status 
ON products_ingestion(pipeline_status);

COMMENT ON VIEW products_published IS 'Projects published products from ingestion pipeline into storefront-friendly format with brand and category data.';
