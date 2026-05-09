# Taxonomy Overhaul — Tasks 3 & 4: Migration Files Created

## Task 3: Product-Category Relationship Type (Phase 1)

**File:** `apps/web/supabase/migrations/20260509130500_add_product_categories_relationship_type_phase1.sql`

Changes:
1. Added `relationship_type text DEFAULT 'canonical'` to `public.product_categories`
2. Created non-unique index `idx_product_categories_relationship_type`

**What's intentionally omitted:** `NOT NULL`, `CHECK` constraint, and partial unique index for one-canonical-per-product. Those go in Task 10 after import code is updated.

**Why phase 1:** Current `product_categories` is a plain many-to-many table. Some products have 2+ category rows. If we added the unique constraint immediately, every multi-category product would violate it.

## Task 4: Products Canonical Category FK

**File:** `apps/web/supabase/migrations/20260509131000_add_products_canonical_category_id.sql`

Changes:
1. Added nullable `canonical_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL` to `public.products`
2. Created index `idx_products_canonical_category_id`

**Why nullable:** Backfill happens in Task 8 after taxonomy seed and legacy remap. Import code must also set this field (Tasks 19-20).

## Migration plan dependency order

```
Task 2 (category metadata) 
  → Task 6 (seed taxonomy) 
    → Task 7 (legacy redirects) 
      → Task 8 (remap + canonical backfill)

Task 3 (relationship_type) ──→ Task 8 ──→ Task 10 (final constraints)
                                  ↓
Task 4 (canonical_category_id) ──→ Task 8
                                  ↓
                             Tasks 19-20 (import code updates)
```

Task 10 (finalize constraints with NOT NULL + CHECK + unique canonical index) runs last, only after Tasks 19-20 update import code to write `relationship_type` explicitly.
