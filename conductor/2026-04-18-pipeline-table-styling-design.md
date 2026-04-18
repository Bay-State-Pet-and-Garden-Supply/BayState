# Design: Pipeline Table Styling Synchronization

**Status**: Approved
**Date**: 2026-04-18
**Design Depth**: Standard
**Task Complexity**: Medium

## 1. Problem Statement

The BayStateApp pipeline currently has inconsistent table styling across its stages. While the sidebar tables in the 'scraped' and 'finalizing' stages have been updated to the "Modern Farm Utilitarian" brand (featuring heavy borders and blocky shadows), the main product grids in those and other stages do not yet share this aesthetic. This lack of visual cohesion makes the interface feel disjointed and fails to leverage the unique brand identity established in other parts of the admin panel.

**Goal**: Synchronize the styling of all main product tables in the pipeline with the sidebar table design using a centralized, reusable pattern.

## 2. Requirements

### Functional Requirements
- Update the `ProductTable` component to implement the "Modern Farm Utilitarian" styling.
- All pipeline stages (Scraped, Finalizing, etc.) that use `ProductTable` must automatically receive the updated styles.
- The styling must match the specific visual markers of the sidebar tables: heavy borders (`border-4`) and blocky offsets (`shadow-[8px_8px_0px_rgba(0,0,0,1)]`).

### Non-Functional Requirements
- **Consistency**: The "Farm" style should be defined globally to ensure any future tables can easily adopt it.
- **Maintainability**: Centralize the style definition in `globals.css` using a reusable class (e.g., `.farm-table`).
- **Performance**: Updates should not impact the rendering performance of large product grids (respecting existing virtualization if present).

### Constraints
- Must adhere to the existing "Modern Farm Utilitarian" brand guidelines.
- Should minimize changes to stage-specific view components by focusing on the shared `ProductTable` component.

## 3. Approach

### Selected Approach: Pragmatic Themed Component
- Define a single `.farm-table` CSS class in `globals.css` with Tailwind utility classes (`border-4 border-zinc-900`, `shadow-[8px_8px_0px_rgba(0,0,0,1)]`, `uppercase`, `font-black`, etc.).
- Update the shared `ProductTable.tsx` component to use this class by default in its wrapper element.

### Decision Matrix
| Criterion | Weight | Approach 1 (Pragmatic) |
|-----------|--------|------------------------|
| Speed of Delivery | 40% | 5: Single CSS class and component update. |
| Brand Consistency | 40% | 5: Enforces the look by default. |
| Maintainability | 20% | 5: Simple global class to update. |
| **Weighted Total** | | **5.0** |

### Alternatives Considered
- **Variant-Based Design Component**: Rejected as overly complex for our current goal of unifying the pipeline's look.

## 4. Architecture

- **`apps/web/app/globals.css`**: Define the `.farm-table` utility class with Tailwind `@apply`.
- **`apps/web/components/admin/pipeline/ProductTable.tsx`**: Update the table's container to use the `.farm-table` class by default.

## 5. Risk Assessment

- **Layout Shift**: Adding heavy borders (`border-4`) and blocky shadows (`8px 8px 0px 1px rgba(0,0,0,1)`) could cause minor layout shifts in components that have tight padding or height constraints.
- **Unintended Effects**: If `ProductTable` is used outside of the pipeline, those tables will also adopt the new styling. (Confirmed as acceptable).
- **Virtualization Compatibility**: Ensure that the wrapper styling doesn't interfere with the list's scrolling or item measurement in virtualized tables.

## 6. Success Criteria

- Pipeline stages (Scraped, Finalizing) display product tables with heavy borders and blocky shadows.
- These styles are consistent with the sidebar tables in the same stages.
- The styling is easily toggleable/updateable from a single CSS class in `globals.css`.
