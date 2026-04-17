# Implementation Plan: Pipeline Redesign Polish

## Phase 1: Fix Scraped List Styling & Parity
- **Agent**: `coder`
- **Files**:
  - `apps/web/components/admin/pipeline/ScrapedResultsView.tsx`
- **Instructions**:
  - Update `renderRow` for the header (`type === 'header'`) to match the styling of `ProductListSidebar.tsx`.
  - The cohort label span should use `text-[11px]` (down from `text-xs`) to match `ProductListSidebar`.
  - The count badge should use `bg-zinc-950 text-white` instead of `bg-zinc-200 text-zinc-950`.
  - Remove the extra `border border-zinc-950` if present, aligning exactly with the `ProductListSidebar` count badge (`variant="secondary" className="h-4 text-[9px] px-1 bg-zinc-950 text-white font-black uppercase tracking-tighter"`).
  - Ensure the header container (`bg-zinc-100 border-b-4 border-zinc-950`) has identical hover states and padding if necessary.

## Phase 2: Fix Horizontal Scroll Overflow
- **Agent**: `coder`
- **Files**:
  - `apps/web/components/admin/pipeline/ScrapedResultsView.tsx`
  - `apps/web/components/admin/pipeline/finalizing/ProductListSidebar.tsx`
  - `apps/web/components/admin/pipeline/VirtualizedPipelineTable.tsx` (if needed to enforce table-layout: fixed)
- **Instructions**:
  - Add `table-fixed` and `w-full` to the `tableProps` or `table` elements within both `ScrapedResultsView.tsx` and `ProductListSidebar.tsx` usage of `VirtualizedPipelineTable`.
  - In `ProductListSidebar.tsx`, add `min-w-0` to the flex container holding the product name, and ensure `break-words` or `break-all` is applied if `line-clamp-2` fails on long unbreakable strings.
  - In `ScrapedResultsView.tsx`, ensure `min-w-0` is on all flex parents of the product name and source badges to prevent expanding the table cell beyond the `w-80` container.
  - Test that long strings truncate properly and do not force horizontal scroll on the `.w-80` sidebar container.

## Phase 3: Copilot Panel Slide-over Drawer
- **Agent**: `coder`
- **Files**:
  - `apps/web/components/admin/pipeline/FinalizingResultsView.tsx`
  - `apps/web/components/admin/pipeline/finalizing/ProductSaveActions.tsx`
- **Instructions**:
  - Import `Sheet`, `SheetContent`, `SheetTrigger` from `@/components/ui/sheet`.
  - Remove the inline `renderCopilotPanel()` from the grid in `FinalizingResultsView.tsx`.
  - Change the main grid layout from `2xl:grid-cols-[minmax(0,1fr)_320px]` to `grid-cols-1` so the form takes full width.
  - Add a "Copilot" toggle button (using the `Sparkles` icon) to the header/actions area (likely inside `ProductSaveActions.tsx` or next to it).
  - Wrap `renderCopilotPanel()` inside a `SheetContent` component that slides in from the right (`side="right"`). Set appropriate widths for the sheet so the chat is usable but doesn't take permanent space.
  - Remove the internal padding or borders inside `FinalizationCopilotPanel` if they double-up with the `SheetContent`.

## Phase 4: UX Audit
- **Agent**: `ux_designer`
- **Files**:
  - `apps/web/components/admin/pipeline/*`
- **Instructions**:
  - Verify that both lists look identical in structure and font weights.
  - Ensure the scroll is fixed and no text is cut off inappropriately.
  - Verify the Copilot drawer feels like a natural part of the utilitarian theme (black borders, block shadows on the sheet).
