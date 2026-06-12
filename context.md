# Code Context: Consolidation Pipeline Field Mapping

## Files Retrieved

1. **`apps/web/lib/consolidation/types.ts`** (lines 1-216) — `ConsolidationResult` interface; the output contract from the LLM
2. **`apps/web/lib/consolidation/apply-service.ts`** (entire file, ~550 lines) — Orchestrator that merges LLM results + source fallbacks + facets + media into `products_ingestion.consolidated`
3. **`apps/web/lib/consolidation/facet-assembler.ts`** (entire file) — `assembleProductFacets()` — unpacks LLM `packaging_facets`, legacy-to-canonical mapping, heuristic enrichment, existing facet preservation
4. **`apps/web/lib/consolidation/prompt-builder.ts`** (entire file) — `generateSystemPrompt()` — tells the LLM what JSON shape to return and which keys are allowed in `packaging_facets`
5. **`apps/web/lib/consolidation/prompt-evidence.ts`** (entire file) — `filterSourceData()` — determines which scraper fields ARE sent to the LLM (and by omission which are dropped)
6. **`apps/web/lib/consolidation/detail-enrichment.ts`** (entire file) — `enrichProductDetails()` — post-LLM deterministic extraction; `SOURCE_FIELD_ALIASES` map shows which scraper field names are recognized per DetailField
7. **`apps/web/lib/consolidation/category-domain.ts`** (entire file) — `FACET_PROFILE_APPLICABLE_FIELDS` matrix — 15 facet profiles each with a whitelist of allowed `DetailField` values
8. **`apps/web/lib/consolidation/facet-vocabulary.ts`** (entire file) — `validateFacetValue()` — validates facet values against `facet_definitions` + `facet_values` DB tables
9. **`apps/web/lib/consolidation/result-normalizer.ts`** (entire file) — normalizes `name`, `brand`, `description`, `search_keywords`, `weight` post-LLM
10. **`apps/web/lib/consolidation/media-resolver.ts`** (entire file) — `resolveProductMedia()` — handles images separately from facets
11. **`apps/web/lib/product-source-fallbacks.ts`** (lines 57-840+) — `collectSourceBackedFallbacks()` — traverses enriched + per-source data to extract core fields and facet fallbacks

## Key Code

### 1. LLM Output Contract (`ConsolidationResult`)

```typescript
// types.ts
export interface ConsolidationResult {
    upc: string;
    name?: string;
    brand?: string;
    description?: string;
    search_keywords?: string;
    weight?: string;
    price?: string;
    category?: string;
    confidence_score?: number;
    packaging_facets?: Record<string, string>;  // key-value pairs from LLM
    error?: string;
}
```

The `generateSystemPrompt()` in `prompt-builder.ts` tells the LLM to output **exactly** this shape. The LLM picks which keys go inside `packaging_facets` based on the facet profile matrix in the system prompt.

### 2. Core Fields Consumed by `apply-service.ts`

The `applyConsolidationResults()` function (the main orchestrator) uses these `result.*` fields:

| LLM Field | Where It Goes | Notes |
|-----------|---------------|-------|
| `upc` | Row lookup key | Required |
| `name` | `nextCore.name` | Fallback chain: result → existingCore → sourceFallback |
| `brand` | `brandResolver.resolveBrand(cleanBrandLabel(result.brand))` | Fallback: sourceFallback.core.brand |
| `description` | `nextCore.description` | Fallback chain |
| `search_keywords` | `nextCore.search_keywords` | Fallback chain |
| `weight` | `nextCore.weight_lbs` (parsed via `parseFloat`) | Fallback: existingCore → sourceFallback |
| `price` | `nextCore.price` (parsed) | Fallback: existingCore.price |
| `category` | `nextCore.canonical_category_breadcrumb` | Taxonomy-validated |
| `confidence_score` | `nextCore.confidence_score` | Checked against threshold (default 0.7) |
| `error` | If truthy, product is rejected | Skip assembly |
| `packaging_facets` | Passed to `assembleProductFacets()` | See below |

