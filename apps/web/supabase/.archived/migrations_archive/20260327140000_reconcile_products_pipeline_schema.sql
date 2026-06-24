BEGIN;

-- Move manual storefront-only flags out of products so the table matches
-- the pipeline-owned product payload.
CREATE TABLE IF NOT EXISTS public.product_storefront_settings (
    product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
    is_featured boolean NOT NULL DEFAULT false,
    pickup_only boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_product_storefront_settings_is_featured
    ON public.product_storefront_settings (is_featured)
    WHERE is_featured = true;

CREATE INDEX IF NOT EXISTS idx_product_storefront_settings_pickup_only
    ON public.product_storefront_settings (pickup_only)
    WHERE pickup_only = true;

ALTER TABLE public.product_storefront_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read Product Storefront Settings" ON public.product_storefront_settings;
CREATE POLICY "Public Read Product Storefront Settings"
    ON public.product_storefront_settings FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Admin/Staff Write Product Storefront Settings" ON public.product_storefront_settings;
CREATE POLICY "Admin/Staff Write Product Storefront Settings"
    ON public.product_storefront_settings FOR ALL
    USING (public.is_staff());

INSERT INTO public.product_storefront_settings (product_id, is_featured, pickup_only)
SELECT
    id,
    COALESCE(is_featured, false),
    COALESCE(pickup_only, false)
FROM public.products
ON CONFLICT (product_id) DO UPDATE
SET
    is_featured = EXCLUDED.is_featured,
    pickup_only = EXCLUDED.pickup_only;

CREATE OR REPLACE FUNCTION public.ensure_product_storefront_settings_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.product_storefront_settings (product_id)
    VALUES (NEW.id)
    ON CONFLICT (product_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_product_storefront_settings_row ON public.products;
CREATE TRIGGER ensure_product_storefront_settings_row
AFTER INSERT ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.ensure_product_storefront_settings_row();

WITH category_names AS (
    SELECT
        category_rows.product_id,
        string_agg(category_rows.name, '|' ORDER BY category_rows.display_order, category_rows.name) AS category_value
    FROM (
        SELECT DISTINCT
            pc.product_id,
            c.name,
            COALESCE(c.display_order, 0) AS display_order
        FROM public.product_categories pc
        INNER JOIN public.categories c
            ON c.id = pc.category_id
    ) AS category_rows
    GROUP BY category_rows.product_id
)
UPDATE public.products AS products
SET category = category_names.category_value
FROM category_names
WHERE products.id = category_names.product_id
  AND (products.category IS NULL OR btrim(products.category) = '');

UPDATE public.products
SET
    stock_status = COALESCE(stock_status, 'in_stock'),
    images = COALESCE(images, ARRAY[]::text[]),
    shopsite_pages = CASE
        WHEN shopsite_pages IS NULL OR jsonb_typeof(shopsite_pages) <> 'array' THEN '[]'::jsonb
        ELSE shopsite_pages
    END,
    is_special_order = COALESCE(is_special_order, false),
    quantity = COALESCE(quantity, 0),
    low_stock_threshold = COALESCE(low_stock_threshold, 5),
    is_taxable = COALESCE(is_taxable, true),
    minimum_quantity = COALESCE(minimum_quantity, 0),
    created_at = COALESCE(created_at, now()),
    updated_at = COALESCE(updated_at, now())
WHERE stock_status IS NULL
   OR images IS NULL
   OR shopsite_pages IS NULL
   OR jsonb_typeof(shopsite_pages) <> 'array'
   OR is_special_order IS NULL
   OR quantity IS NULL
   OR low_stock_threshold IS NULL
   OR is_taxable IS NULL
   OR minimum_quantity IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.products
    ALTER COLUMN stock_status SET DEFAULT 'in_stock',
    ALTER COLUMN stock_status SET NOT NULL,
    ALTER COLUMN images SET DEFAULT ARRAY[]::text[],
    ALTER COLUMN images SET NOT NULL,
    ALTER COLUMN shopsite_pages SET DEFAULT '[]'::jsonb,
    ALTER COLUMN shopsite_pages SET NOT NULL,
    ALTER COLUMN is_special_order SET DEFAULT false,
    ALTER COLUMN is_special_order SET NOT NULL,
    ALTER COLUMN quantity SET DEFAULT 0,
    ALTER COLUMN quantity SET NOT NULL,
    ALTER COLUMN low_stock_threshold SET DEFAULT 5,
    ALTER COLUMN low_stock_threshold SET NOT NULL,
    ALTER COLUMN is_taxable SET DEFAULT true,
    ALTER COLUMN is_taxable SET NOT NULL,
    ALTER COLUMN minimum_quantity SET DEFAULT 0,
    ALTER COLUMN minimum_quantity SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET NOT NULL;

DROP INDEX IF EXISTS public.idx_products_category_id;
DROP INDEX IF EXISTS public.idx_products_is_disabled;
DROP INDEX IF EXISTS public.idx_products_shopsite_guid;
DROP INDEX IF EXISTS public.idx_products_shopsite_product_id;

ALTER TABLE public.products
    DROP CONSTRAINT IF EXISTS products_category_id_fkey,
    DROP COLUMN IF EXISTS is_featured,
    DROP COLUMN IF EXISTS shopsite_product_id,
    DROP COLUMN IF EXISTS shopsite_guid,
    DROP COLUMN IF EXISTS legacy_filename,
    DROP COLUMN IF EXISTS sale_price,
    DROP COLUMN IF EXISTS category_id,
    DROP COLUMN IF EXISTS compare_at_price,
    DROP COLUMN IF EXISTS cost_price,
    DROP COLUMN IF EXISTS tax_code,
    DROP COLUMN IF EXISTS barcode,
    DROP COLUMN IF EXISTS meta_title,
    DROP COLUMN IF EXISTS meta_description,
    DROP COLUMN IF EXISTS dimensions,
    DROP COLUMN IF EXISTS origin_country,
    DROP COLUMN IF EXISTS vendor,
    DROP COLUMN IF EXISTS avg_rating,
    DROP COLUMN IF EXISTS review_count,
    DROP COLUMN IF EXISTS is_disabled,
    DROP COLUMN IF EXISTS pickup_only;

COMMIT;
