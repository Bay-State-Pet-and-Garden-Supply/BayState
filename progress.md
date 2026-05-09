# Progress

## Status
In Progress — Batch 4 started

## Recently Completed

### Batch 1 (Parallel — 5 workers): Database Migrations 1-7
- Task 1: Preflight audit script — `supabase/audits/20260509125900_taxonomy_preflight_audit.sql`
- Task 2: Category metadata columns (department_key, depth, breadcrumb, facet_profile, seo_title, seo_description, synonym_keywords, sort_order, is_active) — `migrations/20260509130000_add_taxonomy_category_metadata.sql`
- Task 3: product_categories.relationship_type (phase 1, no unique constraint) — `migrations/20260509130500_add_product_categories_relationship_type_phase1.sql`
- Task 4: products.canonical_category_id (nullable FK) — `migrations/20260509131000_add_products_canonical_category_id.sql`
- Task 5: Expanded facet schema (is_deprecated, facet_profile arrays) + 50+ facet definitions — `migrations/20260509131200_expand_retail_facet_schema_and_definitions.sql`
- Task 6: Seeded 13-department taxonomy (13 L1, 112 L2, 411 L3) + 10 pet types — `migrations/20260509131500_seed_retail_taxonomy_and_pet_types.sql`
- Task 7: Legacy slug redirects table + 70+ mappings — `migrations/20260509131700_create_legacy_slug_redirects.sql`

### Batch 2 (Parallel — 4 workers): Remap + Types
- Task 8: Product category remap + canonical row selection + legacy deactivation — `migrations/20260509131800_remap_product_categories_to_retail_taxonomy.sql`
- Task 9: Backfill canonical product facets (lifestage→life_stage, pet_size→breed_size, etc.) — `migrations/20260509132000_backfill_canonical_product_facets.sql`
- Task 10: Finalize relationship constraints (runs after code deploy) — `migrations/20260509139000_finalize_product_category_relationship_constraints.sql`
- Task 11-12: Updated `lib/taxonomy.ts` (new fields, DB-preferred depth/breadcrumb, synonym matching), `lib/types.ts` (Category, PetLifeStage, FacetProfile aliases), `lib/data.ts` (expanded selects, is_active filter, getLegacyCategoryRedirectBySlug)

### Batch 3 (Parallel — 4 workers): Consolidation + Storefront + ShopSite
- Task 13-14: `lib/consolidation/category-domain.ts` — replaced 5 ProductDomain with 15 FacetProfile, 50+ DetailField, resolveFacetProfile with explicit profile override, backwards-compat aliases
- Task 13-14: `lib/consolidation/detail-enrichment.ts` — 28 new pattern dictionaries, 39 new field extractors, SOURCE_FIELD_ALIASES expanded to 56 entries
- Task 15-16: `lib/facets.ts` — exported FacetValue, added description/facet_profile/is_deprecated to FacetDefinition, filters deprecated definitions by default; `lib/facets/generic-normalization.ts` — updated ProductField→facet mappings to canonical names (lifestage→life_stage, pet_size→breed_size, special_diet→diet_type, health_feature→health_focus)
- Task 17: `lib/data.ts` — expanded selects, is_active filter, getLegacyCategoryRedirectBySlug
- Task 18: `app/(storefront)/c/[...slug]/page.tsx` — legacy 301 redirects, SEO title/description metadata
- Task 22: `lib/facets/category-mapping.ts` — rewrote all slug values for new taxonomy
- Task 23: `lib/shopsite/mapping.ts` — updated page inference for new department names; constants unchanged

### Batch 4: Prompt + Products
- Task 29: `lib/consolidation/prompt-builder.ts` — active-only categories, compact grouped format (department-grouped, ~4000 char budget), removed 50-item cap
- Part of Task 27: `lib/products.ts` — ProductFilterOptions.categories type expanded, is_active filters added to category queries/resolution

### Batch 5 (Complete): Admin Category UI
- Task 24: `app/admin/categories/actions.ts` — extended categorySchema (department_key, facet_profile, seo_title, seo_description, synonym_keywords, sort_order, is_active); createCategory computes depth/breadcrumb from parent; updateCategory recomputes descendants on name/parent change; deleteCategory soft-deletes via is_active=false
- Task 25: `components/admin/categories/CategoryModal.tsx` — extended Category interface and form schema; added department dropdown (13 options), facet profile dropdown (15 options), SEO title/description, synonym keywords input, sort order, is_active checkbox
- Task 26: `components/admin/categories/AdminCategoriesClient.tsx` — sort by sort_order then name; shows department badge, active/inactive status, breadcrumb in secondary text

### Batch 6 (Complete): Tests + Storefront Updates
- Task 1 (test): `lib/consolidation/__tests__/category-domain.test.ts` — rewritten for 15 FacetProfile, new taxonomy breadcrumbs, explicitFacetProfile override
- Task 1 (test): `lib/consolidation/__tests__/detail-enrichment.test.ts` — facetProfile assertions, updated field names (breed_size, diet_type, health_focus)
- Task 2 (test): `__tests__/lib/facets/normalization.test.ts` — canonical facet names (pet_size→breed_size, special_diet→diet_type, health_feature→health_focus), added canonical mapping test
- Task 3 (test): `__tests__/lib/admin/migration/contract-drift-regression.test.ts` — removed exact-10-generic-facets assertion
- Task 3 (test): `__tests__/lib/admin/migration/pet-type-direct-mapping.test.ts` — added Horse, Chicken & Poultry, Farm & Livestock pet types + recognition test
- Task 4 (nav): `components/storefront/header.tsx` — primaryNavCategories shows all L1 departments, not just is_featured
- Task 4 (sitemap): `app/sitemap.ts` — `.eq('is_active', true)` added to categories query
- Task 4 (settings): `lib/settings.ts` — hardcoded link /c/farm-animal → /c/chicken-poultry

## Remaining Work
- Task 21: Import/migration tests (multi-category canonical selection)
- Task 27 (part): Verify product filter/dynamic facet changes for deprecated definitions
- Task 30: Legacy redirect + taxonomy regression tests
- Task 31: Validation (bun run web test, lint)

## Files Changed
92 files total (20 new migrations/audits + 72 modified source files)
