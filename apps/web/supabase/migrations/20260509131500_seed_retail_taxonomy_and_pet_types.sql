-- Seed Retail Taxonomy and Pet Types
-- 
-- Part A: Add missing pet types
-- Part B: Seed 13 L1 departments  
-- Part C: Seed all L2 categories
-- Part D: Seed all L3 categories
--
-- This migration is idempotent — all inserts use ON CONFLICT.
-- Parent references are resolved by slug joins, never hardcoded UUIDs.

BEGIN;

-- Ensure unique constraint on categories.slug for idempotent upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug_unique
    ON public.categories (slug);

-- ============================================================================
-- Part A: Pet Types
-- ============================================================================

-- Ensure unique constraint exists for idempotent upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_types_name 
    ON public.pet_types (name);

INSERT INTO public.pet_types (name, display_order)
VALUES
    ('Dog', 1),
    ('Cat', 2),
    ('Small Pet', 3),
    ('Pet Bird', 4),
    ('Fish', 5),
    ('Reptile & Amphibian', 6),
    ('Wild Bird & Wildlife', 7),
    ('Chicken & Poultry', 8),
    ('Horse', 9),
    ('Farm & Livestock', 10)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Part B: L1 Departments
-- ============================================================================

WITH department_rows (name, slug, department_key, sort_order, facet_profile, seo_title, seo_description) AS (
    VALUES
        ('Dog',               'dog',               'dog',               1,  'general',           'Dog Supplies | Bay State Pet & Garden',              'Shop dog food, treats, toys, grooming, and more at Bay State.'),
        ('Cat',               'cat',               'cat',               2,  'general',           'Cat Supplies | Bay State Pet & Garden',              'Shop cat food, litter, toys, and accessories at Bay State.'),
        ('Small Pet',         'small-pet',         'small-pet',         3,  'general',           'Small Pet Supplies | Bay State Pet & Garden',        'Shop rabbit, guinea pig, hamster, and ferret supplies at Bay State.'),
        ('Pet Bird',          'pet-bird',          'pet-bird',          4,  'general',           'Pet Bird Supplies | Bay State Pet & Garden',         'Shop parrot, parakeet, cockatiel, and finch supplies at Bay State.'),
        ('Fish & Aquarium',   'fish-aquarium',     'fish-aquarium',     5,  'general',           'Fish & Aquarium Supplies | Bay State Pet & Garden',  'Shop aquarium tanks, fish food, filters, and pond supplies at Bay State.'),
        ('Reptile & Amphibian', 'reptile-amphibian', 'reptile-amphibian', 6, 'general',           'Reptile Supplies | Bay State Pet & Garden',          'Shop reptile and amphibian food, tanks, lighting, and habitat supplies at Bay State.'),
        ('Wild Bird & Wildlife', 'wild-bird-wildlife', 'wild-bird-wildlife', 7, 'general',         'Wild Bird Supplies | Bay State Pet & Garden',        'Shop wild bird seed, suet, feeders, houses, and wildlife supplies at Bay State.'),
        ('Chicken & Poultry', 'chicken-poultry',   'chicken-poultry',   8,  'general',           'Chicken & Poultry Supplies | Bay State Pet & Garden','Shop chicken feed, coops, bedding, and poultry supplies at Bay State.'),
        ('Horse',             'horse',             'horse',             9,  'general',           'Horse Supplies | Bay State Pet & Garden',            'Shop horse feed, treats, tack, grooming, and stable supplies at Bay State.'),
        ('Farm & Livestock',  'farm-livestock',    'farm-livestock',    10, 'general',           'Farm & Livestock Supplies | Bay State Pet & Garden', 'Shop goat, sheep, cattle, pig, and alpaca supplies at Bay State.'),
        ('Lawn & Garden',     'lawn-garden',       'lawn-garden',       11, 'general',           'Lawn & Garden Supplies | Bay State Pet & Garden',    'Shop soil, grass seed, fertilizer, plants, and garden tools at Bay State.'),
        ('Home & Heating',    'home-heating',      'home-heating',      12, 'general',           'Home & Heating Supplies | Bay State Pet & Garden',   'Shop heating fuel, stove supplies, cleaning, and pest control at Bay State.'),
        ('Tools & Hardware',  'tools-hardware',    'tools-hardware',    13, 'general',           'Tools & Hardware | Bay State Pet & Garden',          'Shop hand tools, hardware, electrical, plumbing, and shop supplies at Bay State.')
)
INSERT INTO public.categories (name, slug, department_key, depth, breadcrumb, facet_profile, display_order, sort_order, is_active, seo_title, seo_description, synonym_keywords)
SELECT 
    name,
    slug,
    department_key,
    0,
    name,
    facet_profile,
    sort_order,
    sort_order,
    true,
    seo_title,
    seo_description,
    ARRAY[slug, name]
FROM department_rows
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    department_key = EXCLUDED.department_key,
    depth = 0,
    breadcrumb = EXCLUDED.name,
    facet_profile = EXCLUDED.facet_profile,
    display_order = EXCLUDED.display_order,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    seo_title = EXCLUDED.seo_title,
    seo_description = EXCLUDED.seo_description,
    synonym_keywords = EXCLUDED.synonym_keywords
WHERE categories.depth IS DISTINCT FROM 0
   OR categories.breadcrumb IS DISTINCT FROM EXCLUDED.breadcrumb
   OR categories.department_key IS DISTINCT FROM EXCLUDED.department_key;

-- ============================================================================
-- Part C: L2 Categories
-- ============================================================================

