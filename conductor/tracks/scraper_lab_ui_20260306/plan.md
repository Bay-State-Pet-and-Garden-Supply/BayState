# Implementation Plan: Scraper Lab UI High-Density Overhaul

## Phase 1: Scaffolding & High-Density Components
- [x] Task: Create high-density table components and sparkline primitives. [1141e0d]
    - [x] Create `@/components/admin/scrapers/test-lab/results-table.tsx` based on `ResultsPanel`.
    - [x] Implement `Sparkline` component for selector/extraction health.
- [ ] Task: Design the Sidebar SKU Management layout.
    - [ ] Create `@/components/admin/scrapers/test-lab/sku-sidebar.tsx`.
    - [ ] Refactor `TestSkuPanel` to fit a narrow sidebar format.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Scaffolding & High-Density Components' (Protocol in workflow.md)

## Phase 2: Results Panel Transformation
- [ ] Task: Implement Table-centric Results with Detail Drawers.
    - [ ] Write tests for `ResultsTable` row expansion/drawer trigger.
    - [ ] Implement row expansion in `ResultsTable` to show detailed extraction results.
    - [ ] Add quick-filters (Status, Type) to the table header.
- [ ] Task: Integrate Health Sparklines.
    - [ ] Map telemetry data to sparkline visualizations in table rows.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Results Panel Transformation' (Protocol in workflow.md)

## Phase 3: Sidebar & Controls Consolidation
- [ ] Task: Implement Collapsible SKU Sidebar.
    - [ ] Update `TestLabClient` to use a `ResizablePanelGroup` with a sidebar on the left.
    - [ ] Add "Bulk Delete" and "Bulk Type Change" to the SKU sidebar.
- [ ] Task: Consolidate Run Controls & History.
    - [ ] Merge `TestRunControls` and the local controls in `TestLabClient` into a unified header or sidebar area.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Sidebar & Controls Consolidation' (Protocol in workflow.md)

## Phase 4: Peek Terminal & Final Polishing
- [ ] Task: Implement Peek Terminal behavior.
    - [ ] Modify `LogTerminal` to be collapsed by default.
    - [ ] Add logic to auto-expand the terminal on active streaming or errors.
- [ ] Task: Final UX Polishing & Accessibility Audit.
    - [ ] Ensure keyboard navigation for table rows and sidebar.
    - [ ] Apply final "High-Density Dashboard" styling across all panels.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Peek Terminal & Final Polishing' (Protocol in workflow.md)
