# Implementation Plan: Pipeline Table Styling Synchronization

**Status**: Draft
**Date**: 2026-04-18
**Task Complexity**: Medium

## Objective
Synchronize the styling of main product tables in the pipeline with the sidebar table design using a centralized global CSS class.

## Key Files & Context
- `apps/web/app/globals.css`: The central location for global styles and Tailwind layers.
- `apps/web/components/admin/pipeline/ProductTable.tsx`: The shared component used for product grids throughout the pipeline.
- `apps/web/components/admin/pipeline/PipelineSidebarTable.tsx`: The reference component that already contains the "nice" styling.

## Implementation Steps

### Phase 1: Style Extraction & Definition
1. **Reference Extraction**: Read `apps/web/components/admin/pipeline/PipelineSidebarTable.tsx` to identify the exact Tailwind classes used for the borders, shadows, and typography.
2. **Global Class Definition**: Add the `.farm-table` class to `apps/web/app/globals.css` using Tailwind's `@apply` directive. 
   - Ensure it includes `border-4`, `shadow-[8px_8px_0px_rgba(0,0,0,1)]`, and relevant branding typography (`uppercase`, `font-black`).

### Phase 2: Component Integration
1. **Update ProductTable**: Modify `apps/web/components/admin/pipeline/ProductTable.tsx` to wrap its table structure with the `.farm-table` class.
2. **Layout Adjustments**: If the heavy borders cause layout issues (e.g., overflow or scrollbar interference), adjust the component's internal padding or container constraints.

### Phase 3: Verification
1. **Visual Audit**: Verify the styling in the "Scraped" and "Finalizing" tabs of the admin pipeline.
2. **Cross-Browser/Responsive Check**: Ensure the blocky shadows and borders remain visually consistent across different viewport sizes.
3. **Regression Check**: Verify that any other tables using `ProductTable` (if any) are correctly styled and functional.

## Verification & Testing
- **Visual Inspection**: Manually check the pipeline stages in the browser.
- **Snapshot Testing**: If Jest/React Testing Library tests exist for `ProductTable`, update snapshots or verify that the correct classes are being applied.
