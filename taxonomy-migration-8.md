# Task 8: Taxonomy Remap Migration — Implementation Summary

## File Created
`apps/web/supabase/migrations/20260509131800_remap_product_categories_to_retail_taxonomy.sql` (26.7 KB)

## Structure

### Phase 1 — Remap `product_categories.category_id` (lines 38-300)
- **Explicit mapping table** (12 groups, ~75 entries): Same slug-to-slug mappings as Task 7's `legacy_slug_redirects`, covering Bird→Pet Bird, Fish Aquatics→Fish Aquarium, Reptile→Reptile & Amphibian, Wild Bird→Wild Bird & Wildlife, Farm Animal splits (Chicken, Horse, Livestock), Household/Home→Home & Heating, plus Dog/Cat/Small Pet/Lawn & Garden corrections and common alias slugs (`pets→dog`, `bird-supplies→pet-bird`, etc.)
- **Prefix-based fallback** (7 `UPDATE` statements): For any old slug not in the explicit mapping, uses `replace()` on slug prefixes with department_key filter to ensure correct targeting. Order is priority-sensitive (e.g., `farm-animal-chicken-` checked before `farm-animal-horse-` before generic `farm-animal-`)
- Uses temp table `remap_candidates` to preview and verify before updating
- Reports unmapped rows via `RAISE WARNING`

### Phase 2 — Deduplicate after remap (lines 305-326)
- After remapping, deletes duplicate `(product_id, category_id)` rows using `ctid` ordering
- Keeps exactly one row per unique pair

### Phase 3 — Choose canonical rows + backfill (lines 330-410)
- Ranks each product's categories by: `depth DESC` (deepest first) → `sort_order ASC` (lowest/earliest) → `slug ASC` (alphabetical tiebreaker)
- Rank 1 → `relationship_type = 'canonical'`, rest → `'secondary'`
- Backfills `products.canonical_category_id` from the canonical row using `DISTINCT ON` with the same ordering
- Validates no product has >1 canonical row

### Phase 4 — Deactivate legacy categories (lines 414-460)
- Recursive CTE collects all category IDs in the 13-department new taxonomy tree
- Deactivates (`is_active = false`) any category NOT in that tree that has no remaining product_categories references
- Safety net: skips categories that still have product references

### Final verification (lines 464-506)
- Reports: total product_categories, canonical/secondary distribution, products with/without canonical_category_id
- Warns if any product_categories still point to inactive categories or categories outside the new taxonomy
- Warnings are non-fatal — migration always succeeds

## Run Order Dependencies
Must run AFTER:
- `20260509130000_add_taxonomy_category_metadata.sql` (Task 2 — provides `is_active`, `depth`, `department_key`, `sort_order`)
- `20260509130500_add_product_categories_relationship_type_phase1.sql` (Task 3 — provides `relationship_type` column)
- `20260509131000_add_products_canonical_category_id.sql` (Task 4 — provides `canonical_category_id`)
- `20260509131500_seed_retail_taxonomy_and_pet_types.sql` (Task 6 — provides new active categories)
- `20260509131700_create_legacy_slug_redirects.sql` (Task 7 — not a hard dependency but same mapping patterns used)

## Safety Features
- **TEMP table verification**: `remap_candidates` loaded and counted before UPDATE
- **`RAISE NOTICE`/`WARNING`**: Every phase reports row counts; unmapped rows produce warnings
- **`LEFT JOIN` safety**: Prefix replacements use `INNER JOIN` with active category filter, so only valid remaps happen
- **Duplicate deferral**: Relationship-type constraint (Task 10) runs later; this migration only writes the correct values
- **Legacy deactivation guard**: Skips categories that still have product references

## Risks
- Prefix-based slug replacement (`replace(slug, 'farm-animal-chicken', 'chicken-poultry')`) may produce non-existent new slugs if the old slug had non-standard subpaths. The active-category join filter catches and silently skips these — they'll appear in the warning counts.
- Products with zero category rows will have `canonical_category_id = NULL` — this is expected behavior.
- If a product already had exactly one category before remap, it correctly gets `canonical`. Products with zero categories remain uncategorized.
