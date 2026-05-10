-- =====================================================================
-- Bay State Local Dev Seed
-- Idempotent fixture data for local development.
-- Run via: supabase db reset
-- All data is fake/placeholder. No real credentials or production data.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------
INSERT INTO brands (id, name, slug, description, official_domains, preferred_domains, logo_url)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Fromm Family Foods', 'fromm', 'Premium pet nutrition since 1904', ARRAY['frommfamily.com'], ARRAY['frommfamily.com'], NULL),
  ('a0000000-0000-0000-0000-000000000002', 'Purina Pro Plan', 'purina-pro-plan', 'Advanced nutrition for pets', ARRAY['purina.com'], ARRAY['purina.com'], NULL),
  ('a0000000-0000-0000-0000-000000000003', 'World''s Best Cat Litter', 'worlds-best-cat-litter', 'Natural corn-based cat litter', ARRAY['worldsbestcatlitter.com'], ARRAY['worldsbestcatlitter.com'], NULL),
  ('a0000000-0000-0000-0000-000000000004', 'Jonathan Green', 'jonathan-green', 'Premium grass seed and lawn care', ARRAY['jonathangreen.com'], ARRAY['jonathangreen.com'], NULL),
  ('a0000000-0000-0000-0000-000000000005', 'Kaytee', 'kaytee', 'Small pet nutrition and care', ARRAY['kaytee.com'], ARRAY['kaytee.com'], NULL),
  ('a0000000-0000-0000-0000-000000000006', 'KONG', 'kong', 'Durable dog toys and treats', ARRAY['kongcompany.com'], ARRAY['kongcompany.com'], NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Pet Types
-- ---------------------------------------------------------------------
INSERT INTO pet_types (id, name, icon, display_order)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Dog', 'dog', 1),
  ('b0000000-0000-0000-0000-000000000002', 'Cat', 'cat', 2),
  ('b0000000-0000-0000-0000-000000000003', 'Small Pet', 'rabbit', 3)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------
INSERT INTO categories (id, name, slug, description, is_featured, display_order, image_url)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Dog Food', 'dog-food', 'Complete nutrition for dogs of all life stages', TRUE, 1, '/images/categories/dog-food.jpg'),
  ('c0000000-0000-0000-0000-000000000002', 'Dog Treats & Chews', 'dog-treats-chews', 'Rewards, chews, and training treats', TRUE, 2, '/images/categories/dog-treats.jpg'),
  ('c0000000-0000-0000-0000-000000000003', 'Dog Toys', 'dog-toys', 'Playtime and enrichment toys', TRUE, 3, '/images/categories/dog-toys.jpg'),
  ('c0000000-0000-0000-0000-000000000004', 'Cat Food', 'cat-food', 'Premium nutrition for cats and kittens', TRUE, 4, '/images/categories/cat-food.jpg'),
  ('c0000000-0000-0000-0000-000000000005', 'Cat Litter', 'cat-litter', 'High-performance litter solutions', TRUE, 5, '/images/categories/cat-litter.jpg'),
  ('c0000000-0000-0000-0000-000000000006', 'Small Pet Food', 'small-pet-food', 'Nutrition for hamsters, guinea pigs, and bunnies', TRUE, 6, '/images/categories/small-pet-food.jpg'),
  ('c0000000-0000-0000-0000-000000000007', 'Grass Seed', 'lawn-garden-grass-seed', 'Premium grass seed for lush lawns', TRUE, 7, '/images/categories/grass-seed.jpg'),
  ('c0000000-0000-0000-0000-000000000008', 'Fertilizer & Lawn Care', 'lawn-garden-fertilizer', 'Feed your lawn naturally', TRUE, 8, '/images/categories/lawn-fertilizer.jpg')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Products (12 realistic products)
-- ---------------------------------------------------------------------
INSERT INTO products (id, name, slug, sku, description, price, brand_id, stock_status, quantity, images, in_store_pickup, is_taxable)
VALUES
  (
    'd0000000-0000-0000-0000-000000000001',
    'Fromm Gold Large Breed Adult Dog Food 30lb',
    'fromm-gold-large-breed-adult-30lb',
    'FROMM-GLD-LB-30',
    'Fromm Gold Large Breed Adult Dog Food is formulated for large breed dogs (50 lbs and over) with high-quality protein sources and balanced nutrition.',
    79.99,
    'a0000000-0000-0000-0000-000000000001',
    'in_stock',
    50,
    ARRAY['/images/products/fromm-gold-large-30lb.jpg'],
    TRUE,
    TRUE
  ),
  (
    'd0000000-0000-0000-0000-000000000002',
    'Fromm Puppy Gold Dog Food 15lb',
    'fromm-puppy-gold-15lb',
    'FROMM-PUP-GLD-15',
    'Fromm Puppy Gold is a nutrient-dense formula designed to support healthy growth and development in puppies.',
    44.99,
    'a0000000-0000-0000-0000-000000000001',
    'in_stock',
    30,
    ARRAY['/images/products/fromm-puppy-gold-15lb.jpg'],
    TRUE,
    TRUE
  ),
  (
    'd0000000-0000-0000-0000-000000000003',
    'Purina Pro Plan Sensitive Skin Salmon 24lb',
    'purina-pro-plan-sensitive-skin-salmon-24lb',
    'PPP-SALMON-24',
    'Purina Pro Plan Sensitive Skin & Stomach Salmon and Rice formula for adult dogs with sensitive digestive systems.',
    89.99,
    'a0000000-0000-0000-0000-000000000002',
    'out_of_stock',
    0,
    ARRAY['/images/products/ppp-sensitive-salmon-24lb.jpg'],
    TRUE,
    TRUE
  ),
  (
    'd0000000-0000-0000-0000-000000000004',
    'Purina Pro Plan Complete Essentials Chicken 18lb',
    'purina-pro-plan-complete-essentials-chicken-18lb',
    'PPP-CHICK-18',
    'Complete and balanced nutrition for adult dogs with real chicken as the first ingredient.',
    59.99,
    'a0000000-0000-0000-0000-000000000002',
    'in_stock',
    45,
    ARRAY['/images/products/ppp-chicken-18lb.jpg'],
    TRUE,
    TRUE
  ),
  (
    'd0000000-0000-0000-0000-000000000005',
    'KONG Classic Dog Toy Large',
    'kong-classic-dog-toy-large',
    'KONG-CLASSIC-L',
    'The original KONG Classic, made of natural rubber. Perfect for stuffing with treats, peanut butter, or kibble.',
    18.99,
    'a0000000-0000-0000-0000-000000000006',
    'in_stock',
    100,
    ARRAY['/images/products/kong-classic-large.jpg'],
    TRUE,
    TRUE
  ),
  (
    'd0000000-0000-0000-0000-000000000006',
    'KONG Easy Treat Peanut Butter 12oz',
    'kong-easy-treat-peanut-butter-12oz',
    'KONG-TREAT-PB-12',
    'Easy-to-use dog treat paste that fits KONG toys perfectly. Peanut butter flavor dogs love.',
    8.99,
    'a0000000-0000-0000-0000-000000000006',
    'in_stock',
    75,
    ARRAY['/images/products/kong-easy-treat-pb-12oz.jpg'],
    TRUE,
    TRUE
  ),
  (
    'd0000000-0000-0000-0000-000000000007',
    'Fromm Four-Star Cat Food Game Bird 10lb',
    'fromm-four-star-cat-game-bird-10lb',
    'FROMM-CAT-GB-10',
    'Fromm Four-Star Nutritionals Game Bird Recipe for cats. High-protein, grain-free formula.',
    54.99,
    'a0000000-0000-0000-0000-000000000001',
    'in_stock',
    25,
    ARRAY['/images/products/fromm-cat-game-bird-10lb.jpg'],
    TRUE,
    TRUE
  ),
  (
    'd0000000-0000-0000-0000-000000000008',
    'Purina Pro Plan Kitten Chicken & Rice 7lb',
    'purina-pro-plan-kitten-chicken-rice-7lb',
    'PPP-KITTEN-7',
    'Purina Pro Plan Kitten formula with chicken and rice supports healthy development and immune system.',
    35.99,
    'a0000000-0000-0000-0000-000000000002',
    'in_stock',
    20,
    ARRAY['/images/products/ppp-kitten-7lb.jpg'],
    TRUE,
    TRUE
  ),
  (
    'd0000000-0000-0000-0000-000000000009',
    'World''s Best Cat Litter Multiple Cat 15lb',
    'worlds-best-cat-litter-multi-15lb',
    'WBCL-MULTI-15',
    'Natural corn-based clumping litter for multiple cat households. Outstanding odor control.',
    22.99,
    'a0000000-0000-0000-0000-000000000003',
    'in_stock',
    60,
    ARRAY['/images/products/wbcl-multi-15lb.jpg'],
    TRUE,
    TRUE
  ),
  (
    'd0000000-0000-0000-0000-000000000010',
    'Jonathan Green Black Beauty Ultra Grass Seed 7lb',
    'jonathan-green-black-beauty-ultra-7lb',
    'JG-ULTRA-7',
    'Premium grass seed for sunny and shady areas. Covers up to 2,800 sq ft.',
    39.99,
    'a0000000-0000-0000-0000-000000000004',
    'in_stock',
    35,
    ARRAY['/images/products/jg-black-beauty-ultra-7lb.jpg'],
    TRUE,
    TRUE
  ),
  (
    'd0000000-0000-0000-0000-000000000011',
    'Jonathan Green Organic Lawn Food 18lb',
    'jonathan-green-organic-lawn-food-18lb',
    'JG-ORG-18',
    '100% organic lawn fertilizer. Feeds your lawn naturally without synthetic chemicals.',
    32.99,
    'a0000000-0000-0000-0000-000000000004',
    'in_stock',
    40,
    ARRAY['/images/products/jg-organic-18lb.jpg'],
    TRUE,
    TRUE
  ),
  (
    'd0000000-0000-0000-0000-000000000012',
    'Kaytee Timothy Hay 48oz',
    'kaytee-timothy-hay-48oz',
    'KAYTEE-TH-48',
    'Premium Western Timothy Hay for rabbits, guinea pigs, and chinchillas. High fiber for digestive health.',
    12.99,
    'a0000000-0000-0000-0000-000000000005',
    'in_stock',
    80,
    ARRAY['/images/products/kaytee-timothy-hay-48oz.jpg'],
    TRUE,
    TRUE
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Product Storefront Settings
-- ---------------------------------------------------------------------
INSERT INTO product_storefront_settings (product_id, is_featured, pickup_only)
VALUES
  ('d0000000-0000-0000-0000-000000000001', TRUE,  FALSE),
  ('d0000000-0000-0000-0000-000000000002', FALSE, FALSE),
  ('d0000000-0000-0000-0000-000000000003', FALSE, FALSE),
  ('d0000000-0000-0000-0000-000000000004', FALSE, FALSE),
  ('d0000000-0000-0000-0000-000000000005', FALSE, FALSE),
  ('d0000000-0000-0000-0000-000000000006', FALSE, FALSE),
  ('d0000000-0000-0000-0000-000000000007', FALSE, FALSE),
  ('d0000000-0000-0000-0000-000000000008', FALSE, FALSE),
  ('d0000000-0000-0000-0000-000000000009', FALSE, FALSE),
  ('d0000000-0000-0000-0000-000000000010', FALSE, FALSE),
  ('d0000000-0000-0000-0000-000000000011', FALSE, TRUE),  -- pickup-only
  ('d0000000-0000-0000-0000-000000000012', FALSE, FALSE)
ON CONFLICT (product_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Product Categories
-- ---------------------------------------------------------------------
INSERT INTO product_categories (product_id, category_id)
VALUES
  -- Fromm Gold Large Breed -> Dog Food
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001'),
  -- Fromm Puppy Gold -> Dog Food
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001'),
  -- Purina Pro Plan Sensitive Skin -> Dog Food
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001'),
  -- Purina Pro Plan Complete Essentials -> Dog Food
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001'),
  -- KONG Classic -> Dog Toys
  ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000003'),
  -- KONG Easy Treat -> Dog Treats & Chews
  ('d0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002'),
  -- Fromm Cat Food Game Bird -> Cat Food
  ('d0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000004'),
  -- Purina Kitten -> Cat Food
  ('d0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000004'),
  -- World's Best Cat Litter -> Cat Litter
  ('d0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000005'),
  -- Jonathan Green Ultra Grass Seed -> Grass Seed
  ('d0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000007'),
  -- Jonathan Green Organic Lawn Food -> Fertilizer
  ('d0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000008'),
  -- Kaytee Timothy Hay -> Small Pet Food
  ('d0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000006')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Product Pet Types
-- ---------------------------------------------------------------------
INSERT INTO product_pet_types (product_id, pet_type_id)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001'), -- Dog
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000002'), -- Cat
  ('d0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000012', 'b0000000-0000-0000-0000-000000000003')  -- Small Pet
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Facet Definitions
-- ---------------------------------------------------------------------
INSERT INTO facet_definitions (id, name, slug, description)
VALUES
  ('f0000000-0000-0000-0000-000000000001', 'Animal Type', 'animal-type', 'The type of animal a product is for'),
  ('f0000000-0000-0000-0000-000000000002', 'Life Stage', 'life-stage', 'The recommended life stage for the product'),
  ('f0000000-0000-0000-0000-000000000003', 'Primary Protein', 'primary-protein', 'The main protein source in food'),
  ('f0000000-0000-0000-0000-000000000004', 'Food Form', 'food-form', 'The physical form of food'),
  ('f0000000-0000-0000-0000-000000000005', 'Package Weight', 'package-weight', 'The weight of the package')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Facet Values
-- ---------------------------------------------------------------------
INSERT INTO facet_values (id, facet_definition_id, value, normalized_value, slug)
VALUES
  -- Animal Type
  (  ('f0000000-0000-0000-0001-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Dog', 'dog', 'dog'),
  ('f0000000-0000-0000-0001-000000000002', 'f0000000-0000-0000-0000-000000000001', 'Cat', 'cat', 'cat'),
  ('f0000000-0000-0000-0001-000000000003', 'f0000000-0000-0000-0000-000000000001', 'Small Pet', 'small-pet', 'small-pet'),
  -- Life Stage
  ('f0000000-0000-0000-0002-000000000001', 'f0000000-0000-0000-0000-000000000002', 'Adult', 'adult', 'adult'),
  ('f0000000-0000-0000-0002-000000000002', 'f0000000-0000-0000-0000-000000000002', 'Puppy', 'puppy', 'puppy'),
  ('f0000000-0000-0000-0002-000000000003', 'f0000000-0000-0000-0000-000000000002', 'Kitten', 'kitten', 'kitten'),
  ('f0000000-0000-0000-0002-000000000004', 'f0000000-0000-0000-0000-000000000002', 'All Life Stages', 'all-life-stages', 'all-life-stages'),
  -- Primary Protein
  ('f0000000-0000-0000-0003-000000000001', 'f0000000-0000-0000-0000-000000000003', 'Salmon', 'salmon', 'salmon'),
  ('f0000000-0000-0000-0003-000000000002', 'f0000000-0000-0000-0000-000000000003', 'Chicken', 'chicken', 'chicken'),
  ('f0000000-0000-0000-0003-000000000003', 'f0000000-0000-0000-0000-000000000003', 'Game Bird', 'game-bird', 'game-bird'),
  ('f0000000-0000-0000-0003-000000000004', 'f0000000-0000-0000-0000-000000000003', 'Grain', 'grain', 'grain'),
  -- Food Form
  ('f0000000-0000-0000-0004-000000000001', 'f0000000-0000-0000-0000-000000000004', 'Dry Kibble', 'dry-kibble', 'dry-kibble'),
  ('f0000000-0000-0000-0004-000000000002', 'f0000000-0000-0000-0000-000000000004', 'Treat', 'treat', 'treat'),
  ('f0000000-0000-0000-0004-000000000003', 'f0000000-0000-0000-0000-000000000004', 'Litter', 'litter', 'litter'),
  -- Package Weight (for search only)
  ('f0000000-0000-0000-0005-000000000001', 'f0000000-0000-0000-0000-000000000005', '30 lb', '30-lb', '30-lb'),
  ('f0000000-0000-0000-0005-000000000002', 'f0000000-0000-0000-0000-000000000005', '24 lb', '24-lb', '24-lb'),
  ('f0000000-0000-0000-0005-000000000003', 'f0000000-0000-0000-0000-000000000005', '18 lb', '18-lb', '18-lb'),
  ('f0000000-0000-0000-0005-000000000004', 'f0000000-0000-0000-0000-000000000005', '15 lb', '15-lb', '15-lb'),
  ('f0000000-0000-0000-0005-000000000005', 'f0000000-0000-0000-0000-000000000005', '10 lb', '10-lb', '10-lb'),
  ('f0000000-0000-0000-0005-000000000006', 'f0000000-0000-0000-0000-000000000005', '7 lb', '7-lb', '7-lb')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Product Facets
-- ---------------------------------------------------------------------
INSERT INTO product_facets (product_id, facet_value_id)
VALUES
  -- Fromm Gold Large Breed -> Adult, Chicken, Dry Kibble, 30 lb
  ('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0002-000000000001'),
  ('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0003-000000000002'),
  ('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0004-000000000001'),
  ('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0005-000000000001'),
  -- Fromm Puppy Gold -> Puppy, Chicken, Dry Kibble, 15 lb
  ('d0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0002-000000000002'),
  ('d0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0003-000000000002'),
  ('d0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0004-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0005-000000000004'),
  -- Purina Pro Plan Sensitive -> Adult, Salmon, Dry Kibble, 24 lb
  ('d0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0002-000000000001'),
  ('d0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0003-000000000001'),
  ('d0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0004-000000000001'),
  ('d0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0005-000000000002'),
  -- Purina Pro Plan Complete Essentials -> Adult, Chicken, Dry Kibble, 18 lb
  ('d0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0002-000000000001'),
  ('d0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0003-000000000002'),
  ('d0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0004-000000000001'),
  ('d0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0005-000000000003'),
  -- KONG Classic -> Dog, All Life Stages, Toy
  ('d0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0002-000000000004'),
  ('d0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0004-000000000002'),
  -- KONG Easy Treat -> Dog, Treat
  ('d0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0004-000000000002'),
  -- Fromm Cat Food -> Cat, Adult, Game Bird, Dry Kibble, 10 lb
  ('d0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0001-000000000002'),
  ('d0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0002-000000000001'),
  ('d0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0003-000000000003'),
  ('d0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0004-000000000001'),
  ('d0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0005-000000000005'),
  -- Purina Kitten -> Cat, Kitten, Chicken, Dry Kibble, 7 lb
  ('d0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0001-000000000002'),
  ('d0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0002-000000000003'),
  ('d0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0003-000000000002'),
  ('d0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0004-000000000001'),
  ('d0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0005-000000000006'),
  -- World's Best Cat Litter -> Cat, Litter
  ('d0000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0001-000000000002'),
  ('d0000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0004-000000000003'),
  -- Jonathan Green Grass Seed -> Grain
  ('d0000000-0000-0000-0000-000000000010', 'f0000000-0000-0000-0003-000000000004'),
  -- Jonathan Green Lawn Food -> Grain
  ('d0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0003-000000000004'),
  -- Kaytee Timothy Hay -> Small Pet
  ('d0000000-0000-0000-0000-000000000012', 'f0000000-0000-0000-0001-000000000003')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Services (fake, local)
-- ---------------------------------------------------------------------
INSERT INTO services (id, name, slug, description, price, unit, is_active)
VALUES
  ('e0000000-0000-0000-0000-000000000001', 'Propane Refill (20 lb)', 'propane-refill-20lb', 'Standard 20 lb propane tank refill', 19.99, 'tank', TRUE),
  ('e0000000-0000-0000-0000-000000000002', 'Knife Sharpening', 'knife-sharpening', 'Professional knife and tool sharpening', 8.99, 'per blade', TRUE),
  ('e0000000-0000-0000-0000-000000000003', 'Curbside Loading', 'curbside-loading', 'We load heavy items into your vehicle', 0.00, 'per visit', TRUE),
  ('e0000000-0000-0000-0000-000000000004', 'Local Delivery (Taunton)', 'local-delivery-taunton', 'Delivery within Taunton, MA', 5.99, 'per trip', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Site Settings (fake placeholder values only)
-- ---------------------------------------------------------------------
INSERT INTO site_settings (id, key, value)
VALUES
  ('be000000-0000-0000-0000-000000000001', 'campaign_banner', '{"text": "Local seed data — not production", "variant": "info", "active": false}'::jsonb),
  ('be000000-0000-0000-0000-000000000002', 'homepage', '{"hero_title": "Bay State Pet & Garden Supply (DEV)", "hero_subtitle": "Local development instance", "featured_category_ids": ["c0000000-0000-0000-0000-000000000001", "c0000000-0000-0000-0000-000000000004"]}'::jsonb),
  ('be000000-0000-0000-0000-000000000003', 'navigation', '{"primary": [{"label": "Shop", "href": "/products"}, {"label": "Services", "href": "/services"}], "secondary": []}'::jsonb),
  ('be000000-0000-0000-0000-000000000004', 'branding', '{"store_name": "Bay State Pet & Garden Supply (DEV)", "logo_url": null}'::jsonb),
  ('be000000-0000-0000-0000-000000000005', 'shopsite_migration', '{"active": false, "merchant": "", "password": "", "url": "https://placeholder.local/shop"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- Seeded Order Fixtures (fake)
-- ---------------------------------------------------------------------
-- Pickup order (unpaid)
INSERT INTO orders (
  id, order_number, user_id, customer_name, customer_email, customer_phone,
  status, payment_method, payment_status, source_type, fulfillment_status,
  subtotal, discount_amount, tax, total, fulfillment_method
)
VALUES (
  'dd000000-0000-0000-0000-000000000001',
  'BSP-20260510-0001',
  NULL,
  'Jane Doe',
  'jane@example.local',
  '555-0100',
  'pending',
  'pickup',
  'unpaid',
  'web',
  'unfulfilled',
  79.99, 0, 5.00, 84.99,
  'pickup'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_items (order_id, item_type, item_id, item_name, item_slug, quantity, unit_price, total_price)
VALUES (
  'dd000000-0000-0000-0000-000000000001',
  'product',
  'd0000000-0000-0000-0000-000000000001',
  'Fromm Gold Large Breed Adult Dog Food 30lb',
  'fromm-gold-large-breed-adult-30lb',
  1, 79.99, 79.99
)
ON CONFLICT DO NOTHING;

-- Card-paid order
INSERT INTO orders (
  id, order_number, user_id, customer_name, customer_email, customer_phone,
  status, payment_method, payment_status, source_type, fulfillment_status,
  subtotal, discount_amount, tax, total, fulfillment_method,
  stripe_payment_intent_id, paid_at,
  refunded_amount
)
VALUES (
  'dd000000-0000-0000-0000-000000000002',
  'BSP-20260510-0002',
  NULL,
  'John Smith',
  'john@example.local',
  '555-0101',
  'completed',
  'credit_card',
  'paid',
  'web',
  'fulfilled',
  44.99, 0, 2.81, 47.80,
  'pickup',
  'pi_placeholder_seeded_payment_intent',
  NOW() - INTERVAL '1 day',
  0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_items (order_id, item_type, item_id, item_name, item_slug, quantity, unit_price, total_price)
VALUES (
  'dd000000-0000-0000-0000-000000000002',
  'product',
  'd0000000-0000-0000-0000-000000000002',
  'Fromm Puppy Gold Dog Food 15lb',
  'fromm-puppy-gold-15lb',
  1, 44.99, 44.99
)
ON CONFLICT DO NOTHING;

COMMIT;
