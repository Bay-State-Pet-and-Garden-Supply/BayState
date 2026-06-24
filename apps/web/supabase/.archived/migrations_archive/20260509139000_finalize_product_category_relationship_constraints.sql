-- =============================================================================
-- Finalize product_categories relationship constraints
--
-- THIS MIGRATION RUNS LAST — only after import code (Tasks 19-20) is deployed
-- and writing relationship_type explicitly. Must also run after Task 8 remap
-- which selects exactly one canonical row per product.
--
-- Adds:
--   1. NOT NULL on relationship_type
--   2. CHECK constraint for valid values
--   3. Partial unique index enforcing exactly one canonical per product
--   4. Pre-flight violation check with explicit error
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Safety null backfill
-- Any remaining NULL relationship_type values get 'secondary'.
-- After Task 8 remap, every product with category rows should have exactly
-- one canonical and the rest secondary, but this handles edge cases.
-- =============================================================================

UPDATE public.product_categories
SET relationship_type = 'secondary'
WHERE relationship_type IS NULL;

-- =============================================================================
-- 2. Pre-flight violation check
-- Verify no product has more than one canonical row BEFORE creating the index.
-- If violations exist, abort with a clear message.
-- =============================================================================

DO $$
DECLARE
    violation_count integer;
    violation_details text;
BEGIN
    SELECT COUNT(*), string_agg(
        format('product_id=%s has %s canonical rows', product_id::text, cnt::text),
        E'\n'
    )
    INTO violation_count, violation_details
    FROM (
        SELECT product_id, COUNT(*) AS cnt
        FROM public.product_categories
        WHERE relationship_type = 'canonical'
        GROUP BY product_id
        HAVING COUNT(*) > 1
    ) AS dupes;

    IF violation_count > 0 THEN
        RAISE EXCEPTION 'Cannot finalize constraints: % product(s) have multiple canonical categories.%s%s',
            violation_count,
            E'\n',
            violation_details;
    END IF;
END;
$$;

-- =============================================================================
-- 3. Add CHECK constraint (DO block for IF NOT EXISTS pattern)
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.check_constraints cc
            ON tc.constraint_catalog = cc.constraint_catalog
            AND tc.constraint_schema = cc.constraint_schema
            AND tc.constraint_name = cc.constraint_name
        WHERE tc.table_schema = 'public'
            AND tc.table_name = 'product_categories'
            AND tc.constraint_name = 'product_categories_relationship_type_check'
    ) THEN
        ALTER TABLE public.product_categories
            ADD CONSTRAINT product_categories_relationship_type_check
            CHECK (relationship_type IN ('canonical', 'secondary', 'collection'));
    END IF;
END;
$$;

-- =============================================================================
-- 4. Set NOT NULL
-- =============================================================================

ALTER TABLE public.product_categories
    ALTER COLUMN relationship_type SET NOT NULL;

-- =============================================================================
-- 5. Partial unique index — exactly one canonical per product
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_one_canonical_per_product
    ON public.product_categories (product_id)
    WHERE relationship_type = 'canonical';

-- =============================================================================
-- 6. Verification queries (run manually after migration)
-- =============================================================================

-- Verify no NULL relationship_type values remain:
--   SELECT COUNT(*) FROM public.product_categories WHERE relationship_type IS NULL;
-- Expected: 0

-- Verify no product has multiple canonical categories:
--   SELECT product_id, COUNT(*) AS cnt
--   FROM public.product_categories
--   WHERE relationship_type = 'canonical'
--   GROUP BY product_id
--   HAVING COUNT(*) > 1;
-- Expected: empty result set

-- Verify the unique index was created:
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'product_categories'
--   AND indexname = 'idx_product_categories_one_canonical_per_product';
-- Expected: one row

-- Verify constraint exists:
--   SELECT tc.constraint_name, cc.check_clause
--   FROM information_schema.table_constraints tc
--   JOIN information_schema.check_constraints cc
--       ON tc.constraint_catalog = cc.constraint_catalog
--       AND tc.constraint_schema = cc.constraint_schema
--       AND tc.constraint_name = cc.constraint_name
--   WHERE tc.table_schema = 'public'
--       AND tc.table_name = 'product_categories'
--       AND tc.constraint_name = 'product_categories_relationship_type_check';
-- Expected: one row with check_clause "(relationship_type = ANY (ARRAY['canonical'::text, 'secondary'::text, 'collection'::text]))"

-- Verify generated columns are NOT NULL:
--   SELECT column_name, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--       AND table_name = 'product_categories'
--       AND column_name = 'relationship_type';
-- Expected: is_nullable = 'NO'

COMMIT;
