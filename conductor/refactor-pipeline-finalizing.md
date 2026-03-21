# Pipeline Refactor: Skip Consolidated Step & Interactive Finalizing UI

The goal of this refactor is to streamline the product ingestion pipeline by merging the "Consolidated" step into the "Finalizing" step and providing a new, interactive UI for product review and publishing.

## Objectives
1.  **Streamline Pipeline**: Products will move directly from `scraped` to `finalized` (Finalizing) after AI consolidation.
2.  **Interactive Review UI**: Provide a side-by-side view for the `finalized` stage (similar to the Inbox/Scraped view) that allows editing all product fields.
3.  **Enhanced Media Management**: Allow users to select images from candidates and add custom image URLs during the finalizing step.
4.  **Simplified Publishing**: A single "Finalize & Publish" action will move the product to `published` status and trigger the storefront publishing API.

## Key Changes

### 1. Types & Core Logic
- **`apps/web/lib/pipeline/types.ts`**:
    - Update `STAGE_ORDER` to remove `consolidated`.
    - Update `STAGE_CONFIG` for `finalized` to label it "Finalizing".
- **`apps/web/lib/pipeline.ts`**:
    - Update `STATUS_TRANSITIONS` to allow `scraped` -> `finalized` and `finalized` -> `published`.
- **`apps/web/lib/pipeline-tabs.ts`**:
    - Update `TAB_CONFIG` to reflect the UI changes.

### 2. AI Consolidation
- **`apps/web/lib/consolidation/batch-service.ts`**:
    - Update `applyConsolidationResults` to set `pipeline_status` to `'finalized'` instead of `'consolidated'`.

### 3. Frontend Components
- **`apps/web/components/admin/pipeline/FinalizingResultsView.tsx`**:
    - New component based on `ScrapedResultsView`.
    - Left column: SKU list.
    - Right column: Scrollable editing form for all `consolidated` fields.
    - Image selection grid + "Add Image URL" input.
    - "Finalize & Publish" button.
- **`apps/web/components/admin/pipeline/PipelineClient.tsx`**:
    - Update to render `FinalizingResultsView` for the `finalized` stage.
- **`apps/web/components/admin/pipeline/StageTabs.tsx`**:
    - Ensure it respects the new `STAGE_ORDER`.

### 4. API & Backend
- **`apps/web/app/api/admin/pipeline/[sku]/route.ts`**:
    - Ensure `PATCH` supports updating all fields in `consolidated`.
- **`apps/web/app/api/admin/pipeline/bulk/route.ts`**:
    - Update to handle bulk publishing.

## Verification Plan
1.  **Consolidation Flow**:
    - Submit products for AI consolidation from the `scraped` stage.
    - Apply results and verify products move directly to the "Finalizing" tab (status `finalized`).
2.  **Interactive Review**:
    - Navigate to the "Finalizing" tab.
    - Verify side-by-side view works.
    - Edit name, price, description, and brand.
    - Add a custom image URL.
    - Select/deselect images from candidates.
    - Save changes.
3.  **Publishing**:
    - Click "Finalize & Publish" for a product.
    - Verify status changes to `published`.
    - Verify product appears in the storefront database (via API check or DB).
4.  **Bulk Actions**:
    - Select multiple products in "Finalizing" and use the floating bar to publish them.
