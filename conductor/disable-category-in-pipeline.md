# Disable Category in Product Pipeline

This plan disables "Category" handling across the consolidation, finalization, and publishing stages of the product ingestion pipeline. This is necessary because the current hierarchical app categories do not align with legacy ShopSite export categories.

## Objective
Remove "Category" from the AI consolidation process, hide category fields in the admin pipeline UI, and prevent category syncing during product publication.

## Proposed Changes

### 1. AI Consolidation Logic
- **File:** `apps/web/lib/consolidation/prompt-builder.ts`
- **Changes:**
    - Remove `category` from the list of prioritized ShopSite export fields.
    - Remove instructions regarding legacy category strings and leaf breadcrumbs.
    - Remove `category` and `expected_category` from the data structures passed to the LLM.
- **File:** `apps/web/lib/consolidation/taxonomy-validator.ts`
- **Changes:**
    - Remove `category` from the `required` fields array in the consolidation schema.
    - Disable category validation and normalization logic.
- **File:** `apps/web/lib/consolidation/evaluation.ts`
- **Changes:**
    - Remove `category` from the fields being evaluated for accuracy/scoring.
- **File:** `apps/web/lib/consolidation/two-phase-service.ts`
- **Changes:**
    - Remove category-related consistency rules.
- **File:** `apps/web/lib/consolidation/types.ts`
- **Changes:**
    - Remove `expectedCategory` and `category` from relevant interfaces if they cause type errors, or just make them strictly optional.

### 2. Publishing Logic
- **File:** `apps/web/lib/pipeline/publish.ts`
- **Changes:**
    - Disable calls to `syncProductCategoryLinks` in `publishToStorefront`. This prevents the pipeline from attempting to link products to the app's category hierarchy.

### 3. Admin UI Components
- **File:** `apps/web/components/admin/pipeline/FinalizingResultsView.tsx`
- **Changes:**
    - Remove the "Category" form field and its associated state/logic (popover, search, creation).
- **File:** `apps/web/components/admin/pipeline/PipelineProductDetail.tsx`
- **Changes:**
    - Remove the "Category" field from the product detail view.
- **File:** `apps/web/components/admin/pipeline/ScrapedResultsView.tsx`
- **Changes:**
    - Remove the "Category" display from the scraped results comparison view.

## Verification Plan

### Automated Tests
- Run existing consolidation tests to ensure they still pass without category data:
  ```bash
  npm test apps/web/lib/consolidation
  ```
- Run pipeline validation tests:
  ```bash
  npm test apps/web/__tests__/validation/schemas.test.ts
  ```

### Manual Verification
1. **Consolidation:**
    - Run a consolidation batch for a few products.
    - Verify that the consolidated JSON in the database does NOT contain a `category` field.
2. **Finalization:**
    - Go to the "Finalizing" tab in the admin pipeline.
    - Verify that the "Category" field is no longer visible in the editing form.
3. **Publishing:**
    - Publish a product from the "Finalizing" tab.
    - Verify that the product is created/updated in the `products` table but no entries are created in `product_categories` (category links).
4. **Detail View:**
    - Open a product detail view in any pipeline stage.
    - Verify that the "Category" field is hidden.
