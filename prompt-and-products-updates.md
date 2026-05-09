# Prompt Builder & Products.ts Updates

## File 1: `apps/web/lib/consolidation/prompt-builder.ts`

### Changes Made

1. **Added import**: `buildTaxonomyNodes`, `TaxonomyCategoryNode` imported from `@/lib/taxonomy`
2. **`getCategories()`**: Added `.eq('is_active', true)` filter; added `department_key`, `depth`, `breadcrumb` to select
3. **New helper `buildGroupedCategoryList(nodes)`**: Converts ~200+ leaf categories into compact department-grouped lines (e.g. `Dog > Food: Dry Food, Wet Food, Fresh/Frozen +3 more`). Cap at ~4000 chars for the taxonomy section. Limits examples to 8 per group, appends `+N more` for overflow.
4. **`generateSystemPrompt()`**: Now takes the grouped lines as the `allowedCategoriesStr`. Removed the old 50-category `MAX_PROMPT_CATEGORIES` slice. The `categorySuffix` truncation message is gone (grouped format handles overflow naturally).
5. **`buildPromptContext()`**: Passes `categoryRecords` to `buildGroupedCategoryList()` and uses the result as the prompt body. Still returns full breadcrumb strings as `categories` array for downstream taxonomy validation.

### Resolved Issues
- Removed stale `categorySuffix` and `displayedCategories` references
- Prompt now instructs the model to pick full breadcrumbs (e.g. "Dog > Food > Dry Food") from the grouped list

## File 2: `apps/web/lib/products.ts`

### Changes Made

1. **`ProductFilterOptions.categories` type**: Added 5 new optional fields — `department_key`, `facet_profile`, `seo_title`, `seo_description`, `sort_order`
2. **Categories query**: Added `.eq('is_active', true)` filter; expanded select to include `department_key`, `depth`, `breadcrumb`, `facet_profile`, `seo_title`, `seo_description`, `sort_order`
3. **`resolveCategoryIds()` slug lookup**: Added `.eq('is_active', true)` filter so inactive legacy categories don't resolve in the public storefront
4. **`resolveCategoryIds()` tree building**: Added `.eq('is_active', true)` filter to the "fetch all categories" query for descendant resolution

### Not Changed
- Dynamic facets already handled by `lib/facets.ts` `getDynamicFacets()` which was updated to filter `is_deprecated = false`
- `FacetDefinition` type already expanded in `lib/facets.ts` with `description`, `facet_profile`, `is_deprecated`
