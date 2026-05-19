-- Auto-create singleton product groups for existing products
-- This migration ensures all existing products have their own group
-- to maintain backwards compatibility with the new grouping system.

BEGIN;

-- ============================================================================
-- 1. Check if products already have groups
-- ============================================================================

-- Count products that are already in any group
DO $$
DECLARE
    grouped_count integer;
    total_products integer;
BEGIN
    SELECT COUNT(DISTINCT product_id) INTO grouped_count FROM product_group_products;
    SELECT COUNT(*) INTO total_products FROM products;

    RAISE NOTICE 'Products already in groups: % / %', grouped_count, total_products;

    -- Only proceed if we have products but no groups yet
    IF grouped_count = 0 AND total_products > 0 THEN
        RAISE NOTICE 'Creating singleton groups for all products...';
    ELSE
        RAISE NOTICE 'Skipping singleton group creation (groups already exist)';
    END IF;
END $$;

-- ============================================================================
-- 2. Create singleton groups for products not in any group
-- ============================================================================

-- Insert groups for products that don't have one yet
INSERT INTO product_groups (slug, name, description, is_active, created_at, updated_at)
SELECT
    p.slug AS slug,
    p.name AS name,
    NULL AS description,
    true AS is_active,
    NOW() AS created_at,
    NOW() AS updated_at
FROM products p
WHERE NOT EXISTS (
    SELECT 1 FROM product_group_products pgp
    WHERE pgp.product_id = p.id
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 3. Create group memberships for products
-- ============================================================================

-- Insert into junction table for products without groups
INSERT INTO product_group_products (group_id, product_id, sort_order, is_default, created_at)
SELECT
    pg.id AS group_id,
    p.id AS product_id,
    0 AS sort_order,
    true AS is_default,
    NOW() AS created_at
FROM products p
INNER JOIN product_groups pg ON pg.slug = p.slug
WHERE NOT EXISTS (
    SELECT 1 FROM product_group_products pgp
    WHERE pgp.product_id = p.id
);

-- ============================================================================
-- 4. Update group default_product_id
-- ============================================================================

UPDATE product_groups pg
SET default_product_id = (
    SELECT pgp.product_id
    FROM product_group_products pgp
    WHERE pgp.group_id = pg.id AND pgp.is_default = true
    LIMIT 1
)
WHERE pg.default_product_id IS NULL;

-- ============================================================================
-- 5. Verification
-- ============================================================================

DO $$
DECLARE
    group_count integer;
    member_count integer;
BEGIN
    SELECT COUNT(*) INTO group_count FROM product_groups;
    SELECT COUNT(*) INTO member_count FROM product_group_products;

    RAISE NOTICE '=== Product Groups Migration Complete ===';
    RAISE NOTICE 'Total groups created: %', group_count;
    RAISE NOTICE 'Total group memberships: %', member_count;
END $$;

COMMIT;

-- ============================================================================
-- Rollback Script (if needed)
-- ============================================================================

-- To rollback, run:
-- BEGIN;
-- DELETE FROM product_group_products;
-- DELETE FROM product_groups;
-- COMMIT;
