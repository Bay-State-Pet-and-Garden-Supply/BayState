-- Add canonical_category_id to products table
-- This stores the single primary category for each product.
-- It is nullable and gets backfilled in Task 8 after remapping legacy categories.
-- A product's canonical category should match the product_categories row
-- where relationship_type = 'canonical'.

BEGIN;

-- Add canonical_category_id FK to categories
-- Stays nullable; backfilled in Task 8 by selecting one canonical row per product.
-- ON DELETE SET NULL ensures if a category is deleted, products lose only the pointer,
-- not their secondary/collection placements in product_categories.
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS canonical_category_id uuid
        REFERENCES public.categories(id) ON DELETE SET NULL;

-- Index for lookups and joins
CREATE INDEX IF NOT EXISTS idx_products_canonical_category_id
    ON public.products (canonical_category_id);

COMMIT;
