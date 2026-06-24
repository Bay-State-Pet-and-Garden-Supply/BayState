-- =============================================================================
-- Task 8: Remap existing product categories to the new retail taxonomy
--        and choose one canonical row per product.
--
-- Phase 1: Remap product_categories.category_id from old slug to new slug
--          using the same mapping logic as legacy_slug_redirects (Task 7)
--          plus prefix-based pattern matching for any unlisted slugs.
-- Phase 2: Delete duplicate (product_id, category_id) rows after remap.
-- Phase 3: Choose exactly one canonical row per product and set
--          relationship_type accordingly. Backfill products.canonical_category_id.
-- Phase 4: Deactivate legacy categories not in the new taxonomy tree.
--
-- Dependencies: Must run AFTER:
--   - Task 3 (relationship_type column exists)
--   - Task 4 (products.canonical_category_id column exists)
--   - Task 6 (new taxonomy categories seeded)
--   - Task 7 (legacy_slug_redirects — we reuse the same mapping logic)
-- =============================================================================

BEGIN;

-- ============================================================================
-- Safety check: verify that the seed taxonomy exists
-- ============================================================================

DO $$
DECLARE
    dept_count integer;
BEGIN
    SELECT count(*) INTO dept_count
    FROM public.categories
    WHERE parent_id IS NULL AND is_active = true;

    IF dept_count < 13 THEN
        RAISE WARNING 'Task 8: Only % active L1 departments found (expected 13). The seed taxonomy migration (Task 6) may not have run yet. Continuing with available mappings.',
            dept_count;
    ELSE
        RAISE NOTICE 'Task 8: Found % active L1 departments. Proceeding with remap.', dept_count;
    END IF;
END $$;

-- ============================================================================
-- Phase 1: Build slug mapping and remap product_categories
-- ============================================================================

-- Step 1a: Create a mapping from old category slugs to new category slugs.
-- We use the same explicit mapping as Task 7, plus prefix-based pattern
-- matching for any old slugs not in the explicit list.
--
-- The mapping is stored in a temp table so it can be inspected and verified.

CREATE TEMP TABLE slug_mapping (
    old_slug text NOT NULL,
    new_slug text NOT NULL
);

-- Insert explicit mappings (same as legacy_slug_redirects in Task 7)
-- #1: Pet Bird (renamed from Bird)
INSERT INTO slug_mapping (old_slug, new_slug) VALUES
    ('bird', 'pet-bird'),
    ('bird-food', 'pet-bird-food'),
    ('bird-food-treats', 'pet-bird-treats');

-- #2: Fish & Aquarium (renamed from Fish & Aquatics)
INSERT INTO slug_mapping (old_slug, new_slug) VALUES
    ('fish-aquatics', 'fish-aquarium'),
    ('fish-aquatics-food', 'fish-aquarium-fish-food'),
    ('fish-aquatics-water-care', 'fish-aquarium-water-care'),
    ('fish-aquatics-habitat-aquariums', 'fish-aquarium-aquariums-tanks');

-- #3: Reptile & Amphibian (renamed from Reptile)
INSERT INTO slug_mapping (old_slug, new_slug) VALUES
    ('reptile', 'reptile-amphibian'),
    ('reptile-food', 'reptile-amphibian-food-treats'),
    ('reptile-habitat-heating-lighting', 'reptile-amphibian-heating-lighting');

-- #4: Wild Bird & Wildlife (renamed from Wild Bird, expanded scope)
INSERT INTO slug_mapping (old_slug, new_slug) VALUES
    ('wild-bird', 'wild-bird-wildlife'),
    ('wild-bird-seed-food', 'wild-bird-wildlife-wild-bird-food'),
    ('wild-bird-seed-food-seed-blends', 'wild-bird-wildlife-wild-bird-food'),
    ('wild-bird-seed-food-suet-cakes', 'wild-bird-wildlife-suet'),
    ('wild-bird-feeders', 'wild-bird-wildlife-feeders'),
    ('wild-bird-habitat-bird-houses', 'wild-bird-wildlife-bird-houses-nesting');

