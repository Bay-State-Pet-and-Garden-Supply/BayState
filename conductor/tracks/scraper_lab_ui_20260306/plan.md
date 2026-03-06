# Implementation Plan: Scraper Lab UI High-Density Overhaul

## Phase 1: Scaffolding & High-Density Components [checkpoint: 58e555b]
- [x] Task: Create high-density table components and sparkline primitives. [1141e0d]
    - [x] Create `@/components/admin/scrapers/test-lab/results-table.tsx` based on `ResultsPanel`.
    - [x] Implement `Sparkline` component for selector/extraction health.
- [x] Task: Design the Sidebar SKU Management layout. [82a2ef6]
    - [x] Create `@/components/admin/scrapers/test-lab/sku-sidebar.tsx`.
    - [x] Refactor `TestSkuPanel` to fit a narrow sidebar format.
- [x] Task: Conductor - User Manual Verification 'Phase 1: Scaffolding & High-Density Components' (Protocol in workflow.md) [58e555b]

## Phase 2: Results Panel Transformation [checkpoint: 929b07e]
- [x] Task: Implement Table-centric Results with Detail Drawers. [065965a]
    - [x] Write tests for `ResultsTable` row expansion/drawer trigger.
    - [x] Implement row expansion in `ResultsTable` to show detailed extraction results.
    - [x] Add quick-filters (Status, Type) to the table header.
- [x] Task: Integrate Health Sparklines. [1a514b7]
    - [x] Map telemetry data to sparkline visualizations in table rows.
- [x] Task: Conductor - User Manual Verification 'Phase 2: Results Panel Transformation' (Protocol in workflow.md) [929b07e]

## Phase 3: Sidebar & Controls Consolidation [checkpoint: d89c909]
- [x] Task: Implement Collapsible SKU Sidebar. [c63e3b1]
    - [x] Update `TestLabClient` to use a `ResizablePanelGroup` with a sidebar on the left.
    - [x] Add "Bulk Delete" and "Bulk Type Change" to the SKU sidebar.
- [x] Task: Consolidate Run Controls & History. [5b8f69f]
    - [x] Merge `TestRunControls` and the local controls in `TestLabClient` into a unified header or sidebar area.
- [x] Task: Conductor - User Manual Verification 'Phase 3: Sidebar & Controls Consolidation' (Protocol in workflow.md) [d89c909]

## Phase 4: Peek Terminal & Final Polishing
- [x] Task: Implement Peek Terminal behavior. [2e34310]
    - [x] Modify `LogTerminal` to be collapsed by default.
    - [x] Add logic to auto-expand the terminal on active streaming or errors.
- [~] Task: Final UX Polishing & Accessibility Audit.
    - [ ] Ensure keyboard navigation for table rows and sidebar.
    - [ ] Apply final "High-Density Dashboard" styling across all panels.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Peek Terminal & Final Polishing' (Protocol in workflow.md)
