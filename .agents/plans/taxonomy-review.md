# Taxonomy Implementation Plan Review

**Verdict: NEEDS_CHANGES**

The plan is broad and mostly aligned with the research, but it has several implementation-order and backwards-compatibility gaps that should be fixed before workers start coding.

## Validation answers

1. **Does the plan cover all code paths identified in research?**
   - Mostly. It covers the major researched surfaces: category schema, `product_categories`, `products.canonical_category_id`, facets, `lib/taxonomy.ts`, `lib/data.ts`, `lib/products.ts`, admin category UI/actions, storefront category pages, consolidation domain/profile logic, prompt builder, `category-mapping.ts`, `shopsite/mapping.ts`, and tests.
   - Missing or under-specified: `pet_types` data seeding, existing `product_facets` remap, URL redirects/old slug fallback, future import writes for `relationship_type`/`canonical_category_id`, and recursive breadcrumb/depth maintenance after admin edits.

2. **Are there missed dependencies between workstreams?**
   - Yes. A2's canonical uniqueness depends on B2's canonical-row selection, not the other way around.
   - Future import code must be updated before adding/enforcing the one-canonical-row rule, or imports can fail.
   - If `is_active` is used by B2/F3/H1/I1, it must be a firm migration decision in A1, not optional.

3. **Does the migration order make sense?**
   - Not yet. A2 currently defaults all existing `product_categories` rows to `canonical` and immediately adds a partial unique index. The current table is many-to-many; any product with more than one category row will violate that index.
   - Use a two-phase migration instead: add `relationship_type` without the unique index, mark one row canonical per product during remap/backfill, set the rest secondary/collection, then add the partial unique index.

4. **Backwards compatibility concerns for existing products?**
   - Yes. Existing category URLs can break, old product facet filters can lose value unless remapped/aliased, existing products may have unmapped categories not listed in `category-mapping.ts`, and `products.canonical_category_id` can drift from `product_categories` unless runtime writes are updated.

5. **Does the plan handle the ShopSite import pipeline?**
   - Partially. It covers `apps/web/lib/facets/category-mapping.ts`, `apps/web/lib/shopsite/mapping.ts`, and `apps/web/lib/shopsite/constants.ts`.
   - It does not explicitly require import write paths to set `product_categories.relationship_type` and `products.canonical_category_id` for future imports. Add this to D2/E1 or a new workstream.

6. **Are facet profile definitions comprehensive enough to replace the current domain system?**
   - The profile list is close, but the facet matrix is incomplete. Research says `animal_health_wellness` needs condition, active ingredient, and application method; the plan does not add `active_ingredient` or a health-specific `condition`/`target_condition`. Farm feed also needs feed/nutrient fields, and litter/bedding needs absorbency.
   - Also define a concrete profile-to-facet mapping in code or DB. Current D1 keeps `facet_definitions` flat and D2 only optionally mentions profile metadata.

## Correct

- Plan matches the research's main taxonomy target: 13 top-level departments and split `Farm Animal` into `Chicken & Poultry`, `Horse`, and `Farm & Livestock`.
- Plan covers the researched ShopSite slug paths: `category-mapping.ts`, `shopsite/mapping.ts`, and `SHOPSITE_PAGES` compatibility.
- Plan correctly recognizes the prompt-builder risk from the research: new taxonomy likely exceeds the current 50-category prompt cap.
- Plan keeps old facet definitions during transition, which is safer than deleting them immediately.

## Blocker

### 1. A2 canonical uniqueness can fail on existing data

Evidence:
- Research: `product_categories` is currently a plain many-to-many table and every placement is equal.
- Plan A2: add `relationship_type NOT NULL DEFAULT 'canonical'` and partial unique index on one canonical row per product.

Problem:
- If any existing product has 2+ category rows, both become `canonical`, then the partial unique index fails.

Required change:
- Split A2 into:
  1. Add nullable/default `secondary` or unconstrained `relationship_type`.
  2. During B2, choose exactly one canonical row per product.
  3. Backfill `products.canonical_category_id`.
  4. Add `NOT NULL`, check constraint, and partial unique canonical index after cleanup.

### 2. Legacy slug/URL compatibility is only a risk, not a workstream

Evidence:
- Research risk: slug changes break existing URLs; mitigation is 301 redirects or old slug fallback.
- Plan only lists this in Risks and H1 mentions hardcoded link updates.

Required change:
- Add a dedicated workstream for old-slug compatibility:
  - persist `legacy_slug_map(old_slug, new_slug)` or equivalent,
  - implement category-page fallback/redirect from old slugs to new slugs,
  - add tests for representative old URLs: `bird`, `fish-aquatics`, `farm-animal`, `farm-animal-horse-*`, `home-*`.

### 3. Existing product facet values are not migrated

Evidence:
- Research explicitly lists: “Migrate existing facet values: Map old ShopSite facet fields to new facet definitions.”
- Plan D1 keeps old definitions and says value migration is optional/later.

Problem:
- New canonical facets (`life_stage`, `breed_size`, `diet_type`, `health_focus`, `primary_protein`) may be empty for existing products, while old facets still render separately.

Required change:
- Add a migration/backfill workstream to copy or remap existing `product_facets` from old definitions to new definitions, with dedupe on `(product_id, facet_value_id)`.
- If deferring, add explicit UI/runtime aliasing so old filters remain visible and not duplicated.

### 4. Future import writes are under-specified

Evidence:
- Plan updates import files mainly for facet definition names.
- New DB design adds both `product_categories.relationship_type` and `products.canonical_category_id`.

Problem:
- Future ShopSite imports can keep inserting category rows using default `canonical`, conflicting with the one-canonical index, or fail to update `products.canonical_category_id`.

Required change:
- Add explicit tasks in `product-import.ts` and `product-import-batched.ts`:
  - choose canonical category from mapped slug(s),
  - insert/update canonical join row with `relationship_type = 'canonical'`,
  - insert secondary placements as `secondary`,
  - update `products.canonical_category_id`,
  - add regression tests for multi-category imports.

### 5. `is_active` is optional but downstream workstreams rely on it

Evidence:
- Plan A1 says `is_active` is optional.
- B2, F3, G3, H1, and I1 all branch on inactive legacy categories.

Required change:
- Make `is_active boolean NOT NULL DEFAULT true` part of A1, or remove all inactive-category behavior and choose hard deletion plus redirects. Do not leave this as optional in the implementation plan.

## Note

- Add `pet_types` DB seed/update. Research flags missing horse/poultry/livestock pet types. Plan F2 updates TypeScript types only, not data.
- Add preflight SQL audit before B2: list current category slugs, product counts by category, products with multiple categories, and unmapped slugs. The plan currently maps slugs referenced in `category-mapping.ts`, but production may contain more.
- Add recursive breadcrumb/depth maintenance. G1 computes the edited category, but if a parent is renamed or moved, descendants need breadcrumb/depth recalculation too.
- Expand facet definitions for missing profile needs: `active_ingredient`, `condition` or `target_condition`, `feed_type`, `protein_percentage`, `fat_percentage`, `absorbency`. Treat `application_method` as usable by animal health, not only garden.
- Decide whether `brand` should be a `facet_definition`. Current app already has a separate brand filter/table; adding brand as a facet may duplicate UI filters unless intentionally handled.
- ShopSite handling is directionally correct. Keep `SHOPSITE_PAGES` stable unless ShopSite destination pages actually change, and add tests that new breadcrumbs still map to valid page constants.