-- #5: Chicken & Poultry (split from Farm Animal)
INSERT INTO slug_mapping (old_slug, new_slug) VALUES
    ('farm-animal-chicken', 'chicken-poultry'),
    ('farm-animal-chicken-coop-supplies', 'chicken-poultry-coops-runs'),
    ('farm-animal-chicken-feed', 'chicken-poultry-feed'),
    ('farm-animal-chicken-treats-supplements', 'chicken-poultry-treats');

-- #6: Horse (split from Farm Animal)
INSERT INTO slug_mapping (old_slug, new_slug) VALUES
    ('farm-animal-horse-feed', 'horse-feed'),
    ('farm-animal-horse-treats', 'horse-treats'),
    ('farm-animal-horse-fly-control', 'horse-fly-control'),
    ('farm-animal-horse-supplements', 'horse-health-supplements'),
    ('farm-animal-livestock-health-hoof-care', 'horse-grooming');

-- #7: Farm & Livestock (remaining Farm Animal after splits)
INSERT INTO slug_mapping (old_slug, new_slug) VALUES
    ('farm-animal', 'farm-livestock'),
    ('farm-animal-livestock-waterers-feeders', 'farm-livestock-feeders-waterers'),
    ('farm-animal-livestock-fencing-gates', 'farm-livestock-handling-fencing'),
    ('farm-animal-livestock-health', 'farm-livestock-health-first-aid'),
    ('farm-animal-livestock-health-dewormers', 'farm-livestock-health-first-aid'),
    ('farm-animal-livestock-health-wound-care', 'farm-livestock-health-first-aid'),
    ('farm-animal-goat-sheep', 'farm-livestock'),
    ('farm-animal-goat-sheep-supplements', 'farm-livestock-supplements-minerals'),
    ('farm-animal-goat-sheep-feed', 'farm-livestock-feed');

-- #8: Home & Heating (split and renamed from Household/Home)
INSERT INTO slug_mapping (old_slug, new_slug) VALUES
    ('home', 'home-heating'),
    ('home-heating-fuel', 'home-heating-heating-fuel'),
    ('home-cleaning-pest-control', 'home-heating-cleaning-supplies'),
    ('home-cleaning-pest-control-indoor-pest-control', 'home-heating-pest-control'),
    ('home-storage-utility', 'home-heating-storage-utility'),
    ('home-storage-utility-trash-bags', 'home-heating-cleaning-supplies');

-- #9: Dog category slug corrections
INSERT INTO slug_mapping (old_slug, new_slug) VALUES
    ('dog-beds-crates-beds', 'dog-beds-furniture'),
    ('dog-beds-crates-crates-kennels', 'dog-crates-kennels-gates'),
    ('dog-bowls-feeding-supplies', 'dog-bowls-feeders'),
    ('dog-walk-train-collars', 'dog-collars-leashes-harnesses'),
    ('dog-walk-train-training-behavior', 'dog-training-behavior'),
    ('dog-waste-cleanup', 'dog-cleaning-potty'),
    ('dog-clothing', 'dog-apparel'),
    ('dog-health-wellness-flea-tick', 'dog-flea-tick'),
    ('dog-treats', 'dog-treats-chews'),
    ('dog-treats-biscuits-crunchy-treats', 'dog-treats-chews-biscuits'),
    ('dog-treats-jerky-chews', 'dog-treats-chews-jerky'),
    ('dog-treats-dental-treats', 'dog-treats-chews-dental-treats'),
    ('dog-toys-plush-squeaky-toys', 'dog-toys-plush');

-- #10: Cat category slug corrections
INSERT INTO slug_mapping (old_slug, new_slug) VALUES
    ('cat-litter-housebreaking', 'cat-litter'),
    ('cat-litter-housebreaking-litter-boxes-accessories', 'cat-litter-boxes-accessories'),
    ('cat-scratchers-furniture', 'cat-trees-scratchers-furniture'),
    ('cat-scratchers-furniture-scratchers', 'cat-trees-scratchers-furniture'),
    ('cat-health-wellness-flea-tick', 'cat-flea-tick');

