# Taxanomy Implementation — Task 5 Complete

## File Created
`apps/web/supabase/migrations/20260509131200_expand_retail_facet_schema_and_definitions.sql`

## Summary

### Part A: Schema changes
- Added `is_deprecated boolean NOT NULL DEFAULT false` to `public.facet_definitions`
- Added `facet_profile text[] NOT NULL DEFAULT '{}'` to `public.facet_definitions`  
- Created `idx_facet_definitions_is_deprecated` index

### Part B: Seed 50+ canonical facet definitions
Total definitions across 10 groups, each with slug, description, and facet_profile array:

| Group | Facets | Profiles |
|---|---|---|
| Existing (updated) | lifestage, pet_size, special_diet, health_feature, food_form, flavor, product_feature, size, color, packaging_type | Varied per facet |
| Universal | package_weight, package_count, material, scent, dimensions, indoor_outdoor, subscription_eligible | `{}` (all profiles) |
| Animal food/feed | animal_type, life_stage, breed_size, primary_protein, diet_type, claims, health_focus, feed_type, protein_percentage, fat_percentage | `animal_food`, `animal_feed_farm` etc. |
| Treats/chews | treat_type, chew_duration, texture, rawhide_free, functional_benefit | `animal_treats_chews` |
| Cat litter | litter_material, clumping, dust_level, tracking_control, absorbency | `animal_litter_bedding` |
| Toys | toy_type, play_style, durability, has_squeaker | `animal_toys_enrichment` |
| Garden | garden_product_type, coverage_area, season, organic, target_pest, target_weed, grass_type, npk_ratio, application_method | `garden_consumable`, `garden_equipment` |
| Health | active_ingredient, target_condition | `animal_health_wellness` |
| Equipment | tank_size, wattage, media_type, water_type, bulb_type, uvb_strength, capacity, compatibility | `aquarium_equipment`, `reptile_equipment`, `animal_habitat_containment`, `hardware_tools` |
| Grooming | coat_type, formula, use_case | `grooming_cleaning` |
| Home/heating | fuel_type, btu | `home_heating` |

### Design decisions
- `brand` excluded — separate brand table/filter handles it
- Old definitions left at `is_deprecated=false` for now (Task 9 marks them deprecated + copies values to canonical)
- All inserts use `ON CONFLICT (name) DO UPDATE` for idempotent re-runs
- `facet_profile` arrays enable profile-aware filter rendering in the storefront
- `life_stage`, `breed_size`, `diet_type`, `health_focus` added as new canonical names alongside deprecated old ones

## Validation
- Migration file is syntactically valid SQL (`BEGIN`/`COMMIT` wrapped)
- No collisions with existing facet names
- All slugs are lowercase-kebab format
- No product data is affected (additive migration only)

## Next
Task 9 will migrate existing product facet values from deprecated definitions to canonical ones.
