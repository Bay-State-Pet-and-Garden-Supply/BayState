-- Performance Optimization: Add brand data to products_published view
-- This eliminates the N+1 query pattern where products are fetched first,
-- then brands are fetched in a separate query.

-- Drop and recreate the view with brand join
DROP VIEW IF EXISTS public.products_published;

CREATE VIEW public.products_published AS
SELECT
  pi.sku AS id,
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
  COALESCE((pi.consolidated->>'is_featured')::boolean, false) AS is_featured,
  pi.created_at,
  pi.updated_at,
  pi.pipeline_status,
  -- Include brand data directly to avoid N+1 queries
  b.name AS brand_name,
  b.slug AS brand_slug,
  b.logo_url AS brand_logo_url
FROM products_ingestion pi
LEFT JOIN brands b ON (pi.consolidated->>'brand_id')::uuid = b.id
WHERE pi.pipeline_status = 'published';

COMMENT ON VIEW products_published IS 'Projects published products from ingestion pipeline into storefront-friendly format with brand data. Respects RLS.';