-- #11: Small Pet category slug corrections
INSERT INTO slug_mapping (old_slug, new_slug) VALUES
    ('small-pet-health-wellness', 'small-pet-health-grooming'),
    ('small-pet-health-wellness-grooming', 'small-pet-health-grooming'),
    ('small-pet-habitats-accessories', 'small-pet-cages-habitats'),
    ('small-pet-hay-forage', 'small-pet-hay'),
    ('small-pet-treats-chews-treats', 'small-pet-treats-chews');

-- #12: Lawn & Garden slug simplifications
INSERT INTO slug_mapping (old_slug, new_slug) VALUES
    ('lawn-garden-fertilizers-plant-food', 'lawn-garden-fertilizer'),
    ('lawn-garden-gardening-tools', 'lawn-garden-garden-tools'),
    ('lawn-garden-grass-seed-lawn-repair-grass-seed', 'lawn-garden-grass-seed'),
    ('lawn-garden-pest-weed-control', 'lawn-garden-weed-pest-control'),
    ('lawn-garden-pest-weed-control-animal-repellents', 'lawn-garden-weed-pest-control'),
    ('lawn-garden-pest-weed-control-weed-control', 'lawn-garden-weed-pest-control'),
    ('lawn-garden-planters-seed-starting-planters-pots', 'lawn-garden-planters-supplies'),
    ('lawn-garden-planters-seed-starting-seed-starting', 'lawn-garden-garden-seeds-plants');

-- Also add the Pets-R-Us banner/promo categories that may have been created
INSERT INTO slug_mapping (old_slug, new_slug) VALUES
    ('pets', 'dog'),
    ('bird-supplies', 'pet-bird'),
    ('dog-food-wet-food', 'dog-food'),
    ('dog-food-dry-food', 'dog-food'),
    ('dog-beds', 'dog-beds-furniture'),
    ('cat-food-wet-food', 'cat-food'),
    ('cat-food-dry-food', 'cat-food'),
    ('pond', 'fish-aquarium'),
    ('aquarium', 'fish-aquarium'),
    ('small-animal', 'small-pet'),
    ('poultry', 'chicken-poultry'),
    ('livestock', 'farm-livestock');

-- Create index on the temp table for faster lookups
CREATE INDEX ON slug_mapping (old_slug);

-- Report mapping count
DO $$
DECLARE
    mapping_count integer;
BEGIN
    SELECT count(*) INTO mapping_count FROM slug_mapping;
    RAISE NOTICE 'Task 8 Phase 1: Loaded % explicit slug mappings', mapping_count;
END $$;

-- ============================================================================
-- Step 1b: Apply the explicit mapping to product_categories.
-- For each row, join the old category slug, look up the new slug in our
-- mapping table, then find the new category ID and update.
-- ============================================================================

-- Use a temp table to capture what will be remapped
CREATE TEMP TABLE remap_candidates AS
SELECT
    pc.product_id,
    pc.category_id AS old_category_id,
    old_cat.slug AS old_slug,
    m.new_slug,
    new_cat.id AS new_category_id
FROM public.product_categories pc
INNER JOIN public.categories old_cat ON old_cat.id = pc.category_id
INNER JOIN slug_mapping m ON m.old_slug = old_cat.slug
LEFT JOIN public.categories new_cat ON new_cat.slug = m.new_slug AND new_cat.is_active = true;

-- Report
DO $$
DECLARE
    explicit_match bigint;
    no_target bigint;
BEGIN
    SELECT count(*) INTO explicit_match FROM remap_candidates WHERE new_category_id IS NOT NULL;
    SELECT count(*) INTO no_target FROM remap_candidates WHERE new_category_id IS NULL;
    RAISE NOTICE 'Task 8 Phase 1: % rows match explicit mapping with valid target, % rows have no target category',
        explicit_match, no_target;

    IF no_target > 0 THEN
        RAISE WARNING 'Task 8 Phase 1: % product_categories rows could not find the target category. New slugs: %',
            no_target, (SELECT array_agg(DISTINCT new_slug) FROM remap_candidates WHERE new_category_id IS NULL);
    END IF;
END $$;

-- Collect all remap candidates into a single temp table (avoiding duplicate keys)
-- We collect pairs here, dedup, then apply in one pass.

