# Taxonomy Types Update

## Files Modified

### 1. `apps/web/lib/taxonomy.ts`

**TaxonomyCategoryRecord** — added 9 optional fields: `department_key`, `depth`, `breadcrumb`, `facet_profile`, `seo_title`, `seo_description`, `synonym_keywords`, `sort_order`, `is_active`.

**TaxonomyCategoryNode** — added normalized non-optional versions of all new fields. `depth` and `breadcrumb` prefer DB-provided values with computed fallbacks. `synonym_keywords` defaults to `[]`. `is_active` defaults to `true`.

**buildTaxonomyNodes()** — sort order changed to `sort_order ?? display_order ?? 0` (favoring new `sort_order` column). Depth and breadcrumb now prefer DB-provided `category.depth` / `category.breadcrumb` when present, falling back to computed parent-chain values.

**resolveTaxonomySelections()** — added `bySynonym` map indexed from `node.synonym_keywords`. Lookup chain extended: `byId → byBreadcrumb → bySlug → byUniqueName → bySynonym`.

### 2. `apps/web/lib/types.ts`

**Category interface** — expanded with: `department_key`, `depth`, `breadcrumb`, `facet_profile`, `seo_title`, `seo_description`, `synonym_keywords`, `sort_order`, `is_active`, `display_order`, `is_featured`, `updated_at`.

**New type aliases:**
- `CategoryRelationshipType = 'canonical' | 'secondary' | 'collection'`
- `FacetProfile` — 14 production profiles + `general`

**PetLifeStage** — expanded with `'chick' | 'layer' | 'starter-grower' | 'all-life-stages'`.

**PET_LIFE_STAGES constant** — added 4 new entries (chick, layer, starter/grower, all life stages).

### 3. `apps/web/lib/data.ts`

**getNavCategories()** — select expanded to all new columns. Added `.eq('is_active', true)` filter.

**getCategoryBySlug()** — select expanded to all new columns. Added `.eq('is_active', true)` filter.

**New function `getLegacyCategoryRedirectBySlug(slug)`** — queries `legacy_slug_redirects` table joined to `categories`, filtering `categories.is_active = true`, returns `{ old_slug, category }` or null.

## Validation Status
- All files compile syntactically (the TypeScript types extend existing patterns)
- No function signatures changed — all changes are additive (new optional fields, new exports)
- `getLegacyCategoryRedirectBySlug` is ready for storefront redirect use (Task 18)
- Downstream code using `buildTaxonomyNodes()` will receive new metadata fields automatically
- Seeded taxonomy with DB-provided `depth`/`breadcrumb` will be preferred over computed values
