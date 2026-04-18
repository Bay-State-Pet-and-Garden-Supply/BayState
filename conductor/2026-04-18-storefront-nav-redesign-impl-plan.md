---
title: "Storefront Navigation Redesign Implementation Plan"
design_ref: "conductor/2026-04-18-storefront-nav-redesign-design.md"
created: "2026-04-18T10:00:00Z"
status: "draft"
total_phases: 3
estimated_files: 2
task_complexity: "medium"
---

# Storefront Navigation Redesign Implementation Plan

## Plan Overview

- **Total phases**: 3
- **Agents involved**: coder, ux_designer, tester
- **Estimated effort**: Medium complexity UI/UX refactor focusing on layout balance and alignment logic.

## Dependency Graph

```
[Phase 1: Foundation] --> [Phase 2: Strip Redesign] --> [Phase 3: More Menu & Polish]
```

## Execution Strategy

| Stage | Phases | Execution | Agent Count | Notes |
|-------|--------|-----------|-------------|-------|
| 1     | Phase 1 | Sequential | 1 | Fix alignment logic and basic component structure. |
| 2     | Phase 2 | Sequential | 1 | Redesign Tier 3 layout for a balanced "Horizontal Strip" feel. |
| 3     | Phase 3 | Sequential | 1 | Implement responsive overflow logic and final polish. |

## Phase 1: Foundation & Component Refactor

### Objective
Fix the dropdown menu alignment issue by refactoring the `NavigationMenuItem` and `NavigationMenuContent` relationship in `StorefrontHeader`.

### Agent: coder
### Parallel: No

### Files to Create
None.

### Files to Modify

- `apps/web/components/storefront/header.tsx` — Remove `static` from `NavigationMenuItem` and adjust `NavigationMenuContent` classes to align with triggers.

### Implementation Details

1.  **Alignment Fix**: Remove the `static` class from the `NavigationMenuItem` wrappers for both the dynamic categories loop and the "Brands" dropdown.
2.  **Menu Positioning**: Adjust the `NavigationMenuContent` classes. Remove `left-0` if it's forcing alignment to the container start. Use `md:absolute` and ensure it respects the `relative` parent.
3.  **Width Management**: Ensure the `w-screen` and `max-w` on the inner `div` of `NavigationMenuContent` don't cause clipping now that the menu is trigger-aligned. Use `md:left-0` or `md:-translate-x-1/2 md:left-1/2` if centering is desired.

### Validation

- Verify that hovering over "Departments" or "Brands" opens a menu directly beneath the trigger.
- Verify that menus no longer all open at the far-left of the navigation bar.

### Dependencies

- Blocked by: None
- Blocks: Phase 2

---

## Phase 2: Navigation Strip Redesign

### Objective
Redesign the "Tier 3" navigation strip to achieve the "Horizontal Strip" layout goal, focusing on balanced spacing and improved typography.

### Agent: ux_designer
### Parallel: No

### Files to Create
None.

### Files to Modify

- `apps/web/components/storefront/header.tsx` — Update Tier 3 container styles and navigation item spacing.

### Implementation Details

1.  **Layout Balance**: Adjust the height of the Tier 3 container (currently `h-14`). Consider reducing it or optimizing the padding to feel less "stacked."
2.  **Typography & Spacing**: Update `NavigationMenuTrigger` and `NavigationMenuLink` styles. Increase horizontal gap between items (`gap-2` -> `gap-4` or `gap-6`).
3.  **Brand Elements**: Ensure the "Modern Farm Utilitarian" brand is maintained with consistent borders and shadows.
4.  **Separator Logic**: Add subtle vertical separators or border-x adjustments to navigation items to enhance the horizontal rhythm.

### Validation

- Visual review: Header should feel less "vertically heavy" and more "balanced horizontally."
- Verify brand consistency (borders, typography).

### Dependencies

- Blocked by: Phase 1
- Blocks: Phase 3

---

## Phase 3: Responsive "More" Menu & Polish

### Objective
Implement the collapsible "More" menu logic to handle overflow on smaller desktop screens and apply final design polish.

### Agent: coder
### Parallel: No

### Files to Create
None.

### Files to Modify

- `apps/web/components/storefront/header.tsx` — Implement overflow detection logic and the "More" dropdown menu.

### Implementation Details

1.  **Overflow Detection**: Use a `ResizeObserver` or a custom hook to measure the navigation container and determine how many items fit.
2.  **More Menu Component**: Create a standard `NavigationMenuItem` with a "More" trigger.
3.  **Dynamic Rendering**: Filter the navigation items based on the visible count and render the remainder inside the "More" dropdown.
4.  **Final Polish**: Ensure smooth transitions and consistent z-index layering (ensuring menus stay above Tier 2 and main content).

### Validation

- Resize browser window: Items should move into the "More" menu before they start to wrap or overlap.
- Verify all links are still accessible through the "More" menu.

### Dependencies

- Blocked by: Phase 2
- Blocks: None

---

## File Inventory

| # | File | Phase | Purpose |
|---|------|-------|---------|
| 1 | `apps/web/components/storefront/header.tsx` | 1, 2, 3 | Core component for the navigation redesign. |

## Risk Classification

| Phase | Risk | Rationale |
|-------|------|-----------|
| 1 | LOW | Straightforward CSS alignment fix. |
| 2 | MEDIUM | Visual balance is subjective and requires careful styling. |
| 3 | MEDIUM | Overflow logic can be complex to get right across different browsers/widths. |

## Execution Profile

```
Execution Profile:
- Total phases: 3
- Parallelizable phases: 0
- Sequential-only phases: 3
- Estimated parallel wall time: N/A
- Estimated sequential wall time: ~4-6 turns

Note: Native subagents currently run without user approval gates.
All tool calls are auto-approved without user confirmation.
```
