## 2026-03-05 — Code Quality Review (pipeline UI overhaul)

- Ran required checks in `apps/web`:
  - `npx tsc --noEmit` → **failed** with existing TypeScript errors outside reviewed pipeline files (tests + scraper config/test areas).
  - `npm run lint` → **failed** with 497 issues total (124 errors, 373 warnings).
  - `npm run build` → **passed** (Next.js production build completed successfully).
- Reviewed target files for anti-patterns:
  - `components/admin/pipeline/UnifiedPipelineClient.tsx`
  - `components/admin/pipeline/PipelineHeader.tsx`
  - `components/admin/pipeline/PipelineStats.tsx`
  - `components/admin/pipeline/PipelineProductGrid.tsx`
  - `components/admin/pipeline/PipelineActions.tsx`
  - `components/admin/pipeline/StatusFilter.tsx`
  - `components/admin/pipeline/MonitoringClient.tsx`
- Anti-pattern scan results (target files):
  - No `as any`.
  - No `@ts-ignore`.
  - No empty `catch` blocks.
  - No `console.log` in production code.
  - One issue found: `StatusFilter.tsx` has unused local variable `currentCount` (lint warning at line 71).
  - No obvious AI slop patterns (no excessive comments or obviously generic placeholder naming).

## 2026-03-05 — Accessibility Audit (`/admin/pipeline`)

- Environment/setup:
  - Started `apps/web` dev server with root `.env.local` exported so `/admin/pipeline` renders successfully on `http://localhost:3000`.
  - Attempted required command `npx @axe-core/cli http://localhost:3000/admin/pipeline`.
  - CLI repeatedly hung in this environment (no JSON/report output returned before timeout), so audit used Playwright + axe-core runtime injection for equivalent automated coverage.

- Automated scan (axe-core via Playwright):
  - URL: `http://localhost:3000/admin/pipeline`
  - Violations: 1
    - `page-has-heading-one` (moderate): page-level `<h1>` landmark issue reported.
  - Targeted `color-contrast` rule run: **0 violations**.

- Manual checks (Playwright keyboard traversal + DOM inspection):
  - Keyboard navigation: **Most interactive elements reachable via Tab** (links, toolbar actions, inputs).
  - Focus visibility: Skip link and nav links show visible focus; buttons/inputs use focus-visible ring/outline styling.
  - Modal ARIA labels:
    - Import dialog uses `role="dialog"`, `aria-modal="true"`, `aria-labelledby="import-dialog-title"`, `aria-describedby="import-dialog-desc"`.
  - Modal focus trap:
    - **FAIL** on Import dialog: Tab traversal escaped dialog to background controls/navigation while modal remained open.
  - Checkbox handling:
    - Pipeline product card checkboxes use `onChange` (not `onClick`) where checkboxes are rendered.
  - Reduced motion:
    - Detected `prefers-reduced-motion` media-query rules in loaded stylesheets (count: 2).

- Screen-reader oriented checks:
  - No broken `aria-labelledby` references.
  - No broken `aria-describedby` references.
  - No duplicate IDs detected.
  - Console surfaced Radix accessibility warning during modal flows (`DialogContent` requires `DialogTitle`) indicating an accessibility issue path in at least one dialog interaction state.
