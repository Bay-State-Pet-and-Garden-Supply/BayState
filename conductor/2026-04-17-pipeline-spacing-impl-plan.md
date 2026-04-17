---
title: \"Pipeline Space Efficiency Implementation Plan\"
design_ref: \"conductor/pipeline-spacing-design.md\"
created: \"2026-04-17T10:00:00Z\"
status: \"draft\"
total_phases: 4
estimated_files: 12
task_complexity: \"medium\"
---

# Pipeline Space Efficiency Implementation Plan

## Plan Overview

- **Total phases**: 4
- **Agents involved**: design_system_engineer, coder, tester
- **Estimated effort**: Medium. Systematic refactoring of Tailwind spacing classes across the core pipeline UI components to achieve a "Dense" layout.

## Dependency Graph

```
Phase 1: Layout Foundation (Header & Tabs)
    |
Phase 2: Main Content Views (Tables & Grids)
    |
Phase 3: Supporting UI (Filters & Dialogs)
    |
Phase 4: Validation & Quality
```

## Execution Strategy

| Stage | Phases | Execution | Agent Count | Notes |
|-------|--------|-----------|-------------|-------|
| 1     | Phase 1 | Sequential | 1 | Foundation - Layout wrapper and navigation |
| 2     | Phase 2 | Sequential | 1 | Core Content - Tables and stage-specific views |
| 3     | Phase 3 | Sequential | 1 | Polish - UI controls and ancillary components |
| 4     | Phase 4 | Sequential | 1 | Verification |

## Phase 1: Layout Foundation (Header & Tabs)

### Objective
Establish the dense layout container and compact the top-level navigation and header actions.

### Agent: design_system_engineer
### Parallel: No

### Files to Modify

- `apps/web/components/admin/pipeline/PipelineClient.tsx` — Reduce main container margins/padding and gap between tabs and content.
- `apps/web/components/admin/pipeline/StageTabs.tsx` — Compact tab padding and font sizing if necessary to save vertical space.
- `apps/web/components/admin/pipeline/PipelineHeader.tsx` — Reduce internal padding.

### Implementation Details
- Change `mb-6` in `PipelineClient.tsx` (Stage Tabs container) to `mb-2`.
- Update `p-4 sm:p-6` in section wrappers to `p-2 sm:p-3`.
- Tighten `gap-6` to `gap-2` in the main content grid.

### Validation
- Visual check: Ensure header and tabs are cohesive and significantly more compact.
- Run `npm run lint` in `apps/web`.

### Dependencies
- Blocked by: None
- Blocks: Phase 2

---

## Phase 2: Main Content Views (Tables & Grids)

### Objective
Apply dense spacing to the primary data display components (Tables, Scraped Results, Finalizing Results).

### Agent: coder
### Parallel: No

### Files to Modify

- `apps/web/components/admin/pipeline/ProductTable.tsx` — Reduce cell padding and row heights.
- `apps/web/components/admin/pipeline/ScrapedResultsView.tsx` — Compact the grid and card spacing.
- `apps/web/components/admin/pipeline/FinalizingResultsView.tsx` — Compact the results view.
- `apps/web/components/admin/pipeline/ActiveRunsTab.tsx` — Reduce padding on run cards.
- `apps/web/components/admin/pipeline/ActiveConsolidationsTab.tsx` — Reduce padding on batch cards.

### Implementation Details
- Systematically replace `p-4` with `p-2`.
- Reduce horizontal/vertical gaps in grids from `gap-6` to `gap-2`.
- Adjust table cell padding (e.g., `py-4` to `py-1` or `py-2`).

### Validation
- Visual check: Ensure tables and grids display more items per screen.
- Verify scrolling and interactions work as expected in dense mode.

### Dependencies
- Blocked by: Phase 1
- Blocks: Phase 3

---

## Phase 3: Supporting UI (Filters & Dialogs)

### Objective
Compact the supporting UI elements to match the new dense aesthetic.

### Agent: coder
### Parallel: No

### Files to Modify

- `apps/web/components/admin/pipeline/PipelineFilters.tsx` — Reduce internal padding and gaps.
- `apps/web/components/admin/pipeline/PipelineSearchField.tsx` — Compact search input.
- `apps/web/components/admin/pipeline/FloatingActionsBar.tsx` — Reduce vertical footprint.
- `apps/web/components/admin/pipeline/AlertBanner.tsx` — Compact padding.

### Implementation Details
- Adjust `h-8` to `h-7` where appropriate for small buttons/inputs.
- Reduce margins between filter labels and controls.

### Validation
- Ensure all controls remain accessible and usable at smaller sizes.

### Dependencies
- Blocked by: Phase 2
- Blocks: Phase 4

---

## Phase 4: Validation & Quality

### Objective
Perform a final audit to ensure visual consistency and no functional regressions.

### Agent: tester
### Parallel: No

### Validation Criteria
- Run `npm test` to ensure no components are broken by style changes.
- Manual verification of "Modern Farm Utilitarian" brand integrity.
- Check responsive behavior (Mobile/Tablet/Desktop).

### Dependencies
- Blocked by: Phase 3
- Blocks: None

---

## File Inventory

| # | File | Phase | Purpose |
|---|------|-------|---------|
| 1 | `apps/web/components/admin/pipeline/PipelineClient.tsx` | 1 | Layout Foundation |
| 2 | `apps/web/components/admin/pipeline/StageTabs.tsx` | 1 | Navigation |
| 3 | `apps/web/components/admin/pipeline/PipelineHeader.tsx` | 1 | Header |
| 4 | `apps/web/components/admin/pipeline/ProductTable.tsx` | 2 | Main Table |
| 5 | `apps/web/components/admin/pipeline/ScrapedResultsView.tsx` | 2 | Results View |
| 6 | `apps/web/components/admin/pipeline/FinalizingResultsView.tsx` | 2 | Results View |
| 7 | `apps/web/components/admin/pipeline/ActiveRunsTab.tsx` | 2 | Live View |
| 8 | `apps/web/components/admin/pipeline/ActiveConsolidationsTab.tsx` | 2 | Live View |
| 9 | `apps/web/components/admin/pipeline/PipelineFilters.tsx` | 3 | Controls |
| 10 | `apps/web/components/admin/pipeline/PipelineSearchField.tsx` | 3 | Controls |
| 11 | `apps/web/components/admin/pipeline/FloatingActionsBar.tsx` | 3 | Actions |
| 12 | `apps/web/components/admin/pipeline/AlertBanner.tsx` | 3 | UI Feedback |

## Risk Classification

| Phase | Risk | Rationale |
|-------|------|-----------|
| 1     | LOW | Structural layout changes are safe but visible. |
| 2     | MEDIUM | High impact on data visibility; risk of overcrowding. |
| 3     | LOW | Minor UI controls adjustments. |
| 4     | LOW | Verification phase. |

## Execution Profile

```
Execution Profile:
- Total phases: 4
- Parallelizable phases: 0
- Sequential-only phases: 4
- Estimated parallel wall time: N/A
- Estimated sequential wall time: ~60-90 minutes

Note: Native subagents currently run without user approval gates.
All tool calls are auto-approved without user confirmation.
```