WITH 
dept AS (
    SELECT id, name, slug, department_key, breadcrumb 
    FROM public.categories 
    WHERE parent_id IS NULL AND is_active = true
),
l2_rows (name, slug, parent_slug, department_key, facet_profile, sort_order, seo_title, synonym_keywords) AS (
    VALUES
    -- === DOG (dog) ===
    ('Food',                'dog-food',                'dog',                'dog',             'animal_food',              1,  'Dog Food | Bay State Pet & Garden',                ARRAY['dog food', 'kibble']),
    ('Treats & Chews',      'dog-treats-chews',        'dog',                'dog',             'animal_treats_chews',      2,  'Dog Treats & Chews | Bay State Pet & Garden',      ARRAY['dog treats', 'dog chews', 'dog biscuits']),
    ('Toys',                'dog-toys',                'dog',                'dog',             'animal_toys_enrichment',   3,  'Dog Toys | Bay State Pet & Garden',                 ARRAY['dog toys', 'puppy toys']),
    ('Health & Wellness',   'dog-health-wellness',     'dog',                'dog',             'animal_health_wellness',   4,  'Dog Health & Wellness | Bay State Pet & Garden',    ARRAY['dog supplements', 'dog vitamins', 'dog health']),
    ('Flea & Tick',         'dog-flea-tick',           'dog',                'dog',             'animal_health_wellness',   5,  'Dog Flea & Tick | Bay State Pet & Garden',          ARRAY['dog flea', 'dog tick', 'flea treatment']),
    ('Collars, Leashes & Harnesses', 'dog-collars-leashes-harnesses', 'dog', 'dog', 'general',              6,  'Dog Collars, Leashes & Harnesses | Bay State Pet & Garden', ARRAY['dog collars', 'dog leashes', 'dog harnesses']),
    ('Beds & Furniture',    'dog-beds-furniture',      'dog',                'dog',             'general',                  7,  'Dog Beds & Furniture | Bay State Pet & Garden',     ARRAY['dog beds', 'dog furniture', 'dog crate mats']),
    ('Crates, Kennels & Gates', 'dog-crates-kennels-gates', 'dog',          'dog',             'animal_habitat_containment', 8, 'Dog Crates, Kennels & Gates | Bay State Pet & Garden', ARRAY['dog crates', 'dog kennels', 'dog gates']),
    ('Bowls & Feeders',     'dog-bowls-feeders',       'dog',                'dog',             'general',                  9,  'Dog Bowls & Feeders | Bay State Pet & Garden',      ARRAY['dog bowls', 'dog feeders', 'dog waterers']),
    ('Grooming',            'dog-grooming',            'dog',                'dog',             'grooming_cleaning',        10, 'Dog Grooming | Bay State Pet & Garden',             ARRAY['dog grooming', 'dog shampoo', 'dog brushes']),
    ('Cleaning & Potty',    'dog-cleaning-potty',      'dog',                'dog',             'grooming_cleaning',        11, 'Dog Cleaning & Potty | Bay State Pet & Garden',     ARRAY['dog potty pads', 'dog poop bags', 'dog stain remover']),
    ('Training & Behavior', 'dog-training-behavior',   'dog',                'dog',             'general',                  12, 'Dog Training & Behavior | Bay State Pet & Garden',  ARRAY['dog training', 'dog behavior', 'dog clicker']),
    ('Travel & Outdoor',    'dog-travel-outdoor',      'dog',                'dog',             'general',                  13, 'Dog Travel & Outdoor | Bay State Pet & Garden',     ARRAY['dog carriers', 'dog travel', 'dog car seat']),
    ('Apparel',             'dog-apparel',             'dog',                'dog',             'general',                  14, 'Dog Apparel | Bay State Pet & Garden',              ARRAY['dog clothes', 'dog coats', 'dog sweaters', 'dog boots']),

    -- === CAT (cat) ===
    ('Food',                'cat-food',                'cat',                'cat',             'animal_food',              1,  'Cat Food | Bay State Pet & Garden',                ARRAY['cat food', 'kitten food']),
    ('Treats',              'cat-treats',              'cat',                'cat',             'animal_treats_chews',      2,  'Cat Treats | Bay State Pet & Garden',              ARRAY['cat treats', 'catnip']),
    ('Litter',              'cat-litter',              'cat',                'cat',             'animal_litter_bedding',    3,  'Cat Litter | Bay State Pet & Garden',              ARRAY['cat litter', 'kitty litter']),
    ('Litter Boxes & Accessories', 'cat-litter-boxes-accessories', 'cat',    'cat',             'general',                  4,  'Cat Litter Boxes & Accessories | Bay State Pet & Garden', ARRAY['litter boxes', 'litter scoops', 'litter mats']),
    ('Toys',                'cat-toys',                'cat',                'cat',             'animal_toys_enrichment',   5,  'Cat Toys | Bay State Pet & Garden',                ARRAY['cat toys', 'kitten toys', 'cat wand']),
    ('Trees, Scratchers & Furniture', 'cat-trees-scratchers-furniture', 'cat', 'cat',          'animal_toys_enrichment',   6,  'Cat Trees & Furniture | Bay State Pet & Garden',   ARRAY['cat trees', 'cat scratchers', 'cat furniture']),
    ('Health & Wellness',   'cat-health-wellness',     'cat',                'cat',             'animal_health_wellness',   7,  'Cat Health & Wellness | Bay State Pet & Garden',   ARRAY['cat supplements', 'cat hairball', 'cat health']),
    ('Flea & Tick',         'cat-flea-tick',           'cat',                'cat',             'animal_health_wellness',   8,  'Cat Flea & Tick | Bay State Pet & Garden',         ARRAY['cat flea', 'cat tick']),
    ('Beds',                'cat-beds',                'cat',                'cat',             'general',                  9,  'Cat Beds | Bay State Pet & Garden',                ARRAY['cat beds', 'cat cave', 'cat mat']),
    ('Bowls & Feeders',     'cat-bowls-feeders',       'cat',                'cat',             'general',                  10, 'Cat Bowls & Feeders | Bay State Pet & Garden',     ARRAY['cat bowls', 'cat fountain', 'cat feeder']),
    ('Grooming',            'cat-grooming',            'cat',                'cat',             'grooming_cleaning',        11, 'Cat Grooming | Bay State Pet & Garden',            ARRAY['cat grooming', 'cat brush', 'cat shampoo']),
    ('Carriers & Travel',   'cat-carriers-travel',     'cat',                'cat',             'general',                  12, 'Cat Carriers & Travel | Bay State Pet & Garden',   ARRAY['cat carriers', 'cat travel']),
    ('Collars & Harnesses', 'cat-collars-harnesses',   'cat',                'cat',             'general',                  13, 'Cat Collars & Harnesses | Bay State Pet & Garden', ARRAY['cat collars', 'cat harnesses']),

    -- === SMALL PET (small-pet) ===
    ('Food',                'small-pet-food',                'small-pet', 'small-pet', 'animal_food',              1,  'Small Pet Food | Bay State Pet & Garden',        ARRAY['rabbit food', 'guinea pig food', 'hamster food', 'ferret food']),
    ('Hay',                 'small-pet-hay',                 'small-pet', 'small-pet', 'animal_food',              2,  'Small Pet Hay | Bay State Pet & Garden',         ARRAY['timothy hay', 'orchard grass', 'alfalfa']),
    ('Treats & Chews',      'small-pet-treats-chews',        'small-pet', 'small-pet', 'animal_treats_chews',      3,  'Small Pet Treats & Chews | Bay State Pet & Garden', ARRAY['small pet treats', 'chew sticks']),
    ('Bedding & Litter',    'small-pet-bedding-litter',      'small-pet', 'small-pet', 'animal_litter_bedding',    4,  'Small Pet Bedding & Litter | Bay State Pet & Garden', ARRAY['small pet bedding', 'paper bedding', 'wood bedding']),
    ('Cages & Habitats',    'small-pet-cages-habitats',      'small-pet', 'small-pet', 'animal_habitat_containment', 5, 'Small Pet Cages & Habitats | Bay State Pet & Garden', ARRAY['small pet cages', 'rabbit hutch', 'guinea pig cage']),
    ('Toys & Enrichment',   'small-pet-toys-enrichment',     'small-pet', 'small-pet', 'animal_toys_enrichment',   6,  'Small Pet Toys & Enrichment | Bay State Pet & Garden', ARRAY['small pet toys', 'chew toys', 'tunnels', 'exercise wheel']),
    ('Bowls, Feeders & Waterers', 'small-pet-bowls-feeders-waterers', 'small-pet', 'small-pet', 'general', 7, 'Small Pet Bowls & Waterers | Bay State Pet & Garden', ARRAY['small pet bowls', 'water bottle', 'hay feeder']),
    ('Health & Grooming',   'small-pet-health-grooming',     'small-pet', 'small-pet', 'animal_health_wellness',   8,  'Small Pet Health & Grooming | Bay State Pet & Garden', ARRAY['small pet supplements', 'nail care', 'small pet brush']),

    -- === PET BIRD (pet-bird) ===
    ('Food',                'pet-bird-food',           'pet-bird',           'pet-bird',        'animal_food',              1,  'Pet Bird Food | Bay State Pet & Garden',          ARRAY['parrot food', 'parakeet food', 'cockatiel food', 'finch food']),
    ('Treats',              'pet-bird-treats',         'pet-bird',           'pet-bird',        'animal_treats_chews',      2,  'Pet Bird Treats | Bay State Pet & Garden',        ARRAY['bird treats', 'millet', 'seed treats']),
    ('Cages & Stands',      'pet-bird-cages-stands',   'pet-bird',           'pet-bird',        'animal_habitat_containment', 3, 'Pet Bird Cages & Stands | Bay State Pet & Garden', ARRAY['bird cages', 'bird stand', 'bird cage cover']),
    ('Toys',                'pet-bird-toys',           'pet-bird',           'pet-bird',        'animal_toys_enrichment',   4,  'Pet Bird Toys | Bay State Pet & Garden',          ARRAY['bird toys', 'parrot toys', 'foraging toys', 'bird swing']),
    ('Perches',             'pet-bird-perches',        'pet-bird',           'pet-bird',        'general',                  5,  'Pet Bird Perches | Bay State Pet & Garden',       ARRAY['bird perches', 'wood perch', 'rope perch']),
    ('Feeders & Waterers',  'pet-bird-feeders-waterers', 'pet-bird',        'pet-bird',        'general',                  6,  'Pet Bird Feeders & Waterers | Bay State Pet & Garden', ARRAY['bird cups', 'bird feeder', 'bird waterer']),
    ('Health & Grooming',   'pet-bird-health-grooming', 'pet-bird',         'pet-bird',        'animal_health_wellness',   7,  'Pet Bird Health & Grooming | Bay State Pet & Garden', ARRAY['bird supplements', 'bird grooming', 'beak care']),
    ('Bedding & Litter',    'pet-bird-bedding-litter',  'pet-bird',         'pet-bird',        'animal_litter_bedding',    8,  'Pet Bird Bedding & Litter | Bay State Pet & Garden', ARRAY['cage liners', 'bird litter']),

    -- === FISH & AQUARIUM (fish-aquarium) ===
    ('Fish Food',           'fish-aquarium-food',              'fish-aquarium',    'fish-aquarium',    'animal_food',              1,  'Fish Food | Bay State Pet & Garden',               ARRAY['fish food', 'fish flakes', 'fish pellets', 'pond food']),
    ('Aquariums & Tanks',   'fish-aquarium-tanks',             'fish-aquarium',    'fish-aquarium',    'animal_habitat_containment', 2, 'Fish Aquariums & Tanks | Bay State Pet & Garden',  ARRAY['aquariums', 'fish tanks', 'aquarium kit']),
    ('Filters & Media',     'fish-aquarium-filters-media',     'fish-aquarium',    'fish-aquarium',    'aquarium_equipment',       3,  'Aquarium Filters & Media | Bay State Pet & Garden', ARRAY['aquarium filters', 'filter media', 'filter cartridge']),
    ('Pumps & Air',         'fish-aquarium-pumps-air',         'fish-aquarium',    'fish-aquarium',    'aquarium_equipment',       4,  'Aquarium Pumps & Air | Bay State Pet & Garden',    ARRAY['air pump', 'water pump', 'air stone', 'tubing']),
    ('Heating & Lighting',  'fish-aquarium-heating-lighting',  'fish-aquarium',    'fish-aquarium',    'aquarium_equipment',       5,  'Aquarium Heating & Lighting | Bay State Pet & Garden', ARRAY['aquarium heater', 'aquarium light', 'thermometer']),
    ('Water Care',          'fish-aquarium-water-care',        'fish-aquarium',    'fish-aquarium',    'aquarium_equipment',       6,  'Aquarium Water Care | Bay State Pet & Garden',     ARRAY['water conditioner', 'water test kit', 'aquarium salt']),
    ('Decor & Substrate',   'fish-aquarium-decor-substrate',   'fish-aquarium',    'fish-aquarium',    'general',                  7,  'Aquarium Decor & Substrate | Bay State Pet & Garden', ARRAY['aquarium gravel', 'aquarium sand', 'aquarium plants', 'aquarium ornaments']),
    ('Maintenance',         'fish-aquarium-maintenance',       'fish-aquarium',    'fish-aquarium',    'general',                  8,  'Aquarium Maintenance | Bay State Pet & Garden',    ARRAY['aquarium net', 'gravel vacuum', 'algae scraper']),
    ('Pond & Koi',          'fish-aquarium-pond-koi',          'fish-aquarium',    'fish-aquarium',    'general',                  9,  'Pond & Koi Supplies | Bay State Pet & Garden',     ARRAY['pond supplies', 'koi food', 'pond pump', 'pond treatment']),

    -- === REPTILE & AMPHIBIAN (reptile-amphibian) ===
    ('Food & Treats',        'reptile-amphibian-food',           'reptile-amphibian', 'reptile-amphibian', 'animal_food',              1,  'Reptile Food & Treats | Bay State Pet & Garden',  ARRAY['reptile food', 'bearded dragon food', 'turtle food', 'live feeders']),
    ('Tanks & Terrariums',   'reptile-amphibian-tanks-terrariums', 'reptile-amphibian', 'reptile-amphibian', 'animal_habitat_containment', 2, 'Reptile Tanks & Terrariums | Bay State Pet & Garden', ARRAY['reptile tank', 'terrarium', 'screen lid']),
    ('Heating & Lighting',   'reptile-amphibian-heating-lighting', 'reptile-amphibian', 'reptile-amphibian', 'reptile_equipment',       3,  'Reptile Heating & Lighting | Bay State Pet & Garden', ARRAY['heat lamp', 'UVB bulb', 'ceramic heat emitter']),
    ('Substrate & Bedding',  'reptile-amphibian-substrate-bedding', 'reptile-amphibian', 'reptile-amphibian', 'animal_litter_bedding',    4,  'Reptile Substrate & Bedding | Bay State Pet & Garden', ARRAY['reptile substrate', 'coconut fiber', 'reptile sand']),
    ('Habitat Decor',        'reptile-amphibian-habitat-decor',    'reptile-amphibian', 'reptile-amphibian', 'general',                  5,  'Reptile Habitat Decor | Bay State Pet & Garden',  ARRAY['reptile hides', 'reptile decor', 'habitat branches']),
    ('Humidity & Water',     'reptile-amphibian-humidity-water',  'reptile-amphibian', 'reptile-amphibian', 'general',                  6,  'Reptile Humidity & Water | Bay State Pet & Garden', ARRAY['reptile mister', 'reptile fogger', 'hygrometer']),
    ('Supplements & Health', 'reptile-amphibian-supplements-health', 'reptile-amphibian', 'reptile-amphibian', 'animal_health_wellness',   7, 'Reptile Supplements & Health | Bay State Pet & Garden', ARRAY['reptile calcium', 'reptile vitamins', 'shedding aid']),

    -- === WILD BIRD & WILDLIFE (wild-bird-wildlife) ===
    ('Wild Bird Food',       'wild-bird-wildlife-food',          'wild-bird-wildlife', 'wild-bird-wildlife', 'animal_food',              1,  'Wild Bird Food | Bay State Pet & Garden',          ARRAY['bird seed', 'sunflower seed', 'nyjer', 'mealworms']),
    ('Suet',                 'wild-bird-wildlife-suet',          'wild-bird-wildlife', 'wild-bird-wildlife', 'animal_food',              2,  'Wild Bird Suet | Bay State Pet & Garden',           ARRAY['suet cakes', 'suet nuggets', 'suet plugs']),
    ('Feeders',              'wild-bird-wildlife-feeders',       'wild-bird-wildlife', 'wild-bird-wildlife', 'general',                  3,  'Wild Bird Feeders | Bay State Pet & Garden',        ARRAY['bird feeders', 'tube feeder', 'hopper feeder', 'platform feeder']),
    ('Hummingbird',          'wild-bird-wildlife-hummingbird',   'wild-bird-wildlife', 'wild-bird-wildlife', 'general',                  4,  'Hummingbird Supplies | Bay State Pet & Garden',     ARRAY['hummingbird nectar', 'hummingbird feeder']),
    ('Bird Houses & Nesting','wild-bird-wildlife-houses-nesting','wild-bird-wildlife', 'wild-bird-wildlife', 'general',                  5,  'Bird Houses & Nesting | Bay State Pet & Garden',    ARRAY['bird houses', 'nesting material']),
    ('Bird Baths',           'wild-bird-wildlife-bird-baths',    'wild-bird-wildlife', 'wild-bird-wildlife', 'general',                  6,  'Bird Baths | Bay State Pet & Garden',               ARRAY['bird baths', 'bird bath heater']),
    ('Wildlife Feed',        'wild-bird-wildlife-wildlife-feed', 'wild-bird-wildlife', 'wild-bird-wildlife', 'animal_feed_farm',         7,  'Wildlife Feed | Bay State Pet & Garden',            ARRAY['squirrel food', 'deer corn', 'duck feed']),
    ('Pest & Critter Control','wild-bird-wildlife-pest-critter-control', 'wild-bird-wildlife', 'wild-bird-wildlife', 'general', 8,  'Pest & Critter Control | Bay State Pet & Garden',   ARRAY['squirrel repellent', 'bird baffle', 'critter guard']),

    -- === CHICKEN & POULTRY (chicken-poultry) ===
    ('Feed',                'chicken-poultry-feed',          'chicken-poultry', 'chicken-poultry', 'animal_feed_farm',         1,  'Chicken Feed | Bay State Pet & Garden',            ARRAY['layer feed', 'chicken feed', 'starter feed', 'scratch grains']),
    ('Treats',              'chicken-poultry-treats',        'chicken-poultry', 'chicken-poultry', 'animal_treats_chews',      2,  'Chicken Treats | Bay State Pet & Garden',          ARRAY['mealworms', 'scratch treats', 'forage block']),
    ('Coops & Runs',        'chicken-poultry-coops-runs',    'chicken-poultry', 'chicken-poultry', 'animal_habitat_containment', 3, 'Chicken Coops & Runs | Bay State Pet & Garden',    ARRAY['chicken coop', 'chicken run', 'nesting box']),
    ('Feeders & Waterers',  'chicken-poultry-feeders-waterers', 'chicken-poultry', 'chicken-poultry', 'general', 4,  'Chicken Feeders & Waterers | Bay State Pet & Garden', ARRAY['chicken feeder', 'chicken waterer', 'heated waterer']),
    ('Bedding',             'chicken-poultry-bedding',       'chicken-poultry', 'chicken-poultry', 'animal_litter_bedding',    5,  'Chicken Bedding | Bay State Pet & Garden',         ARRAY['pine shavings', 'straw', 'coop bedding']),
    ('Health & Supplements','chicken-poultry-health-supplements', 'chicken-poultry', 'chicken-poultry', 'animal_health_wellness', 6, 'Chicken Health & Supplements | Bay State Pet & Garden', ARRAY['chicken grit', 'oyster shell', 'poultry vitamins']),
    ('Egg Supplies',        'chicken-poultry-egg-supplies',  'chicken-poultry', 'chicken-poultry', 'general',                  7,  'Egg Supplies | Bay State Pet & Garden',            ARRAY['egg cartons', 'egg wash', 'egg storage']),
    ('Brooding',            'chicken-poultry-brooding',      'chicken-poultry', 'chicken-poultry', 'general',                  8,  'Brooding Supplies | Bay State Pet & Garden',       ARRAY['heat lamp', 'brooder', 'chick supplies']),

    -- === HORSE (horse) ===
    ('Feed',                'horse-feed',                    'horse',           'horse',           'animal_feed_farm',         1,  'Horse Feed | Bay State Pet & Garden',              ARRAY['horse feed', 'senior horse feed', 'performance horse feed']),
    ('Treats',              'horse-treats',                  'horse',           'horse',           'animal_treats_chews',      2,  'Horse Treats | Bay State Pet & Garden',            ARRAY['horse treats', 'horse cookies', 'horse biscuits']),
    ('Health & Supplements','horse-health-supplements',      'horse',           'horse',           'animal_health_wellness',   3,  'Horse Supplements & Health | Bay State Pet & Garden', ARRAY['horse supplements', 'joint support', 'hoof health']),
    ('Grooming',            'horse-grooming',                'horse',           'horse',           'grooming_cleaning',        4,  'Horse Grooming | Bay State Pet & Garden',          ARRAY['horse grooming', 'horse shampoo', 'hoof care', 'fly spray']),
    ('Fly Control',         'horse-fly-control',             'horse',           'horse',           'animal_health_wellness',   5,  'Horse Fly Control | Bay State Pet & Garden',       ARRAY['horse fly spray', 'fly mask', 'fly sheet']),
    ('Tack & Saddlery',     'horse-tack-saddlery',           'horse',           'horse',           'general',                  6,  'Horse Tack & Saddlery | Bay State Pet & Garden',   ARRAY['horse halters', 'lead ropes', 'saddles', 'bridles']),
    ('Stable Supplies',     'horse-stable-supplies',         'horse',           'horse',           'general',                  7,  'Horse Stable Supplies | Bay State Pet & Garden',   ARRAY['stable buckets', 'hay feeder', 'stall supplies']),
    ('Blankets & Sheets',   'horse-blankets-sheets',         'horse',           'horse',           'general',                  8,  'Horse Blankets & Sheets | Bay State Pet & Garden', ARRAY['horse blankets', 'turnout blanket', 'horse sheet', 'cooler']),
    ('Farrier Supplies',    'horse-farrier-supplies',        'horse',           'horse',           'general',                  9,  'Farrier Supplies | Bay State Pet & Garden',        ARRAY['hoof tools', 'horse shoes', 'hoof care']),

    -- === FARM & LIVESTOCK (farm-livestock) ===
    ('Feed',                'farm-livestock-feed',              'farm-livestock', 'farm-livestock', 'animal_feed_farm',         1,  'Livestock Feed | Bay State Pet & Garden',          ARRAY['cattle feed', 'goat feed', 'sheep feed', 'pig feed']),
    ('Treats',              'farm-livestock-treats',            'farm-livestock', 'farm-livestock', 'animal_treats_chews',      2,  'Livestock Treats | Bay State Pet & Garden',        ARRAY['livestock treats']),
    ('Supplements & Minerals', 'farm-livestock-supplements-minerals', 'farm-livestock', 'farm-livestock', 'animal_health_wellness', 3, 'Livestock Supplements & Minerals | Bay State Pet & Garden', ARRAY['mineral blocks', 'protein supplement', 'livestock vitamins']),
    ('Feeders & Waterers',  'farm-livestock-feeders-waterers',  'farm-livestock', 'farm-livestock', 'general',                  4,  'Livestock Feeders & Waterers | Bay State Pet & Garden', ARRAY['livestock trough', 'water tank', 'automatic waterer']),
    ('Bedding',             'farm-livestock-bedding',           'farm-livestock', 'farm-livestock', 'animal_litter_bedding',    5,  'Livestock Bedding | Bay State Pet & Garden',       ARRAY['straw', 'shavings']),
    ('Health & First Aid',  'farm-livestock-health-first-aid',  'farm-livestock', 'farm-livestock', 'animal_health_wellness',   6,  'Livestock Health & First Aid | Bay State Pet & Garden', ARRAY['dewormer', 'wound care', 'livestock fly control']),
    ('Handling & Fencing',  'farm-livestock-handling-fencing', 'farm-livestock', 'farm-livestock', 'general',                  7,  'Livestock Handling & Fencing | Bay State Pet & Garden', ARRAY['livestock halters', 'panels', 'gates']),

    -- === LAWN & GARDEN (lawn-garden) ===
    ('Soil, Mulch & Compost', 'lawn-garden-soil-mulch-compost',  'lawn-garden', 'lawn-garden', 'garden_consumable',         1,  'Soil, Mulch & Compost | Bay State Pet & Garden',   ARRAY['potting soil', 'garden soil', 'mulch', 'compost']),
    ('Grass Seed',           'lawn-garden-grass-seed',           'lawn-garden', 'lawn-garden', 'garden_consumable',         2,  'Grass Seed | Bay State Pet & Garden',              ARRAY['grass seed', 'lawn seed', 'patch repair']),
    ('Fertilizer',           'lawn-garden-fertilizer',           'lawn-garden', 'lawn-garden', 'garden_consumable',         3,  'Fertilizer | Bay State Pet & Garden',              ARRAY['lawn fertilizer', 'garden fertilizer', 'organic fertilizer']),
    ('Weed & Pest Control',  'lawn-garden-weed-pest-control',    'lawn-garden', 'lawn-garden', 'garden_consumable',         4,  'Weed & Pest Control | Bay State Pet & Garden',     ARRAY['weed killer', 'insect control', 'animal repellent']),
    ('Garden Seeds & Plants','lawn-garden-seeds-plants',        'lawn-garden', 'lawn-garden', 'garden_consumable',         5,  'Garden Seeds & Plants | Bay State Pet & Garden',   ARRAY['vegetable seeds', 'flower seeds', 'bulbs', 'plants']),
    ('Planters & Supplies',  'lawn-garden-planters-supplies',   'lawn-garden', 'lawn-garden', 'garden_equipment',          6,  'Planters & Garden Supplies | Bay State Pet & Garden', ARRAY['pots', 'planters', 'trellises', 'stakes']),
    ('Garden Tools',         'lawn-garden-tools',               'lawn-garden', 'lawn-garden', 'garden_equipment',          7,  'Garden Tools | Bay State Pet & Garden',            ARRAY['hand tools', 'pruners', 'rakes', 'shovels']),
    ('Sprayers & Spreaders', 'lawn-garden-sprayers-spreaders',  'lawn-garden', 'lawn-garden', 'garden_equipment',          8,  'Sprayers & Spreaders | Bay State Pet & Garden',    ARRAY['sprayers', 'spreaders']),
    ('Watering',             'lawn-garden-watering',            'lawn-garden', 'lawn-garden', 'garden_equipment',          9,  'Garden Watering | Bay State Pet & Garden',         ARRAY['hoses', 'nozzles', 'sprinklers', 'watering cans']),
    ('Seasonal Yard Care',   'lawn-garden-seasonal-yard-care',  'lawn-garden', 'lawn-garden', 'garden_consumable',         10, 'Seasonal Yard Care | Bay State Pet & Garden',      ARRAY['ice melt', 'snow tools', 'fall cleanup']),

    -- === HOME & HEATING (home-heating) ===
    ('Heating Fuel',          'home-heating-fuel',               'home-heating', 'home-heating', 'home_heating',             1,  'Heating Fuel | Bay State Pet & Garden',            ARRAY['wood pellets', 'coal', 'firewood', 'fire starters']),
    ('Stove & Fireplace',     'home-heating-stove-fireplace',    'home-heating', 'home-heating', 'home_heating',             2,  'Stove & Fireplace Supplies | Bay State Pet & Garden', ARRAY['stove accessories', 'ash bucket', 'chimney supplies']),
    ('Cleaning Supplies',     'home-heating-cleaning-supplies',  'home-heating', 'home-heating', 'general',                  3,  'Cleaning Supplies | Bay State Pet & Garden',       ARRAY['cleaners', 'odor control', 'trash bags']),
    ('Pest Control',          'home-heating-pest-control',       'home-heating', 'home-heating', 'general',                  4,  'Pest Control | Bay State Pet & Garden',            ARRAY['mouse traps', 'rat poison', 'ant control', 'roach killer']),
    ('Storage & Utility',     'home-heating-storage-utility',    'home-heating', 'home-heating', 'general',                  5,  'Storage & Utility | Bay State Pet & Garden',       ARRAY['totes', 'buckets', 'utility supplies']),
    ('Winter Essentials',     'home-heating-winter-essentials',  'home-heating', 'home-heating', 'general',                  6,  'Winter Essentials | Bay State Pet & Garden',       ARRAY['ice melt', 'snow shovels', 'winter gloves']),

    -- === TOOLS & HARDWARE (tools-hardware) ===
    ('Tools',                 'tools-hardware-tools',            'tools-hardware', 'tools-hardware', 'hardware_tools',         1,  'Tools | Bay State Pet & Garden',                   ARRAY['hand tools', 'power tools', 'tool accessories']),
    ('Hardware',              'tools-hardware-hardware',         'tools-hardware', 'tools-hardware', 'hardware_tools',         2,  'Hardware | Bay State Pet & Garden',               ARRAY['fasteners', 'hooks', 'chains', 'rope']),
    ('Electrical',            'tools-hardware-electrical',       'tools-hardware', 'tools-hardware', 'hardware_tools',         3,  'Electrical | Bay State Pet & Garden',              ARRAY['extension cords', 'batteries', 'lighting']),
    ('Plumbing',              'tools-hardware-plumbing',         'tools-hardware', 'tools-hardware', 'hardware_tools',         4,  'Plumbing Supplies | Bay State Pet & Garden',       ARRAY['hoses', 'fittings', 'pumps']),
    ('Garage & Shop',         'tools-hardware-garage-shop',      'tools-hardware', 'tools-hardware', 'hardware_tools',         5,  'Garage & Shop Supplies | Bay State Pet & Garden',  ARRAY['lubricants', 'tarps', 'shop supplies'])
)
INSERT INTO public.categories (name, slug, parent_id, department_key, depth, breadcrumb, facet_profile, display_order, sort_order, is_active, seo_title, seo_description, synonym_keywords)
SELECT 
    l.name,
    l.slug,
    d.id,
    l.department_key,
    1,
    d.name || ' > ' || l.name,
    l.facet_profile,
    l.sort_order,
    l.sort_order,
    true,
    l.seo_title,
    d.name || ' > ' || l.name || ' — Shop online at Bay State Pet & Garden Supply.',
    l.synonym_keywords
