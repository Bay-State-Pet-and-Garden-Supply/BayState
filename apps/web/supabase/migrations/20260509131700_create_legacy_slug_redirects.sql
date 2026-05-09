-- Create legacy_slug_redirects table and populate old-to-new category slug mappings.
-- This enables 301 redirects from old taxonomy slugs (from the ShopSite import era)
-- to the new 13-department retail taxonomy. See taxonomy-plan-v2.md Task 7.
--
-- Dependencies: Must run AFTER seed_retail_taxonomy_and_pet_types.sql (Task 6).
-- The WHERE EXISTS guards ensure silent skip if target slug doesn't exist yet.

BEGIN;

-- ============================================================================
-- Part A: Create table and RLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.legacy_slug_redirects (
    old_slug text PRIMARY KEY,
    new_category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.legacy_slug_redirects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to legacy_slug_redirects" ON public.legacy_slug_redirects;
CREATE POLICY "Allow public read access to legacy_slug_redirects"
    ON public.legacy_slug_redirects FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Allow admin write access to legacy_slug_redirects" ON public.legacy_slug_redirects;
CREATE POLICY "Allow admin write access to legacy_slug_redirects"
    ON public.legacy_slug_redirects FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

CREATE INDEX IF NOT EXISTS idx_legacy_slug_redirects_new_category_id
    ON public.legacy_slug_redirects (new_category_id);

-- ============================================================================
-- Part B: Populate old → new slug mappings
-- ============================================================================
-- Each block uses a VALUES CTE + INSERT SELECT to resolve new slug → category ID.
-- WHERE EXISTS guards skip mappings when the target slug hasn't been seeded yet.
-- ON CONFLICT DO NOTHING handles any duplicate old_slug entries safely.

-- #1: Pet Bird (renamed from Bird)
INSERT INTO legacy_slug_redirects (old_slug, new_category_id)
SELECT m.old_slug, c.id
FROM (VALUES
    ('bird', 'pet-bird'),
    ('bird-food', 'pet-bird-food'),
    ('bird-food-treats', 'pet-bird-treats')
) AS m(old_slug, new_slug)
INNER JOIN categories c ON c.slug = m.new_slug AND c.is_active = true
ON CONFLICT (old_slug) DO NOTHING;

-- #2: Fish & Aquarium (renamed from Fish & Aquatics)
INSERT INTO legacy_slug_redirects (old_slug, new_category_id)
SELECT m.old_slug, c.id
FROM (VALUES
    ('fish-aquatics', 'fish-aquarium'),
    ('fish-aquatics-food', 'fish-aquarium-fish-food'),
    ('fish-aquatics-water-care', 'fish-aquarium-water-care'),
    ('fish-aquatics-habitat-aquariums', 'fish-aquarium-aquariums-tanks')
) AS m(old_slug, new_slug)
INNER JOIN categories c ON c.slug = m.new_slug AND c.is_active = true
ON CONFLICT (old_slug) DO NOTHING;

-- #3: Reptile & Amphibian (renamed from Reptile)
INSERT INTO legacy_slug_redirects (old_slug, new_category_id)
SELECT m.old_slug, c.id
FROM (VALUES
    ('reptile', 'reptile-amphibian'),
    ('reptile-food', 'reptile-amphibian-food-treats'),
    ('reptile-habitat-heating-lighting', 'reptile-amphibian-heating-lighting')
) AS m(old_slug, new_slug)
INNER JOIN categories c ON c.slug = m.new_slug AND c.is_active = true
ON CONFLICT (old_slug) DO NOTHING;

-- #4: Wild Bird & Wildlife (renamed from Wild Bird, expanded scope)
INSERT INTO legacy_slug_redirects (old_slug, new_category_id)
SELECT m.old_slug, c.id
FROM (VALUES
    ('wild-bird', 'wild-bird-wildlife'),
    ('wild-bird-seed-food', 'wild-bird-wildlife-wild-bird-food'),
    ('wild-bird-seed-food-seed-blends', 'wild-bird-wildlife-wild-bird-food'),
    ('wild-bird-seed-food-suet-cakes', 'wild-bird-wildlife-suet'),
    ('wild-bird-feeders', 'wild-bird-wildlife-feeders'),
    ('wild-bird-habitat-bird-houses', 'wild-bird-wildlife-bird-houses-nesting')
) AS m(old_slug, new_slug)
INNER JOIN categories c ON c.slug = m.new_slug AND c.is_active = true
ON CONFLICT (old_slug) DO NOTHING;

-- #5: Chicken & Poultry (split from Farm Animal)
INSERT INTO legacy_slug_redirects (old_slug, new_category_id)
SELECT m.old_slug, c.id
FROM (VALUES
    ('farm-animal-chicken', 'chicken-poultry'),
    ('farm-animal-chicken-coop-supplies', 'chicken-poultry-coops-runs'),
    ('farm-animal-chicken-feed', 'chicken-poultry-feed'),
    ('farm-animal-chicken-treats-supplements', 'chicken-poultry-treats')
) AS m(old_slug, new_slug)
INNER JOIN categories c ON c.slug = m.new_slug AND c.is_active = true
ON CONFLICT (old_slug) DO NOTHING;

-- #6: Horse (split from Farm Animal)
INSERT INTO legacy_slug_redirects (old_slug, new_category_id)
SELECT m.old_slug, c.id
FROM (VALUES
    ('farm-animal-horse-feed', 'horse-feed'),
    ('farm-animal-horse-treats', 'horse-treats'),
    ('farm-animal-horse-fly-control', 'horse-fly-control'),
    ('farm-animal-horse-supplements', 'horse-health-supplements'),
    ('farm-animal-livestock-health-hoof-care', 'horse-grooming')
) AS m(old_slug, new_slug)
INNER JOIN categories c ON c.slug = m.new_slug AND c.is_active = true
ON CONFLICT (old_slug) DO NOTHING;

-- #7: Farm & Livestock (remaining Farm Animal after splits)
INSERT INTO legacy_slug_redirects (old_slug, new_category_id)
SELECT m.old_slug, c.id
FROM (VALUES
    ('farm-animal', 'farm-livestock'),
    ('farm-animal-livestock-waterers-feeders', 'farm-livestock-feeders-waterers'),
    ('farm-animal-livestock-fencing-gates', 'farm-livestock-handling-fencing'),
    ('farm-animal-livestock-health', 'farm-livestock-health-first-aid'),
    ('farm-animal-livestock-health-dewormers', 'farm-livestock-health-first-aid'),
    ('farm-animal-livestock-health-wound-care', 'farm-livestock-health-first-aid'),
    ('farm-animal-goat-sheep', 'farm-livestock'),
    ('farm-animal-goat-sheep-supplements', 'farm-livestock-supplements-minerals'),
    ('farm-animal-goat-sheep-feed', 'farm-livestock-feed')
) AS m(old_slug, new_slug)
INNER JOIN categories c ON c.slug = m.new_slug AND c.is_active = true
ON CONFLICT (old_slug) DO NOTHING;

-- #8: Home & Heating (split and renamed from Household/Home)
INSERT INTO legacy_slug_redirects (old_slug, new_category_id)
SELECT m.old_slug, c.id
FROM (VALUES
    ('home', 'home-heating'),
    ('home-heating-fuel', 'home-heating-heating-fuel'),
    ('home-cleaning-pest-control', 'home-heating-cleaning-supplies'),
    ('home-cleaning-pest-control-indoor-pest-control', 'home-heating-pest-control'),
    ('home-storage-utility', 'home-heating-storage-utility'),
    ('home-storage-utility-trash-bags', 'home-heating-cleaning-supplies')
) AS m(old_slug, new_slug)
INNER JOIN categories c ON c.slug = m.new_slug AND c.is_active = true
ON CONFLICT (old_slug) DO NOTHING;

-- #9: Dog category slug corrections
INSERT INTO legacy_slug_redirects (old_slug, new_category_id)
SELECT m.old_slug, c.id
FROM (VALUES
    -- L2 renames/restructures
    ('dog-beds-crates-beds', 'dog-beds-furniture'),
    ('dog-beds-crates-crates-kennels', 'dog-crates-kennels-gates'),
    ('dog-bowls-feeding-supplies', 'dog-bowls-feeders'),
    ('dog-walk-train-collars', 'dog-collars-leashes-harnesses'),
    ('dog-walk-train-training-behavior', 'dog-training-behavior'),
    ('dog-waste-cleanup', 'dog-cleaning-potty'),
    ('dog-clothing', 'dog-apparel'),
    ('dog-health-wellness-flea-tick', 'dog-flea-tick'),
    -- L2 renamed: Treats → Treats & Chews
    ('dog-treats', 'dog-treats-chews'),
    -- L3 sub-slug corrections under Treats & Chews
    ('dog-treats-biscuits-crunchy-treats', 'dog-treats-chews-biscuits'),
    ('dog-treats-jerky-chews', 'dog-treats-chews-jerky'),
    ('dog-treats-dental-treats', 'dog-treats-chews-dental-treats'),
    -- Toy sub-slug flattening
    ('dog-toys-plush-squeaky-toys', 'dog-toys-plush')
) AS m(old_slug, new_slug)
INNER JOIN categories c ON c.slug = m.new_slug AND c.is_active = true
ON CONFLICT (old_slug) DO NOTHING;

-- #10: Cat category slug corrections
INSERT INTO legacy_slug_redirects (old_slug, new_category_id)
SELECT m.old_slug, c.id
FROM (VALUES
    ('cat-litter-housebreaking', 'cat-litter'),
    ('cat-litter-housebreaking-litter-boxes-accessories', 'cat-litter-boxes-accessories'),
    ('cat-scratchers-furniture', 'cat-trees-scratchers-furniture'),
    ('cat-scratchers-furniture-scratchers', 'cat-trees-scratchers-furniture'),
    ('cat-health-wellness-flea-tick', 'cat-flea-tick')
) AS m(old_slug, new_slug)
INNER JOIN categories c ON c.slug = m.new_slug AND c.is_active = true
ON CONFLICT (old_slug) DO NOTHING;

-- #11: Small Pet category slug corrections
INSERT INTO legacy_slug_redirects (old_slug, new_category_id)
SELECT m.old_slug, c.id
FROM (VALUES
    ('small-pet-health-wellness', 'small-pet-health-grooming'),
    ('small-pet-health-wellness-grooming', 'small-pet-health-grooming'),
    ('small-pet-habitats-accessories', 'small-pet-cages-habitats'),
    ('small-pet-hay-forage', 'small-pet-hay'),
    ('small-pet-treats-chews-treats', 'small-pet-treats-chews')
) AS m(old_slug, new_slug)
INNER JOIN categories c ON c.slug = m.new_slug AND c.is_active = true
ON CONFLICT (old_slug) DO NOTHING;

-- #12: Lawn & Garden slug simplifications
INSERT INTO legacy_slug_redirects (old_slug, new_category_id)
SELECT m.old_slug, c.id
FROM (VALUES
    ('lawn-garden-fertilizers-plant-food', 'lawn-garden-fertilizer'),
    ('lawn-garden-gardening-tools', 'lawn-garden-garden-tools'),
    ('lawn-garden-grass-seed-lawn-repair-grass-seed', 'lawn-garden-grass-seed'),
    ('lawn-garden-pest-weed-control', 'lawn-garden-weed-pest-control'),
    ('lawn-garden-pest-weed-control-animal-repellents', 'lawn-garden-weed-pest-control'),
    ('lawn-garden-pest-weed-control-weed-control', 'lawn-garden-weed-pest-control'),
    ('lawn-garden-planters-seed-starting-planters-pots', 'lawn-garden-planters-supplies'),
    ('lawn-garden-planters-seed-starting-seed-starting', 'lawn-garden-garden-seeds-plants')
) AS m(old_slug, new_slug)
INNER JOIN categories c ON c.slug = m.new_slug AND c.is_active = true
ON CONFLICT (old_slug) DO NOTHING;

-- ============================================================================
-- Part C: Summary — report mapping counts
-- ============================================================================

DO $$
DECLARE
    total_mappings bigint;
    missing_slugs text[];
BEGIN
    SELECT count(*) INTO total_mappings FROM public.legacy_slug_redirects;
    RAISE NOTICE 'Task 7: Inserted % legacy slug redirects', total_mappings;

    -- Check for any old slugs in the VALUES that didn't match
    -- (these will appear in the NOTICE but won't fail the migration)
    SELECT array_agg(m.old_slug) INTO missing_slugs
    FROM (VALUES
        ('bird'::text), ('bird-food'::text), ('bird-food-treats'::text),
        ('fish-aquatics'::text), ('fish-aquatics-food'::text),
        ('fish-aquatics-water-care'::text), ('fish-aquatics-habitat-aquariums'::text),
        ('reptile'::text), ('reptile-food'::text), ('reptile-habitat-heating-lighting'::text),
        ('wild-bird'::text), ('wild-bird-seed-food'::text),
        ('wild-bird-seed-food-seed-blends'::text), ('wild-bird-seed-food-suet-cakes'::text),
        ('wild-bird-feeders'::text), ('wild-bird-habitat-bird-houses'::text),
        ('farm-animal'::text), ('farm-animal-chicken'::text),
        ('farm-animal-chicken-coop-supplies'::text), ('farm-animal-chicken-feed'::text),
        ('farm-animal-chicken-treats-supplements'::text),
        ('farm-animal-horse-feed'::text), ('farm-animal-horse-treats'::text),
        ('farm-animal-horse-fly-control'::text), ('farm-animal-horse-supplements'::text),
        ('farm-animal-livestock-health-hoof-care'::text),
        ('farm-animal-livestock-waterers-feeders'::text),
        ('farm-animal-livestock-fencing-gates'::text),
        ('farm-animal-livestock-health'::text),
        ('farm-animal-livestock-health-dewormers'::text),
        ('farm-animal-livestock-health-wound-care'::text),
        ('farm-animal-goat-sheep'::text), ('farm-animal-goat-sheep-supplements'::text),
        ('farm-animal-goat-sheep-feed'::text),
        ('home'::text), ('home-heating-fuel'::text),
        ('home-cleaning-pest-control'::text),
        ('home-cleaning-pest-control-indoor-pest-control'::text),
        ('home-storage-utility'::text), ('home-storage-utility-trash-bags'::text),
        ('dog-beds-crates-beds'::text), ('dog-beds-crates-crates-kennels'::text),
        ('dog-bowls-feeding-supplies'::text), ('dog-walk-train-collars'::text),
        ('dog-walk-train-training-behavior'::text), ('dog-waste-cleanup'::text),
        ('dog-clothing'::text), ('dog-health-wellness-flea-tick'::text),
        ('dog-treats'::text), ('dog-treats-biscuits-crunchy-treats'::text),
        ('dog-treats-jerky-chews'::text), ('dog-treats-dental-treats'::text),
        ('dog-toys-plush-squeaky-toys'::text),
        ('cat-litter-housebreaking'::text),
        ('cat-litter-housebreaking-litter-boxes-accessories'::text),
        ('cat-scratchers-furniture'::text), ('cat-scratchers-furniture-scratchers'::text),
        ('cat-health-wellness-flea-tick'::text),
        ('small-pet-health-wellness'::text),
        ('small-pet-health-wellness-grooming'::text),
        ('small-pet-habitats-accessories'::text), ('small-pet-hay-forage'::text),
        ('small-pet-treats-chews-treats'::text),
        ('lawn-garden-fertilizers-plant-food'::text),
        ('lawn-garden-gardening-tools'::text),
        ('lawn-garden-grass-seed-lawn-repair-grass-seed'::text),
        ('lawn-garden-pest-weed-control'::text),
        ('lawn-garden-pest-weed-control-animal-repellents'::text),
        ('lawn-garden-pest-weed-control-weed-control'::text),
        ('lawn-garden-planters-seed-starting-planters-pots'::text),
        ('lawn-garden-planters-seed-starting-seed-starting'::text)
    ) AS m(old_slug)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.legacy_slug_redirects r WHERE r.old_slug = m.old_slug
    );

    IF missing_slugs IS NOT NULL AND array_length(missing_slugs, 1) > 0 THEN
        RAISE WARNING 'Task 7: % old slugs had no matching new category slug. These slugs may need to be added to the seed taxonomy or the mapping corrected: %',
            array_length(missing_slugs, 1), missing_slugs;
    END IF;
END $$;

COMMIT;