DROP TABLE IF EXISTS remap_candidates;
CREATE TEMP TABLE remap_candidates AS
SELECT DISTINCT ON (pc.product_id, rc.new_category_id)
    pc.product_id,
    pc.category_id AS old_category_id,
    rc.new_category_id
FROM public.product_categories pc
INNER JOIN public.categories old_cat ON old_cat.id = pc.category_id
INNER JOIN slug_mapping m ON m.old_slug = old_cat.slug
LEFT JOIN public.categories new_cat ON new_cat.slug = m.new_slug AND new_cat.is_active = true
CROSS JOIN LATERAL (VALUES (new_cat.id)) AS rc(new_category_id)
WHERE rc.new_category_id IS NOT NULL
  AND old_cat.id != rc.new_category_id;

-- Add prefix-based fallback candidates (bird→pet-bird, fish-aquatics→fish-aquarium, etc.)
INSERT INTO remap_candidates (product_id, old_category_id, new_category_id)
SELECT DISTINCT ON (pc.product_id, new_cat.id)
    pc.product_id,
    old_cat.id AS old_category_id,
    new_cat.id AS new_category_id
FROM public.product_categories pc
INNER JOIN public.categories old_cat ON old_cat.id = pc.category_id
INNER JOIN public.categories new_cat
    ON new_cat.slug = replace(old_cat.slug, 'bird', 'pet-bird')
    AND new_cat.is_active = true
    AND new_cat.department_key = 'pet-bird'
WHERE old_cat.slug LIKE 'bird%'
  AND old_cat.slug NOT LIKE 'pet-bird%'
  AND old_cat.slug NOT LIKE 'wild-bird%'
  AND old_cat.id != new_cat.id
  AND NOT EXISTS (SELECT 1 FROM remap_candidates rc WHERE rc.product_id = pc.product_id AND rc.old_category_id = old_cat.id)
ON CONFLICT DO NOTHING;

INSERT INTO remap_candidates (product_id, old_category_id, new_category_id)
SELECT DISTINCT ON (pc.product_id, new_cat.id)
    pc.product_id,
    old_cat.id AS old_category_id,
    new_cat.id AS new_category_id
FROM public.product_categories pc
INNER JOIN public.categories old_cat ON old_cat.id = pc.category_id
INNER JOIN public.categories new_cat
    ON new_cat.slug = replace(old_cat.slug, 'fish-aquatics', 'fish-aquarium')
    AND new_cat.is_active = true
    AND new_cat.department_key = 'fish-aquarium'
WHERE old_cat.slug LIKE 'fish-aquatics%'
  AND old_cat.id != new_cat.id
  AND NOT EXISTS (SELECT 1 FROM remap_candidates rc WHERE rc.product_id = pc.product_id AND rc.old_category_id = old_cat.id)
ON CONFLICT DO NOTHING;

INSERT INTO remap_candidates (product_id, old_category_id, new_category_id)
SELECT DISTINCT ON (pc.product_id, new_cat.id)
    pc.product_id,
    old_cat.id AS old_category_id,
    new_cat.id AS new_category_id
FROM public.product_categories pc
INNER JOIN public.categories old_cat ON old_cat.id = pc.category_id
INNER JOIN public.categories new_cat
    ON new_cat.slug = replace(old_cat.slug, 'reptile', 'reptile-amphibian')
    AND new_cat.is_active = true
    AND new_cat.department_key = 'reptile-amphibian'
WHERE old_cat.slug LIKE 'reptile%'
  AND old_cat.id != new_cat.id
  AND NOT EXISTS (SELECT 1 FROM remap_candidates rc WHERE rc.product_id = pc.product_id AND rc.old_category_id = old_cat.id)
ON CONFLICT DO NOTHING;

INSERT INTO remap_candidates (product_id, old_category_id, new_category_id)
SELECT DISTINCT ON (pc.product_id, new_cat.id)
    pc.product_id,
    old_cat.id AS old_category_id,
    new_cat.id AS new_category_id
