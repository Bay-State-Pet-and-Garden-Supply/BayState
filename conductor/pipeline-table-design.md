# Pipeline Sidebar Table Component Design

## Objective
Create a consistent, reusable Table Component (`PipelineSidebarTable`) for viewing and selecting products across the pipeline tabs (specifically Scraped and Finalizing views).

## Architecture
- **Component Strategy:** Unified Component (`PipelineSidebarTable`) that fully encapsulates data flattening (`FlatItem` logic), virtualization setup (`useVirtualizer`), and keyboard navigation (ArrowUp, ArrowDown, Space).
- **Row Rendering:** Use a `variant="scraped" | "finalizing"` prop to explicitly dictate the rendering of specific pipeline stage layouts and badges.
- **Brand Styling:** Ensure all rows adhere strictly to the "Modern Farm Utilitarian" brand guidelines (e.g., `font-black`, `uppercase`, `tracking-tighter`, `border-4 border-zinc-950`).

## Interfaces

```typescript
type PipelineSidebarTableVariant = "scraped" | "finalizing";

interface PipelineSidebarTableProps {
  products: PipelineProduct[];
  groupedProducts?: {
    groups: Record<string, PipelineProduct[]>;
    cohortIds: string[];
    names?: Record<string, string>;
  };
  cohortBrands?: Record<string, string>;
  
  // Selection
  selectedSkus: Set<string>;
  preferredSku: string | null;
  onSelectSku: (sku: string, isSelected: boolean, index?: number, isShiftClick?: boolean, visibleProducts?: PipelineProduct[]) => void;
  onSelectAll?: (skus: string[]) => void;
  onDeselectAll?: (skus: string[]) => void;
  onPreferredSkuChange: (sku: string) => void;
  
  // Customization
  variant: PipelineSidebarTableVariant;
  onEditCohort?: (id: string, name: string | null, brandName: string | null) => void;
}
```

## Internal Responsibilities
1. **Flattening:** Transform `groupedProducts` into `FlatItem[]` (Header Rows + Product Rows).
2. **Virtualization:** Provide `estimateSize` and pass `flatItems` to `VirtualizedPipelineTable`. Use `scrollToIndex` when `preferredSku` changes.
3. **Keyboard Navigation:** Register event listeners for list navigation and trigger selection callbacks.
4. **Rendering:** Render `PipelineSidebarHeaderRow` (shared) and `PipelineSidebarProductRow` (handles the `variant` rendering logic).

## Migration Plan
1. Create the `PipelineSidebarTable` component in `apps/web/components/admin/pipeline/`.
2. Refactor `ScrapedResultsView` to replace its manual list logic with the new component (`variant="scraped"`).
3. Refactor `ProductListSidebar` (used in Finalizing) to use the new component (`variant="finalizing"`).
4. Verify keyboard navigation, selection synchronization, and visual parity.