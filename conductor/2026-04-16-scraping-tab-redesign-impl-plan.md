---
title: "Scraping Tab Brand Redesign Implementation Plan"
design_ref: "conductor/active-runs-design.md"
created: "2026-04-16T10:00:00Z"
status: "draft"
total_phases: 4
estimated_files: 8
task_complexity: "medium"
---

# Scraping Tab Brand Redesign Implementation Plan

## Plan Overview
- **Total phases**: 4
- **Agents involved**: `design_system_engineer`, `code_reviewer`
- **Estimated effort**: Medium refactor of 8 UI components to align with "Modern Farm Utilitarian" brand.

## Dependency Graph
```
Phase 1: Shared Core
    |
Phase 2: Scraping View (depends on 1)
    |
Phase 3: Tab Wrappers (depends on 2)
    |
Phase 4: Final Audit (depends on 3)
```

## Execution Strategy
| Stage | Phases | Execution | Agent Count | Notes |
|-------|--------|-----------|-------------|-------|
| 1     | Phase 1 | Sequential | 1 | Foundational UI elements |
| 2     | Phase 2 | Sequential | 1 | Primary feature view |
| 3     | Phase 3 | Sequential | 1 | Layout and Tab integration |
| 4     | Phase 4 | Sequential | 1 | Quality Assurance |

## Phase 1: Shared Core Redesign
### Objective
Refactor foundational UI components used in the pipeline to use heavy borders and blocky shadows.

### Agent: design_system_engineer
### Parallel: No

### Files to Modify
- `apps/web/components/admin/pipeline/StatusBadge.tsx` — Replace `rounded-full` with `rounded-none`, add `border-2 border-zinc-950`.
- `apps/web/components/admin/pipeline/ProgressBar.tsx` — Replace `rounded-full` with `rounded-none`, add `border-2 border-zinc-950` to the track.
- `apps/web/components/admin/pipeline/StageTabs.tsx` — Align `TabsTrigger` with the blocky theme.

### Validation
- Manual visual check: Ensure badges and progress bars look "blocky".
- `npm run lint` in `apps/web`.

## Phase 2: Scraping View Redesign
### Objective
Redesign the Active Runs tab and its job-tracking sub-components.

### Agent: design_system_engineer
### Parallel: No

### Files to Modify
- `apps/web/components/admin/pipeline/ActiveRunsTab.tsx` — Refactor `JobCard` to use `rounded-none`, `border-2 border-zinc-950`, and `shadow-[4px_4px_0px_rgba(0,0,0,1)]`.
- `apps/web/components/admin/pipeline/TimelineView.tsx` — Update timeline container and job bars to be sharp-edged.
- `apps/web/components/admin/pipeline/ChunkStatusTable.tsx` — Update table styling and header typography.

### Validation
- `npm run dev` and navigate to the scraping tab to verify live job cards.
- Check expanded state for logs and chunks.

## Phase 3: Integration & Consolidation Tab
### Objective
Update the top-level pipeline layout and the consolidation tab to ensure consistent "Modern Farm" styling.

### Agent: design_system_engineer
### Parallel: No

### Files to Modify
- `apps/web/components/admin/pipeline/PipelineClient.tsx` — Update wrapper sections for 'scraping' and 'consolidating'.
- `apps/web/components/admin/pipeline/ActiveConsolidationsTab.tsx` — Refactor cards and queues.

### Validation
- Ensure no "AI Slop" (soft borders/shadows) remains in the consolidated view.

## Phase 4: Final Audit
### Objective
Comprehensive code review to ensure brand compliance and no regressions in real-time functionality.

### Agent: code_reviewer
### Parallel: No

### Files to Modify
None.

### Validation
- Verify all modified files follow the "Modern Farm Utilitarian" guidelines.
- Check for accessibility (contrast) and performance.

---

## File Inventory
| # | File | Phase | Purpose |
|---|------|-------|---------|
| 1 | `apps/web/components/admin/pipeline/StatusBadge.tsx` | 1 | Shared status indicators |
| 2 | `apps/web/components/admin/pipeline/ProgressBar.tsx` | 1 | Job progress visualization |
| 3 | `apps/web/components/admin/pipeline/StageTabs.tsx` | 1 | Pipeline stage navigation |
| 4 | `apps/web/components/admin/pipeline/ActiveRunsTab.tsx` | 2 | Primary scraper job monitor |
| 5 | `apps/web/components/admin/pipeline/TimelineView.tsx` | 2 | Visual history of jobs |
| 6 | `apps/web/components/admin/pipeline/ChunkStatusTable.tsx` | 2 | Granular job tracking |
| 7 | `apps/web/components/admin/pipeline/PipelineClient.tsx` | 3 | Admin pipeline entry point |
| 8 | `apps/web/components/admin/pipeline/ActiveConsolidationsTab.tsx` | 3 | AI consolidation monitoring |

## Execution Profile
```
Execution Profile:
- Total phases: 4
- Parallelizable phases: 0
- Sequential-only phases: 4
- Estimated parallel wall time: N/A
- Estimated sequential wall time: 4-6 turns

Note: Native subagents currently run without user approval gates.
All tool calls are auto-approved without user confirmation.
```