### 3. Facet Assembly (`facet-assembler.ts`)

`assembleProductFacets()` builds the final `facets[]` array. Sources, in priority order:

**A. LLM `packaging_facets`** (confidence 0.95, source `vlm_ocr`):
Every key in `result.packaging_facets` is remapped via `LEGACY_TO_CANONICAL_FACETS`, then dasherized.

**B. LLM non-core fields** (confidence 0.9, source `llm`):
Any field on `result` NOT in `coreKeys = { upc, name, brand, weight, price, category, description, confidence_score, search_keywords, error, packaging_facets }` is promoted to a facet.

**C. Source-backed fallback facets** (from `collectSourceBackedFallbacks`):
Facets extracted from enriched + per-source data, also remapped and dasherized.

**D. Heuristic enrichment** (from `enrichProductDetails`, confidence 0.85, source `heuristic_enrichment`):
Category-dependent deterministic extraction (see section 5).

**E. Existing facets** (from `products_ingestion.consolidated.facets`):
Preserved if not overridden by higher-priority sources.

### 4. Legacy-to-Canonical Facet Slug Mapping

```typescript
// facet-assembler.ts
LEGACY_TO_CANONICAL_FACETS = {
    pet_type: 'animal_type',
    life_stage: 'life_stage',
    pet_size: 'breed_size',
    special_diet: 'diet_type',
    health_feature: 'health_focus',
    food_form: 'food_form',
    flavor: 'flavor',
    product_feature: 'claims',
    size: 'size',
    color: 'color',
    packaging_type: 'packaging_type',
    // Scraper adapter field aliases
    protein: 'primary_protein',
    protein_source: 'primary_protein',
    case_pack: 'package_count',
    pack_count: 'package_count',
    unit_of_measure: 'unit_type',
    bci_item_number: 'item_number',
    mfg_number: 'manufacturer_number',
    mfg_part_number: 'manufacturer_number',
};
```

After mapping, `_` is replaced with `-` to produce the final `definition_slug` (e.g. `primary_protein` → `primary-protein`).

### 5. Facet Profile Applicability Matrix

From `category-domain.ts`, 15 profiles each with a whitelist of allowed `DetailField` values:

| Profile | Allowed Fields |
|---------|---------------|
| `animal_food` | animal_type, life_stage, breed_size, food_form, primary_protein, diet_type, flavor, health_focus, claims, size, package_weight, package_count, packaging_type, product_feature, color |
| `animal_treats_chews` | animal_type, life_stage, breed_size, flavor, treat_type, chew_duration, texture, rawhide_free, functional_benefit, claims, size, package_weight, packaging_type, color |
| `animal_feed_farm` | animal_type, life_stage, food_form, feed_type, protein_percentage, fat_percentage, flavor, claims, size, package_weight, packaging_type |
| `animal_health_wellness` | animal_type, life_stage, breed_size, active_ingredient, target_condition, application_method, flavor, size, package_weight, packaging_type, claims, product_feature |
| `animal_toys_enrichment` | animal_type, toy_type, play_style, durability, has_squeaker, material, size, color, product_feature |
| `animal_habitat_containment` | animal_type, size, dimensions, material, capacity, color, product_feature |
| `animal_litter_bedding` | animal_type, litter_material, clumping, scent, dust_level, tracking_control, absorbency, size, package_weight, packaging_type |
| `grooming_cleaning` | animal_type, coat_type, formula, use_case, scent, size, color, packaging_type, product_feature |
| `aquarium_equipment` | tank_size, wattage, media_type, water_type, size, dimensions, color, product_feature |
| `reptile_equipment` | animal_type, bulb_type, uvb_strength, wattage, size, dimensions, product_feature |
| `garden_consumable` | garden_product_type, coverage_area, season, organic, target_pest, target_weed, grass_type, npk_ratio, application_method, size, package_weight, product_feature |
| `garden_equipment` | garden_product_type, material, size, dimensions, color, capacity, product_feature |
| `home_heating` | fuel_type, btu, size, package_weight, dimensions, product_feature |
| `hardware_tools` | material, size, dimensions, color, capacity, compatibility, product_feature |
| `general` | product_feature, size, color, packaging_type, material, dimensions |

