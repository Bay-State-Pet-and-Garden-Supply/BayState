# Scraper Pipeline Data Flow — Compressed Summary

## Pipeline State Machine
8 persisted statuses (`apps/web/lib/pipeline/types.ts`):
```
imported → extracting → processed → merging → reviewing → publishing → failed
         → awaiting_brand (sub-status of imported)
```

Status transitions validated in `apps/web/lib/pipeline/core.ts`.

---

## 1. Scraper → Adapter → Enrichment (Raw Source Data)

### Python scraper models (`apps/scraper/core/models.py`)
- **`ExcelInputProduct`**: frozen model — `upc` + `price` are the SOURCE OF TRUTH, NEVER overwritten by scrapers or LLM
- **`RawScrapedProduct`**: enrichment-only data — `name`, `brand`, `weight`, `description`, `images`, `features`, `ingredients`, `dimensions`, `case_pack`, `ratings`, `reviews_count`, `image_text`. `scraped_price` is **for reference only** and stored but ignored downstream
- Scraper output goes into `products_ingestion.sources` as a `source_slug`-keyed nested structure

### Enriched source layout (`apps/web/lib/product-source-fallbacks.ts`)
Each source in the DB has a nested shape:
```
extracted.core: { name, brand_name, description, weight_lbs, search_keywords }
extracted.facets: [{ definition_slug, value, confidence_score }]
extracted.media: [{ url, role, source, confidence_score }]
extracted.evidence.source_urls, selected_images
extracted.approved_sources: { [sourceSlug]: { extracted: { core, facets, media } } }
extracted.source_results: [{ sourceSlug, product: { core, facets, media }, evidenceUrl }]
```

### Protected fields (never extracted from sources)
**Price**, stock_status, availability, is_special_order, minimum_quantity, is_taxable — these are FROZEN from the original Excel input. `product-source-fallbacks.ts` explicitly skips them.

---

## 2. Consolidation (LLM) — `apps/web/lib/consolidation/`

### Trigger
Products in `processed` status → POST `/api/admin/consolidation/submit` → `batch-service.ts` → `direct-chat-service.ts` → DeepSeek `/v1/chat/completions`

### LLM Output Contract (`prompt-builder.ts` / `AGENTS.md`)
```json
{ "name": "string", "brand": "string", "weight": "string",
  "confidence_score": "number 0.0-1.0", "category": "string",
  "description": "string", "search_keywords": "string" }
```

### Apply + Detail Enrichment (`apply-service.ts` + `facet-assembler.ts` + `detail-enrichment.ts`)
During `applyConsolidationResults()`:
1. **Validate**: required fields, confidence threshold (default 0.7), taxonomy, animal signal cross-check against trusted sources
2. **Brand resolution**: `brand-resolver.ts` — lookup/cleanse to canonical `brand_id`
3. **Facet assembly** (`assembleProductFacets()`): merges LLM output + VLM packaging facets + source-backed fallbacks + heuristic enrichment
4. **Detail enrichment** (`enrichProductDetails()`):
   - Classifies product into a **facet profile** (15 profiles: `animal_food`, `animal_treats_chews`, `animal_feed_farm`, `animal_health_wellness`, `animal_toys_enrichment`, `animal_habitat_containment`, `animal_litter_bedding`, `grooming_cleaning`, `aquarium_equipment`, `reptile_equipment`, `garden_consumable`, `garden_equipment`, `home_heating`, `hardware_tools`, `general`)
   - Resolves profile from category breadcrumb + optional explicit DB hint
   - For each applicable field (~50+ total fields), tries: (a) structured source aliases, (b) regex pattern matching on name/description/category
   - Returns `populatedFields` + `missingFields` — gaps surfaced in Reviewing UI for manual fill
5. Product promoted to `reviewing` status

### Canonical 15 facet profiles + applicable fields (`category-domain.ts`)
Each profile has a distinct field set. Examples:
- `animal_food`: animal_type, life_stage, breed_size, food_form, primary_protein, diet_type, flavor, health_focus, claims, size, package_weight, packaging_type
- `garden_consumable`: garden_product_type, coverage_area, season, organic, target_pest, target_weed, grass_type, npk_ratio, application_method, size, package_weight
- `general` fallback: product_feature, size, color, packaging_type, material, dimensions

---

## 3. Review → Publish → Storefront (`apps/web/lib/pipeline/publish.ts`)

