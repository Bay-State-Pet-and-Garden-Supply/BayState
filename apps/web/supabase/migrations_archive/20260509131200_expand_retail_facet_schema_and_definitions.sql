-- Expand facet definition schema and seed canonical retail facet definitions
-- Adds is_deprecated and facet_profile columns to facet_definitions
-- Seeds all canonical facet definitions alongside existing ones
-- Task 9 will mark old definitions (lifestage, pet_size, special_diet, health_feature) as deprecated

BEGIN;

-- ============================================================================
-- Part A: Schema changes
-- ============================================================================

ALTER TABLE public.facet_definitions
    ADD COLUMN IF NOT EXISTS is_deprecated boolean NOT NULL DEFAULT false;

ALTER TABLE public.facet_definitions
    ADD COLUMN IF NOT EXISTS facet_profile text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_facet_definitions_is_deprecated
    ON public.facet_definitions (is_deprecated);

COMMENT ON COLUMN public.facet_definitions.is_deprecated IS 'If true, this facet definition is superseded by a canonical replacement. Storefront filters should hide deprecated facets.';
COMMENT ON COLUMN public.facet_definitions.facet_profile IS 'Array of facet profile keys that use this facet (e.g. animal_food, garden_consumable, animal_litter_bedding). Empty array means universal/general.';

-- ============================================================================
-- Part B: Seed canonical facet definitions
-- ============================================================================
-- Use ON CONFLICT (name) so already-seeded rows get profile metadata updated.

-- Existing definitions — update with profile metadata, keep is_deprecated=false
INSERT INTO public.facet_definitions (name, slug, description, facet_profile)
VALUES
    ('lifestage', 'lifestage', 'Normalized ProductField18 values for life stage filtering. Will be replaced by life_stage.', '{animal_food,animal_feed_farm}'),
    ('pet_size', 'pet-size', 'Normalized ProductField19 values for pet size filtering. Will be replaced by breed_size.', '{animal_food,animal_treats_chews}'),
    ('special_diet', 'special-diet', 'Normalized ProductField20 values for special diet filtering. Will be replaced by diet_type.', '{animal_food}'),
    ('health_feature', 'health-feature', 'Normalized ProductField21 values for health feature filtering. Will be replaced by health_focus.', '{animal_food,animal_treats_chews,animal_health_wellness}'),
    ('food_form', 'food-form', 'Normalized ProductField22 values for food form filtering.', '{animal_food,animal_feed_farm}'),
    ('flavor', 'flavor', 'Normalized ProductField23 values for flavor filtering.', '{animal_food,animal_treats_chews}'),
    ('product_feature', 'product-feature', 'Normalized ProductField26 values for product feature filtering.', '{}'),
    ('size', 'size', 'Normalized ProductField27 values for size filtering.', '{}'),
    ('color', 'color', 'Normalized ProductField29 values for color filtering.', '{}'),
    ('packaging_type', 'packaging-type', 'Normalized ProductField30 values for packaging type filtering.', '{}')
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    facet_profile = EXCLUDED.facet_profile;

-- Universal facets — applicable across all profiles
INSERT INTO public.facet_definitions (name, slug, description, facet_profile)
VALUES
    ('package_weight', 'package-weight', 'Numeric normalized package weight for weight-based filtering (e.g. 5 lb, 12 oz).', '{}'),
    ('package_count', 'package-count', 'Package count for multi-packs and cases (e.g. 12 count, case of 24).', '{}'),
    ('material', 'material', 'Primary material the product is made from (e.g. Rubber, Nylon, Pine, Stainless Steel).', '{}'),
    ('scent', 'scent', 'Product scent or fragrance (e.g. Lavender, Unscented, Fresh Linen).', '{}'),
    ('dimensions', 'dimensions', 'Physical dimensions for containment products (e.g. 36x24x18 in).', '{animal_habitat_containment,aquarium_equipment,reptile_equipment,home_heating,hardware_tools}'),
    ('indoor_outdoor', 'indoor-outdoor', 'Whether the product is designed for indoor, outdoor, or both use cases.', '{}'),
    ('subscription_eligible', 'subscription-eligible', 'Whether the product supports auto-delivery subscription (boolean).', '{}')
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    facet_profile = EXCLUDED.facet_profile;