### 6. Source Field Aliases (Detail Enrichment)

`detail-enrichment.ts` defines `SOURCE_FIELD_ALIASES` — the map from canonical `DetailField` names to known scraper/adapter key names. Full list of canonical fields:

```
animal_type, life_stage, breed_size, primary_protein, diet_type, flavor,
health_focus, claims, food_form, packaging_type, size, color, pet_type,
pet_size, special_diet, health_feature, product_feature, treat_type,
chew_duration, texture, rawhide_free, functional_benefit, litter_material,
clumping, dust_level, tracking_control, absorbency, toy_type, play_style,
durability, has_squeaker, garden_product_type, coverage_area, season,
organic, target_pest, target_weed, grass_type, npk_ratio,
application_method, active_ingredient, target_condition, feed_type,
protein_percentage, fat_percentage, fuel_type, btu, tank_size, wattage,
media_type, water_type, bulb_type, uvb_strength, capacity, compatibility,
coat_type, formula, use_case, dimensions, package_weight, package_count,
material, scent, indoor_outdoor, subscription_eligible
```

### 7. Fields Sent to the LLM (prompt-evidence.ts)

`filterSourceData()` only includes fields matching `RELEVANT_FIELDS`:

```
title, brand, weight, size, attributes, description, category, categories,
flavor, color, unit, quantity, ingredients, material, dimensions,
specifications, pet_type, lifestage, features, upc, item_number,
manufacturer_part_number, case_pack, unit_of_measure, size_options,
confidence, image_text
```

Plus up to 4 additional fallback fields with key names matching fragments: `name, brand, weight, size, attribute, description, category, flavor, colour, color, unit, quantity, material, ingredient, dimension, spec, title, confidence, categories, pet, age, life, stage, animal, breed, feature, page, upc, item_number, manufacturer_part, case_pack, uom`.

### 8. Fields Explicitly Excluded from LLM Input

```typescript
const EXCLUDED_FROM_LLM = new Set([
  'ratings', 'reviews_count', 'availability', 'scraped_at',
  'search_keywords', 'is_taxable', 'taxable', 'is_special_order',
  'special_order', 'specialorder', 'selected_images', 'manual_selection',
]);

// Plus: any key containing image, url, search_keyword, searchkeyword,
// taxable, special_order, specialorder, special order, manual, scraped_at,
// or starting with _
```

## Architecture

```
Scraper Adapters → Products Ingestion (sources JSON)
        │
        ▼
  filterSourceData()  ───  "What fields does the LLM see?"
  (prompt-evidence.ts)
        │
        ▼
  LLM Consolidation  ───  Returns ConsolidationResult JSON
  (OpenAI/DeepSeek/Gemini)   { name, brand, weight, description,
        │                      category, search_keywords,
        │                      confidence_score, packaging_facets, ... }
        ▼
  normalizeConsolidationResult()  ───  Name/brand/weight/description
  (result-normalizer.ts)               normalization rules
        │
        ▼
  applyConsolidationResults()  ───  Orchestrator
  (apply-service.ts)            │
        │                       ├─ Brand resolution (brand-resolver.ts)
        │                       ├─ Taxonomy validation (taxonomy-validator.ts)
        │                       ├─ Animal-signal cross-check
        │                       ├─ Confidence threshold gate
        │                       └─ Calls assembleProductFacets() ↓
        ▼
  assembleProductFacets()  ───  Builds final facets[] array
  (facet-assembler.ts)      │
                            ├─ 1. LLM packaging_facets (vlm_ocr)
                            ├─ 2. LLM non-core fields (llm)
                            ├─ 3. Source-backed fallback facets
                            ├─ 4. Heuristic detail enrichment
                            └─ 5. Preserved existing facets
                                 │
                                 ▼
  enrichProductDetails()  ───  Profile-aware deterministic extraction
  (detail-enrichment.ts)   │
                           ├─ Resolves FacetProfile from category
                           ├─ For each applicable DetailField:
                           │   try source → pattern-match → null
                           └─ Returns populatedFields + missingFields
                                 │
                                 ▼
  resolveProductMedia()   ───  Image/media resolution (separate path)
  (media-resolver.ts)
        │
        ▼
  mergeNestedCandidates()  ───  Merges into consolidated {core, facets,
  (apply-service.ts)                     media, evidence}
```

