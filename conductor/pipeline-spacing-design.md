# Design Document: Pipeline Space Efficiency

## Requirements
- Significantly reduce margins and padding across the pipeline views to maximize data density.
- Maintain the "Modern Farm Utilitarian" branding (heavy borders, uppercase headers, hard shadows).

## Selected Approach
- **Density Scale**: Dense (Maximum space efficiency).
- **Core Adjustments**:
  - Replace large structural margins (`mb-6`, `mb-8`) with minimal margins (`mb-2` or `mb-3`).
  - Replace spacious grid gaps (`gap-6`, `gap-4`) with tighter gaps (`gap-2` or `gap-3`).
  - Replace thick padding on cards and panels (`p-4`, `sm:p-6`) with compact padding (`p-2`, `sm:p-3`).
  - Adjust header heights and action bars (`h-8`, etc.) if needed to match the dense layout without compromising touch targets.

## Target Components
- `PipelineClient.tsx` (Main layout wrapper, StageTabs container)
- `StageTabs.tsx`
- `ProductTable.tsx`
- `ActiveRunsTab.tsx`
- `ActiveConsolidationsTab.tsx`
- `ScrapedResultsView.tsx`
- `FinalizingResultsView.tsx`
- `FloatingActionsBar.tsx`