-- Animal food / feed facets
INSERT INTO public.facet_definitions (name, slug, description, facet_profile)
VALUES
    ('animal_type', 'animal-type', 'Target animal species for the product (e.g. Dog, Cat, Horse, Chicken, Rabbit, Fish).', '{animal_food,animal_treats_chews,animal_feed_farm,animal_health_wellness,animal_litter_bedding,animal_toys_enrichment,animal_habitat_containment,grooming_cleaning,aquarium_equipment,reptile_equipment}'),
    ('life_stage', 'life-stage', 'Canonical life stage facet replacing lifestage. Supports puppy, kitten, adult, senior, chick, layer, starter/grower, all-life-stages.', '{animal_food,animal_feed_farm}'),
    ('breed_size', 'breed-size', 'Canonical breed/size class facet replacing pet_size. Supports small, medium, large, giant breed.', '{animal_food,animal_treats_chews}'),
    ('primary_protein', 'primary-protein', 'Primary protein source in food or treats (e.g. Chicken, Beef, Salmon, Lamb, Turkey, Duck).', '{animal_food,animal_treats_chews,animal_feed_farm}'),
    ('diet_type', 'diet-type', 'Canonical diet type facet replacing special_diet. Grain-Free, Grain-Inclusive, Limited Ingredient, High-Protein, Weight Management, Sensitive Stomach, Gluten-Free, Low Fat, Low Calorie, Veterinary Diet.', '{animal_food}'),
    ('claims', 'claims', 'Marketing or label claims (e.g. Natural, Organic, Non-GMO, Made in USA, No Corn/Wheat/Soy).', '{animal_food,animal_treats_chews,garden_consumable,grooming_cleaning}'),
    ('health_focus', 'health-focus', 'Canonical health feature facet replacing health_feature. Skin & Coat, Digestive, Joint, Dental, Urinary, Calming, Sensitive Stomach.', '{animal_food,animal_treats_chews,animal_health_wellness}'),
    ('feed_type', 'feed-type', 'Specific feed type for farm/livestock (e.g. Complete Feed, Supplement, Mineral Block, Protein Block).', '{animal_feed_farm}'),
    ('protein_percentage', 'protein-percentage', 'Crude protein percentage minimum guarantee for farm feed.', '{animal_feed_farm}'),
    ('fat_percentage', 'fat-percentage', 'Crude fat percentage minimum guarantee for farm feed.', '{animal_feed_farm}')
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    facet_profile = EXCLUDED.facet_profile;

-- Treats / chews facets
INSERT INTO public.facet_definitions (name, slug, description, facet_profile)
VALUES
    ('treat_type', 'treat-type', 'Type of treat or chew (e.g. Biscuit, Dental Treat, Jerky, Training Treat, Chew, Lickable, Freeze-Dried).', '{animal_treats_chews}'),
    ('chew_duration', 'chew-duration', 'Expected chew duration (e.g. Quick, Moderate, Long-Lasting).', '{animal_treats_chews}'),
    ('texture', 'texture', 'Texture of the treat or product (e.g. Crunchy, Soft, Chewy, Hard).', '{animal_treats_chews,animal_litter_bedding}'),
    ('rawhide_free', 'rawhide-free', 'Whether the chew is rawhide-free (boolean).', '{animal_treats_chews}'),
    ('functional_benefit', 'functional-benefit', 'Functional benefit claim (e.g. Dental, Calming, Joint, Skin & Coat, Digestive).', '{animal_treats_chews,animal_health_wellness}')
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    facet_profile = EXCLUDED.facet_profile;

-- Cat litter facets
INSERT INTO public.facet_definitions (name, slug, description, facet_profile)
VALUES
    ('litter_material', 'litter-material', 'Primary material of cat litter (e.g. Clay, Crystal, Corn, Pine, Paper, Walnut, Grass).', '{animal_litter_bedding}'),
    ('clumping', 'clumping', 'Whether the litter is clumping or non-clumping.', '{animal_litter_bedding}'),
    ('dust_level', 'dust-level', 'Dust level classification (e.g. Low Dust, Dust-Free).', '{animal_litter_bedding}'),
    ('tracking_control', 'tracking-control', 'Whether the litter is formulated for low tracking.', '{animal_litter_bedding}'),
    ('absorbency', 'absorbency', 'Absorbency rating or description for litter and bedding products.', '{animal_litter_bedding}')
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    facet_profile = EXCLUDED.facet_profile;

-- Toys / enrichment facets
INSERT INTO public.facet_definitions (name, slug, description, facet_profile)
VALUES
    ('toy_type', 'toy-type', 'Type of toy (e.g. Plush, Chew, Fetch, Rope, Puzzle, Treat Dispensing, Wand).', '{animal_toys_enrichment}'),
    ('play_style', 'play-style', 'Intended play style (e.g. Chewing, Fetching, Tugging, Chasing, Foraging).', '{animal_toys_enrichment}'),
    ('durability', 'durability', 'Durability rating (e.g. Light, Moderate, Tough, Extreme).', '{animal_toys_enrichment}'),
    ('has_squeaker', 'has-squeaker', 'Whether the toy contains a squeaker (boolean).', '{animal_toys_enrichment}')
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    facet_profile = EXCLUDED.facet_profile;

