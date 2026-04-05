# ShopSite to Supabase Migration - Work Plan

## TL;DR

> **Objective:** Complete migration of 8,330 ShopSite products to Supabase, fixing the duplicate SKU blocker and finishing all remaining phases (Product Groups, Cross-sells, Legacy Redirects, Image Migration).
>
> **Deliverables:**
> - 8,330 products imported with UPSERT handling for duplicates
> - ~1,667 product group relationships from `<Subproducts>`
> - ~32K cross-sell relationships from `<ProductField32>` (matched SKUs only)
> - ~8,330 legacy URL redirects for SEO preservation
> - Resumable image migration script for ~8k product images
>
> **Estimated Effort:** Large (4-6 waves, ~15-20 tasks)
> **Parallel Execution:** YES - Multiple phases can run in parallel after product import
> **Critical Path:** Fix UPSERT → Complete Product Import → Product Groups → Cross-sells → Legacy Redirects

---

## Context

### Original Request
Handoff from previous agent who started ShopSite XML → Supabase migration. The migration is partially complete but blocked by duplicate SKU handling in batch SQL.

### Interview Summary
**Key Discussions:**
- Fresh start approach confirmed: truncate products and rebuild from XML (safe - no orders/wishlists to lose)
- All 8,330 XML products are enabled (disabled were filtered out by ShopSite export)
- Cross-sells come from `<ProductField32>` (not `<CrossSell>`) - pipe-delimited SKUs
- Only matched SKUs for cross-sells (42% of references don't match - likely discontinued)
- Image migration to be spaced out/batched separately

### Data Analysis Findings
- **Total Products:** 8,330 in XML
- **Duplicate SKUs:** 1,354 entries with duplicate SKUs (need UPSERT handling)
- **Product Groups:** ~1,667 subproduct entries from `<Subproducts>`
- **Cross-sell References:** ~32K from `<ProductField32>` across 7,999 products
- **Match Rate:** ~58% of PF32 references match real SKUs in the catalog

### Technical Architecture
- **Source:** `temp/web_inventory032126.xml` (67MB, ShopSite export)
- **Target:** Supabase PostgreSQL (`fapnuczapctelxxmrail`)
- **Execution:** Python scripts → SQL batches → `exec_sql()` RPC function
- **Image Source:** `https://www.baystatepet.com/media/{graphic_path}`
- **Image Target:** Supabase Storage `product-images` bucket (already exists)

---

## Work Objectives

### Core Objective
Complete the ShopSite to Supabase migration by fixing the duplicate SKU blocker, importing all 8,330 products, and implementing all remaining data relationships (groups, cross-sells, redirects).

### Concrete Deliverables
- Python migration script with UPSERT logic (`gen_product_batches.py`)
- 167 SQL batch files with `ON CONFLICT (sku) DO UPDATE`
- Execution script completing all product batches (`run_migration.py`)
- Product Groups import script handling `<Subproducts>`
- Cross-sells import script parsing `<ProductField32>` with SKU matching
- Legacy redirects import script mapping `<FileName>` to product slugs
- Resumable image migration script with rate limiting

### Definition of Done
- [ ] All 8,330 products imported into Supabase
- [ ] Duplicate SKUs handled gracefully (last-write-wins or merge strategy)
- [ ] All product groups populated from `<Subproducts>`
- [ ] Cross-sell relationships created for matched SKUs only
- [ ] Legacy redirects table populated for SEO
- [ ] Image migration script tested and ready for batched execution
- [ ] Verification queries pass (counts match expected)

### Must Have
- UPSERT logic to handle duplicate SKUs without batch failures
- SKU-to-ID resolution for cross-sell relationships
- FileName-to-slug mapping for legacy redirects
- Resumable image migration with progress tracking

### Must NOT Have (Guardrails)
- DO NOT create cross-sells for unmatched SKUs (skip them)
- DO NOT fail entire batches on single product errors
- DO NOT download images as part of core migration (separate phase)
- DO NOT modify existing brands/categories (they're already populated)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists:** YES - Supabase with `exec_sql()` function
- **Automated tests:** NO - This is a data migration, not application code
- **Verification method:** SQL count queries and sampling

### QA Policy
Every task MUST include agent-executed QA scenarios:
- **Database verification:** SQL count queries against Supabase
- **Data sampling:** Random record inspection for field correctness
- **Relationship verification:** Join queries to verify foreign keys
- **Evidence capture:** Query results saved to `.sisyphus/evidence/`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Sequential, Blocks Everything):
├── Task 1: Recreate gen_product_batches.py with UPSERT logic
└── Task 2: Regenerate 167 SQL batch files

Wave 2 (Core Import - Can run batches in parallel):
├── Task 3: Execute product batches (batches 1-50)
├── Task 4: Execute product batches (batches 51-100)
├── Task 5: Execute product batches (batches 101-150)
└── Task 6: Execute remaining batches (151-167)

Wave 3 (Relationships - Parallel after Wave 2):
├── Task 7: Import Product Groups from <Subproducts>
├── Task 8: Build SKU-to-ID mapping table
├── Task 9: Import Cross-sells from <ProductField32>
└── Task 10: Import Legacy Redirects from <FileName>

Wave 4 (Verification - Parallel):
├── Task 11: Verify product counts and field coverage
├── Task 12: Verify product groups and cross-sells
├── Task 13: Verify legacy redirects
└── Task 14: Sample data quality check

Wave 5 (Image Migration - Deferred, Resumable):
├── Task 15: Create resumable image migration script
└── Task 16: Test image migration with small batch

Wave FINAL (After ALL tasks - Verification & Sign-off):
├── Task F1: Final verification audit
└── Task F2: Migration completion report
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2, 3-6 |
| 2 | 1 | 3-6 |
| 3-6 | 2 | 7-10, 11-14 |
| 7 | 3-6 | 11-14 |
| 8 | 3-6 | 9 |
| 9 | 8 | 11-14 |
| 10 | 3-6 | 11-14 |
| 11-14 | 7-10 | F1-F2 |
| 15-16 | — | — (independent) |
| F1-F2 | 11-14 | — |

**Critical Path:** 1 → 2 → 3-6 → 7-10 → 11-14 → F1-F2

**Parallel Speedup:** Wave 2 (4 parallel batch runners), Wave 3 (4 parallel relationship tasks)

### Agent Dispatch Summary

| Wave | Tasks | Category | Skills |
|------|-------|----------|--------|
| 1 | 1-2 | `deep` | Python, SQL, XML parsing |
| 2 | 3-6 | `unspecified-high` | SQL execution, batch processing |
| 3 | 7-10 | `deep` | Data transformation, relationship mapping |
| 4 | 11-14 | `quick` | SQL verification, data validation |
| 5 | 15-16 | `unspecified-high` | Python, Supabase Storage, HTTP |
| FINAL | F1-F2 | `oracle` | Audit, reporting |

---

## TODOs

### Wave 1: Fix UPSERT Logic

- [x] **1. Recreate gen_product_batches.py with UPSERT Logic**

  **What to do:**
  - Create `/tmp/gen_product_batches.py` (or save to repo at `apps/web/scripts/`)
  - Parse `temp/web_inventory032126.xml` using ElementTree
  - Handle HTML entities (`&reg;`, `&trade;`, etc.) before parsing
  - Generate `INSERT INTO products (...) VALUES (...)` with `ON CONFLICT (sku) DO UPDATE SET ...`
  - For duplicates: Use last-write-wins strategy (later products overwrite earlier)
  - Generate 167 batch files (50 products each) in `/tmp/migration_products/`
  - Include proper transaction wrapping per batch

  **Must NOT do:**
  - Don't use raw INSERT without ON CONFLICT (causes the current blocker)
  - Don't skip products with duplicate SKUs (upsert them instead)
  - Don't change the field mapping from the implementation plan

  **Recommended Agent Profile:**
  - **Category:** `deep`
  - **Reason:** Complex XML parsing, entity handling, and SQL generation logic
  - **Skills:** None specifically needed, but Python expertise is required

  **Parallelization:**
  - **Can Run In Parallel:** NO
  - **Blocks:** Task 2, Wave 2 (Tasks 3-6)

  **References:**
  - `temp/implementation_plan.md` - Field mapping table (lines 64-86)
  - `temp/web_inventory032126.xml` - Source data structure
  - `apps/web/lib/types.ts` - Product type definitions
  - Supabase products table schema (use MCP to query)

  **Acceptance Criteria:**
  - [ ] Script exists and is executable
  - [ ] Script generates 167 SQL files in `/tmp/migration_products/`
  - [ ] Each SQL file contains UPSERT statements (`ON CONFLICT (sku) DO UPDATE`)
  - [ ] Sample SQL file shows correct syntax (verify via `head -5`)

  **QA Scenarios:**
  ```
  Scenario: Verify UPSERT syntax generation
    Tool: Bash
    Steps:
      1. Run: python3 /tmp/gen_product_batches.py
      2. Check: ls -la /tmp/migration_products/ | wc -l
      3. Verify: grep -l "ON CONFLICT" /tmp/migration_products/*.sql | wc -l
    Expected Result: 167 SQL files exist, all contain "ON CONFLICT"
    Evidence: .sisyphus/evidence/task-1-upsert-verification.txt
  ```

  **Commit:** NO (this is a utility script, not application code)

- [x] **2. Regenerate SQL Batch Files**

  **What to do:**
  - Execute Task 1's script to generate all 167 batch files
  - Verify file count and size distribution
  - Validate a sample file for correct UPSERT syntax
  - Ensure files are in `/tmp/migration_products/` directory

  **Must NOT do:**
  - Don't modify the generated SQL manually
  - Don't proceed to Wave 2 if files aren't generated correctly

  **Recommended Agent Profile:**
  - **Category:** `quick`
  - **Reason:** Simple script execution and validation

  **Parallelization:**
  - **Can Run In Parallel:** NO (depends on Task 1)
  - **Blocks:** Wave 2 (Tasks 3-6)

  **Acceptance Criteria:**
  - [ ] 167 SQL files exist in `/tmp/migration_products/`
  - [ ] Total size ~4-5MB (similar to original)
  - [ ] Sample file shows proper UPSERT syntax

  **QA Scenarios:**
  ```
  Scenario: Verify batch file generation
    Tool: Bash
    Steps:
      1. Run: ls /tmp/migration_products/*.sql | wc -l
      2. Run: wc -c /tmp/migration_products/*.sql | tail -1
      3. Run: head -20 /tmp/migration_products/products_000.sql
    Expected Result: 167 files, ~4-5MB total, shows UPSERT syntax
    Evidence: .sisyphus/evidence/task-2-batch-verification.txt
  ```

  **Commit:** NO

### Wave 2: Execute Product Import

- [x] **3. Execute Product Batches 1-50**

  **What to do:**
  - Create or use `/tmp/run_migration.py` to execute SQL batches via `exec_sql()` RPC
  - Process batches 0-49 (products_000.sql through products_049.sql)
  - Call `exec_sql()` for each batch file
  - Log success/failure for each batch
  - On failure: log error, continue to next batch (don't stop)

  **Must NOT do:**
  - Don't stop on first error (log and continue)
  - Don't execute batches out of order

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high`
  - **Reason:** Batch execution with error handling
  - **Skills:** May need `vercel-cli` if using Supabase CLI

  **Parallelization:**
  - **Can Run In Parallel:** YES - with Tasks 4, 5, 6
  - **Blocked By:** Task 2
  - **Blocks:** Wave 3 (Tasks 7-10)

  **References:**
  - `exec_sql(query text)` function in Supabase (already deployed)
  - Supabase service role key (from `.env.local`)

  **Acceptance Criteria:**
  - [ ] Batches 0-49 executed
  - [ ] Success/failure logged for each batch
  - [ ] Product count in DB increases appropriately

  **QA Scenarios:**
  ```
  Scenario: Verify batch execution and product count
    Tool: skill_mcp (Supabase query)
    Steps:
      1. Execute batches 0-49
      2. Query: SELECT COUNT(*) FROM products
      3. Verify count increased by ~2500 products
    Expected Result: ~2500 new products in database
    Evidence: .sisyphus/evidence/task-3-batch-1-50.log
  ```

  **Commit:** NO

- [x] **4. Execute Product Batches 51-100**

  **What to do:**
  - Same as Task 3, for batches 50-99
  - Process products_050.sql through products_099.sql

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high`

  **Parallelization:**
  - **Can Run In Parallel:** YES - with Tasks 3, 5, 6

  **Acceptance Criteria:**
  - [ ] Batches 50-99 executed
  - [ ] Product count increases by ~2500 more

  **QA Scenarios:**
  ```
  Scenario: Verify batch execution (51-100)
    Tool: skill_mcp (Supabase query)
    Steps:
      1. Execute batches 50-99
      2. Query: SELECT COUNT(*) FROM products
      3. Verify total ~5000 products
    Expected Result: ~5000 total products after this batch
    Evidence: .sisyphus/evidence/task-4-batch-51-100.log
  ```

  **Commit:** NO

- [x] **5. Execute Product Batches 101-150**

  **What to do:**
  - Same pattern, for batches 100-149

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high`

  **Parallelization:**
  - **Can Run In Parallel:** YES - with Tasks 3, 4, 6

  **Acceptance Criteria:**
  - [ ] Batches 100-149 executed
  - [ ] Product count ~7500

  **QA Scenarios:**
  ```
  Scenario: Verify batch execution (101-150)
    Tool: skill_mcp (Supabase query)
    Steps:
      1. Execute batches 100-149
      2. Query: SELECT COUNT(*) FROM products
      3. Verify total ~7500 products
    Expected Result: ~7500 total products
    Evidence: .sisyphus/evidence/task-5-batch-101-150.log
  ```

  **Commit:** NO

- [x] **6. Execute Remaining Batches 151-167**

  **What to do:**
  - Execute final batches 150-166
  - Verify all 8,330 products imported

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high`

  **Parallelization:**
  - **Can Run In Parallel:** YES - with Tasks 3, 4, 5

  **Acceptance Criteria:**
  - [ ] All 167 batches executed
  - [ ] Product count = 8,330 (allowing for 5 products skipped due to missing data)
  - [ ] No critical errors in logs

  **QA Scenarios:**
  ```
  Scenario: Verify complete product import
    Tool: skill_mcp (Supabase query)
    Steps:
      1. Execute final batches 150-166
      2. Query: SELECT COUNT(*) FROM products
      3. Verify count >= 8325 (allowing for 5 skipped)
      4. Query: SELECT COUNT(*) FROM products WHERE weight IS NOT NULL
      5. Verify ~7,946 products have weight
    Expected Result: 8325-8330 products, ~7946 with weight
    Evidence: .sisyphus/evidence/task-6-final-batch.log
  ```

  **Commit:** NO

### Wave 3: Import Relationships

- [x] **7. Import Product Groups from <Subproducts>**

  **What to do:**
  - Parse XML for `<Subproducts>` elements
  - For each parent product with subproducts:
    - Create `product_groups` entry if not exists
    - Set parent product as `default_product_id`
    - For each `<Subproduct>`:
      - Match by SKU to get `product_id`
      - Insert into `product_group_products` with `display_label` from `<Name>`
  - Expected: ~1,667 subproduct entries

  **Must NOT do:**
  - Don't create duplicate product groups for same parent
  - Don't fail if subproduct SKU doesn't match (skip gracefully)

  **Recommended Agent Profile:**
  - **Category:** `deep`
  - **Reason:** Complex relationship mapping and parent-child logic

  **Parallelization:**
  - **Can Run In Parallel:** YES - with Tasks 8-10
  - **Blocked By:** Wave 2 (Tasks 3-6)

  **References:**
  - `temp/web_inventory032126.xml` - `<Subproducts>` structure
  - `apps/web/supabase/migrations/*product_groups*` - Schema

  **Acceptance Criteria:**
  - [ ] Product groups created for all products with `<Subproducts>`
  - [ ] `product_group_products` populated with ~1,667 entries
  - [ ] Parent products set as default in their groups

  **QA Scenarios:**
  ```
  Scenario: Verify product groups import
    Tool: skill_mcp (Supabase query)
    Steps:
      1. Run import script
      2. Query: SELECT COUNT(*) FROM product_groups
      3. Query: SELECT COUNT(*) FROM product_group_products
      4. Sample: SELECT * FROM product_groups LIMIT 5
    Expected Result: Product groups and junction table populated
    Evidence: .sisyphus/evidence/task-7-product-groups.log
  ```

  **Commit:** NO

- [x] **8. Build SKU-to-ID Mapping Table**

  **What to do:**
  - Query all products: `SELECT id, sku FROM products`
  - Build in-memory mapping dict: `{sku: product_id}`
  - Export to temp file for use by cross-sell import
  - This enables fast SKU resolution without repeated DB queries

  **Recommended Agent Profile:**
  - **Category:** `quick`
  - **Reason:** Simple data export and transformation

  **Parallelization:**
  - **Can Run In Parallel:** YES - with Tasks 7, 9-10
  - **Blocks:** Task 9

  **Acceptance Criteria:**
  - [ ] Mapping file created at `/tmp/sku_to_id.json`
  - [ ] Contains ~8,330 SKU-to-ID mappings
  - [ ] All SKUs from products table present

  **QA Scenarios:**
  ```
  Scenario: Verify SKU mapping
    Tool: Bash
    Steps:
      1. Run: python3 -c "import json; data=json.load(open('/tmp/sku_to_id.json')); print(len(data))"
      2. Verify count >= 8325
    Expected Result: ~8330 SKU mappings
    Evidence: .sisyphus/evidence/task-8-sku-mapping.log
  ```

  **Commit:** NO

- [x] **9. Import Cross-sells from <ProductField32>**

  **What to do:**
  - Parse XML for `<ProductField32>` elements
  - For each product with PF32:
    - Split value by `|` to get reference SKUs
    - For each reference SKU:
      - Look up in `/tmp/sku_to_id.json` mapping
      - If found: insert into `related_products` with `relation_type = 'cross_sell'`
      - If not found: skip (log if verbose mode)
  - Expected: ~18,500 cross-sell relationships (58% of ~32K references)

  **Must NOT do:**
  - Don't create cross-sells for unmatched SKUs
  - Don't duplicate existing cross-sell relationships

  **Recommended Agent Profile:**
  - **Category:** `deep`
  - **Reason:** Complex parsing and relationship creation

  **Parallelization:**
  - **Can Run In Parallel:** YES - with Tasks 7, 8, 10
  - **Blocked By:** Task 8 (needs SKU mapping)

  **References:**
  - `/tmp/sku_to_id.json` - SKU to product_id mapping
  - `apps/web/lib/types.ts` - RelatedProduct type

  **Acceptance Criteria:**
  - [ ] Cross-sells imported for matched SKUs only
  - [ ] `related_products` table populated
  - [ ] No duplicate cross-sell relationships

  **QA Scenarios:**
  ```
  Scenario: Verify cross-sells import
    Tool: skill_mcp (Supabase query)
    Steps:
      1. Run import script
      2. Query: SELECT COUNT(*) FROM related_products WHERE relation_type = 'cross_sell'
      3. Verify count > 10,000 (expected ~18,500)
      4. Sample: SELECT * FROM related_products LIMIT 5
    Expected Result: Cross-sell relationships created
    Evidence: .sisyphus/evidence/task-9-cross-sells.log
  ```

  **Commit:** NO

- [x] **10. Import Legacy Redirects from <FileName>**

  **What to do:**
  - Parse XML for `<FileName>` elements (e.g., `esbilac-12-oz.html`)
  - For each product:
    - Extract old URL path from `<FileName>`
    - Map to new path: `/products/{slug}`
    - Insert into `legacy_redirects` table:
      - `old_path`: `/esbilac-12-oz.html` (add leading slash)
      - `new_path`: `/products/{product_slug}`
      - `status_code`: 301
  - Expected: ~8,330 redirects

  **Must NOT do:**
  - Don't create redirects for products without FileName
  - Don't duplicate existing redirects

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high`
  - **Reason:** Data transformation and import

  **Parallelization:**
  - **Can Run In Parallel:** YES - with Tasks 7-9

  **References:**
  - `temp/web_inventory032126.xml` - `<FileName>` elements
  - `legacy_redirects` table schema

  **Acceptance Criteria:**
  - [ ] Legacy redirects created for all products with FileName
  - [ ] `legacy_redirects` table populated
  - [ ] Old paths map correctly to new product slugs

  **QA Scenarios:**
  ```
  Scenario: Verify legacy redirects
    Tool: skill_mcp (Supabase query)
    Steps:
      1. Run import script
      2. Query: SELECT COUNT(*) FROM legacy_redirects
      3. Verify count ~8330
      4. Sample: SELECT * FROM legacy_redirects LIMIT 5
    Expected Result: ~8330 redirects created
    Evidence: .sisyphus/evidence/task-10-legacy-redirects.log
  ```

  **Commit:** NO

### Wave 4: Verification

- [x] **11. Verify Product Counts and Field Coverage**

  **What to do:**
  - Run verification queries from implementation plan:
    - `SELECT COUNT(*) FROM products` -- Should be ~8,330
    - `SELECT COUNT(*) FROM products WHERE weight IS NOT NULL` -- ~7,946
    - `SELECT COUNT(*) FROM products WHERE description IS NOT NULL` -- Check coverage
    - `SELECT COUNT(*) FROM products WHERE images IS NOT NULL AND array_length(images, 1) > 0` -- Check images
  - Compare against expected values
  - Log discrepancies

  **Recommended Agent Profile:**
  - **Category:** `quick`

  **Parallelization:**
  - **Can Run In Parallel:** YES - with Tasks 12-14
  - **Blocked By:** Wave 2 (Tasks 3-6)

  **Acceptance Criteria:**
  - [ ] All count queries executed
  - [ ] Results logged and compared to expected
  - [ ] Discrepancies documented

  **QA Scenarios:**
  ```
  Scenario: Verify product data coverage
    Tool: skill_mcp (Supabase queries)
    Steps:
      1. Query product count
      2. Query weight coverage
      3. Query description coverage
      4. Query images coverage
    Expected Result: Matches implementation plan expectations
    Evidence: .sisyphus/evidence/task-11-product-verification.log
  ```

  **Commit:** NO

- [x] **12. Verify Product Groups and Cross-sells**

  **What to do:**
  - Verify product groups:
    - `SELECT COUNT(*) FROM product_groups`
    - `SELECT COUNT(*) FROM product_group_products`
  - Verify cross-sells:
    - `SELECT COUNT(*) FROM related_products WHERE relation_type = 'cross_sell'`
  - Sample random relationships to verify correctness

  **Recommended Agent Profile:**
  - **Category:** `quick`

  **Parallelization:**
  - **Can Run In Parallel:** YES - with Tasks 11, 13-14

  **Acceptance Criteria:**
  - [ ] Product group counts verified
  - [ ] Cross-sell counts verified
  - [ ] Sample relationships checked

  **QA Scenarios:**
  ```
  Scenario: Verify relationships
    Tool: skill_mcp (Supabase queries)
    Steps:
      1. Query product_group counts
      2. Query related_products counts
      3. Sample product with subproducts
      4. Sample product with cross-sells
    Expected Result: Relationships exist and point to valid products
    Evidence: .sisyphus/evidence/task-12-relationships-verification.log
  ```

  **Commit:** NO

- [x] **13. Verify Legacy Redirects**

  **What to do:**
  - Query redirect counts: `SELECT COUNT(*) FROM legacy_redirects`
  - Verify old_path format (should start with `/`)
  - Verify new_path format (should be `/products/{slug}`)
  - Check for duplicates: `SELECT old_path, COUNT(*) FROM legacy_redirects GROUP BY old_path HAVING COUNT(*) > 1`

  **Recommended Agent Profile:**
  - **Category:** `quick`

  **Parallelization:**
  - **Can Run In Parallel:** YES - with Tasks 11-12, 14

  **Acceptance Criteria:**
  - [ ] Redirect count matches product count
  - [ ] No duplicate old_path values
  - [ ] Path formats are correct

  **QA Scenarios:**
  ```
  Scenario: Verify legacy redirects
    Tool: skill_mcp (Supabase queries)
    Steps:
      1. Query redirect count
      2. Query for duplicates
      3. Sample 10 redirects
    Expected Result: ~8330 redirects, no duplicates, correct format
    Evidence: .sisyphus/evidence/task-13-redirects-verification.log
  ```

  **Commit:** NO

- [x] **14. Sample Data Quality Check**

  **What to do:**
  - Randomly sample 10 products
  - Verify all fields are populated correctly:
    - Check name, slug, price, sku are non-null
    - Check images array is populated
    - Check brand_id references valid brand
    - Check categories are linked
  - Log any data quality issues

  **Recommended Agent Profile:**
  - **Category:** `quick`

  **Parallelization:**
  - **Can Run In Parallel:** YES - with Tasks 11-13

  **Acceptance Criteria:**
  - [ ] 10 random products sampled
  - [ ] All critical fields verified
  - [ ] Data quality issues logged

  **QA Scenarios:**
  ```
  Scenario: Sample data quality
    Tool: skill_mcp (Supabase query)
    Steps:
      1. Query: SELECT * FROM products ORDER BY random() LIMIT 10
      2. Verify each product has: name, slug, price, sku, images
      3. Check brand and category links
    Expected Result: All sampled products have complete data
    Evidence: .sisyphus/evidence/task-14-data-quality.log
  ```

  **Commit:** NO

### Wave 5: Image Migration

- [ ] **15. Create Resumable Image Migration Script**

  **What to do:**
  - Create `/tmp/migrate_images.py` script:
    - Query products for `images[]` array
    - For each image path:
      - Construct source URL: `https://www.baystatepet.com/media/{path}`
      - Download image via HTTP
      - Upload to Supabase Storage `product-images` bucket at same relative path
      - Insert into `product_images` table with `product_id`, `url`, `position`, `is_primary`, `storage_path`
    - Rate limiting: 5-10 concurrent downloads, 100ms delay
    - Resumable: Track uploaded paths in SQLite/JSON file, skip on re-run
    - Batched: Process in chunks of ~500 products
    - Error handling: Log failures, continue processing

  **Must NOT do:**
  - Don't download all images at once (rate limit and memory concerns)
  - Don't fail entire batch on single image error

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high`
  - **Reason:** HTTP operations, file handling, Supabase Storage API
  - **Skills:** None required

  **Parallelization:**
  - **Can Run In Parallel:** NO (can be deferred entirely)

  **References:**
  - `apps/web/lib/product-image-storage.ts` - Storage integration pattern
  - `apps/web/lib/supabase/image-loader.ts` - Image URL construction
  - Supabase Storage API documentation

  **Acceptance Criteria:**
  - [ ] Script exists and is executable
  - [ ] Script supports resumable execution
  - [ ] Script has rate limiting and error handling
  - [ ] Script can process batches of 500 products

  **QA Scenarios:**
  ```
  Scenario: Verify image migration script
    Tool: Bash
    Steps:
      1. Review script code
      2. Check for resumable state file logic
      3. Check for rate limiting (sleep/delay)
      4. Check for error handling
    Expected Result: Script has all required features
    Evidence: .sisyphus/evidence/task-15-image-script-review.txt
  ```

  **Commit:** NO

- [ ] **16. Test Image Migration with Small Batch**

  **What to do:**
  - Run image migration script on first 10 products only
  - Verify images download and upload successfully
  - Verify `product_images` table populated
  - Verify images are accessible via Supabase Storage URL
  - Document any issues

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high`

  **Parallelization:**
  - **Can Run In Parallel:** NO (depends on Task 15)

  **Acceptance Criteria:**
  - [ ] Small batch (10 products) processed successfully
  - [ ] Images visible in Supabase Storage
  - [ ] `product_images` table has entries
  - [ ] Images accessible via public URL

  **QA Scenarios:**
  ```
  Scenario: Test image migration
    Tool: Bash + webfetch
    Steps:
      1. Run: python3 /tmp/migrate_images.py --limit 10
      2. Query: SELECT COUNT(*) FROM product_images
      3. Verify count > 0
      4. Test: curl -I {supabase_storage_url}/product-images/{path}
    Expected Result: Images uploaded and accessible
    Evidence: .sisyphus/evidence/task-16-image-test.log
  ```

  **Commit:** NO

### Wave FINAL: Final Verification

- [x] **F1. Final Verification Audit**

  **What to do:**
  - Comprehensive verification of entire migration:
    - Product count: Should be ~8,330
    - Product groups: Should have ~1,667 junction entries
    - Cross-sells: Should have ~18,500 relationships
    - Legacy redirects: Should have ~8,330 entries
    - Brands: Should have ~100 (already populated)
    - Categories: Should have existing count maintained
  - Generate migration report with all counts
  - Flag any discrepancies

  **Recommended Agent Profile:**
  - **Category:** `oracle`
  - **Reason:** Comprehensive audit and reporting

  **Parallelization:**
  - **Can Run In Parallel:** NO
  - **Blocked By:** All Wave 1-5 tasks

  **Acceptance Criteria:**
  - [ ] All count verifications complete
  - [ ] Migration report generated
  - [ ] Discrepancies documented with explanations

  **QA Scenarios:**
  ```
  Scenario: Final audit
    Tool: skill_mcp (Supabase queries)
    Steps:
      1. Query all table counts
      2. Compare to expected values
      3. Generate audit report
    Expected Result: All counts match expectations
    Evidence: .sisyphus/evidence/final-audit-report.md
  ```

  **Commit:** NO

- [x] **F2. Migration Completion Report**

  **What to do:**
  - Generate comprehensive completion report:
    - Summary of what was migrated
    - Counts for all tables
    - Any issues encountered and resolutions
    - Recommendations for image migration execution
    - Next steps for production deployment
  - Save report to `.sisyphus/evidence/migration-completion-report.md`
  - Present summary to user

  **Recommended Agent Profile:**
  - **Category:** `writing`

  **Parallelization:**
  - **Can Run In Parallel:** NO
  - **Blocked By:** Task F1

  **Acceptance Criteria:**
  - [ ] Completion report generated
  - [ ] All stakeholders can understand migration status
  - [ ] Clear next steps documented

  **QA Scenarios:**
  ```
  Scenario: Verify completion report
    Tool: Read file
    Steps:
      1. Read: .sisyphus/evidence/migration-completion-report.md
      2. Verify all sections present
      3. Verify counts match audit
    Expected Result: Complete and accurate report
    Evidence: Report file itself
  ```

  **Commit:** NO

---

## Final Verification Wave

### Verification Commands

```bash
# Product counts
psql -c "SELECT COUNT(*) FROM products;"  # Should be ~8330
psql -c "SELECT COUNT(*) FROM products WHERE weight IS NOT NULL;"  # ~7946

# Relationship counts
psql -c "SELECT COUNT(*) FROM product_groups;"
psql -c "SELECT COUNT(*) FROM product_group_products;"  # ~1667
psql -c "SELECT COUNT(*) FROM related_products WHERE relation_type = 'cross_sell';"  # ~18500

# Redirect counts
psql -c "SELECT COUNT(*) FROM legacy_redirects;"  # ~8330

# Data quality checks
psql -c "SELECT COUNT(*) FROM products WHERE name IS NULL OR sku IS NULL;"  # Should be 0
psql -c "SELECT COUNT(*) FROM products WHERE array_length(images, 1) = 0 OR images IS NULL;"  # Check image coverage
```

### Final Checklist
- [ ] All 8,330 products imported
- [ ] Duplicate SKUs handled (no batch failures)
- [ ] Product groups populated (~1,667 entries)
- [ ] Cross-sells created (~18,500 relationships)
- [ ] Legacy redirects created (~8,330 entries)
- [ ] Image migration script ready for execution
- [ ] All verification queries pass
- [ ] Completion report generated

---

## Commit Strategy

- **NO commits** - This is a data migration using temporary scripts
- The scripts in `/tmp/` are disposable utilities
- Database changes are the actual deliverable
- If scripts need to be persisted, save to `apps/web/scripts/migration/` and commit separately

---

## Success Criteria

### Quantitative
- 8,330 products in database
- ~1,667 product group relationships
- ~18,500 cross-sell relationships
- ~8,330 legacy redirects
- 0 batch failures due to duplicate SKUs

### Qualitative
- All products have complete core data (name, slug, price, sku)
- All relationships point to valid products
- Legacy redirects properly map old URLs to new slugs
- Image migration script tested and ready

### Verification
- Run all verification queries successfully
- Sample data quality checks pass
- Final audit report confirms completion
