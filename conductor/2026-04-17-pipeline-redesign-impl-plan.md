---
title: "Pipeline Tabs Redesign Implementation Plan"
design_ref: "conductor/2026-04-17-pipeline-redesign-design.md"
created: "2026-04-17T14:30:00Z"
status: "draft"
total_phases: 5
estimated_files: 6
task_complexity: "complex"
---

# Pipeline Tabs Redesign Implementation Plan

## Plan Overview

- **Total phases**: 5
- **Agents involved**: `design_system_engineer`, `coder`, `ux_designer`, `code_reviewer`
- **Estimated effort**: Redesigning two high-complexity views (Scraped & Finalizing) in the admin pipeline to align with the Modern Farm Utilitarian brand while introducing virtualization for large-scale data sets.

## Dependency Graph

```
Phase 1: Foundation (Global Styling)
    |
Phase 2: Infrastructure (Virtualized Table Wrapper)
   / \
Phase 3: Scraped Tab Redesign <--- Parallel ---> Phase 4: Finalizing Tab Redesign
   \ /
Phase 5: Quality & UX Audit
```

## Execution Strategy

| Stage | Phases | Execution | Agent Count | Notes |
|-------|--------|-----------|-------------|-------|
| 1     | Phase 1 | Sequential | 1 | Global `Table` styling |
| 2     | Phase 2 | Sequential | 1 | `@tanstack/react-virtual` wrapper |
| 3     | Phase 3, 4 | Parallel | 2 | Redesigning Scraped & Finalizing views |
| 4     | Phase 5 | Sequential | 2 | UX audit and Code Review |

---

## Phase 1: Global Styling (Foundation)

### Objective
Update the global `components/ui/table.tsx` primitive to follow the Modern Farm Utilitarian brand (heavy borders, uppercase, font-black) and ensure compatibility with virtualization.

### Agent: `design_system_engineer`
### Parallel: No

### Files to Modify
- `apps/web/components/ui/table.tsx` — Add `border-4 border-zinc-950`, `shadow-[8px_8px_0px_rgba(0,0,0,1)]`, `uppercase`, `font-black`, and `tracking-tighter`. Ensure `TableHead` and `TableCell` are compatible with absolute positioning by avoiding `border-collapse: collapse` if it conflicts with virtualization.

### Validation
- `npm run lint`
- Manual check: Verify `Table` primitives in another admin view (e.g., `apps/web/app/admin/products/page.tsx`) correctly inherit the new styling without breaking.

### Dependencies
- Blocked by: None
- Blocks: Phase 2

---

## Phase 2: Virtualized Table Wrapper (Infrastructure)

### Objective
Build a reusable `VirtualizedPipelineTable.tsx` component that abstracts `@tanstack/react-virtual` logic for the pipeline views.

### Agent: `coder`
### Parallel: No

### Files to Create
- `apps/web/components/admin/pipeline/VirtualizedPipelineTable.tsx` — Implement a virtualized table body using `useVirtualizer`. The component should accept `data`, `rowHeight`, and a `renderRow` callback. It must ensure the blocky shadows from Phase 1 are not clipped during virtualization.

### Validation
- `npm run lint`
- `npm run test` (if applicable)

### Dependencies
- Blocked by: Phase 1
- Blocks: Phase 3, Phase 4

---

## Phase 3: Scraped Tab Redesign

### Objective
Redesign the `ScrapedResultsView.tsx` to use the `VirtualizedPipelineTable` for the product list sidebar.

### Agent: `coder`
### Parallel: Yes (with Phase 4)

### Files to Modify
- `apps/web/components/admin/pipeline/ScrapedResultsView.tsx` — Replace the existing sidebar logic with the `VirtualizedPipelineTable`. Apply Modern Farm Utilitarian styling to the sidebar container (`border-r-4`, `shadow-none`). Ensure all existing product actions (Re-scrape, etc.) are correctly wired up.

### Validation
- `npm run lint`
- Manual check: Verify scrolling 100+ scraped products is smooth and actions function correctly.

### Dependencies
- Blocked by: Phase 2
- Blocks: Phase 5

---

## Phase 4: Finalizing Tab Redesign

### Objective
Redesign the `ProductListSidebar.tsx` and `FinalizingResultsView.tsx` to use the `VirtualizedPipelineTable`.

### Agent: `coder`
### Parallel: Yes (with Phase 3)

### Files to Modify
- `apps/web/components/admin/pipeline/finalizing/ProductListSidebar.tsx` — Implement virtualization and utilitarian styling for the Finalizing sidebar.
- `apps/web/components/admin/pipeline/FinalizingResultsView.tsx` — Update the main results list to use the new `Table` styling and verify the sidebar integration.

### Validation
- `npm run lint`
- Manual check: Verify smooth scrolling and functional product selection in the Finalizing stage.

### Dependencies
- Blocked by: Phase 2
- Blocks: Phase 5

---

## Phase 5: Quality & UX Audit

### Objective
Verify visual hierarchy, data density, and performance across both redesigned tabs. Ensure no data-fetching regressions.

### Agent: `ux_designer`, `code_reviewer`
### Parallel: No

### Files to Review
- `apps/web/components/admin/pipeline/ScrapedResultsView.tsx`
- `apps/web/components/admin/pipeline/FinalizingResultsView.tsx`
- `apps/web/components/ui/table.tsx`
- `apps/web/lib/pipeline/index.ts` (to ensure no data logic was touched)

### Validation
- `npm run lint`
- `npm run test`
- `npm run build`

### Dependencies
- Blocked by: Phase 3, Phase 4
- Blocks: None

---

## File Inventory

| # | File | Phase | Purpose |
|---|------|-------|---------|
| 1 | `apps/web/components/ui/table.tsx` | 1 | Update global primitives with brand styling |
| 2 | `apps/web/components/admin/pipeline/VirtualizedPipelineTable.tsx` | 2 | Reusable virtualization wrapper |
| 3 | `apps/web/components/admin/pipeline/ScrapedResultsView.tsx` | 3 | Scraped tab redesign |
| 4 | `apps/web/components/admin/pipeline/finalizing/ProductListSidebar.tsx` | 4 | Finalizing sidebar virtualization |
| 5 | `apps/web/components/admin/pipeline/FinalizingResultsView.tsx` | 4 | Finalizing tab integration |

## Risk Classification

| Phase | Risk | Rationale |
|-------|------|-----------|
| 1     | HIGH | Global update to `Table` primitives could break layouts in non-admin areas. |
| 2     | MEDIUM | Virtualizing tables with absolute positioning can cause CSS layout issues. |
| 3     | LOW | Targeted refactor of an admin-only view. |
| 4     | LOW | Targeted refactor of an admin-only view. |
| 5     | LOW | Documentation and final verification pass. |

## Execution Profile

```
Execution Profile:
- Total phases: 5
- Parallelizable phases: 2 (in 1 batch: Phase 3 & 4)
- Sequential-only phases: 3
- Estimated parallel wall time: 4 turns (3 sequential stages)
- Estimated sequential wall time: 5 turns

Note: Native parallel execution currently runs agents in autonomous mode.
All tool calls are auto-approved without user confirmation.
```
