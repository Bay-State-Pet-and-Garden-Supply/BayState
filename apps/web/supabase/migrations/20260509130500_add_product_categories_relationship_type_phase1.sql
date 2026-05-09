-- Add relationship_type to product_categories (phase 1)
-- Phase 1 adds the column and index without constraints.
-- NOT NULL, CHECK, and the partial unique canonical index come in Task 10
-- after import code is updated to write relationship_type explicitly.

BEGIN;

-- Add relationship_type column with default 'canonical'
-- All existing rows get 'canonical' by default; Task 8 remap will promote
-- exactly one row per product to canonical and set the rest to secondary.
ALTER TABLE public.product_categories
    ADD COLUMN IF NOT EXISTS relationship_type text DEFAULT 'canonical';

-- Non-unique index for filtering by relationship type
-- A partial unique index (one canonical per product) is added in Task 10.
CREATE INDEX IF NOT EXISTS idx_product_categories_relationship_type
    ON public.product_categories (relationship_type);

COMMIT;