## Start Here

Open **`apps/web/lib/consolidation/facet-assembler.ts`** first. It's the central junction point where LLM output, source-backed fallbacks, heuristic enrichment, and existing facets converge into the final `facets[]` array. Follow the `assembleProductFacets()` function and trace each source of facet candidates.

## Constraints, Risks & Open Questions

### What Gets Passed Through
- **LLM `packaging_facets` keys**: All pass through after legacy remap → dasherization → vocabulary validation → value normalization. The LLM chooses which keys based on the profile matrix in the system prompt, but there is NO server-side filter restricting `packaging_facets` keys to profile-allowed fields — any key survives (see risk #2).
- **LLM non-core fields**: Any field on `ConsolidationResult` not in `coreKeys` gets promoted to a facet.
- **Enrichment fields**: Only profile-applicable `DetailField` values are extracted.
- **Source field aliases**: 60+ canonical `DetailField` names each have 2-6 known scraper/adapter key aliases.

### What Gets Silently Dropped
1. **LLM input filtering** (prompt-evidence.ts): The LLM never sees `ratings`, `reviews_count`, `availability`, `scraped_at`, `search_keywords` (paradoxically required in output), `is_taxable`, `is_special_order`, or any key containing `image`/`url` (except `image_text`). Also dropped: keys starting with `_`, and any field not in `RELEVANT_FIELDS` or not matching the fallback fragment list.
2. **Source metadata**: Fields like `_scraped_at`, `_source`, `_url`, and source-tracking metadata are excluded from LLM context and enrichment aliases.
3. **Unrecognized scraper adapter fields**: If a scraper adapter outputs a field like `wash_instructions` or `assembly_required`, it won't match any alias in `SOURCE_FIELD_ALIASES` or `LEGACY_TO_CANONICAL_FACETS` and will only reach the LLM if it matches the fallback fragment list in `hasRelevantKeyName`.
4. **Protected fields**: `price`, `stock_status`, `availability`, `is_special_order`, `minimum_quantity`, `is_taxable` are explicitly blocked from `collectSourceBackedFallbacks` output.

### Key Risks
1. **No server-side packaging_facets key filter**: The system prompt tells the LLM which keys to use per profile, but `facet-assembler.ts` does NOT filter `packaging_facets` keys against the resolved profile. The LLM could output keys for a different profile and they would still pass through.
2. **Vocabulary validation depends on DB state**: If `facet_definitions` or `facet_values` tables are empty/incomplete, vocabulary-based validation is a no-op and raw LLM values pass through unchanged.
3. **profile-allowed_fields vs. packaging_facets mismatch**: The profile matrix only gates *heuristic enrichment* extraction. The LLM's `packaging_facets` and the non-core-field-to-facet promotion are NOT constrained by the profile — they're only constrained by the LLM following instructions.
4. **`search_keywords` excluded from LLM input but required in output**: The LLM must synthesize keywords from context; it never sees existing `search_keywords`.
