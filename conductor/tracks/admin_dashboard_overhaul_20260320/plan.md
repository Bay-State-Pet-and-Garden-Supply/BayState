# Implementation Plan - Admin Panel Dashboard Overhaul and Product Reset

## Phase 1: Foundation & Data Cleanup
Goal: Prepare the database by removing placeholders and implementing the product reset logic.

- [x] Task: Create Product Reset Script a31dc6f
    - [ ] Write tests for product reset and placeholder removal logic
    - [ ] Implement script to reset `published` status and delete placeholder products in Supabase
    - [ ] Verify script execution and database state
- [x] Task: Define Dashboard Data Schema 8311ed9
    - [ ] Identify key metrics for the dashboard (Scraper health, Sync status, Product stats)
    - [ ] Create Supabase views or RPCs for efficient data aggregation
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Foundation & Data Cleanup' (Protocol in workflow.md)

## Phase 2: Core Dashboard Components
Goal: Build the modular UI components for the new high-density dashboard.

- [ ] Task: Create Metric Card Components
    - [ ] Write tests for MetricCard component (success, loading, error states)
    - [ ] Implement MetricCard with support for sparklines and status indicators
- [ ] Task: Create Scraper Status Widget
    - [ ] Write tests for ScraperStatusWidget (fetching data from API)
    - [ ] Implement widget to show active scraper runs and health metrics
- [ ] Task: Create Recent Activity Feed
    - [ ] Write tests for ActivityFeed component
    - [ ] Implement feed showing recent scraper completions and product updates
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Core Dashboard Components' (Protocol in workflow.md)

## Phase 3: Dashboard Layout & Integration
Goal: Assemble the dashboard and integrate with real-time data.

- [ ] Task: Implement Main Dashboard Layout
    - [ ] Write tests for Dashboard layout and responsiveness
    - [ ] Implement the high-density grid layout for the admin panel
- [ ] Task: Integrate Real-time Data Fetching
    - [ ] Write tests for data fetching hooks/Server Components
    - [ ] Replace placeholder data with live metrics from Supabase
- [ ] Task: Mobile Optimization & Safari Verification
    - [ ] Verify layout on mobile breakpoints
    - [ ] Fix any Safari-specific rendering issues
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Dashboard Layout & Integration' (Protocol in workflow.md)

## Phase 4: Final Polish & Validation
Goal: Ensure the dashboard meets all quality gates and performance targets.

- [ ] Task: Performance Audit & Optimization
    - [ ] Measure load times and optimize data fetching if necessary
    - [ ] Implement skeleton loaders for better perceived performance
- [ ] Task: Final Quality Gate Check
    - [ ] Run full test suite and verify >80% coverage
    - [ ] Perform security review of admin access controls
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Final Polish & Validation' (Protocol in workflow.md)
