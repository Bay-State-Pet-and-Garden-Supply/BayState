-- =============================================================================
-- Taxonomy Overhaul — Add category metadata columns
-- Adds department_key, depth, breadcrumb, facet_profile, SEO fields,
-- sort_order, is_active, and synonym_keywords to the categories table.
-- Backfills computed values for existing rows.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Add new columns (IF NOT EXISTS for idempotency)
-- =============================================================================

ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS department_key text,
    ADD COLUMN IF NOT EXISTS depth integer,
    ADD COLUMN IF NOT EXISTS breadcrumb text,
    ADD COLUMN IF NOT EXISTS facet_profile text,
    ADD COLUMN IF NOT EXISTS seo_title text,
    ADD COLUMN IF NOT EXISTS seo_description text,
    ADD COLUMN IF NOT EXISTS sort_order integer;

-- Synonym keywords as text array
ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS synonym_keywords text[] NOT NULL DEFAULT '{}';

-- Active flag for soft-deletion/hiding legacy rows
ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- =============================================================================
-- 2. Backfill sort_order from display_order for existing rows
-- =============================================================================

UPDATE public.categories
SET sort_order = display_order
WHERE sort_order IS NULL AND display_order IS NOT NULL;

-- Where display_order was also null, default to 0
UPDATE public.categories
SET sort_order = 0
WHERE sort_order IS NULL;

-- =============================================================================
-- 3. Backfill depth and breadcrumb via recursive CTE
-- The CTE walks the parent_id hierarchy to compute cached depth and breadcrumb.
-- =============================================================================

WITH RECURSIVE category_tree AS (
    -- Anchor: top-level categories (no parent)
    SELECT
        id,
        parent_id,
        name,
        0 AS depth,
        name AS breadcrumb
    FROM public.categories
    WHERE parent_id IS NULL

    UNION ALL

    -- Recursive: children join on parent
    SELECT
        c.id,
        c.parent_id,
        c.name,
        ct.depth + 1,
        ct.breadcrumb || ' > ' || c.name
    FROM public.categories c
    INNER JOIN category_tree ct ON ct.id = c.parent_id
)
UPDATE public.categories AS c
SET
    depth = ct.depth,
    breadcrumb = ct.breadcrumb
FROM category_tree ct
WHERE c.id = ct.id
  AND (
      c.depth IS DISTINCT FROM ct.depth
      OR c.breadcrumb IS DISTINCT FROM ct.breadcrumb
  );

-- Handle orphan rows (those whose parent_id reference does not exist)
-- These get depth 0 and breadcrumb = name as a safe fallback.
UPDATE public.categories
SET
    depth = 0,
    breadcrumb = name
WHERE depth IS NULL OR breadcrumb IS NULL;

-- =============================================================================
-- 4. Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_categories_department_key
    ON public.categories (department_key);

CREATE INDEX IF NOT EXISTS idx_categories_depth
    ON public.categories (depth);

CREATE INDEX IF NOT EXISTS idx_categories_facet_profile
    ON public.categories (facet_profile);

CREATE INDEX IF NOT EXISTS idx_categories_breadcrumb
    ON public.categories (breadcrumb);

CREATE INDEX IF NOT EXISTS idx_categories_is_active
    ON public.categories (is_active);

CREATE INDEX IF NOT EXISTS idx_categories_sort_order
    ON public.categories (sort_order);

-- =============================================================================
-- 5. Check constraints
-- =============================================================================

ALTER TABLE public.categories
    ADD CONSTRAINT categories_depth_non_negative
    CHECK (depth >= 0);

ALTER TABLE public.categories
    ADD CONSTRAINT categories_facet_profile_valid
    CHECK (
        facet_profile IS NULL
        OR facet_profile = ANY (ARRAY[
            'animal_food',
            'animal_treats_chews',
            'animal_feed_farm',
            'animal_health_wellness',
            'animal_toys_enrichment',
            'animal_habitat_containment',
            'animal_litter_bedding',
            'grooming_cleaning',
            'aquarium_equipment',
            'reptile_equipment',
            'garden_consumable',
            'garden_equipment',
            'home_heating',
            'hardware_tools',
            'general'
        ])
    );

COMMIT;
