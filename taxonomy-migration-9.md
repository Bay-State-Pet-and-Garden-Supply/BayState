# Task 9: Backfill Canonical Product Facets — Complete

## File Created
`apps/web/supabase/migrations/20260509132000_backfill_canonical_product_facets.sql` (14.6 KB)

## What It Does

### Phase 1: Copy facet_values (4 mappings)
Copies existing facet values from deprecated definitions to their canonical replacements:

| Deprecated Definition | Canonical Replacement | Copy Strategy |
|---|---|---|
| `lifestage` | `life_stage` | All values via normalized_value |
| `pet_size` | `breed_size` | All values via normalized_value |
| `special_diet` | `diet_type` | All values via normalized_value |
| `health_feature` | `health_focus` | All values via normalized_value |

Uses `ON CONFLICT (facet_definition_id, normalized_value) DO NOTHING` for idempotency.

### Phase 2: Flavor → primary_protein (protein-only)
Only copies flavor values that represent actual protein sources: Chicken, Beef, Salmon, Turkey, Lamb, Duck, Venison, Pork, Fish, Rabbit, Bison, Tuna, Whitefish, Trout, Cod, Liver, Seafood, Shrimp, Herring, Mixed Protein.

Non-protein flavors (Peanut Butter, Sweet Potato, Apple, Banana, Cheese, Bacon) stay as flavor-only.

### Phase 3: Copy product_facets associations
For each mapping, copies existing product facet associations to the canonical facet values. Uses `normalized_value` as the join key between old and new facet values. DISTINCT ensures no duplicates. `ON CONFLICT (product_id, facet_value_id)` handles idempotent re-runs.

### Phase 4: Mark deprecated definitions
Sets `is_deprecated = true` on `lifestage`, `pet_size`, `special_diet`, `health_feature`.

Keeps `flavor` NOT deprecated — it remains a display facet.

### Reporting
All phases emit `RAISE NOTICE` counts through a temp table report, showing exactly how many values and product facet associations were copied for each mapping.

## Safety Features
- All inserts use `ON CONFLICT ... DO NOTHING` — safe to re-run
- Wrapped in `BEGIN/COMMIT` — atomic
- Reports success/failure counts — easy to verify
- Checks that old AND new definitions exist before copying (JOIN-based lookups)
- No destructive operations — deprecated definitions remain in the table with `is_deprecated = true`

## Dependencies
- **Must run AFTER** `20260509131200_expand_retail_facet_schema_and_definitions.sql` (Task 5) — that migration creates the canonical `life_stage`, `breed_size`, `diet_type`, `health_focus`, and `primary_protein` definitions alongside the deprecated ones.

## Verification
After running, check:
1. `SELECT COUNT(*) FROM product_facets` increased by expected amount
2. `SELECT name, is_deprecated FROM facet_definitions WHERE name IN ('lifestage','pet_size','special_diet','health_feature')` shows all `true`
3. `SELECT name, is_deprecated FROM facet_definitions WHERE name = 'flavor'` shows `false`
4. Storefront facet sidebar shows `life_stage` (not `lifestage`), `breed_size` (not `pet_size`), etc.
