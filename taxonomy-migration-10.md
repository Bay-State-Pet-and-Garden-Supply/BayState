# Task 10: Finalize Product Category Relationship Constraints

## File Created

`apps/web/supabase/migrations/20260509139000_finalize_product_category_relationship_constraints.sql`

## What It Does

| Step | Detail |
|---|---|
| 1. Safety null backfill | `UPDATE ... SET relationship_type = 'secondary' WHERE NULL` — catches any edgecase nulls |
| 2. Pre-flight violation check | `DO $$` block counts products with >1 canonical row; `RAISE EXCEPTION` with product IDs if violations exist |
| 3. CHECK constraint | `(IN ('canonical', 'secondary', 'collection'))` added with `DO $$` + `information_schema` guard for idempotency |
| 4. NOT NULL | `ALTER COLUMN relationship_type SET NOT NULL` |
| 5. Partial unique index | `idx_product_categories_one_canonical_per_product` on `(product_id) WHERE relationship_type = 'canonical'` |
| 6. Verification queries | 5 commented SQL checks for manual review after migration |

## Run Order

**Must run LAST** in the taxonomy migration sequence:

```
Tasks 2-5 (schema additions)
  → Task 6 (seed taxonomy)
    → Task 7 (legacy redirects)
      → Task 8 (product remap + canonical selection)
        → Tasks 19-20 (import code deploys)
          → **Task 10** ← here
```

## Safety

- Pre-flight `DO $$` block will `RAISE EXCEPTION` if any product has duplicate canonical rows — migration aborts before any damage
- CHECK constraint is guarded by `information_schema` lookup — no error on re-run
- Index uses `CREATE UNIQUE INDEX IF NOT EXISTS` — idempotent
- NOT NULL is unconditional but safe: nulls are backfilled first

## Manual Verification Queries

Included as SQL comments in the migration (lines 117-141). Run after migration completes:

1. Check for null relationship_type → expect 0
2. Check for duplicate canonical rows → expect empty
3. Confirm partial unique index exists
4. Confirm CHECK constraint exists with correct values
5. Confirm `is_nullable = 'NO'`

## Dependency

This migration is safe to write now but **must not be applied** until:
- Task 8 has backfilled exactly one canonical row per product
- Tasks 19-20 (import code writes `relationship_type` explicitly) are deployed to production
