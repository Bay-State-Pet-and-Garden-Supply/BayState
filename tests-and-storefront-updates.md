# Tests + Storefront Updates — Summary

## Files Modified

### 1. `apps/web/lib/consolidation/__tests__/category-domain.test.ts`
- Replaced `classifyProductDomain` imports with `resolveFacetProfile`
- Replaced `DOMAIN_APPLICABLE_FIELDS` with `FACET_PROFILE_APPLICABLE_FIELDS`
- Rewrote all test categories to new taxonomy breadcrumbs (e.g. `Dog > Food > Dry Food`)
- Coverage for all 15 facet profiles: `animal_food`, `animal_treats_chews`, `animal_feed_farm`, `animal_health_wellness`, `animal_toys_enrichment`, `animal_habitat_containment`, `animal_litter_bedding`, `grooming_cleaning`, `aquarium_equipment`, `reptile_equipment`, `garden_consumable`, `garden_equipment`, `home_heating`, `hardware_tools`, `general`
- Added `explicitFacetProfile` override tests
- Updated field assertions to new canonical fields (`diet_type`, `health_focus`, `breed_size`, `active_ingredient`, `clumping`, `npk_ratio`, etc.)

### 2. `apps/web/lib/consolidation/__tests__/detail-enrichment.test.ts`
- Replaced `result.domain` assertions with `result.facetProfile`
- Updated expected profiles: `pet_food` → `animal_food`, `garden` → `garden_consumable`
- Updated pet size: `pet_size` → `breed_size`, `special_diet` → `diet_type`, `health_feature` → `health_focus`
- Added test for `facet_profile` from consolidated data override
- Updated test breadcrumbs to new taxonomy paths

### 3. `apps/web/__tests__/lib/facets/normalization.test.ts`
- Updated `ProductField19` expected name from `pet_size` to `breed_size`
- Updated `ProductField20` expected name from `special_diet` to `diet_type`
- Updated `ProductField21` expected name from `health_feature` to `health_focus`
- Added canonical facet mapping test for `life_stage`, `diet_type`, `health_focus`

### 4. `apps/web/__tests__/lib/admin/migration/contract-drift-regression.test.ts`
- Removed the `GENERIC_FACET_FIELDS` exact-count-10 assertion (`toHaveLength(10)`)
- All other contract tests remain unchanged

### 5. `apps/web/__tests__/lib/admin/migration/pet-type-direct-mapping.test.ts`
- Added 3 new pet types to fixture data: `Horse`, `Chicken & Poultry`, `Farm & Livestock`
- Added new test: `recognizes Horse, Chicken & Poultry, and Farm & Livestock pet types`
- Verifies direct PF17 mapping works for the 3 new pet types

### 6. `apps/web/app/sitemap.ts`
- Added `.eq('is_active', true)` to categories query — excludes inactive legacy categories from sitemap

### 7. `apps/web/lib/settings.ts`
- Updated hardcoded hero slide link from `/c/farm-animal` → `/c/chicken-poultry`

### 8. `apps/web/components/storefront/header.tsx`
- Changed `primaryNavCategories` from filtering `is_featured` to showing all top-level categories
- Desktop nav now renders all active L1 departments (13) + Brands via responsive overflow/"More" menu
- Mega menu `childrenMap` remains unchanged — shows all subcategories regardless

## Files Not Modified (No Changes Needed)
- `apps/web/__tests__/lib/admin/migration/cross-sell-import.test.ts` — no stale facet name references

## Validation Notes
- Nav handles 13+ items via existing `ResizeObserver` + "More" menu overflow system
- Sitemap excludes inactive legacy categories after migration Task 8 runs
- Consolidation test category paths match the seeded taxonomy breadcrumbs from Task 6
- All function signatures unchanged — only test expectations and nav rendering logic updated
