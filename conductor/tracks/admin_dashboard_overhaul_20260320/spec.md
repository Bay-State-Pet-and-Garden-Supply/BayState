# Specification - Admin Panel Dashboard Overhaul and Product Reset

## Overview
The current admin dashboard in `apps/web/components/admin/dashboard/` is outdated in terms of UI and content. This track aims to overhaul the dashboard to provide a modern, high-density, and informative interface for managing Bay State Pet & Garden Supply operations. Additionally, the track includes resetting published products and removing placeholder data to ensure a clean production-ready state.

## Functional Requirements
- **UI Overhaul:**
    - Redesign the admin dashboard layout using Tailwind CSS v4 and shadcn/ui.
    - Implement high-density information displays (sparklines, metric cards, status indicators).
    - Provide quick access to key administrative functions (Scraper Lab, Product Management, Order Tracking).
- **Content Update:**
    - Display real-time or near-real-time metrics from Supabase (e.g., active scrapers, recent syncs, product counts).
    - Remove all hardcoded placeholder data.
- **Product Reset:**
    - Implement a mechanism (script or admin action) to reset the `published` status of products.
    - Purge placeholder products from the database.
- **Responsive Design:**
    - Ensure the dashboard is fully functional and readable on mobile devices (iPhone/Safari).

## Non-Functional Requirements
- **Performance:** Dashboard should load quickly (< 200ms for initial data fetch).
- **Security:** Access restricted to authenticated administrators only.
- **Maintainability:** Use modular React components and clear data fetching patterns (Server Components preferred).

## Acceptance Criteria
- [ ] Admin dashboard UI matches the modern high-density design language.
- [ ] Placeholder data is completely removed from the UI.
- [ ] Dashboard displays live metrics from the database.
- [ ] A script or action exists to reset published products and remove placeholders.
- [ ] >80% test coverage for new components and logic.
- [ ] Dashboard passes mobile responsiveness checks on Safari.

## Out of Scope
- Integration with third-party analytics (e.g., Google Analytics).
- Full redesign of individual product management pages (only dashboard is in scope).
