# Pipeline Frontend Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up DESIGN.md violations in the pipeline frontend components (no shadows, square corners, brand colors, bold typography).

**Architecture:** Surgical replacement of Tailwind classes across the pipeline component directory to align with the "General Store" aesthetic.

**Tech Stack:** Next.js, Tailwind CSS, Lucide Icons, Brand Tokens (ledger-charcoal, feed-bag-cream, uniform-green, etc.).

---

### Task 1: Clean up Core Pipeline View Components

**Files:**
- `ActiveConsolidationsTab.tsx`
- `ActiveRunsTab.tsx`
- `ImportedResultsView.tsx`
- `ScrapedResultsView.tsx`
- `FinalizingResultsView.tsx`

- [ ] **Step 1: Replace Forbidden Colors**
  - Replace `zinc-950`, `zinc-900`, `zinc-800` with `ledger-charcoal`.
  - Replace `zinc-50`, `zinc-100` with `feed-bag-cream`.
  - Replace `#000` or `rgba(0,0,0,1)` in shadows/borders with `ledger-charcoal` (if borders) or remove (if shadows).

- [ ] **Step 2: Remove All Shadows**
  - Remove `shadow-[...]`, `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`.
  - Remove `shadow-none` if it was part of an active state for a shadow that no longer exists.

- [ ] **Step 3: Enforce Square Corners**
  - Replace `rounded-xl`, `rounded-lg`, `rounded-full`, `rounded-md` with `rounded-none`.
  - Admin cards can keep `rounded-md` if it follows the "Admin Cards" section of DESIGN.md, but buttons/inputs/badges must be `rounded-none`.

- [ ] **Step 4: Standardize Typography**
  - Ensure labels and stamps use `font-black`, `uppercase`, and `tracking-widest` (or `tracking-[0.15em]`).

### Task 2: Clean up Supporting Pipeline Components

**Files:**
- `ProductTable.tsx`
- `ChunkStatusTable.tsx`
- `CohortEditDialog.tsx`
- `TimelineView.tsx`
- `PipelineProductDetail.tsx`
- `ProgressBar.tsx`
- `PipelineSidebarHeaderRow.tsx`
- `PipelineSidebarProductRow.tsx`

- [ ] **Step 1: Repeat the same cleanup logic for these files.**
  - Focus on removing shadows and rounding from Dialogs, Tables, and Sidebars.
  - `CohortEditDialog` currently has heavy shadows and zinc colors.

### Task 3: Clean up Sub-directory Components

**Files:**
- `consolidation/BatchHistorySection.tsx`
- `consolidation/ConsolidationJobCard.tsx`
- `finalizing/FinalizationCopilotPanel.tsx`
- `finalizing/ImageCarousel.tsx`
- `finalizing/MerchandisingClassification.tsx`
- `finalizing/ProductInfoForm.tsx`
- `finalizing/ProductListSidebar.tsx`

- [ ] **Step 1: Repeat cleanup for sub-directory components.**
  - Special attention to `FinalizationCopilotPanel` and `ProductInfoForm` which are complex.

### Task 4: Final Verification

- [ ] **Step 1: Run grep to verify no remaining violations.**
  - Run: `grep -rE "shadow-|zinc-9|#000|rounded-(xl|2xl|full)" components/admin/pipeline/`
  - Expected: No results (or only justified exceptions if any exist).

- [ ] **Step 2: Check for regressions.**
  - Ensure the UI still functions (Dialogs open, Tables scroll, etc.).
