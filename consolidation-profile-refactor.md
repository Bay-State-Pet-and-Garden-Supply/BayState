# Consolidation Profile Refactor

## Summary

Replaced the 5-domain classification system with 15 facet profiles in the consolidation pipeline. All backwards-compatibility aliases maintained.

## Files Modified

### apps/web/lib/consolidation/category-domain.ts
- `ProductDomain` (5 values) → `FacetProfile` (15 values): `animal_food`, `animal_treats_chews`, `animal_feed_farm`, `animal_health_wellness`, `animal_toys_enrichment`, `animal_habitat_containment`, `animal_litter_bedding`, `grooming_cleaning`, `aquarium_equipment`, `reptile_equipment`, `garden_consumable`, `garden_equipment`, `home_heating`, `hardware_tools`, `general`
- `DetailField` expanded from 11 → 50+ fields (all canonical facet definitions)
- `DOMAIN_APPLICABLE_FIELDS` → `FACET_PROFILE_APPLICABLE_FIELDS` with profile-specific field matrices
- `classifyProductDomain(category)` → `resolveFacetProfile(category, explicitFacetProfile?)` — now accepts optional DB-stored profile override. Uses breadcrumb-segment-based rule engine (14 prioritized rules) rather than regex floods.
- Backwards compat: `ProductDomain = FacetProfile`, `DOMAIN_APPLICABLE_FIELDS` alias, `classifyProductDomain` re-export as alias

### apps/web/lib/consolidation/detail-enrichment.ts
- Imports: `resolveFacetProfile`, `FACET_PROFILE_APPLICABLE_FIELDS`, `FacetProfile`
- `EnrichmentResult.domain` kept as deprecated alias alongside new `facetProfile`
- Added 28 new pattern dictionaries: `PROTEIN_PATTERNS`, `CLAIMS_PATTERNS`, `TREAT_TYPE_PATTERNS`, `CHEW_DURATION_PATTERNS`, `TEXTURE_PATTERNS`, `FUNCTIONAL_BENEFIT_PATTERNS`, `LITTER_MATERIAL_PATTERNS`, `CLUMPING_PATTERNS`, `DUST_LEVEL_PATTERNS`, `TOY_TYPE_PATTERNS`, `PLAY_STYLE_PATTERNS`, `DURABILITY_PATTERNS`, `GARDEN_PRODUCT_TYPE_PATTERNS`, `SEASON_PATTERNS`, `ORGANIC_PATTERNS`, `FUEL_TYPE_PATTERNS`, etc.
- Added 39 new field extractors with source data lookup + pattern matching fallback
- `SOURCE_FIELD_ALIASES` expanded from 11 → 56 entries (every canonical detail field)
- Main `enrichProductDetails()` now reads `consolidated.facet_profile` for explicit profile override

## Backwards Compatibility
- `EnrichmentResult.domain` still populated (aliased to `facetProfile`)
- `classifyProductDomain` still exported as alias
- `DOMAIN_APPLICABLE_FIELDS` still exported as alias
- `ProductDomain` still exported as type alias
- `batch-service.ts` imports only `enrichProductDetails` — signature unchanged

## Downstream Dependencies
- `batch-service.ts` — unchanged, accesses only `.fields`
- `detail-enrichment` re-exports: `FACET_PROFILE_APPLICABLE_FIELDS`, `resolveFacetProfile`, `DetailField`, `FacetProfile`