FROM public.product_categories pc
INNER JOIN public.categories old_cat ON old_cat.id = pc.category_id
INNER JOIN public.categories new_cat
    ON new_cat.slug = replace(old_cat.slug, 'wild-bird', 'wild-bird-wildlife')
    AND new_cat.is_active = true
    AND new_cat.department_key = 'wild-bird-wildlife'
WHERE old_cat.slug LIKE 'wild-bird%'
  AND old_cat.id != new_cat.id
  AND NOT EXISTS (SELECT 1 FROM remap_candidates rc WHERE rc.product_id = pc.product_id AND rc.old_category_id = old_cat.id)
ON CONFLICT DO NOTHING;

-- Farm Animal → Chicken & Poultry
INSERT INTO remap_candidates (product_id, old_category_id, new_category_id)
SELECT DISTINCT ON (pc.product_id, new_cat.id)
    pc.product_id,
    old_cat.id AS old_category_id,
    new_cat.id AS new_category_id
FROM public.product_categories pc
INNER JOIN public.categories old_cat ON old_cat.id = pc.category_id
INNER JOIN public.categories new_cat
    ON new_cat.slug = replace(old_cat.slug, 'farm-animal-chicken', 'chicken-poultry')
    AND new_cat.is_active = true
    AND new_cat.department_key = 'chicken-poultry'
WHERE pc.category_id = old_cat.id
  AND old_cat.slug LIKE 'farm-animal-chicken%'
  AND old_cat.id != new_cat.id;

-- Farm Animal → Horse
INSERT INTO remap_candidates (product_id, old_category_id, new_category_id)
SELECT DISTINCT ON (pc.product_id, new_cat.id)
    pc.product_id,
    old_cat.id AS old_category_id,
    new_cat.id AS new_category_id
FROM public.product_categories pc
INNER JOIN public.categories old_cat ON old_cat.id = pc.category_id
INNER JOIN public.categories new_cat
    ON new_cat.slug = replace(old_cat.slug, 'farm-animal-horse', 'horse')
    AND new_cat.is_active = true
    AND (new_cat.department_key = 'horse' OR new_cat.slug LIKE 'horse%')
WHERE old_cat.slug LIKE 'farm-animal-horse%'
  AND old_cat.id != new_cat.id
  AND NOT EXISTS (SELECT 1 FROM remap_candidates rc WHERE rc.product_id = pc.product_id AND rc.old_category_id = old_cat.id)
ON CONFLICT DO NOTHING;

-- Farm Animal → Farm & Livestock
INSERT INTO remap_candidates (product_id, old_category_id, new_category_id)
SELECT DISTINCT ON (pc.product_id, new_cat.id)
    pc.product_id,
    old_cat.id AS old_category_id,
    new_cat.id AS new_category_id
FROM public.product_categories pc
INNER JOIN public.categories old_cat ON old_cat.id = pc.category_id
INNER JOIN public.categories new_cat
    ON new_cat.slug = replace(old_cat.slug, 'farm-animal', 'farm-livestock')
    AND new_cat.is_active = true
    AND new_cat.department_key = 'farm-livestock'
WHERE old_cat.slug LIKE 'farm-animal%'
  AND old_cat.id != new_cat.id
  AND NOT EXISTS (SELECT 1 FROM remap_candidates rc WHERE rc.product_id = pc.product_id AND rc.old_category_id = old_cat.id)
ON CONFLICT DO NOTHING;

-- Home → Home & Heating
INSERT INTO remap_candidates (product_id, old_category_id, new_category_id)
SELECT DISTINCT ON (pc.product_id, new_cat.id)
    pc.product_id,
    old_cat.id AS old_category_id,
    new_cat.id AS new_category_id
FROM public.product_categories pc
INNER JOIN public.categories old_cat ON old_cat.id = pc.category_id
INNER JOIN public.categories new_cat
    ON new_cat.slug = replace(old_cat.slug, 'home', 'home-heating')
    AND new_cat.is_active = true
    AND new_cat.department_key = 'home-heating'
WHERE old_cat.slug LIKE 'home%'
  AND old_cat.slug NOT LIKE 'home-heating%'
  AND old_cat.id != new_cat.id
  AND NOT EXISTS (SELECT 1 FROM remap_candidates rc WHERE rc.product_id = pc.product_id AND rc.old_category_id = old_cat.id)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Apply all remap candidates to product_categories
