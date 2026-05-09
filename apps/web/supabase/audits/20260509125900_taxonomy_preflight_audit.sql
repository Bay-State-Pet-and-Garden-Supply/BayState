-- =============================================================================
-- Taxonomy Overhaul — Preflight Audit
-- Run against staging/production BEFORE migrations to baseline current state
-- and identify data that needs manual mapping before remap.
-- Read-only. Does not modify data.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Current category count and all slugs ordered by name
-- =============================================================================
SELECT '1. Category inventory' AS section;

SELECT
    COUNT(*) AS total_categories,
    COUNT(*) FILTER (WHERE parent_id IS NULL) AS top_level_count
FROM public.categories;

SELECT id, name, slug, parent_id, display_order
FROM public.categories
ORDER BY name;

-- =============================================================================
-- 2. Product counts by category
-- =============================================================================
SELECT '2. Product counts by category' AS section;

SELECT
    c.id,
    c.name,
    c.slug,
    COUNT(pc.product_id) AS product_count
FROM public.categories c
LEFT JOIN public.product_categories pc ON pc.category_id = c.id
GROUP BY c.id, c.name, c.slug
ORDER BY product_count DESC, c.name;

-- =============================================================================
-- 3. Products with multiple categories
-- =============================================================================
SELECT '3. Products with multiple categories' AS section;

WITH product_category_counts AS (
    SELECT
        product_id,
        COUNT(*) AS category_count,
        ARRAY_AGG(category_id::text ORDER BY category_id) AS category_ids,
        ARRAY_AGG(
            (SELECT name FROM public.categories WHERE id = pc.category_id)
            ORDER BY category_id
        ) AS category_names
    FROM public.product_categories pc
    GROUP BY product_id
)
SELECT
    pcc.product_id,
    p.name AS product_name,
    p.slug AS product_slug,
    pcc.category_count,
    pcc.category_ids,
    pcc.category_names
FROM product_category_counts pcc
JOIN public.products p ON p.id = pcc.product_id
WHERE pcc.category_count > 1
ORDER BY pcc.category_count DESC, p.name;

-- =============================================================================
-- 4. Category slugs NOT covered by the legacy mapping patterns
--    (These are slugs that may need manual mapping entries)
-- =============================================================================
SELECT '4. Uncovered category slugs' AS section;

WITH legacy_patterns AS (
    SELECT slug FROM public.categories
    WHERE slug ILIKE 'bird%'
       OR slug ILIKE 'fish-aquatics%'
       OR slug ILIKE 'farm-animal%'
       OR slug ILIKE 'dog%'
       OR slug ILIKE 'cat%'
       OR slug ILIKE 'small-pet%'
       OR slug ILIKE 'reptile%'
       OR slug ILIKE 'wild-bird%'
       OR slug ILIKE 'lawn-garden%'
       OR slug ILIKE 'home%'
)
SELECT
    c.id,
    c.name,
    c.slug,
    c.parent_id,
    (SELECT name FROM public.categories WHERE id = c.parent_id) AS parent_name,
    COUNT(pc.product_id) AS product_count
FROM public.categories c
LEFT JOIN public.product_categories pc ON pc.category_id = c.id
WHERE NOT EXISTS (
    SELECT 1 FROM legacy_patterns lp WHERE lp.slug = c.slug
)
GROUP BY c.id, c.name, c.slug, c.parent_id
ORDER BY c.name;

-- =============================================================================
-- 5. Current facet definitions
-- =============================================================================
SELECT '5. Facet definitions' AS section;

SELECT
    COUNT(*) AS total_facet_definitions
FROM public.facet_definitions;

SELECT id, name, slug, description, created_at
FROM public.facet_definitions
ORDER BY name;

-- =============================================================================
-- 6. Facet value counts per definition
-- =============================================================================
SELECT '6. Facet values per definition' AS section;

SELECT
    fd.id AS definition_id,
    fd.name AS definition_name,
    fd.slug AS definition_slug,
    COUNT(fv.id) AS value_count
FROM public.facet_definitions fd
LEFT JOIN public.facet_values fv ON fv.facet_definition_id = fd.id
GROUP BY fd.id, fd.name, fd.slug
ORDER BY fd.name;

-- =============================================================================
-- 7. Products with zero categories
-- =============================================================================
SELECT '7. Products with zero categories' AS section;

SELECT
    COUNT(*) AS products_without_categories
FROM public.products p
WHERE NOT EXISTS (
    SELECT 1 FROM public.product_categories pc WHERE pc.product_id = p.id
);

-- Also list them if count is reasonable (< 100)
SELECT
    p.id,
    p.name,
    p.slug,
    p.brand_id,
    b.name AS brand_name,
    p.created_at
FROM public.products p
LEFT JOIN public.brands b ON b.id = p.brand_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.product_categories pc WHERE pc.product_id = p.id
)
ORDER BY p.name
LIMIT 100;

COMMIT;