### `publishToStorefront(upc)`:
1. Validates product is in `reviewing` status
2. Resolves slug + storefront name
3. Handles images: stores inline data URLs as durable Supabase storage objects
4. **Core fields written to `products` table**:
   - `name`, `price` (from consolidated core, fallback to input, default 0), `brand_id`, `stock_status` (fallback "in_stock"), `is_special_order`, `is_taxable`, `weight`, `search_keywords`, `gtin`, `availability` (fallback "in stock"), `minimum_quantity`, `quantity` (default 0), `low_stock_threshold` (default 5)
   - Category: resolves `canonical_category_breadcrumb` → lookup in `categories` table → stores `canonical_category_id`
5. **Facets**: syncs `product_facets` rows (definition_slug uses hyphens, e.g. `animal-type`)
   - Multi-values (pipe-delimited like `Chicken|Salmon`) are split into individual `product_facets` rows
   - Facet values upserted into `facet_values` table, linked via `product_facets` junction
6. **ShopSite sync**: creates `shopsite_sync_status` pending row
7. Pipeline status → `publishing`

### Key storefront data dependency chain:
```
input.price → frozen from Excel (never changes)
consolidated.core.stock_status → products.stock_status (default "in_stock")
consolidated.core.is_special_order → products.is_special_order
consolidated.core.is_taxable → products.is_taxable
consolidated.name → products.name
consolidated.core.canonical_category_breadcrumb → products.canonical_category_id
consolidated.facets[].definition_slug/value → product_facets rows
consolidated.media[].url → products.images
```

---

## 4. Cohort System (`apps/web/lib/pipeline/cohorts.ts`)
Products are grouped into cohorts by UPC prefix + brand_id. When brand changes during consolidation apply, `recohortProducts()` splits mixed-brand cohorts.

---

## 5. Downstream Consumers of Scraped Data

| Consumer | What it reads | Source path |
|----------|--------------|-------------|
| **Storefront (`products` table)** | name, price, brand_id, stock_status, images, weight, gtin | consolidated.core + fallbacks |
| **Product facets** | ~50+ detail fields | consolidated.facets → `product_facets` |
| **Category links** | `canonical_category_breadcrumb` | consolidated → `product_categories` |
| **ShopSite export** | name, price, description, images, weight | `shopsite_sync_status` → eventual export |
| **Admin Reviewing UI** | facets, evidence, source data | consolidated + sources for copilot editing |
| **Search / Filtering** | name, description, search_keywords, facets | `products` table + `product_facets` |
| **Prices & Inventory** | **FROZEN from Excel input** — scraped price is stored as `scraped_price` in raw source data but never consumed by any downstream system | `input.price`, `consolidated.core.stock_status` |

---

## 6. Tests Validating Product Data Extraction

| Test File | What it validates |
|-----------|-------------------|
| `apps/web/lib/consolidation/__tests__/detail-enrichment.test.ts` | Facet profile classification, field extraction from structured sources + pattern matching, profile-appropriate field filtering, pre-existing value preservation |
| `apps/web/__tests__/lib/pipeline/publish.test.ts` | Storefront publish flow: name resolution, facet syncing, category linking, image storage |
| `apps/web/__tests__/integration/cohort-pipeline.test.ts` | End-to-end: import → consolidate → apply → publish, state machine transitions, error handling |
| `apps/web/__tests__/integration/scraper-qa-flow.test.ts` | Scraper test callback → health score tracking |
| `apps/web/lib/consolidation/__tests__/consistency-rules.test.ts` | Brand consistency across siblings, description format validation |
| `apps/web/lib/pipeline/core.test.ts` | State machine transition validation |
| `apps/scraper/tests/live/test_full_pipeline_live.py` | Live SERP → crawl → resolve → extract pipeline (acceptance-level) |

---

## 7. Key Architectural Constraints

1. **Price is frozen at import** — never derived from scraped data. `ExcelInputProduct.price` is the single source of truth.
2. **Stock/inventory defaults** — `stock_status` defaults to `"in_stock"` if absent from consolidation. No real inventory sync exists.
3. **Facet profiles are deterministic** — no second LLM call for details. Regex + structured source extraction only.
4. **Source trust hierarchy**: canonical (shopsite_input) > trusted (Bradley, Central Pet, Orgill, manufacturer) > standard > marketplace (Amazon, eBay). Marketplace data excluded from animal signal cross-checks.
5. **Marketplace prices never consumed** — `PROTECTED_FIELDS` set in `product-source-fallbacks.ts` blocks `price`, `stock_status`, `availability`, `is_special_order`, `minimum_quantity`, `is_taxable` from source-backed extraction.