-- Strategy: rebuild product_categories for affected products from scratch.
-- This avoids all duplicate-key problems from in-place updates.
-- ============================================================================

-- Step 1: Build a clean set of (product_id, category_id) pairs for remapped products.
-- Include: the remapped pairs (deduped) + any existing pairs that had no remap target.

CREATE TEMP TABLE remapped_product_categories AS
SELECT DISTINCT ON (pc.product_id, COALESCE(rc.new_category_id, pc.category_id))
    pc.product_id,
    COALESCE(rc.new_category_id, pc.category_id) AS category_id
FROM public.product_categories pc
LEFT JOIN remap_candidates rc
    ON rc.product_id = pc.product_id
   AND rc.old_category_id = pc.category_id
WHERE pc.product_id IN (SELECT DISTINCT product_id FROM remap_candidates);

-- Step 2: Delete old rows for affected products
DELETE FROM public.product_categories
WHERE product_id IN (SELECT DISTINCT product_id FROM remap_candidates);

-- Step 3: Re-insert clean deduplicated rows
INSERT INTO public.product_categories (product_id, category_id)
SELECT product_id, category_id FROM remapped_product_categories;

DROP TABLE IF EXISTS remapped_product_categories;

-- Report remaining unmapped categories
DO $$
DECLARE
    remaining bigint;
BEGIN
    SELECT count(DISTINCT c.id) INTO remaining
    FROM public.product_categories pc
    INNER JOIN public.categories c ON c.id = pc.category_id
    LEFT JOIN public.categories new_cat ON new_cat.id = pc.category_id AND new_cat.department_key IS NOT NULL
    WHERE new_cat.id IS NULL;

    IF remaining > 0 THEN
        RAISE WARNING 'Task 8 Phase 1: % product_categories rows still reference categories without a department_key (not in new taxonomy). These will be handled in Phase 4.',
            remaining;
    END IF;
END $$;

-- ============================================================================
-- Phase 2: Delete duplicate (product_id, category_id) rows after remap
-- ============================================================================

DO $$
DECLARE
    dup_count integer;
BEGIN
    -- Find duplicates (same product_id + category_id after remap) and keep one
    WITH dups AS (
        SELECT ctid, product_id, category_id,
               row_number() OVER (
                   PARTITION BY product_id, category_id
                   ORDER BY ctid
               ) AS rn
        FROM public.product_categories
    )
    DELETE FROM public.product_categories
    WHERE ctid IN (
        SELECT ctid FROM dups WHERE rn > 1
    );

    GET DIAGNOSTICS dup_count = ROW_COUNT;
    RAISE NOTICE 'Task 8 Phase 2: Removed % duplicate product_categories rows', dup_count;
END $$;

-- ============================================================================
-- Phase 3: Choose one canonical row per product and set relationship_type
-- ============================================================================

-- Step 3a: Rank each product's categories by depth (deepest wins), then
-- sort_order, then slug for tie-breaking.

DO $$
DECLARE
    canonical_count integer;
    secondary_count integer;
    multi_product bigint;
BEGIN
    -- Rank rows within each product
    WITH ranked AS (
        SELECT
            pc.product_id,
            pc.category_id,
            c.depth,
            c.sort_order,
            c.slug,
            c.breadcrumb,
            row_number() OVER (
                PARTITION BY pc.product_id
                ORDER BY
                    c.depth DESC NULLS LAST,
                    c.sort_order ASC NULLS LAST,
                    c.slug ASC
            ) AS category_rank
        FROM public.product_categories pc
        INNER JOIN public.categories c ON c.id = pc.category_id
        WHERE c.is_active = true
    )
    UPDATE public.product_categories pc
    SET relationship_type = CASE
        WHEN r.category_rank = 1 THEN 'canonical'
        ELSE 'secondary'
    END
    FROM ranked r
    WHERE pc.product_id = r.product_id
      AND pc.category_id = r.category_id;

    GET DIAGNOSTICS canonical_count = ROW_COUNT;

    -- Report distribution
    SELECT count(*) INTO multi_product
    FROM (
        SELECT product_id
        FROM public.product_categories
        WHERE relationship_type = 'canonical'
        GROUP BY product_id
        HAVING count(*) > 1
    ) x;

    IF multi_product > 0 THEN
        RAISE WARNING 'Task 8 Phase 3: % products have MORE THAN ONE canonical row! This should not happen after ranking.',
            multi_product;
    ELSE
        RAISE NOTICE 'Task 8 Phase 3: No products have duplicate canonical rows — ranking is correct.';
    END IF;

    SELECT count(*) INTO secondary_count
    FROM public.product_categories
    WHERE relationship_type = 'secondary';

    RAISE NOTICE 'Task 8 Phase 3: Set % rows to canonical, % rows to secondary',
        (SELECT count(*) FROM public.product_categories WHERE relationship_type = 'canonical'),
        secondary_count;
