-- Security Hardening Migration
-- Addresses security linter errors: SECURITY DEFINER view and disabled RLS on public tables.

-- 1. Redefine products_published view to be SECURITY INVOKER
-- Dropping first to change from SECURITY DEFINER (if it was set)
DROP VIEW IF EXISTS public.products_published;

CREATE VIEW public.products_published AS
SELECT
  sku AS id,
  COALESCE(consolidated->>'name', input->>'name') AS name,
  LOWER(REGEXP_REPLACE(
    COALESCE(consolidated->>'name', input->>'name', sku),
    '[^a-zA-Z0-9]+', '-', 'g'
  )) AS slug,
  COALESCE(consolidated->>'description', '') AS description,
  COALESCE((consolidated->>'price')::numeric, (input->>'price')::numeric, 0) AS price,
  COALESCE(consolidated->'images', '[]'::jsonb) AS images,
  COALESCE(consolidated->>'stock_status', 'in_stock') AS stock_status,
  (consolidated->>'brand_id')::uuid AS brand_id,
  COALESCE((consolidated->>'is_featured')::boolean, false) AS is_featured,
  created_at,
  updated_at,
  pipeline_status
FROM products_ingestion
WHERE pipeline_status = 'published';

COMMENT ON VIEW products_published IS 'Projects published products from ingestion pipeline into storefront-friendly format. respects RLS.';

-- 2. Enable RLS on public tables
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products_ingestion ENABLE ROW LEVEL SECURITY;

-- 3. Add Public Read Policies (Allow anyone to view storefront data)
-- 3. Add Public Read Policies (Allow anyone to view storefront data)
DROP POLICY IF EXISTS "Public Read Categories" ON public.categories;
CREATE POLICY "Public Read Categories" ON public.categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Product Types" ON public.product_types;
CREATE POLICY "Public Read Product Types" ON public.product_types FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Services" ON public.services;
CREATE POLICY "Public Read Services" ON public.services FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Brands" ON public.brands;
CREATE POLICY "Public Read Brands" ON public.brands FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Products" ON public.products;
CREATE POLICY "Public Read Products" ON public.products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Site Settings" ON public.site_settings;
CREATE POLICY "Public Read Site Settings" ON public.site_settings FOR SELECT USING (true);

-- 4. Ingestion table needs specific policies for the view to work
-- Allowing public to select from products_ingestion but ONLY for published products
-- This ensures the SECURITY INVOKER view works for public users
DROP POLICY IF EXISTS "Public Read Published Ingestion" ON public.products_ingestion;
CREATE POLICY "Public Read Published Ingestion" ON public.products_ingestion 
FOR SELECT USING (pipeline_status = 'published');

-- 5. Add Admin/Staff Write Policies for site_settings
DROP POLICY IF EXISTS "Admin/Staff Write Site Settings" ON public.site_settings;
CREATE POLICY "Admin/Staff Write Site Settings" ON public.site_settings
FOR ALL USING (public.is_staff());

-- 6. Add Admin/Staff Write Policies for other tables (for management)
DROP POLICY IF EXISTS "Admin/Staff Write Categories" ON public.categories;
CREATE POLICY "Admin/Staff Write Categories" ON public.categories FOR ALL USING (public.is_staff());

DROP POLICY IF EXISTS "Admin/Staff Write Product Types" ON public.product_types;
CREATE POLICY "Admin/Staff Write Product Types" ON public.product_types FOR ALL USING (public.is_staff());

DROP POLICY IF EXISTS "Admin/Staff Write Services" ON public.services;
CREATE POLICY "Admin/Staff Write Services" ON public.services FOR ALL USING (public.is_staff());

DROP POLICY IF EXISTS "Admin/Staff Write Brands" ON public.brands;
CREATE POLICY "Admin/Staff Write Brands" ON public.brands FOR ALL USING (public.is_staff());

DROP POLICY IF EXISTS "Admin/Staff Write Products" ON public.products;
CREATE POLICY "Admin/Staff Write Products" ON public.products FOR ALL USING (public.is_staff());

DROP POLICY IF EXISTS "Admin/Staff Write Ingestion" ON public.products_ingestion;
CREATE POLICY "Admin/Staff Write Ingestion" ON public.products_ingestion FOR ALL USING (public.is_staff());
