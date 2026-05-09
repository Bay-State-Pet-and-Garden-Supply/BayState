# Import Code Updates — Canonical Category Placement

## Summary

Updated both batch and single-product import paths to:
1. Write `relationship_type` on `product_categories` rows (`'canonical'` or `'secondary'`)
2. Set `products.canonical_category_id` to the chosen canonical category

## Files Modified

### `apps/web/lib/admin/migration/product-import.ts`

**Changes:**

1. **New helper types and functions:**
   - `CategoryMeta` interface — `{ depth, sort_order, slug }`
   - `fetchCategoryMetas()` — fetches depth/sort_order/slug for a set of category IDs
   - `chooseCanonicalCategory()` — selects canonical from list (deepest depth → lowest sort_order → alphabetical slug)

2. **`replaceProductCategories()` updated:**
   - Added optional `categoryMetaMap` parameter (if not provided, fetched internally)
   - When categories exist: upserts each with `relationship_type = 'canonical'` or `'secondary'`
   - Updates `products.canonical_category_id` to the chosen canonical ID
   - When 0 categories: clears `products.canonical_category_id` to null

3. **Preloading phase updated:**
   - Category slug→ID resolution now also fetches `depth, sort_order, slug`
   - Builds `categoryMetaById: Map<string, { depth, sort_order, slug }>`

4. **Caller at line ~694:**
   - Passes `categoryMetaById` to `replaceProductCategories()`

### `apps/web/lib/admin/migration/product-import-batched.ts`

**Changes:**

1. **`loadReferenceData()` updated:**
   - Category fetch now selects `id, name, slug, depth, sort_order`
   - Builds `categoryMetaById: Map<string, { depth, sort_order, slug }>` from results
   - Returns `categoryMetaById` alongside `categoryMap`

2. **`categoriesToInsert` type changed from:**
   ```ts
   Array<{ product_id: string; category_id: string }>
   ```
   To:
   ```ts
   Array<{ product_id: string; category_id: string; relationship_type: 'canonical' | 'secondary' }>
   ```

3. **Category collection loop updated:**
   - Resolves slugs to IDs
   - Selects canonical using deepest depth → lowest sort_order → alphabetical slug
   - Pushes each with appropriate `relationship_type`

4. **New bulk canonical_category_id update after relation insert:**
   - Builds map of product→canonical category ID
   - Batches updates by category ID for efficiency (using `IN` queries)
   - Also clears `canonical_category_id` to null for products with 0 categories

## How Canonical Selection Works

Both import paths use the same priority:
1. **Deepest depth** (L3 > L2 > L1) — most specific category wins
2. **Lowest sort_order** — earlier in display order
3. **Alphabetical slug** — deterministic tiebreaker

## Verification

After deployment:
- Each product with categories has exactly one `product_categories` row with `relationship_type = 'canonical'`
- `products.canonical_category_id` matches that canonical row's `category_id`
- Products with 0 categories have `canonical_category_id = null`
- Products with multiple categories have additional rows as `secondary`
