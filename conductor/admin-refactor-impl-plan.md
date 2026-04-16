---
title: "Admin Panel Modern Farm Utilitarian Refactor Implementation Plan"
design_ref: "conductor/admin-refactor-design.md"
created: "2026-04-16T10:00:00Z"
status: "draft"
total_phases: 4
estimated_files: 50
task_complexity: "medium"
---

# Admin Panel Modern Farm Utilitarian Refactor Implementation Plan

## Plan Overview

- **Total phases**: 4
- **Agents involved**: design_system_engineer, coder, refactor, code_reviewer
- **Estimated effort**: Medium. Global UI component updates followed by a scoped refactor of all admin pages to remove "AI Slop" patterns.

## Dependency Graph

```
Phase 1: UI Core (Foundation)
    |
Phase 2: Layout & Navigation
    |
Phase 3: Admin Page Refactor
    |
Phase 4: Validation & Polish
```

## Execution Strategy

| Stage | Phases | Execution | Agent Count | Notes |
|-------|--------|-----------|-------------|-------|
| 1     | Phase 1 | Sequential | 1 | Foundation UI components |
| 2     | Phase 2 | Sequential | 1 | Admin Shell updates |
| 3     | Phase 3 | Sequential | 1 | Batch refactor of all admin views |
| 4     | Phase 4 | Sequential | 1 | Final validation |

## Phase 1: UI Core Foundation

### Objective
Update base UI components in `apps/web/components/ui/` to align with the "Modern Farm Utilitarian" brand.

### Agent: design_system_engineer
### Parallel: No

### Files to Modify

- `apps/web/components/ui/button.tsx` — Change `rounded-md` to `rounded-none`, increase border thickness, add blocky shadow.
- `apps/web/components/ui/card.tsx` — Verify/Enforce `rounded-none`, `border-4`, and `shadow-[8px_8px_0px_rgba(0,0,0,1)]`.
- `apps/web/components/ui/input.tsx` — Change `rounded-md` to `rounded-none`, set `border-2` minimum.
- `apps/web/components/ui/badge.tsx` — Change `rounded-full` to `rounded-none`, add `border-2`.
- `apps/web/components/ui/tabs.tsx` — Update tab triggers and list to be blocky/none-rounded.
- `apps/web/components/ui/dialog.tsx` / `sheet.tsx` — Fix `pure-black` background (bg-black) to `bg-zinc-950` or similar. Ensure `rounded-none`.

### Implementation Details
- Standardize on `rounded-none` globally.
- Use `border-zinc-950` for primary borders.
- Typography: Apply `uppercase tracking-tight` to buttons and badges.

### Validation
- `npm run lint` in `apps/web`.
- Visual check of primary components.

### Dependencies
- Blocked by: None
- Blocks: Phase 2, 3

---

## Phase 2: Admin Layout & Navigation

### Objective
Apply the blocky aesthetic to the Admin Panel's structural components.

### Agent: coder
### Parallel: No

### Files to Modify

- `apps/web/app/admin/layout.tsx` — Ensure the main container and skip link follow the blocky style.
- `apps/web/components/admin/sidebar.tsx` — Update sidebar container, active states, and nav items to be `rounded-none` with heavy borders.

### Implementation Details
- Ensure the sidebar matches the high-contrast, blocky feel of the main cards.
- Update active navigation item indicators to avoid soft rounding.

### Validation
- `npm run lint` in `apps/web`.

### Dependencies
- Blocked by: Phase 1
- Blocks: Phase 3

---

## Phase 3: Admin Page Refactor

### Objective
Batch refactor of all files in `apps/web/app/admin/` to remove hardcoded "AI Slop" patterns.

### Agent: refactor
### Parallel: No (due to potential shared files across admin)

### Files to Modify
- `apps/web/app/admin/**/*.tsx` — Audit all 80+ files for `rounded-`, `shadow-`, and side-accent borders.

### Implementation Details
- Use `grep` to find instances of `rounded-sm/md/lg/xl/full` and replace with `rounded-none`.
- Replace elevation shadows with the brand blocky shadow.
- Remove `border-l-4` style side-accents as flagged by `impeccable`.

### Validation
- `npm run lint` in `apps/web`.
- Re-run `npx impeccable --json apps/web/app/admin`.

### Dependencies
- Blocked by: Phase 2
- Blocks: Phase 4

---

## Phase 4: Final Validation & Polish

### Objective
Ensure the entire Admin Panel is clean and adheres perfectly to the design philosophy.

### Agent: code_reviewer
### Parallel: No

### Implementation Details
- Perform a final pass on the most critical admin pages (Dashboard, Products, Pipeline).
- Verify that typography (uppercase, black weight) is consistently applied to headers.

### Validation
- `npx impeccable --json apps/web/app/admin` — Expect 0 high-severity findings.

### Dependencies
- Blocked by: Phase 3
- Blocks: None

---

## File Inventory

| # | File | Phase | Purpose |
|---|------|-------|---------|
| 1 | `apps/web/components/ui/button.tsx` | 1 | Base Button component |
| 2 | `apps/web/components/ui/card.tsx` | 1 | Base Card component |
| 3 | `apps/web/app/admin/layout.tsx` | 2 | Admin Panel Layout |
| 4 | `apps/web/components/admin/sidebar.tsx` | 2 | Admin Sidebar |
| 5 | `apps/web/app/admin/**/*.tsx` | 3 | All Admin views |

## Risk Classification

| Phase | Risk | Rationale |
|-------|------|-----------|
| 1 | MEDIUM | Broad impact on the entire app's UI. Requires careful CSS adjustment. |
| 3 | MEDIUM | Large number of files modified. High potential for regression if classes are incorrectly replaced. |

## Execution Profile

```
Execution Profile:
- Total phases: 4
- Parallelizable phases: 0
- Sequential-only phases: 4
- Estimated parallel wall time: 2.5h
- Estimated sequential wall time: 2.5h

Note: Native subagents currently run without user approval gates.
All tool calls are auto-approved without user confirmation.
```