END $$;

-- ============================================================================
-- Phase 3 (continued): Backfill products.canonical_category_id
-- ============================================================================

-- For each product that has a canonical product_categories row, set
-- products.canonical_category_id to the canonical row's category_id.
-- If a product has multiple canonical rows (shouldn't happen after ranking),
-- pick the one with the deepest depth.

UPDATE public.products p
SET canonical_category_id = ranked.category_id
FROM (
    SELECT DISTINCT ON (pc.product_id)
        pc.product_id,
        pc.category_id
    FROM public.product_categories pc
    INNER JOIN public.categories c ON c.id = pc.category_id
    WHERE pc.relationship_type = 'canonical'
    ORDER BY pc.product_id, c.depth DESC NULLS LAST, c.sort_order ASC NULLS LAST, c.slug ASC
) ranked
WHERE p.id = ranked.product_id;

DO $$
DECLARE
    backfill_count integer;
    total_products bigint;
    without_canonical bigint;
BEGIN
    SELECT count(*) INTO backfill_count
    FROM public.products
    WHERE canonical_category_id IS NOT NULL;

    SELECT count(*) INTO total_products
    FROM public.products;

    SELECT count(*) INTO without_canonical
    FROM public.products
    WHERE canonical_category_id IS NULL;

    RAISE NOTICE 'Task 8 Phase 3: Backfilled canonical_category_id for % of % products. % products still have NULL (may have no category assignments).',
        backfill_count, total_products, without_canonical;
END $$;

-- ============================================================================
-- Phase 4: Deactivate legacy categories not in the new taxonomy
-- ============================================================================

-- Deactivate any category that:
--   1. Has no department_key (was never part of the new taxonomy)
--   2. Has no remaining product_categories references after remap
--   3. Is not in the 13 active L1 department subtrees

WITH RECURSIVE new_dept_ids AS (
    -- Get all categories in the new taxonomy (13 departments and their descendants)
    SELECT id, slug, department_key
    FROM public.categories
    WHERE parent_id IS NULL AND is_active = true
      AND slug IN (
          'dog', 'cat', 'small-pet', 'pet-bird', 'fish-aquarium',
          'reptile-amphibian', 'wild-bird-wildlife', 'chicken-poultry',
          'horse', 'farm-livestock', 'lawn-garden', 'home-heating', 'tools-hardware'
      )
    UNION ALL
    SELECT c.id, c.slug, c.department_key
    FROM public.categories c
    INNER JOIN new_dept_ids nd ON c.parent_id = nd.id
)
UPDATE public.categories c
SET is_active = false,
    updated_at = now()
FROM (
    -- Categories that are NOT in the new taxonomy tree
    SELECT oc.id
    FROM public.categories oc
    LEFT JOIN new_dept_ids nd ON nd.id = oc.id
    WHERE nd.id IS NULL
      -- Must have department_key IS NULL or not match the 13 dept keys
      AND (oc.department_key IS NULL OR oc.department_key NOT IN (
          'dog', 'cat', 'small-pet', 'pet-bird', 'fish-aquarium',
          'reptile-amphibian', 'wild-bird-wildlife', 'chicken-poultry',
          'horse', 'farm-livestock', 'lawn-garden', 'home-heating', 'tools-hardware'
      ))
      -- Don't deactivate if they still have product references (safety net)
      AND EXISTS (
          SELECT 1 FROM public.product_categories pc
          WHERE pc.category_id = oc.id
      ) = false
      -- Don't deactivate if they're already inactive
      AND oc.is_active = true
) legacy
WHERE c.id = legacy.id;

DO $$
DECLARE
    deactivated_count integer;
BEGIN
    GET DIAGNOSTICS deactivated_count = ROW_COUNT;
    RAISE NOTICE 'Task 8 Phase 4: Deactivated % legacy categories (no products, not in new taxonomy)', deactivated_count;
END $$;

-- ============================================================================
-- Final verification report
-- ============================================================================

DO $$
DECLARE
    -- Overall product mapping stats
    total_pc_rows bigint;
    canonical_rows bigint;
    secondary_rows bigint;
    products_with_canonical bigint;
    products_without_canonical bigint;

    -- Legacy category stats
    legacy_categories bigint;
    active_categories bigint;
    total_categories bigint;

    -- Problem detection
    unmapped_pc_rows bigint;
    legacy_pc_rows bigint;
BEGIN
    -- Product categories stats
    SELECT count(*) INTO total_pc_rows FROM public.product_categories;
    SELECT count(*) INTO canonical_rows FROM public.product_categories WHERE relationship_type = 'canonical';
    SELECT count(*) INTO secondary_rows FROM public.product_categories WHERE relationship_type = 'secondary';
    SELECT count(*) INTO products_with_canonical FROM public.products WHERE canonical_category_id IS NOT NULL;
    SELECT count(*) INTO products_without_canonical FROM public.products WHERE canonical_category_id IS NULL;

    -- Check for any product_categories that still point to inactive categories
    SELECT count(*) INTO unmapped_pc_rows
    FROM public.product_categories pc
    INNER JOIN public.categories c ON c.id = pc.category_id
    WHERE c.is_active = false;

    -- Check for product_categories pointing to categories outside the new taxonomy
    SELECT count(*) INTO legacy_pc_rows
    FROM public.product_categories pc
    INNER JOIN public.categories c ON c.id = pc.category_id
    WHERE c.department_key IS NULL OR c.department_key NOT IN (
        'dog', 'cat', 'small-pet', 'pet-bird', 'fish-aquarium',
        'reptile-amphibian', 'wild-bird-wildlife', 'chicken-poultry',
        'horse', 'farm-livestock', 'lawn-garden', 'home-heating', 'tools-hardware'
    );

    -- Category stats
    SELECT count(*) INTO total_categories FROM public.categories;
    SELECT count(*) INTO active_categories FROM public.categories WHERE is_active = true;
    SELECT count(*) INTO legacy_categories FROM public.categories WHERE is_active = false;

    -- Final report
    RAISE NOTICE '=== Task 8 Final Report ===';
    RAISE NOTICE 'Product categories: % total, % canonical, % secondary',
        total_pc_rows, canonical_rows, secondary_rows;
    RAISE NOTICE 'Products with canonical_category_id: % / %',
        products_with_canonical, products_without_canonical + products_with_canonical;
    RAISE NOTICE 'Categories: % total, % active, % inactive (legacy)',
        total_categories, active_categories, legacy_categories;

    IF unmapped_pc_rows > 0 THEN
        RAISE WARNING '⚠ % product_categories rows still point to INACTIVE (removed) categories!', unmapped_pc_rows;
    ELSE
        RAISE NOTICE '✅ No product_categories rows point to inactive categories.';
    END IF;

    IF legacy_pc_rows > 0 THEN
        RAISE WARNING '⚠ % product_categories rows still reference categories OUTSIDE the new taxonomy (no department_key or unknown dept)!', legacy_pc_rows;
    ELSE
        RAISE NOTICE '✅ All product_categories reference categories within the new taxonomy.';
    END IF;

    IF products_without_canonical = products_with_canonical + products_without_canonical THEN
        RAISE NOTICE 'ℹ All % products have no canonical category (no category assignments). This is normal if products are uncategorized.', products_without_canonical;
    END IF;

    RAISE NOTICE '===============================';
END $$;

COMMIT;
