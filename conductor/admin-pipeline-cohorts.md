# Admin Pipeline Cohorts Integration

## Background & Motivation
Recent changes to the data ingestion pipeline introduced support for batch processing by "cohort" (e.g., grouping by UPC prefix to ensure related products are processed consistently). While the database schema (`cohort_batches`, `cohort_members`) and scraper logic now support cohorts, the Admin Pipeline UI lacks the ability to filter or visually group products by their cohort. This plan addresses that gap by plumbing the `cohort_id` parameter through the stack and introducing collapsible visual groups in the pipeline interface.

## Scope & Impact
- **Backend Data Fetching:** `apps/web/lib/pipeline.ts` and API routes will accept a `cohort_id` filter.
- **Filtering UI:** `apps/web/components/admin/pipeline/PipelineFilters.tsx` will add a text input for `cohort_id`.
- **Display UI:** `apps/web/components/admin/pipeline/PipelineClient.tsx` will be refactored to group `filteredProducts` by `cohort_id`. These groups will be displayed as collapsible sections, with a default "Ungrouped" section for products missing a `cohort_id`.

## Proposed Solution & Implementation Steps

### 1. Update Data Fetching Options
Update `getProductsByStatus` and `getSkusByStatus` in `apps/web/lib/pipeline.ts`:
- Add `cohort_id?: string` to their `options` argument interface.
- Append a condition: `if (options?.cohort_id) query = query.eq('cohort_id', options.cohort_id);` (Ensure `cohort_id` exists in the interface definition).

### 2. Update API Route and Page Loaders
- **API Route:** In `apps/web/app/api/admin/pipeline/route.ts`, parse `cohort_id = searchParams.get('cohort_id') || undefined` and pass it into both `getSkusByStatus` and `getProductsByStatus` calls.
- **Page Component:** In `apps/web/app/admin/pipeline/page.tsx`, parse `cohort_id` from `searchParams` and include it in the initial data fetch.

### 3. Expand `PipelineFilters` Component
In `apps/web/components/admin/pipeline/PipelineFilters.tsx`:
- Extend `PipelineFiltersState` interface with `cohort_id?: string`.
- Add a new input field (with an appropriate label like "Cohort ID") inside the Popover to capture this value.
- Update `activeFilterCount` to account for `filters.cohort_id`.

### 4. Implement Collapsible Groups in `PipelineClient`
In `apps/web/components/admin/pipeline/PipelineClient.tsx`:
- Parse `cohort_id` from `useSearchParams()` into state/local filters.
- Update data fetching to append `&cohort_id=${filters.cohort_id}` when requesting more products.
- Modify the product list rendering logic. Instead of rendering `filteredProducts.map(...)` directly, derive a grouped structure:
  ```typescript
  const groupedProducts = useMemo(() => {
    const groups: Record<string, PipelineProduct[]> = { ungrouped: [] };
    filteredProducts.forEach(p => {
      const cid = p.cohort_id || 'ungrouped';
      if (!groups[cid]) groups[cid] = [];
      groups[cid].push(p);
    });
    return groups;
  }, [filteredProducts]);
  ```
- Use a `div` wrapper with a toggleable state (or a Shadcn `<Accordion>`) to render each group block. Include an aggregate header (e.g., "Cohort: [ID] - X items") for each section.

## Verification & Testing
- Load the Pipeline view at `/admin/pipeline`. Check that products with `cohort_id` cluster correctly into their collapsible sections.
- Verify that products lacking a `cohort_id` fall into the default "Ungrouped" section.
- Expand the Filter popover, enter a known `cohort_id`, apply it, and confirm the data refetches correctly to show only that cohort.
- Clear filters and ensure the full list (grouped) is restored.
