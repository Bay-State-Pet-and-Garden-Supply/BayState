---
title: "Storefront Topbar Redesign Implementation Plan"
design_ref: "docs/maestro/plans/2026-04-22-storefront-topbar-redesign-design.md"
created: "2026-04-22T10:00:00Z"
status: "draft"
total_phases: 3
estimated_files: 2
task_complexity: "medium"
---

# Storefront Topbar Redesign Implementation Plan

## Plan Overview

- **Total phases**: 3
- **Agents involved**: `coder`, `design_system_engineer`
- **Estimated effort**: Medium scope focusing on performance-optimized scroll tracking and Tailwind data-variant styling.

## Dependency Graph

```
Phase 1: Foundation (Hook)
    |
Phase 2: Implementation (Header & Styling)
    |
Phase 3: Validation & Polish
```

## Execution Strategy

| Stage | Phases | Execution | Agent Count | Notes |
|-------|--------|-----------|-------------|-------|
| 1     | Phase 1 | Sequential | 1 | Foundation Hook |
| 2     | Phase 2 | Sequential | 1 | Header Implementation |
| 3     | Phase 3 | Sequential | 1 | Verification |

## Phase 1: Foundation (Hook)

### Objective
Create a performant `useScroll` hook to track vertical scroll position.

### Agent: `coder`
### Parallel: No

### Files to Create
- `apps/web/hooks/use-scroll.ts` — Throttled scroll position tracker that returns an `isScrolled` boolean when the user scrolls past a 50px threshold.

### Files to Modify
None.

### Implementation Details
- Use `useState` and `useEffect`.
- Implement throttling using `requestAnimationFrame` or a timestamp check to ensure 60fps performance without external dependencies like lodash.
- Clean up event listener on unmount.
- Ensure SSR compatibility (check for `typeof window !== 'undefined'`).

### Validation
- Import in a test component (or just verify syntax/lint).

### Dependencies
- Blocked by: None
- Blocks: Phase 2

## Phase 2: Implementation (Header & Styling)

### Objective
Apply the `useScroll` hook to the `StorefrontHeader` and implement "Compact on Scroll" styling.

### Agent: `design_system_engineer`
### Parallel: No

### Files to Create
None.

### Files to Modify
- `apps/web/components/storefront/header.tsx` — 
    - Integrate `useScroll`.
    - Apply `data-scrolled={isScrolled}` to the root `<header>` element.
    - Add transition utility classes (`transition-all duration-300 ease-in-out`) to height, padding, and logo elements.
    - Use `data-[scrolled=true]:h-0 data-[scrolled=true]:opacity-0 data-[scrolled=true]:overflow-hidden` for the Pre-Header.
    - Use `data-[scrolled=true]:scale-90` (or similar) for the Logo.

### Implementation Details
- Ensure the Pre-Header collapses cleanly without layout jank.
- Maintain the heavy bottom border (`border-b-4`) even in compact mode, adhering to the "Modern Farm Utilitarian" brand.

### Validation
- Verify smooth transition visually.
- Ensure banners scroll out of view before the main header sticks.

### Dependencies
- Blocked by: Phase 1
- Blocks: Phase 3

## Phase 3: Validation & Polish

### Objective
Comprehensive build, lint, and cross-device validation.

### Agent: `coder`
### Parallel: No

### Files to Create
None.

### Files to Modify
None.

### Implementation Details
- Ensure there are no type errors or lint warnings introduced by the new hook or component changes.
- Verify mobile touch targets remain accessible in compact mode.

### Validation
- Run `npm run build` in `apps/web`.
- Run `npm run lint` in `apps/web`.

### Dependencies
- Blocked by: Phase 2
- Blocks: None

---

## File Inventory

| # | File | Phase | Purpose |
|---|------|-------|---------|
| 1 | `apps/web/hooks/use-scroll.ts` | 1 | Performance-optimized scroll tracking hook |
| 2 | `apps/web/components/storefront/header.tsx` | 2 | Main header with compact styling logic |

## Risk Classification

| Phase | Risk | Rationale |
|-------|------|-----------|
| 1 | LOW | Standard React hook implementation. |
| 2 | MEDIUM | Requires careful Tailwind CSS authoring to ensure smooth transitions without layout jank. |
| 3 | LOW | Standard verification step. |

## Execution Profile

```
Execution Profile:
- Total phases: 3
- Parallelizable phases: 0
- Sequential-only phases: 3
- Estimated parallel wall time: 30m
- Estimated sequential wall time: 30m

Note: Native subagents currently run without user approval gates.
All tool calls are auto-approved without user confirmation.
```

## Token Budget Estimation
| Phase | Agent | Model | Est. Input | Est. Output | Est. Cost |
|-------|-------|-------|-----------|------------|----------|
| 1 | coder | default | 1500 | 400 | ~$0.02 |
| 2 | design_system_engineer | default | 3000 | 800 | ~$0.05 |
| 3 | coder | default | 1000 | 100 | ~$0.01 |
| **Total** | | | **5500** | **1300** | **~$0.08** |