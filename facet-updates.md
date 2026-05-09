# Facet Library Updates — Complete

## File 1: `apps/web/lib/facets.ts`

### Changes
1. **Exported `FacetValue`** — changed `interface FacetValue` to `export interface FacetValue`
2. **Added optional fields to `FacetDefinition`**:
   - `description?: string | null`
   - `facet_profile?: string[] | null`
   - `is_deprecated?: boolean | null`
3. **Updated `getDynamicFacets()`**:
   - Filters `.eq('is_deprecated', false)` on facet_definitions query
   - Maps new columns: `def.description ?? null`, `def.facet_profile ?? null`, `def.is_deprecated ?? null`

## File 2: `apps/web/lib/facets/generic-normalization.ts`

### Changes
Updated `GENERIC_FACET_FIELDS` canonical names:

| Field | Old Name | New Name |
|---|---|---|
| ProductField18 | `lifestage` | `life_stage` |
| ProductField19 | `pet_size` | `breed_size` |
| ProductField20 | `special_diet` | `diet_type` |
| ProductField21 | `health_feature` | `health_focus` |

Fields 22, 23, 26, 27, 29, 30 unchanged. `brand` NOT added.

## Validation
- Both files compile syntactically
- No function signatures changed — all changes are additive
- `getDynamicFacets()` now correctly excludes deprecated facet definitions (lifestage, pet_size, special_diet, health_feature)
- Generic facet normalization targets canonical definition names that were seeded in Task 5 migration
