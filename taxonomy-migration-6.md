# Task 6: Seed Retail Taxonomy & Pet Types — Complete

## File Created
`apps/web/supabase/migrations/20260509131500_seed_retail_taxonomy_and_pet_types.sql` (951 lines)

## Contents

### Part A: Pet Types
10 types upserted with `ON CONFLICT (name) DO NOTHING`. Unique index `idx_pet_types_name` created first.

### Part B: L1 Departments
13 departments, each with `seo_title`, `seo_description`, `synonym_keywords`, `facet_profile='general'`, `is_active=true`, slug resolution.

### Part C: L2 Categories
112 L2 rows with department-specific `facet_profile` assignments:
- `animal_food` — food categories (dog, cat, small pet, bird, fish, reptile)
- `animal_treats_chews` — treats, chews
- `animal_toys_enrichment` — toys
- `animal_health_wellness` — health, flea/tick, supplements
- `animal_habitat_containment` — crates, cages, coops, tanks
- `animal_litter_bedding` — litter, bedding, substrate
- `grooming_cleaning` — grooming, cleaning
- `aquarium_equipment` — filters, pumps, lights, water care
- `reptile_equipment` — heat lamps, UVB, substrate
- `garden_consumable` — soil, seed, fertilizer, pest control
- `garden_equipment` — tools, watering, sprayers
- `home_heating` — fuel, stove/fireplace
- `hardware_tools` — tools, hardware, electrical, plumbing
- `animal_feed_farm` — farm/equine feed
- `general` — apparel, beds, bowls, carriers, storage, etc.

### Part D: L3 Categories
411 L3 rows across all departments.

| Department | L2s | L3s |
|---|---|---|
| Dog | 14 | 48 |
| Cat | 13 | 42 |
| Small Pet | 8 | 22 |
| Pet Bird | 8 | 23 |
| Fish & Aquarium | 9 | 33 |
| Reptile & Amphibian | 7 | 26 |
| Wild Bird & Wildlife | 8 | 26 |
| Chicken & Poultry | 8 | 29 |
| Horse | 9 | 31 |
| Farm & Livestock | 7 | 23 |
| Lawn & Garden | 10 | 37 |
| Home & Heating | 6 | 20 |
| Tools & Hardware | 5 | 15 |
| **Total** | **112** | **411** |

### Design Decisions
- **No hardcoded UUIDs** — all parent references resolved by slug joins
- **Idempotent** — `ON CONFLICT (slug) DO UPDATE` on every insert
- **Inherited SEO** — L2s get `department > name` title, L3s get `breadcrumb` description
- **Cached breadcrumbs** — computed as `parent.breadcrumb || ' > ' || child.name`
- **sort_order = display_order** — consistent ordering throughout

Progress recorded: `progress.md` updated.
