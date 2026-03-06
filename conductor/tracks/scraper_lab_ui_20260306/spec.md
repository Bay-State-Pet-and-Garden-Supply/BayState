# Specification: Scraper Lab UI High-Density Overhaul

## Overview
This track focuses on decluttering the "Scraper Lab" (Test Lab) interface in the BayStateApp admin panel. The current interface is overly dense and wasteful of space, particularly for static data like SKUs. We will transition to a high-density dashboard-style layout that prioritizes high-throughput diagnostic information.

## Functional Requirements
- **Table-Centric Results Panel**: Replace individual SKU cards with a high-density table view.
- **Detail Drawers/Expanded Rows**: Move detailed extraction results, selector health, and raw JSON data into side drawers or expanded table rows to reduce visual noise.
- **Sidebar SKU Management**: Relocate SKU management (adding, removing, filtering) to a collapsible left sidebar.
- **Compact SKU List**: Implement a more vertical, compact list for SKUs with bulk action support.
- **Unified Run Controls**: Consolidate redundant run controls and execution history into a single, cohesive panel or header area.
- **Peek Terminal**: Transition the log terminal into a "peek" panel that is collapsed by default and appears automatically during active streams or on error.
- **Result Filters**: Add quick-action filters (Passed, Failed, No Results) to the results table.
- **Health Sparklines**: Integrate mini-visualizations (sparklines) for selector and extraction health directly in the table rows.

## Non-Functional Requirements
- **High-Density Dashboard Aesthetic**: Use specialized dashboard-like components to maximize information density without sacrificing readability.
- **Accessibility**: Ensure all new interactive elements (expandable rows, drawers) are keyboard-accessible and follow ARIA guidelines.
- **Performance**: Optimize the results table for rendering up to 50+ SKUs using virtualization if necessary.

## Acceptance Criteria
- [ ] Scraper Lab results are displayed in a table format.
- [ ] SKU management is accessible via a collapsible sidebar.
- [ ] Clicking a result row opens a detailed diagnostic view (drawer or expansion).
- [ ] Run history and controls are merged into one area.
- [ ] Terminal can be toggled and "peeks" on activity.
- [ ] Table rows include status icons and health sparklines.

## Out of Scope
- Modifying the scraper backend or engine logic.
- Changing the actual data schema for scraper results.
- Global site-wide navigation changes.