FROM l2_rows l
JOIN dept d ON d.slug = l.parent_slug
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id,
    department_key = EXCLUDED.department_key,
    depth = 1,
    breadcrumb = EXCLUDED.breadcrumb,
    facet_profile = EXCLUDED.facet_profile,
    display_order = EXCLUDED.display_order,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    seo_title = EXCLUDED.seo_title,
    seo_description = EXCLUDED.seo_description,
    synonym_keywords = EXCLUDED.synonym_keywords
WHERE categories.depth IS DISTINCT FROM 1
   OR categories.breadcrumb IS DISTINCT FROM EXCLUDED.breadcrumb
   OR categories.facet_profile IS DISTINCT FROM EXCLUDED.facet_profile
   OR categories.parent_id IS DISTINCT FROM EXCLUDED.parent_id;

-- ============================================================================
-- Part D: L3 Categories
-- ============================================================================

WITH 
l2 AS (
    SELECT c.id, c.name, c.slug, c.breadcrumb, c.department_key
    FROM public.categories c
    WHERE c.depth = 1 AND c.is_active = true
),
l3_rows (name, slug, parent_slug, department_key, facet_profile, sort_order) AS (
    VALUES
    -- === DOG > Food ===
    ('Dry Food',          'dog-food-dry',          'dog-food',          'dog', 'animal_food', 1),
    ('Wet Food',          'dog-food-wet',          'dog-food',          'dog', 'animal_food', 2),
    ('Fresh/Frozen',      'dog-food-fresh-frozen', 'dog-food',          'dog', 'animal_food', 3),
    ('Toppers',           'dog-food-toppers',      'dog-food',          'dog', 'animal_food', 4),
    ('Veterinary Diets',  'dog-food-veterinary-diets', 'dog-food',      'dog', 'animal_food', 5),
    ('Puppy Food',        'dog-food-puppy',        'dog-food',          'dog', 'animal_food', 6),

    -- === DOG > Treats & Chews ===
    ('Biscuits',               'dog-treats-chews-biscuits',               'dog-treats-chews', 'dog', 'animal_treats_chews', 1),
    ('Soft Treats',            'dog-treats-chews-soft',                   'dog-treats-chews', 'dog', 'animal_treats_chews', 2),
    ('Dental Treats',          'dog-treats-chews-dental',                 'dog-treats-chews', 'dog', 'animal_treats_chews', 3),
    ('Jerky',                  'dog-treats-chews-jerky',                  'dog-treats-chews', 'dog', 'animal_treats_chews', 4),
    ('Training Treats',        'dog-treats-chews-training',               'dog-treats-chews', 'dog', 'animal_treats_chews', 5),
    ('Bully Sticks',           'dog-treats-chews-bully-sticks',           'dog-treats-chews', 'dog', 'animal_treats_chews', 6),
    ('Long-Lasting Chews',     'dog-treats-chews-long-lasting',           'dog-treats-chews', 'dog', 'animal_treats_chews', 7),
    ('Freeze-Dried Treats',    'dog-treats-chews-freeze-dried',           'dog-treats-chews', 'dog', 'animal_treats_chews', 8),

    -- === DOG > Toys ===
    ('Plush',                  'dog-toys-plush',              'dog-toys', 'dog', 'animal_toys_enrichment', 1),
    ('Chew Toys',              'dog-toys-chew',               'dog-toys', 'dog', 'animal_toys_enrichment', 2),
    ('Fetch Toys',             'dog-toys-fetch',              'dog-toys', 'dog', 'animal_toys_enrichment', 3),
    ('Rope & Tug',             'dog-toys-rope-tug',           'dog-toys', 'dog', 'animal_toys_enrichment', 4),
    ('Puzzle Toys',            'dog-toys-puzzle',             'dog-toys', 'dog', 'animal_toys_enrichment', 5),
    ('Treat Dispensing',       'dog-toys-treat-dispensing',   'dog-toys', 'dog', 'animal_toys_enrichment', 6),

    -- === DOG > Health & Wellness ===
    ('Vitamins & Supplements', 'dog-health-wellness-vitamins-supplements', 'dog-health-wellness', 'dog', 'animal_health_wellness', 1),
    ('Digestive Health',       'dog-health-wellness-digestive',            'dog-health-wellness', 'dog', 'animal_health_wellness', 2),
    ('Skin & Coat',            'dog-health-wellness-skin-coat',            'dog-health-wellness', 'dog', 'animal_health_wellness', 3),
    ('Joint Support',          'dog-health-wellness-joint',                'dog-health-wellness', 'dog', 'animal_health_wellness', 4),
    ('Calming',                'dog-health-wellness-calming',              'dog-health-wellness', 'dog', 'animal_health_wellness', 5),
    ('Dental Care',            'dog-health-wellness-dental',               'dog-health-wellness', 'dog', 'animal_health_wellness', 6),

    -- === DOG > Flea & Tick ===
    ('Collars',                'dog-flea-tick-collars',        'dog-flea-tick', 'dog', 'animal_health_wellness', 1),
    ('Topicals',               'dog-flea-tick-topicals',       'dog-flea-tick', 'dog', 'animal_health_wellness', 2),
    ('Oral Treatments',        'dog-flea-tick-oral',           'dog-flea-tick', 'dog', 'animal_health_wellness', 3),
    ('Sprays',                 'dog-flea-tick-sprays',         'dog-flea-tick', 'dog', 'animal_health_wellness', 4),
    ('Yard/Home Flea Control', 'dog-flea-tick-yard-home',      'dog-flea-tick', 'dog', 'animal_health_wellness', 5),

    -- === DOG > Collars, Leashes & Harnesses ===
    ('Collars',                'dog-collars-leashes-harnesses-collars',    'dog-collars-leashes-harnesses', 'dog', 'general', 1),
    ('Leashes',                'dog-collars-leashes-harnesses-leashes',   'dog-collars-leashes-harnesses', 'dog', 'general', 2),
    ('Harnesses',              'dog-collars-leashes-harnesses-harnesses', 'dog-collars-leashes-harnesses', 'dog', 'general', 3),
    ('ID Tags',                'dog-collars-leashes-harnesses-id-tags',   'dog-collars-leashes-harnesses', 'dog', 'general', 4),

    -- === DOG > Beds & Furniture ===
    ('Beds',                   'dog-beds-furniture-beds',        'dog-beds-furniture', 'dog', 'general', 1),
    ('Crate Mats',             'dog-beds-furniture-crate-mats',  'dog-beds-furniture', 'dog', 'general', 2),
    ('Blankets',               'dog-beds-furniture-blankets',    'dog-beds-furniture', 'dog', 'general', 3),

    -- === DOG > Crates, Kennels & Gates ===
    ('Crates',                 'dog-crates-kennels-gates-crates',   'dog-crates-kennels-gates', 'dog', 'animal_habitat_containment', 1),
    ('Kennels',                'dog-crates-kennels-gates-kennels',  'dog-crates-kennels-gates', 'dog', 'animal_habitat_containment', 2),
    ('Pens',                   'dog-crates-kennels-gates-pens',     'dog-crates-kennels-gates', 'dog', 'animal_habitat_containment', 3),
    ('Gates',                  'dog-crates-kennels-gates-gates',    'dog-crates-kennels-gates', 'dog', 'animal_habitat_containment', 4),

    -- === DOG > Bowls & Feeders ===
    ('Bowls',                  'dog-bowls-feeders-bowls',         'dog-bowls-feeders', 'dog', 'general', 1),
    ('Slow Feeders',           'dog-bowls-feeders-slow',         'dog-bowls-feeders', 'dog', 'general', 2),
    ('Raised Feeders',         'dog-bowls-feeders-raised',       'dog-bowls-feeders', 'dog', 'general', 3),
    ('Waterers',               'dog-bowls-feeders-waterers',     'dog-bowls-feeders', 'dog', 'general', 4),

    -- === DOG > Grooming ===
    ('Shampoo',                'dog-grooming-shampoo',     'dog-grooming', 'dog', 'grooming_cleaning', 1),
    ('Brushes',                'dog-grooming-brushes',     'dog-grooming', 'dog', 'grooming_cleaning', 2),
    ('Nail Care',              'dog-grooming-nail-care',   'dog-grooming', 'dog', 'grooming_cleaning', 3),
    ('Ear Care',               'dog-grooming-ear-care',    'dog-grooming', 'dog', 'grooming_cleaning', 4),
    ('Wipes',                  'dog-grooming-wipes',       'dog-grooming', 'dog', 'grooming_cleaning', 5),

    -- === DOG > Cleaning & Potty ===
    ('Pee Pads',               'dog-cleaning-potty-pee-pads',      'dog-cleaning-potty', 'dog', 'grooming_cleaning', 1),
    ('Poop Bags',              'dog-cleaning-potty-poop-bags',     'dog-cleaning-potty', 'dog', 'grooming_cleaning', 2),
    ('Stain/Odor Removers',    'dog-cleaning-potty-stain-odor',    'dog-cleaning-potty', 'dog', 'grooming_cleaning', 3),
    ('Diapers',                'dog-cleaning-potty-diapers',        'dog-cleaning-potty', 'dog', 'grooming_cleaning', 4),

    -- === DOG > Training & Behavior ===
    ('Training Aids',          'dog-training-behavior-aids',       'dog-training-behavior', 'dog', 'general', 1),
    ('Clickers',               'dog-training-behavior-clickers',   'dog-training-behavior', 'dog', 'general', 2),
    ('Bark Control',           'dog-training-behavior-bark',       'dog-training-behavior', 'dog', 'general', 3),
    ('Calming',                'dog-training-behavior-calming',    'dog-training-behavior', 'dog', 'general', 4),

    -- === DOG > Travel & Outdoor ===
    ('Carriers',               'dog-travel-outdoor-carriers',      'dog-travel-outdoor', 'dog', 'general', 1),
    ('Car Seats',              'dog-travel-outdoor-car-seats',     'dog-travel-outdoor', 'dog', 'general', 2),
    ('Ramps',                  'dog-travel-outdoor-ramps',         'dog-travel-outdoor', 'dog', 'general', 3),
    ('Outdoor Gear',           'dog-travel-outdoor-gear',          'dog-travel-outdoor', 'dog', 'general', 4),

    -- === DOG > Apparel ===
    ('Coats',                  'dog-apparel-coats',     'dog-apparel', 'dog', 'general', 1),
    ('Sweaters',               'dog-apparel-sweaters',  'dog-apparel', 'dog', 'general', 2),
    ('Boots',                  'dog-apparel-boots',     'dog-apparel', 'dog', 'general', 3),
    ('Life Jackets',           'dog-apparel-life-jackets', 'dog-apparel', 'dog', 'general', 4),

    -- === CAT > Food ===
    ('Dry Food',               'cat-food-dry',               'cat-food', 'cat', 'animal_food', 1),
    ('Wet Food',               'cat-food-wet',               'cat-food', 'cat', 'animal_food', 2),
    ('Toppers',                'cat-food-toppers',           'cat-food', 'cat', 'animal_food', 3),
    ('Veterinary Diets',       'cat-food-veterinary-diets',  'cat-food', 'cat', 'animal_food', 4),
    ('Kitten Food',            'cat-food-kitten',            'cat-food', 'cat', 'animal_food', 5),

    -- === CAT > Treats ===
    ('Crunchy Treats',         'cat-treats-crunchy',      'cat-treats', 'cat', 'animal_treats_chews', 1),
    ('Soft Treats',            'cat-treats-soft',         'cat-treats', 'cat', 'animal_treats_chews', 2),
    ('Lickable Treats',        'cat-treats-lickable',     'cat-treats', 'cat', 'animal_treats_chews', 3),
    ('Dental Treats',          'cat-treats-dental',       'cat-treats', 'cat', 'animal_treats_chews', 4),
    ('Catnip',                 'cat-treats-catnip',       'cat-treats', 'cat', 'animal_treats_chews', 5),

    -- === CAT > Litter ===
    ('Clumping',               'cat-litter-clumping',        'cat-litter', 'cat', 'animal_litter_bedding', 1),
    ('Non-Clumping',           'cat-litter-non-clumping',    'cat-litter', 'cat', 'animal_litter_bedding', 2),
    ('Crystal',                'cat-litter-crystal',         'cat-litter', 'cat', 'animal_litter_bedding', 3),
    ('Natural',                'cat-litter-natural',         'cat-litter', 'cat', 'animal_litter_bedding', 4),
    ('Lightweight',            'cat-litter-lightweight',     'cat-litter', 'cat', 'animal_litter_bedding', 5),
    ('Scented',                'cat-litter-scented',         'cat-litter', 'cat', 'animal_litter_bedding', 6),
    ('Unscented',              'cat-litter-unscented',       'cat-litter', 'cat', 'animal_litter_bedding', 7),

    -- === CAT > Litter Boxes & Accessories ===
    ('Litter Boxes',           'cat-litter-boxes-accessories-boxes',    'cat-litter-boxes-accessories', 'cat', 'general', 1),
    ('Scoops',                 'cat-litter-boxes-accessories-scoops',   'cat-litter-boxes-accessories', 'cat', 'general', 2),
    ('Mats',                   'cat-litter-boxes-accessories-mats',     'cat-litter-boxes-accessories', 'cat', 'general', 3),
    ('Liners',                 'cat-litter-boxes-accessories-liners',   'cat-litter-boxes-accessories', 'cat', 'general', 4),
    ('Deodorizers',            'cat-litter-boxes-accessories-deodorizers', 'cat-litter-boxes-accessories', 'cat', 'general', 5),

    -- === CAT > Toys ===
    ('Interactive',            'cat-toys-interactive',         'cat-toys', 'cat', 'animal_toys_enrichment', 1),
    ('Wands',                  'cat-toys-wands',              'cat-toys', 'cat', 'animal_toys_enrichment', 2),
    ('Balls',                  'cat-toys-balls',              'cat-toys', 'cat', 'animal_toys_enrichment', 3),
    ('Catnip Toys',            'cat-toys-catnip',             'cat-toys', 'cat', 'animal_toys_enrichment', 4),
    ('Plush/Mice',             'cat-toys-plush-mice',         'cat-toys', 'cat', 'animal_toys_enrichment', 5),

    -- === CAT > Trees, Scratchers & Furniture ===
    ('Trees',                  'cat-trees-scratchers-furniture-trees',       'cat-trees-scratchers-furniture', 'cat', 'animal_toys_enrichment', 1),
    ('Condos',                 'cat-trees-scratchers-furniture-condos',      'cat-trees-scratchers-furniture', 'cat', 'animal_toys_enrichment', 2),
    ('Scratchers',             'cat-trees-scratchers-furniture-scratchers',  'cat-trees-scratchers-furniture', 'cat', 'animal_toys_enrichment', 3),
    ('Window Perches',         'cat-trees-scratchers-furniture-window-perches', 'cat-trees-scratchers-furniture', 'cat', 'animal_toys_enrichment', 4),

    -- === CAT > Health & Wellness ===
    ('Supplements',            'cat-health-wellness-supplements',   'cat-health-wellness', 'cat', 'animal_health_wellness', 1),
    ('Hairball',               'cat-health-wellness-hairball',      'cat-health-wellness', 'cat', 'animal_health_wellness', 2),
    ('Digestive',              'cat-health-wellness-digestive',     'cat-health-wellness', 'cat', 'animal_health_wellness', 3),
    ('Urinary',                'cat-health-wellness-urinary',       'cat-health-wellness', 'cat', 'animal_health_wellness', 4),
    ('Calming',                'cat-health-wellness-calming',       'cat-health-wellness', 'cat', 'animal_health_wellness', 5),

    -- === CAT > Flea & Tick ===
    ('Topicals',               'cat-flea-tick-topicals',  'cat-flea-tick', 'cat', 'animal_health_wellness', 1),
    ('Collars',                'cat-flea-tick-collars',   'cat-flea-tick', 'cat', 'animal_health_wellness', 2),
    ('Sprays',                 'cat-flea-tick-sprays',    'cat-flea-tick', 'cat', 'animal_health_wellness', 3),

    -- === CAT > Beds ===
    ('Beds',                   'cat-beds-beds',       'cat-beds', 'cat', 'general', 1),
    ('Caves',                  'cat-beds-caves',      'cat-beds', 'cat', 'general', 2),
    ('Mats',                   'cat-beds-mats',       'cat-beds', 'cat', 'general', 3),

    -- === CAT > Bowls & Feeders ===
    ('Bowls',                  'cat-bowls-feeders-bowls',       'cat-bowls-feeders', 'cat', 'general', 1),
    ('Fountains',              'cat-bowls-feeders-fountains',   'cat-bowls-feeders', 'cat', 'general', 2),
    ('Automatic Feeders',      'cat-bowls-feeders-automatic',   'cat-bowls-feeders', 'cat', 'general', 3),

    -- === CAT > Grooming ===
    ('Brushes',                'cat-grooming-brushes',    'cat-grooming', 'cat', 'grooming_cleaning', 1),
    ('Shampoo',                'cat-grooming-shampoo',    'cat-grooming', 'cat', 'grooming_cleaning', 2),
    ('Nail Care',              'cat-grooming-nail-care',  'cat-grooming', 'cat', 'grooming_cleaning', 3),
    ('Wipes',                  'cat-grooming-wipes',      'cat-grooming', 'cat', 'grooming_cleaning', 4),

    -- === CAT > Carriers & Travel ===
    ('Carriers',               'cat-carriers-travel-carriers',           'cat-carriers-travel', 'cat', 'general', 1),
    ('Harnesses',              'cat-carriers-travel-harnesses',          'cat-carriers-travel', 'cat', 'general', 2),
    ('Travel Accessories',     'cat-carriers-travel-accessories',        'cat-carriers-travel', 'cat', 'general', 3),

    -- === CAT > Collars & Harnesses ===
    ('Collars',                'cat-collars-harnesses-collars',    'cat-collars-harnesses', 'cat', 'general', 1),
    ('Harnesses',              'cat-collars-harnesses-harnesses',  'cat-collars-harnesses', 'cat', 'general', 2),
    ('ID Tags',                'cat-collars-harnesses-id-tags',    'cat-collars-harnesses', 'cat', 'general', 3),

    -- === SMALL PET > Food ===
    ('Rabbit Food',            'small-pet-food-rabbit',         'small-pet-food', 'small-pet', 'animal_food', 1),
    ('Guinea Pig Food',        'small-pet-food-guinea-pig',     'small-pet-food', 'small-pet', 'animal_food', 2),
    ('Hamster/Gerbil Food',    'small-pet-food-hamster-gerbil', 'small-pet-food', 'small-pet', 'animal_food', 3),
    ('Ferret Food',            'small-pet-food-ferret',         'small-pet-food', 'small-pet', 'animal_food', 4),
    ('Chinchilla Food',        'small-pet-food-chinchilla',     'small-pet-food', 'small-pet', 'animal_food', 5),

    -- === SMALL PET > Hay ===
    ('Timothy Hay',            'small-pet-hay-timothy',     'small-pet-hay', 'small-pet', 'animal_food', 1),
    ('Orchard Grass',          'small-pet-hay-orchard',     'small-pet-hay', 'small-pet', 'animal_food', 2),
    ('Alfalfa',                'small-pet-hay-alfalfa',     'small-pet-hay', 'small-pet', 'animal_food', 3),

    -- === SMALL PET > Treats & Chews ===
    ('Treats',                 'small-pet-treats-chews-treats',      'small-pet-treats-chews', 'small-pet', 'animal_treats_chews', 1),
    ('Chew Sticks',            'small-pet-treats-chews-sticks',      'small-pet-treats-chews', 'small-pet', 'animal_treats_chews', 2),
    ('Mineral Chews',          'small-pet-treats-chews-mineral',     'small-pet-treats-chews', 'small-pet', 'animal_treats_chews', 3),

    -- === SMALL PET > Bedding & Litter ===
    ('Paper Bedding',          'small-pet-bedding-litter-paper',   'small-pet-bedding-litter', 'small-pet', 'animal_litter_bedding', 1),
    ('Wood Bedding',           'small-pet-bedding-litter-wood',    'small-pet-bedding-litter', 'small-pet', 'animal_litter_bedding', 2),
    ('Litter',                 'small-pet-bedding-litter-litter',  'small-pet-bedding-litter', 'small-pet', 'animal_litter_bedding', 3),

    -- === SMALL PET > Cages & Habitats ===
    ('Cages',                  'small-pet-cages-habitats-cages',       'small-pet-cages-habitats', 'small-pet', 'animal_habitat_containment', 1),
    ('Hutches',                'small-pet-cages-habitats-hutches',     'small-pet-cages-habitats', 'small-pet', 'animal_habitat_containment', 2),
    ('Playpens',               'small-pet-cages-habitats-playpens',    'small-pet-cages-habitats', 'small-pet', 'animal_habitat_containment', 3),
    ('Habitat Accessories',    'small-pet-cages-habitats-accessories', 'small-pet-cages-habitats', 'small-pet', 'animal_habitat_containment', 4),

    -- === SMALL PET > Toys & Enrichment ===
    ('Chew Toys',              'small-pet-toys-enrichment-chew',      'small-pet-toys-enrichment', 'small-pet', 'animal_toys_enrichment', 1),
    ('Tunnels',                'small-pet-toys-enrichment-tunnels',   'small-pet-toys-enrichment', 'small-pet', 'animal_toys_enrichment', 2),
    ('Exercise Wheels',        'small-pet-toys-enrichment-wheels',    'small-pet-toys-enrichment', 'small-pet', 'animal_toys_enrichment', 3),

    -- === SMALL PET > Bowls, Feeders & Waterers ===
    ('Bowls',                  'small-pet-bowls-feeders-waterers-bowls',   'small-pet-bowls-feeders-waterers', 'small-pet', 'general', 1),
    ('Bottles',                'small-pet-bowls-feeders-waterers-bottles', 'small-pet-bowls-feeders-waterers', 'small-pet', 'general', 2),
    ('Hay Feeders',            'small-pet-bowls-feeders-waterers-hay',     'small-pet-bowls-feeders-waterers', 'small-pet', 'general', 3),

    -- === SMALL PET > Health & Grooming ===
    ('Supplements',            'small-pet-health-grooming-supplements',  'small-pet-health-grooming', 'small-pet', 'animal_health_wellness', 1),
    ('Nail Care',              'small-pet-health-grooming-nail-care',    'small-pet-health-grooming', 'small-pet', 'animal_health_wellness', 2),
    ('Brushes',                'small-pet-health-grooming-brushes',      'small-pet-health-grooming', 'small-pet', 'animal_health_wellness', 3),

    -- === PET BIRD > Food ===
    ('Parrot Food',            'pet-bird-food-parrot',        'pet-bird-food', 'pet-bird', 'animal_food', 1),
    ('Parakeet Food',          'pet-bird-food-parakeet',      'pet-bird-food', 'pet-bird', 'animal_food', 2),
    ('Cockatiel Food',         'pet-bird-food-cockatiel',     'pet-bird-food', 'pet-bird', 'animal_food', 3),
    ('Finch/Canary Food',      'pet-bird-food-finch-canary',  'pet-bird-food', 'pet-bird', 'animal_food', 4),

    -- === PET BIRD > Treats ===
    ('Seed Treats',            'pet-bird-treats-seed',        'pet-bird-treats', 'pet-bird', 'animal_treats_chews', 1),
    ('Millet',                 'pet-bird-treats-millet',      'pet-bird-treats', 'pet-bird', 'animal_treats_chews', 2),
    ('Mineral Treats',         'pet-bird-treats-mineral',     'pet-bird-treats', 'pet-bird', 'animal_treats_chews', 3),

    -- === PET BIRD > Cages & Stands ===
    ('Cages',                  'pet-bird-cages-stands-cages',    'pet-bird-cages-stands', 'pet-bird', 'animal_habitat_containment', 1),
    ('Stands',                 'pet-bird-cages-stands-stands',   'pet-bird-cages-stands', 'pet-bird', 'animal_habitat_containment', 2),
    ('Covers',                 'pet-bird-cages-stands-covers',   'pet-bird-cages-stands', 'pet-bird', 'animal_habitat_containment', 3),

    -- === PET BIRD > Toys ===
    ('Chew Toys',              'pet-bird-toys-chew',          'pet-bird-toys', 'pet-bird', 'animal_toys_enrichment', 1),
    ('Foraging Toys',          'pet-bird-toys-foraging',      'pet-bird-toys', 'pet-bird', 'animal_toys_enrichment', 2),
    ('Swings',                 'pet-bird-toys-swings',        'pet-bird-toys', 'pet-bird', 'animal_toys_enrichment', 3),

    -- === PET BIRD > Perches ===
    ('Wood Perches',           'pet-bird-perches-wood',       'pet-bird-perches', 'pet-bird', 'general', 1),
    ('Rope Perches',           'pet-bird-perches-rope',       'pet-bird-perches', 'pet-bird', 'general', 2),
    ('Heated Perches',         'pet-bird-perches-heated',     'pet-bird-perches', 'pet-bird', 'general', 3),

    -- === PET BIRD > Feeders & Waterers ===
    ('Cups',                   'pet-bird-feeders-waterers-cups',      'pet-bird-feeders-waterers', 'pet-bird', 'general', 1),
    ('Feeders',                'pet-bird-feeders-waterers-feeders',   'pet-bird-feeders-waterers', 'pet-bird', 'general', 2),
    ('Waterers',               'pet-bird-feeders-waterers-waterers',  'pet-bird-feeders-waterers', 'pet-bird', 'general', 3),

    -- === PET BIRD > Health & Grooming ===
    ('Supplements',            'pet-bird-health-grooming-supplements',  'pet-bird-health-grooming', 'pet-bird', 'animal_health_wellness', 1),
    ('Beak/Nail Care',         'pet-bird-health-grooming-beak-nail',   'pet-bird-health-grooming', 'pet-bird', 'animal_health_wellness', 2),
    ('Bathing',                'pet-bird-health-grooming-bathing',     'pet-bird-health-grooming', 'pet-bird', 'animal_health_wellness', 3),

    -- === PET BIRD > Bedding & Litter ===
    ('Cage Liners',            'pet-bird-bedding-litter-cage-liners',  'pet-bird-bedding-litter', 'pet-bird', 'animal_litter_bedding', 1),
    ('Litter',                 'pet-bird-bedding-litter-litter',       'pet-bird-bedding-litter', 'pet-bird', 'animal_litter_bedding', 2),

    -- === FISH & AQUARIUM > Fish Food ===
    ('Flakes',                 'fish-aquarium-food-flakes',             'fish-aquarium-food', 'fish-aquarium', 'animal_food', 1),
    ('Pellets',                'fish-aquarium-food-pellets',            'fish-aquarium-food', 'fish-aquarium', 'animal_food', 2),
    ('Freeze-Dried',           'fish-aquarium-food-freeze-dried',       'fish-aquarium-food', 'fish-aquarium', 'animal_food', 3),
    ('Frozen',                 'fish-aquarium-food-frozen',             'fish-aquarium-food', 'fish-aquarium', 'animal_food', 4),
    ('Vacation Feeders',       'fish-aquarium-food-vacation',           'fish-aquarium-food', 'fish-aquarium', 'animal_food', 5),
    ('Pond/Koi Food',          'fish-aquarium-food-pond-koi',           'fish-aquarium-food', 'fish-aquarium', 'animal_food', 6),

    -- === FISH & AQUARIUM > Aquariums & Tanks ===
    ('Tanks',                  'fish-aquarium-tanks-tanks',             'fish-aquarium-tanks', 'fish-aquarium', 'animal_habitat_containment', 1),
    ('Starter Kits',           'fish-aquarium-tanks-starter-kits',      'fish-aquarium-tanks', 'fish-aquarium', 'animal_habitat_containment', 2),
    ('Stands',                 'fish-aquarium-tanks-stands',            'fish-aquarium-tanks', 'fish-aquarium', 'animal_habitat_containment', 3),

    -- === FISH & AQUARIUM > Filters & Media ===
    ('Filters',                'fish-aquarium-filters-media-filters',       'fish-aquarium-filters-media', 'fish-aquarium', 'aquarium_equipment', 1),
    ('Cartridges',              'fish-aquarium-filters-media-cartridges',   'fish-aquarium-filters-media', 'fish-aquarium', 'aquarium_equipment', 2),
    ('Biological Media',        'fish-aquarium-filters-media-biological',   'fish-aquarium-filters-media', 'fish-aquarium', 'aquarium_equipment', 3),
    ('Carbon',                  'fish-aquarium-filters-media-carbon',       'fish-aquarium-filters-media', 'fish-aquarium', 'aquarium_equipment', 4),

    -- === FISH & AQUARIUM > Pumps & Air ===
    ('Air Pumps',              'fish-aquarium-pumps-air-air-pumps',       'fish-aquarium-pumps-air', 'fish-aquarium', 'aquarium_equipment', 1),
    ('Water Pumps',            'fish-aquarium-pumps-air-water-pumps',     'fish-aquarium-pumps-air', 'fish-aquarium', 'aquarium_equipment', 2),
    ('Tubing',                 'fish-aquarium-pumps-air-tubing',          'fish-aquarium-pumps-air', 'fish-aquarium', 'aquarium_equipment', 3),
    ('Air Stones',             'fish-aquarium-pumps-air-air-stones',      'fish-aquarium-pumps-air', 'fish-aquarium', 'aquarium_equipment', 4),

    -- === FISH & AQUARIUM > Heating & Lighting ===
    ('Heaters',                'fish-aquarium-heating-lighting-heaters',        'fish-aquarium-heating-lighting', 'fish-aquarium', 'aquarium_equipment', 1),
    ('Thermometers',           'fish-aquarium-heating-lighting-thermometers',   'fish-aquarium-heating-lighting', 'fish-aquarium', 'aquarium_equipment', 2),
    ('Aquarium Lights',        'fish-aquarium-heating-lighting-lights',         'fish-aquarium-heating-lighting', 'fish-aquarium', 'aquarium_equipment', 3),

    -- === FISH & AQUARIUM > Water Care ===
    ('Conditioners',           'fish-aquarium-water-care-conditioners',      'fish-aquarium-water-care', 'fish-aquarium', 'aquarium_equipment', 1),
    ('Test Kits',              'fish-aquarium-water-care-test-kits',         'fish-aquarium-water-care', 'fish-aquarium', 'aquarium_equipment', 2),
    ('Treatments',             'fish-aquarium-water-care-treatments',        'fish-aquarium-water-care', 'fish-aquarium', 'aquarium_equipment', 3),
    ('Salt',                   'fish-aquarium-water-care-salt',              'fish-aquarium-water-care', 'fish-aquarium', 'aquarium_equipment', 4),

    -- === FISH & AQUARIUM > Decor & Substrate ===
    ('Gravel',                 'fish-aquarium-decor-substrate-gravel',        'fish-aquarium-decor-substrate', 'fish-aquarium', 'general', 1),
    ('Sand',                   'fish-aquarium-decor-substrate-sand',          'fish-aquarium-decor-substrate', 'fish-aquarium', 'general', 2),
    ('Plants',                 'fish-aquarium-decor-substrate-plants',        'fish-aquarium-decor-substrate', 'fish-aquarium', 'general', 3),
    ('Ornaments',              'fish-aquarium-decor-substrate-ornaments',     'fish-aquarium-decor-substrate', 'fish-aquarium', 'general', 4),
    ('Backgrounds',            'fish-aquarium-decor-substrate-backgrounds',   'fish-aquarium-decor-substrate', 'fish-aquarium', 'general', 5),

    -- === FISH & AQUARIUM > Maintenance ===
    ('Nets',                   'fish-aquarium-maintenance-nets',           'fish-aquarium-maintenance', 'fish-aquarium', 'general', 1),
    ('Scrapers',               'fish-aquarium-maintenance-scrapers',       'fish-aquarium-maintenance', 'fish-aquarium', 'general', 2),
    ('Gravel Vacuums',         'fish-aquarium-maintenance-gravel-vacuums', 'fish-aquarium-maintenance', 'fish-aquarium', 'general', 3),

    -- === FISH & AQUARIUM > Pond & Koi ===
    ('Pond Food',              'fish-aquarium-pond-koi-food',            'fish-aquarium-pond-koi', 'fish-aquarium', 'general', 1),
    ('Pond Pumps',             'fish-aquarium-pond-koi-pumps',           'fish-aquarium-pond-koi', 'fish-aquarium', 'general', 2),
    ('Pond Treatments',        'fish-aquarium-pond-koi-treatments',      'fish-aquarium-pond-koi', 'fish-aquarium', 'general', 3),

    -- === REPTILE & AMPHIBIAN > Food & Treats ===
    ('Dry Food',               'reptile-amphibian-food-dry',          'reptile-amphibian-food', 'reptile-amphibian', 'animal_food', 1),
    ('Canned Food',            'reptile-amphibian-food-canned',       'reptile-amphibian-food', 'reptile-amphibian', 'animal_food', 2),
    ('Freeze-Dried',           'reptile-amphibian-food-freeze-dried',  'reptile-amphibian-food', 'reptile-amphibian', 'animal_food', 3),
    ('Live Feeders',           'reptile-amphibian-food-live',          'reptile-amphibian-food', 'reptile-amphibian', 'animal_food', 4),

    -- === REPTILE & AMPHIBIAN > Tanks & Terrariums ===
    ('Terrariums',             'reptile-amphibian-tanks-terrariums-terrariums',    'reptile-amphibian-tanks-terrariums', 'reptile-amphibian', 'animal_habitat_containment', 1),
    ('Screen Lids',            'reptile-amphibian-tanks-terrariums-lids',          'reptile-amphibian-tanks-terrariums', 'reptile-amphibian', 'animal_habitat_containment', 2),
    ('Stands',                 'reptile-amphibian-tanks-terrariums-stands',        'reptile-amphibian-tanks-terrariums', 'reptile-amphibian', 'animal_habitat_containment', 3),

    -- === REPTILE & AMPHIBIAN > Heating & Lighting ===
    ('Heat Lamps',             'reptile-amphibian-heating-lighting-heat-lamps',       'reptile-amphibian-heating-lighting', 'reptile-amphibian', 'reptile_equipment', 1),
    ('UVB Bulbs',              'reptile-amphibian-heating-lighting-uvb',              'reptile-amphibian-heating-lighting', 'reptile-amphibian', 'reptile_equipment', 2),
    ('Fixtures',               'reptile-amphibian-heating-lighting-fixtures',         'reptile-amphibian-heating-lighting', 'reptile-amphibian', 'reptile_equipment', 3),
    ('Ceramic Emitters',       'reptile-amphibian-heating-lighting-ceramic',          'reptile-amphibian-heating-lighting', 'reptile-amphibian', 'reptile_equipment', 4),

    -- === REPTILE & AMPHIBIAN > Substrate & Bedding ===
    ('Sand',                   'reptile-amphibian-substrate-bedding-sand',        'reptile-amphibian-substrate-bedding', 'reptile-amphibian', 'animal_litter_bedding', 1),
    ('Coconut Fiber',          'reptile-amphibian-substrate-bedding-coconut',     'reptile-amphibian-substrate-bedding', 'reptile-amphibian', 'animal_litter_bedding', 2),
    ('Bark',                   'reptile-amphibian-substrate-bedding-bark',         'reptile-amphibian-substrate-bedding', 'reptile-amphibian', 'animal_litter_bedding', 3),
    ('Moss',                   'reptile-amphibian-substrate-bedding-moss',         'reptile-amphibian-substrate-bedding', 'reptile-amphibian', 'animal_litter_bedding', 4),
    ('Liners',                 'reptile-amphibian-substrate-bedding-liners',       'reptile-amphibian-substrate-bedding', 'reptile-amphibian', 'animal_litter_bedding', 5),

    -- === REPTILE & AMPHIBIAN > Habitat Decor ===
    ('Hides',                  'reptile-amphibian-habitat-decor-hides',         'reptile-amphibian-habitat-decor', 'reptile-amphibian', 'general', 1),
    ('Branches',               'reptile-amphibian-habitat-decor-branches',      'reptile-amphibian-habitat-decor', 'reptile-amphibian', 'general', 2),
    ('Plants',                 'reptile-amphibian-habitat-decor-plants',        'reptile-amphibian-habitat-decor', 'reptile-amphibian', 'general', 3),
    ('Backgrounds',            'reptile-amphibian-habitat-decor-backgrounds',   'reptile-amphibian-habitat-decor', 'reptile-amphibian', 'general', 4),

    -- === REPTILE & AMPHIBIAN > Humidity & Water ===
    ('Misters',                'reptile-amphibian-humidity-water-misters',    'reptile-amphibian-humidity-water', 'reptile-amphibian', 'general', 1),
    ('Foggers',                'reptile-amphibian-humidity-water-foggers',    'reptile-amphibian-humidity-water', 'reptile-amphibian', 'general', 2),
    ('Bowls',                  'reptile-amphibian-humidity-water-bowls',      'reptile-amphibian-humidity-water', 'reptile-amphibian', 'general', 3),
    ('Hygrometers',            'reptile-amphibian-humidity-water-hygrometers','reptile-amphibian-humidity-water', 'reptile-amphibian', 'general', 4),

    -- === REPTILE & AMPHIBIAN > Supplements & Health ===
    ('Calcium',                'reptile-amphibian-supplements-health-calcium',     'reptile-amphibian-supplements-health', 'reptile-amphibian', 'animal_health_wellness', 1),
    ('Vitamins',               'reptile-amphibian-supplements-health-vitamins',    'reptile-amphibian-supplements-health', 'reptile-amphibian', 'animal_health_wellness', 2),
    ('Shedding Support',       'reptile-amphibian-supplements-health-shedding',    'reptile-amphibian-supplements-health', 'reptile-amphibian', 'animal_health_wellness', 3),

    -- === WILD BIRD & WILDLIFE > Wild Bird Food ===
    ('Seed Mixes',             'wild-bird-wildlife-food-seed-mixes',         'wild-bird-wildlife-food', 'wild-bird-wildlife', 'animal_food', 1),
    ('Sunflower Seed',         'wild-bird-wildlife-food-sunflower',          'wild-bird-wildlife-food', 'wild-bird-wildlife', 'animal_food', 2),
    ('Nyjer',                  'wild-bird-wildlife-food-nyjer',              'wild-bird-wildlife-food', 'wild-bird-wildlife', 'animal_food', 3),
    ('Mealworms',              'wild-bird-wildlife-food-mealworms',          'wild-bird-wildlife-food', 'wild-bird-wildlife', 'animal_food', 4),

    -- === WILD BIRD & WILDLIFE > Suet ===
    ('Cakes',                  'wild-bird-wildlife-suet-cakes',      'wild-bird-wildlife-suet', 'wild-bird-wildlife', 'animal_food', 1),
    ('Nuggets',                'wild-bird-wildlife-suet-nuggets',    'wild-bird-wildlife-suet', 'wild-bird-wildlife', 'animal_food', 2),
    ('Plugs',                  'wild-bird-wildlife-suet-plugs',      'wild-bird-wildlife-suet', 'wild-bird-wildlife', 'animal_food', 3),

    -- === WILD BIRD & WILDLIFE > Feeders ===
    ('Tube Feeders',           'wild-bird-wildlife-feeders-tube',        'wild-bird-wildlife-feeders', 'wild-bird-wildlife', 'general', 1),
    ('Hopper Feeders',         'wild-bird-wildlife-feeders-hopper',      'wild-bird-wildlife-feeders', 'wild-bird-wildlife', 'general', 2),
    ('Platform Feeders',       'wild-bird-wildlife-feeders-platform',    'wild-bird-wildlife-feeders', 'wild-bird-wildlife', 'general', 3),
    ('Suet Feeders',           'wild-bird-wildlife-feeders-suet',        'wild-bird-wildlife-feeders', 'wild-bird-wildlife', 'general', 4),

    -- === WILD BIRD & WILDLIFE > Hummingbird ===
    ('Nectar',                 'wild-bird-wildlife-hummingbird-nectar',        'wild-bird-wildlife-hummingbird', 'wild-bird-wildlife', 'general', 1),
    ('Feeders',                'wild-bird-wildlife-hummingbird-feeders',       'wild-bird-wildlife-hummingbird', 'wild-bird-wildlife', 'general', 2),
    ('Accessories',            'wild-bird-wildlife-hummingbird-accessories',   'wild-bird-wildlife-hummingbird', 'wild-bird-wildlife', 'general', 3),

    -- === WILD BIRD & WILDLIFE > Bird Houses & Nesting ===
    ('Houses',                 'wild-bird-wildlife-houses-nesting-houses',     'wild-bird-wildlife-houses-nesting', 'wild-bird-wildlife', 'general', 1),
    ('Nesting Materials',      'wild-bird-wildlife-houses-nesting-materials',  'wild-bird-wildlife-houses-nesting', 'wild-bird-wildlife', 'general', 2),

    -- === WILD BIRD & WILDLIFE > Bird Baths ===
    ('Baths',                  'wild-bird-wildlife-bird-baths-baths',         'wild-bird-wildlife-bird-baths', 'wild-bird-wildlife', 'general', 1),
    ('Heaters',                'wild-bird-wildlife-bird-baths-heaters',       'wild-bird-wildlife-bird-baths', 'wild-bird-wildlife', 'general', 2),
    ('Accessories',            'wild-bird-wildlife-bird-baths-accessories',   'wild-bird-wildlife-bird-baths', 'wild-bird-wildlife', 'general', 3),

    -- === WILD BIRD & WILDLIFE > Wildlife Feed ===
    ('Squirrel',               'wild-bird-wildlife-wildlife-feed-squirrel',      'wild-bird-wildlife-wildlife-feed', 'wild-bird-wildlife', 'animal_feed_farm', 1),
    ('Deer',                   'wild-bird-wildlife-wildlife-feed-deer',          'wild-bird-wildlife-wildlife-feed', 'wild-bird-wildlife', 'animal_feed_farm', 2),
    ('Duck/Waterfowl',         'wild-bird-wildlife-wildlife-feed-duck',          'wild-bird-wildlife-wildlife-feed', 'wild-bird-wildlife', 'animal_feed_farm', 3),

    -- === WILD BIRD & WILDLIFE > Pest & Critter Control ===
    ('Repellents',             'wild-bird-wildlife-pest-critter-control-repellents', 'wild-bird-wildlife-pest-critter-control', 'wild-bird-wildlife', 'general', 1),
    ('Baffles',                'wild-bird-wildlife-pest-critter-control-baffles',    'wild-bird-wildlife-pest-critter-control', 'wild-bird-wildlife', 'general', 2),
    ('Guards',                 'wild-bird-wildlife-pest-critter-control-guards',     'wild-bird-wildlife-pest-critter-control', 'wild-bird-wildlife', 'general', 3),

    -- === CHICKEN & POULTRY > Feed ===
    ('Layer Feed',             'chicken-poultry-feed-layer',          'chicken-poultry-feed', 'chicken-poultry', 'animal_feed_farm', 1),
    ('Starter/Grower',         'chicken-poultry-feed-starter-grower', 'chicken-poultry-feed', 'chicken-poultry', 'animal_feed_farm', 2),
    ('Scratch Grains',         'chicken-poultry-feed-scratch',        'chicken-poultry-feed', 'chicken-poultry', 'animal_feed_farm', 3),
    ('Pellets',                'chicken-poultry-feed-pellets',        'chicken-poultry-feed', 'chicken-poultry', 'animal_feed_farm', 4),
    ('Crumbles',               'chicken-poultry-feed-crumbles',       'chicken-poultry-feed', 'chicken-poultry', 'animal_feed_farm', 5),

    -- === CHICKEN & POULTRY > Treats ===
    ('Mealworms',              'chicken-poultry-treats-mealworms',        'chicken-poultry-treats', 'chicken-poultry', 'animal_treats_chews', 1),
    ('Scratch Treats',         'chicken-poultry-treats-scratch',          'chicken-poultry-treats', 'chicken-poultry', 'animal_treats_chews', 2),
    ('Forage Blocks',          'chicken-poultry-treats-forage-blocks',    'chicken-poultry-treats', 'chicken-poultry', 'animal_treats_chews', 3),

    -- === CHICKEN & POULTRY > Coops & Runs ===
    ('Coops',                  'chicken-poultry-coops-runs-coops',           'chicken-poultry-coops-runs', 'chicken-poultry', 'animal_habitat_containment', 1),
    ('Runs',                   'chicken-poultry-coops-runs-runs',            'chicken-poultry-coops-runs', 'chicken-poultry', 'animal_habitat_containment', 2),
    ('Doors',                  'chicken-poultry-coops-runs-doors',           'chicken-poultry-coops-runs', 'chicken-poultry', 'animal_habitat_containment', 3),
    ('Nesting Boxes',          'chicken-poultry-coops-runs-nesting-boxes',   'chicken-poultry-coops-runs', 'chicken-poultry', 'animal_habitat_containment', 4),

    -- === CHICKEN & POULTRY > Feeders & Waterers ===
    ('Feeders',                'chicken-poultry-feeders-waterers-feeders',       'chicken-poultry-feeders-waterers', 'chicken-poultry', 'general', 1),
    ('Waterers',               'chicken-poultry-feeders-waterers-waterers',      'chicken-poultry-feeders-waterers', 'chicken-poultry', 'general', 2),
    ('Heated Waterers',        'chicken-poultry-feeders-waterers-heated',        'chicken-poultry-feeders-waterers', 'chicken-poultry', 'general', 3),

    -- === CHICKEN & POULTRY > Bedding ===
    ('Pine Shavings',          'chicken-poultry-bedding-pine-shavings',   'chicken-poultry-bedding', 'chicken-poultry', 'animal_litter_bedding', 1),
    ('Straw',                  'chicken-poultry-bedding-straw',           'chicken-poultry-bedding', 'chicken-poultry', 'animal_litter_bedding', 2),
    ('Coop Bedding',           'chicken-poultry-bedding-coop',            'chicken-poultry-bedding', 'chicken-poultry', 'animal_litter_bedding', 3),

    -- === CHICKEN & POULTRY > Health & Supplements ===
    ('Grit',                   'chicken-poultry-health-supplements-grit',          'chicken-poultry-health-supplements', 'chicken-poultry', 'animal_health_wellness', 1),
    ('Oyster Shell',           'chicken-poultry-health-supplements-oyster-shell',  'chicken-poultry-health-supplements', 'chicken-poultry', 'animal_health_wellness', 2),
    ('Vitamins',               'chicken-poultry-health-supplements-vitamins',      'chicken-poultry-health-supplements', 'chicken-poultry', 'animal_health_wellness', 3),
    ('First Aid',              'chicken-poultry-health-supplements-first-aid',     'chicken-poultry-health-supplements', 'chicken-poultry', 'animal_health_wellness', 4),

    -- === CHICKEN & POULTRY > Egg Supplies ===
    ('Egg Cartons',            'chicken-poultry-egg-supplies-cartons',    'chicken-poultry-egg-supplies', 'chicken-poultry', 'general', 1),
    ('Washes',                 'chicken-poultry-egg-supplies-washes',     'chicken-poultry-egg-supplies', 'chicken-poultry', 'general', 2),
    ('Storage',                'chicken-poultry-egg-supplies-storage',    'chicken-poultry-egg-supplies', 'chicken-poultry', 'general', 3),

    -- === CHICKEN & POULTRY > Brooding ===
    ('Heat Lamps',             'chicken-poultry-brooding-heat-lamps',    'chicken-poultry-brooding', 'chicken-poultry', 'general', 1),
    ('Brooders',               'chicken-poultry-brooding-brooders',      'chicken-poultry-brooding', 'chicken-poultry', 'general', 2),
    ('Chick Supplies',         'chicken-poultry-brooding-chick-supplies','chicken-poultry-brooding', 'chicken-poultry', 'general', 3),

    -- === HORSE > Feed ===
    ('Senior Feed',            'horse-feed-senior',         'horse-feed', 'horse', 'animal_feed_farm', 1),
    ('Performance Feed',       'horse-feed-performance',    'horse-feed', 'horse', 'animal_feed_farm', 2),
    ('Complete Feed',          'horse-feed-complete',       'horse-feed', 'horse', 'animal_feed_farm', 3),

    -- === HORSE > Treats ===
    ('Cookies',                'horse-treats-cookies',     'horse-treats', 'horse', 'animal_treats_chews', 1),
    ('Biscuits',               'horse-treats-biscuits',    'horse-treats', 'horse', 'animal_treats_chews', 2),
    ('Licks',                  'horse-treats-licks',       'horse-treats', 'horse', 'animal_treats_chews', 3),

    -- === HORSE > Health & Supplements ===
    ('Joint',                  'horse-health-supplements-joint',       'horse-health-supplements', 'horse', 'animal_health_wellness', 1),
    ('Hoof',                   'horse-health-supplements-hoof',        'horse-health-supplements', 'horse', 'animal_health_wellness', 2),
    ('Digestive',              'horse-health-supplements-digestive',   'horse-health-supplements', 'horse', 'animal_health_wellness', 3),
    ('Calming',                'horse-health-supplements-calming',     'horse-health-supplements', 'horse', 'animal_health_wellness', 4),
    ('Electrolytes',           'horse-health-supplements-electrolytes','horse-health-supplements', 'horse', 'animal_health_wellness', 5),

    -- === HORSE > Grooming ===
    ('Brushes',                'horse-grooming-brushes',       'horse-grooming', 'horse', 'grooming_cleaning', 1),
    ('Shampoo',                'horse-grooming-shampoo',       'horse-grooming', 'horse', 'grooming_cleaning', 2),
    ('Hoof Care',              'horse-grooming-hoof-care',     'horse-grooming', 'horse', 'grooming_cleaning', 3),
    ('Fly Spray',              'horse-grooming-fly-spray',     'horse-grooming', 'horse', 'grooming_cleaning', 4),

    -- === HORSE > Fly Control ===
    ('Sprays',                 'horse-fly-control-sprays',     'horse-fly-control', 'horse', 'animal_health_wellness', 1),
    ('Masks',                  'horse-fly-control-masks',       'horse-fly-control', 'horse', 'animal_health_wellness', 2),
    ('Sheets',                 'horse-fly-control-sheets',      'horse-fly-control', 'horse', 'animal_health_wellness', 3),
    ('Traps',                  'horse-fly-control-traps',       'horse-fly-control', 'horse', 'animal_health_wellness', 4),

    -- === HORSE > Tack & Saddlery ===
    ('Halters',                'horse-tack-saddlery-halters',      'horse-tack-saddlery', 'horse', 'general', 1),
    ('Lead Ropes',             'horse-tack-saddlery-lead-ropes',    'horse-tack-saddlery', 'horse', 'general', 2),
    ('Saddles',                'horse-tack-saddlery-saddles',       'horse-tack-saddlery', 'horse', 'general', 3),
    ('Bridles',                'horse-tack-saddlery-bridles',       'horse-tack-saddlery', 'horse', 'general', 4),

    -- === HORSE > Stable Supplies ===
    ('Buckets',                'horse-stable-supplies-buckets',        'horse-stable-supplies', 'horse', 'general', 1),
    ('Feeders',                'horse-stable-supplies-feeders',        'horse-stable-supplies', 'horse', 'general', 2),
    ('Waterers',               'horse-stable-supplies-waterers',       'horse-stable-supplies', 'horse', 'general', 3),
    ('Stall Supplies',         'horse-stable-supplies-stall',          'horse-stable-supplies', 'horse', 'general', 4),

    -- === HORSE > Blankets & Sheets ===
    ('Turnout Blankets',       'horse-blankets-sheets-turnout',    'horse-blankets-sheets', 'horse', 'general', 1),
    ('Coolers',                'horse-blankets-sheets-coolers',    'horse-blankets-sheets', 'horse', 'general', 2),
    ('Sheets',                 'horse-blankets-sheets-sheets',     'horse-blankets-sheets', 'horse', 'general', 3),

    -- === HORSE > Farrier Supplies ===
    ('Hoof Tools',             'horse-farrier-supplies-hoof-tools',  'horse-farrier-supplies', 'horse', 'general', 1),
    ('Shoes',                  'horse-farrier-supplies-shoes',       'horse-farrier-supplies', 'horse', 'general', 2),
    ('Care',                   'horse-farrier-supplies-care',        'horse-farrier-supplies', 'horse', 'general', 3),

    -- === FARM & LIVESTOCK > Feed ===
    ('Cattle Feed',            'farm-livestock-feed-cattle',        'farm-livestock-feed', 'farm-livestock', 'animal_feed_farm', 1),
    ('Goat Feed',              'farm-livestock-feed-goat',          'farm-livestock-feed', 'farm-livestock', 'animal_feed_farm', 2),
    ('Sheep Feed',             'farm-livestock-feed-sheep',         'farm-livestock-feed', 'farm-livestock', 'animal_feed_farm', 3),
    ('Pig Feed',               'farm-livestock-feed-pig',           'farm-livestock-feed', 'farm-livestock', 'animal_feed_farm', 4),
    ('Alpaca/Llama Feed',      'farm-livestock-feed-alpaca-llama',  'farm-livestock-feed', 'farm-livestock', 'animal_feed_farm', 5),

    -- === FARM & LIVESTOCK > Treats ===
    ('Livestock Treats',       'farm-livestock-treats-livestock',   'farm-livestock-treats', 'farm-livestock', 'animal_treats_chews', 1),

    -- === FARM & LIVESTOCK > Supplements & Minerals ===
    ('Protein',                'farm-livestock-supplements-minerals-protein',       'farm-livestock-supplements-minerals', 'farm-livestock', 'animal_health_wellness', 1),
    ('Mineral Blocks',         'farm-livestock-supplements-minerals-mineral-blocks','farm-livestock-supplements-minerals', 'farm-livestock', 'animal_health_wellness', 2),
    ('Vitamins',               'farm-livestock-supplements-minerals-vitamins',      'farm-livestock-supplements-minerals', 'farm-livestock', 'animal_health_wellness', 3),

    -- === FARM & LIVESTOCK > Feeders & Waterers ===
    ('Troughs',                'farm-livestock-feeders-waterers-troughs',             'farm-livestock-feeders-waterers', 'farm-livestock', 'general', 1),
    ('Buckets',                'farm-livestock-feeders-waterers-buckets',             'farm-livestock-feeders-waterers', 'farm-livestock', 'general', 2),
    ('Tanks',                  'farm-livestock-feeders-waterers-tanks',               'farm-livestock-feeders-waterers', 'farm-livestock', 'general', 3),
    ('Automatic Waterers',     'farm-livestock-feeders-waterers-automatic-waterers',  'farm-livestock-feeders-waterers', 'farm-livestock', 'general', 4),

    -- === FARM & LIVESTOCK > Bedding ===
    ('Straw',                  'farm-livestock-bedding-straw',         'farm-livestock-bedding', 'farm-livestock', 'animal_litter_bedding', 1),
    ('Shavings',               'farm-livestock-bedding-shavings',      'farm-livestock-bedding', 'farm-livestock', 'animal_litter_bedding', 2),

    -- === FARM & LIVESTOCK > Health & First Aid ===
    ('Dewormers',              'farm-livestock-health-first-aid-dewormers',     'farm-livestock-health-first-aid', 'farm-livestock', 'animal_health_wellness', 1),
    ('Wound Care',             'farm-livestock-health-first-aid-wound-care',    'farm-livestock-health-first-aid', 'farm-livestock', 'animal_health_wellness', 2),
    ('Fly Control',            'farm-livestock-health-first-aid-fly-control',   'farm-livestock-health-first-aid', 'farm-livestock', 'animal_health_wellness', 3),

    -- === FARM & LIVESTOCK > Handling & Fencing ===
    ('Halters',                'farm-livestock-handling-fencing-halters',  'farm-livestock-handling-fencing', 'farm-livestock', 'general', 1),
    ('Leads',                  'farm-livestock-handling-fencing-leads',    'farm-livestock-handling-fencing', 'farm-livestock', 'general', 2),
    ('Panels',                 'farm-livestock-handling-fencing-panels',   'farm-livestock-handling-fencing', 'farm-livestock', 'general', 3),
    ('Gates',                  'farm-livestock-handling-fencing-gates',    'farm-livestock-handling-fencing', 'farm-livestock', 'general', 4),

    -- === LAWN & GARDEN > Soil, Mulch & Compost ===
    ('Potting Soil',           'lawn-garden-soil-mulch-compost-potting',     'lawn-garden-soil-mulch-compost', 'lawn-garden', 'garden_consumable', 1),
    ('Garden Soil',            'lawn-garden-soil-mulch-compost-garden',      'lawn-garden-soil-mulch-compost', 'lawn-garden', 'garden_consumable', 2),
    ('Mulch',                  'lawn-garden-soil-mulch-compost-mulch',       'lawn-garden-soil-mulch-compost', 'lawn-garden', 'garden_consumable', 3),
    ('Compost',                'lawn-garden-soil-mulch-compost-compost',     'lawn-garden-soil-mulch-compost', 'lawn-garden', 'garden_consumable', 4),

    -- === LAWN & GARDEN > Grass Seed ===
    ('Sun/Shade',              'lawn-garden-grass-seed-sun-shade',         'lawn-garden-grass-seed', 'lawn-garden', 'garden_consumable', 1),
    ('Northeast Mix',          'lawn-garden-grass-seed-northeast',         'lawn-garden-grass-seed', 'lawn-garden', 'garden_consumable', 2),
    ('Patch Repair',           'lawn-garden-grass-seed-patch',             'lawn-garden-grass-seed', 'lawn-garden', 'garden_consumable', 3),

    -- === LAWN & GARDEN > Fertilizer ===
    ('Lawn Fertilizer',        'lawn-garden-fertilizer-lawn',              'lawn-garden-fertilizer', 'lawn-garden', 'garden_consumable', 1),
    ('Garden Fertilizer',      'lawn-garden-fertilizer-garden',            'lawn-garden-fertilizer', 'lawn-garden', 'garden_consumable', 2),
    ('Organic Fertilizer',     'lawn-garden-fertilizer-organic',           'lawn-garden-fertilizer', 'lawn-garden', 'garden_consumable', 3),

    -- === LAWN & GARDEN > Weed & Pest Control ===
    ('Weed Killer',            'lawn-garden-weed-pest-control-weed-killer',        'lawn-garden-weed-pest-control', 'lawn-garden', 'garden_consumable', 1),
    ('Insect Control',         'lawn-garden-weed-pest-control-insect-control',     'lawn-garden-weed-pest-control', 'lawn-garden', 'garden_consumable', 2),
    ('Animal Repellents',      'lawn-garden-weed-pest-control-animal-repellents',  'lawn-garden-weed-pest-control', 'lawn-garden', 'garden_consumable', 3),

    -- === LAWN & GARDEN > Garden Seeds & Plants ===
    ('Vegetable Seeds',        'lawn-garden-seeds-plants-vegetable',          'lawn-garden-seeds-plants', 'lawn-garden', 'garden_consumable', 1),
    ('Flower Seeds',           'lawn-garden-seeds-plants-flower',             'lawn-garden-seeds-plants', 'lawn-garden', 'garden_consumable', 2),
    ('Bulbs',                  'lawn-garden-seeds-plants-bulbs',              'lawn-garden-seeds-plants', 'lawn-garden', 'garden_consumable', 3),

    -- === LAWN & GARDEN > Planters & Supplies ===
    ('Pots',                   'lawn-garden-planters-supplies-pots',          'lawn-garden-planters-supplies', 'lawn-garden', 'garden_equipment', 1),
    ('Planters',               'lawn-garden-planters-supplies-planters',      'lawn-garden-planters-supplies', 'lawn-garden', 'garden_equipment', 2),
    ('Trellises',              'lawn-garden-planters-supplies-trellises',     'lawn-garden-planters-supplies', 'lawn-garden', 'garden_equipment', 3),
    ('Stakes',                 'lawn-garden-planters-supplies-stakes',        'lawn-garden-planters-supplies', 'lawn-garden', 'garden_equipment', 4),

    -- === LAWN & GARDEN > Garden Tools ===
    ('Hand Tools',             'lawn-garden-tools-hand',          'lawn-garden-tools', 'lawn-garden', 'garden_equipment', 1),
    ('Pruners',                'lawn-garden-tools-pruners',       'lawn-garden-tools', 'lawn-garden', 'garden_equipment', 2),
    ('Rakes',                  'lawn-garden-tools-rakes',         'lawn-garden-tools', 'lawn-garden', 'garden_equipment', 3),
    ('Shovels',                'lawn-garden-tools-shovels',       'lawn-garden-tools', 'lawn-garden', 'garden_equipment', 4),

    -- === LAWN & GARDEN > Sprayers & Spreaders ===
    ('Sprayers',               'lawn-garden-sprayers-spreaders-sprayers',      'lawn-garden-sprayers-spreaders', 'lawn-garden', 'garden_equipment', 1),
    ('Spreaders',              'lawn-garden-sprayers-spreaders-spreaders',     'lawn-garden-sprayers-spreaders', 'lawn-garden', 'garden_equipment', 2),

    -- === LAWN & GARDEN > Watering ===
    ('Hoses',                  'lawn-garden-watering-hoses',          'lawn-garden-watering', 'lawn-garden', 'garden_equipment', 1),
    ('Nozzles',                'lawn-garden-watering-nozzles',        'lawn-garden-watering', 'lawn-garden', 'garden_equipment', 2),
    ('Sprinklers',             'lawn-garden-watering-sprinklers',     'lawn-garden-watering', 'lawn-garden', 'garden_equipment', 3),
    ('Watering Cans',          'lawn-garden-watering-cans',           'lawn-garden-watering', 'lawn-garden', 'garden_equipment', 4),

    -- === LAWN & GARDEN > Seasonal Yard Care ===
    ('Ice Melt',               'lawn-garden-seasonal-yard-care-ice-melt',     'lawn-garden-seasonal-yard-care', 'lawn-garden', 'garden_consumable', 1),
    ('Snow Tools',             'lawn-garden-seasonal-yard-care-snow-tools',   'lawn-garden-seasonal-yard-care', 'lawn-garden', 'garden_consumable', 2),
    ('Fall Cleanup',           'lawn-garden-seasonal-yard-care-fall-cleanup', 'lawn-garden-seasonal-yard-care', 'lawn-garden', 'garden_consumable', 3),

    -- === HOME & HEATING > Heating Fuel ===
    ('Wood Pellets',           'home-heating-fuel-wood-pellets',      'home-heating-fuel', 'home-heating', 'home_heating', 1),
    ('Coal',                   'home-heating-fuel-coal',              'home-heating-fuel', 'home-heating', 'home_heating', 2),
    ('Firewood',               'home-heating-fuel-firewood',          'home-heating-fuel', 'home-heating', 'home_heating', 3),
    ('Fire Starters',          'home-heating-fuel-fire-starters',     'home-heating-fuel', 'home-heating', 'home_heating', 4),

    -- === HOME & HEATING > Stove & Fireplace ===
    ('Stove Accessories',      'home-heating-stove-fireplace-accessories',    'home-heating-stove-fireplace', 'home-heating', 'home_heating', 1),
    ('Ash Buckets',            'home-heating-stove-fireplace-ash-buckets',    'home-heating-stove-fireplace', 'home-heating', 'home_heating', 2),
    ('Chimney Supplies',       'home-heating-stove-fireplace-chimney',        'home-heating-stove-fireplace', 'home-heating', 'home_heating', 3),

    -- === HOME & HEATING > Cleaning Supplies ===
    ('Cleaners',               'home-heating-cleaning-supplies-cleaners',     'home-heating-cleaning-supplies', 'home-heating', 'general', 1),
    ('Odor Control',           'home-heating-cleaning-supplies-odor',         'home-heating-cleaning-supplies', 'home-heating', 'general', 2),
    ('Trash Bags',             'home-heating-cleaning-supplies-trash-bags',   'home-heating-cleaning-supplies', 'home-heating', 'general', 3),

    -- === HOME & HEATING > Pest Control ===
    ('Mouse/Rat Control',      'home-heating-pest-control-mouse-rat',   'home-heating-pest-control', 'home-heating', 'general', 1),
    ('Ant Control',            'home-heating-pest-control-ant',         'home-heating-pest-control', 'home-heating', 'general', 2),
    ('Roach Control',          'home-heating-pest-control-roach',       'home-heating-pest-control', 'home-heating', 'general', 3),
    ('Fly Control',            'home-heating-pest-control-fly',         'home-heating-pest-control', 'home-heating', 'general', 4),

    -- === HOME & HEATING > Storage & Utility ===
    ('Totes',                  'home-heating-storage-utility-totes',       'home-heating-storage-utility', 'home-heating', 'general', 1),
    ('Buckets',                'home-heating-storage-utility-buckets',     'home-heating-storage-utility', 'home-heating', 'general', 2),
    ('Utility Supplies',       'home-heating-storage-utility-supplies',    'home-heating-storage-utility', 'home-heating', 'general', 3),

    -- === HOME & HEATING > Winter Essentials ===
    ('Ice Melt',               'home-heating-winter-essentials-ice-melt',      'home-heating-winter-essentials', 'home-heating', 'general', 1),
    ('Snow Shovels',           'home-heating-winter-essentials-snow-shovels',  'home-heating-winter-essentials', 'home-heating', 'general', 2),
    ('Gloves',                 'home-heating-winter-essentials-gloves',         'home-heating-winter-essentials', 'home-heating', 'general', 3),

    -- === TOOLS & HARDWARE > Tools ===
    ('Hand Tools',             'tools-hardware-tools-hand',              'tools-hardware-tools', 'tools-hardware', 'hardware_tools', 1),
    ('Power Tool Accessories', 'tools-hardware-tools-power-accessories', 'tools-hardware-tools', 'tools-hardware', 'hardware_tools', 2),

    -- === TOOLS & HARDWARE > Hardware ===
    ('Fasteners',              'tools-hardware-hardware-fasteners',    'tools-hardware-hardware', 'tools-hardware', 'hardware_tools', 1),
    ('Hooks',                  'tools-hardware-hardware-hooks',        'tools-hardware-hardware', 'tools-hardware', 'hardware_tools', 2),
    ('Chains',                 'tools-hardware-hardware-chains',       'tools-hardware-hardware', 'tools-hardware', 'hardware_tools', 3),
    ('Rope',                   'tools-hardware-hardware-rope',         'tools-hardware-hardware', 'tools-hardware', 'hardware_tools', 4),

    -- === TOOLS & HARDWARE > Electrical ===
    ('Extension Cords',        'tools-hardware-electrical-extension-cords',   'tools-hardware-electrical', 'tools-hardware', 'hardware_tools', 1),
    ('Batteries',              'tools-hardware-electrical-batteries',         'tools-hardware-electrical', 'tools-hardware', 'hardware_tools', 2),
    ('Lighting',               'tools-hardware-electrical-lighting',          'tools-hardware-electrical', 'tools-hardware', 'hardware_tools', 3),

    -- === TOOLS & HARDWARE > Plumbing ===
    ('Hoses',                  'tools-hardware-plumbing-hoses',       'tools-hardware-plumbing', 'tools-hardware', 'hardware_tools', 1),
    ('Fittings',               'tools-hardware-plumbing-fittings',    'tools-hardware-plumbing', 'tools-hardware', 'hardware_tools', 2),
    ('Pumps',                  'tools-hardware-plumbing-pumps',       'tools-hardware-plumbing', 'tools-hardware', 'hardware_tools', 3),

    -- === TOOLS & HARDWARE > Garage & Shop ===
    ('Lubricants',             'tools-hardware-garage-shop-lubricants',   'tools-hardware-garage-shop', 'tools-hardware', 'hardware_tools', 1),
    ('Tarps',                  'tools-hardware-garage-shop-tarps',         'tools-hardware-garage-shop', 'tools-hardware', 'hardware_tools', 2),
    ('Shop Supplies',          'tools-hardware-garage-shop-supplies',      'tools-hardware-garage-shop', 'tools-hardware', 'hardware_tools', 3)
)
INSERT INTO public.categories (name, slug, parent_id, department_key, depth, breadcrumb, facet_profile, display_order, sort_order, is_active, seo_description, synonym_keywords)
SELECT 
    l.name,
    l.slug,
    parent.id,
    l.department_key,
    2,
    parent.breadcrumb || ' > ' || l.name,
    l.facet_profile,
    l.sort_order,
    l.sort_order,
    true,
    parent.breadcrumb || ' > ' || l.name || ' — Shop online at Bay State Pet & Garden Supply.',
    ARRAY[l.name, l.slug]
FROM l3_rows l
JOIN l2 parent ON parent.slug = l.parent_slug
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id,
    department_key = EXCLUDED.department_key,
    depth = 2,
    breadcrumb = EXCLUDED.breadcrumb,
    facet_profile = EXCLUDED.facet_profile,
    display_order = EXCLUDED.display_order,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    seo_description = EXCLUDED.seo_description,
    synonym_keywords = EXCLUDED.synonym_keywords
WHERE categories.depth IS DISTINCT FROM 2
   OR categories.breadcrumb IS DISTINCT FROM EXCLUDED.breadcrumb
   OR categories.facet_profile IS DISTINCT FROM EXCLUDED.facet_profile
   OR categories.parent_id IS DISTINCT FROM EXCLUDED.parent_id;

COMMIT;