-- Garden / lawn facets
INSERT INTO public.facet_definitions (name, slug, description, facet_profile)
VALUES
    ('garden_product_type', 'garden-product-type', 'Type of garden product (e.g. Soil, Fertilizer, Seed, Pest Control, Tool, Sprayer).', '{garden_consumable,garden_equipment}'),
    ('coverage_area', 'coverage-area', 'Coverage area in square feet for lawn and garden consumables.', '{garden_consumable}'),
    ('season', 'season', 'Target season or application timing (e.g. Spring, Summer, Fall, Winter, All Season).', '{garden_consumable}'),
    ('organic', 'organic', 'Whether the product is certified organic (boolean).', '{garden_consumable}'),
    ('target_pest', 'target-pest', 'Target pest for pest control products (e.g. Ants, Grubs, Ticks, Fleas, Rodents, Mosquitoes).', '{garden_consumable}'),
    ('target_weed', 'target-weed', 'Target weed type for weed control products (e.g. Crabgrass, Broadleaf, Moss, Dandelion).', '{garden_consumable}'),
    ('grass_type', 'grass-type', 'Target grass type for lawn seed and repair products (e.g. Sun/Shade, Northeast Mix, Tall Fescue, Kentucky Bluegrass).', '{garden_consumable}'),
    ('npk_ratio', 'npk-ratio', 'NPK ratio value for fertilizers (e.g. 10-10-10, 24-0-6, 30-0-0).', '{garden_consumable}'),
    ('application_method', 'application-method', 'Product application method (e.g. Granular, Spray, Concentrate, Ready-to-Use, Hose-End).', '{garden_consumable,animal_health_wellness}')
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    facet_profile = EXCLUDED.facet_profile;

-- Animal health facets
INSERT INTO public.facet_definitions (name, slug, description, facet_profile)
VALUES
    ('active_ingredient', 'active-ingredient', 'Primary active ingredient for health, flea/tick, and pest control products (e.g. Fipronil, Glucosamine, Praziquantel).', '{animal_health_wellness}'),
    ('target_condition', 'target-condition', 'Specific health condition or indication (e.g. Joint Health, Digestive, Urinary, Calming, Deworming, Flea/Tick).', '{animal_health_wellness}')
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    facet_profile = EXCLUDED.facet_profile;

-- Aquarium / equipment facets
INSERT INTO public.facet_definitions (name, slug, description, facet_profile)
VALUES
    ('tank_size', 'tank-size', 'Compatible tank size range in gallons for aquarium equipment.', '{aquarium_equipment,reptile_equipment,animal_habitat_containment}'),
    ('wattage', 'wattage', 'Power rating in watts for heaters, lights, and pumps.', '{aquarium_equipment,reptile_equipment}'),
    ('media_type', 'media-type', 'Filter media type (e.g. Mechanical, Biological, Chemical, Carbon, Ceramic Rings, Sponge).', '{aquarium_equipment}'),
    ('water_type', 'water-type', 'Water type for aquarium treatments and equipment (e.g. Freshwater, Saltwater, Brackish, Pond).', '{aquarium_equipment}'),
    ('bulb_type', 'bulb-type', 'Bulb or lamp type for reptile/aquarium lighting (e.g. UVB, UVA, Heat, LED, Fluorescent, Mercury Vapor).', '{reptile_equipment}'),
    ('uvb_strength', 'uvb-strength', 'UVB output percentage or strength for reptile lighting (e.g. 5.0, 10.0, 14.0).', '{reptile_equipment}'),
    ('capacity', 'capacity', 'Storage or containment capacity for tanks, coops, crates, and containers (e.g. 40 gal, 25 lb, 6 person).', '{animal_habitat_containment,aquarium_equipment,hardware_tools}'),
    ('compatibility', 'compatibility', 'Compatibility notes for parts, filters, media, and accessories (e.g. Fits 10-20 gal tanks, Works with API brands).', '{animal_habitat_containment,aquarium_equipment,reptile_equipment,hardware_tools}')
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    facet_profile = EXCLUDED.facet_profile;

-- Grooming / cleaning facets
INSERT INTO public.facet_definitions (name, slug, description, facet_profile)
VALUES
    ('coat_type', 'coat-type', 'Target coat type for grooming products (e.g. Short Hair, Long Hair, Double Coat, Curly, Smooth).', '{grooming_cleaning}'),
    ('formula', 'formula', 'Product formula or type (e.g. Shampoo, Conditioner, Spray, Wipes, Oatmeal, Hypoallergenic, Medicated).', '{grooming_cleaning}'),
    ('use_case', 'use-case', 'Intended use case for cleaning or grooming products (e.g. Stain Removal, Odor Control, Deodorizing, Deep Clean, Daily).', '{grooming_cleaning}')
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    facet_profile = EXCLUDED.facet_profile;

-- Home / heating facets
INSERT INTO public.facet_definitions (name, slug, description, facet_profile)
VALUES
    ('fuel_type', 'fuel-type', 'Heating fuel type (e.g. Wood Pellets, Coal, Firewood, Corn, Kernel, Fuel Tabs).', '{home_heating}'),
    ('btu', 'btu', 'BTU rating for heating products and stoves.', '{home_heating}')
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    facet_profile = EXCLUDED.facet_profile;

COMMIT;
