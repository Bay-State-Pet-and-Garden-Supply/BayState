# Task 2.1: Build EnrichmentLauncher component

## Context
First UI component for the unified enrichment workflow. This is the product selection step where users choose which products to enrich.

## Implementation Notes
- File: `BayStateApp/components/admin/enrichment/EnrichmentLauncher.tsx`
- Data table with multi-select checkboxes
- Columns: SKU, Name, Brand, Status, Last Enriched
- Filters: Status dropdown, Brand multi-select, "Needs enrichment" toggle
- Selected products counter
- Must use data-testid attributes for Playwright testing

## Data Source
- Fetch from `products_ingestion` table via API
- Need to create or use existing API endpoint

## References
- `components/admin/pipeline/PipelineProductCard.tsx` - Similar patterns
- `components/admin/scraper-configs/ConfigList.tsx` - Table patterns
- Use shadcn/ui components (Table, Checkbox, Select, Badge)

## Acceptance Criteria
- [ ] Products table displays data from products_ingestion API call
- [ ] Clicking checkbox toggles selection state (checked/unchecked)
- [ ] Selected counter displays accurate count (0-N)
- [ ] Applying brand filter reduces displayed rows to matching products

## data-testid Attributes Required
- `product-checkbox-{sku}` - Individual product checkboxes
- `selected-count` - Selected products counter
- `enrichment-next-button` - Next step button
- `brand-filter` - Brand filter dropdown
- `status-filter` - Status filter dropdown
- `needs-enrichment-toggle` - "Needs enrichment" toggle
- Completed EnrichmentLauncher component using existing `/api/admin/pipeline` endpoint.
- Implemented all required data-testids for Playwright testing.
- Used `shadcn/ui` components for the Table, Checkbox, Select, Badge, and Button.
- Handled loading/error states and implemented client-side filtering for brands and statuses.
