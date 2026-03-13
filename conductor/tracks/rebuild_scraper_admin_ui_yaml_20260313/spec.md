# Specification: Scraper Admin UI Rebuild (YAML Transition)

## Overview
Rebuild the Scraper Admin UI to use local YAML configuration files from `apps/scraper/scrapers/configs/` instead of the deprecated Supabase-backed configurations. All configuration edits will now happen in the development environment directly in the YAML files. The UI will provide a read-only view of these configurations and allow management of scraper credentials (which remain in Supabase).

## Functional Requirements
1.  **API Integration:**
    *   Implement a Next.js API endpoint that lists all YAML files in `apps/scraper/scrapers/configs/`.
    *   Provide an endpoint to fetch the content of a specific YAML file for display.
2.  **Scraper Dashboard Rebuild:**
    *   Replace the Supabase-backed scraper list with one that fetches from the new API.
    *   Display each scraper's metadata (display name, name, base URL, status).
    *   Remove "Create Scraper", "Duplicate", and "Delete" buttons from the UI.
3.  **Read-only Configuration View:**
    *   Update the scraper configuration page to show the content of the YAML file in a syntax-highlighted editor (read-only).
    *   Remove all interactive editing components for scraper logic, selectors, and workflows.
4.  **Credential Management:**
    *   Provide a dedicated UI section to manage scraper credentials (login, password, API keys) stored in Supabase.
    *   This section remains editable in all environments.
5.  **Legacy Cleanup:**
    *   Remove code and API routes related to editing scraper configurations in Supabase.
    *   Deprecate/Cleanup the `scraper_configs` table usage in the frontend.

## Acceptance Criteria
1.  Admin panel displays all scrapers defined in `apps/scraper/scrapers/configs/`.
2.  Users can view the YAML configuration for any scraper in a read-only viewer.
3.  Editing of YAML configurations is disabled in the UI.
4.  Users can manage (view/edit) scraper credentials in the UI.
5.  The system no longer attempts to fetch scraper configurations from the Supabase `scraper_configs` table.

## Out of Scope
*   Converting non-YAML configurations to YAML (already handled).
*   Adding new scraper features beyond the rebuild.
