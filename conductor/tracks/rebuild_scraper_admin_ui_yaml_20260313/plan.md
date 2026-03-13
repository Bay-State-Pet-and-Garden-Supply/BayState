# Implementation Plan: Scraper Admin UI Rebuild (YAML Transition)

## Phase 1: API Layer - YAML Config Provider [checkpoint: 735d023]
- [x] Task: Create Next.js API route to list YAML configurations [9912183]
    - [x] Create `apps/web/app/api/admin/scrapers/configs/route.ts`
    - [x] Implement logic to read `apps/scraper/scrapers/configs/*.yaml`
    - [x] Extract metadata (slug, display_name, base_url) from YAML frontmatter or structure
    - [x] Write unit tests for the API route
- [x] Task: Create Next.js API route to fetch specific YAML content [d41bb66]
    - [x] Create `apps/web/app/api/admin/scrapers/configs/[slug]/route.ts`
    - [x] Implement logic to read and return the raw YAML string
    - [x] Write unit tests for the API route
- [x] Task: Conductor - User Manual Verification 'Phase 1: API Layer' (Protocol in workflow.md) [735d023]

## Phase 2: Scraper List & Dashboard Rebuild
- [x] Task: Update `ScraperListPage` and `ScraperListClient` [49864de]
    - [x] Modify `apps/web/app/admin/scrapers/list/page.tsx` to fetch from the new config API
    - [x] Update `ScraperListClient` to handle the new data structure (YAML-based)
    - [x] Remove "Create Scraper", "Duplicate", and "Delete" buttons from the UI
    - [x] Write unit tests for the updated components
- [x] Task: Clean up legacy Supabase fetching in the dashboard [49864de]
    - [x] Remove `getScrapers` Supabase logic from `page.tsx`
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Scraper List' (Protocol in workflow.md)

## Phase 3: Scraper Detail & YAML Viewer
- [ ] Task: Rebuild Scraper Detail Page (`/admin/scrapers/[slug]`)
    - [ ] Replace existing configuration tabs with a single "Configuration" tab
    - [ ] Implement a read-only YAML viewer with syntax highlighting
    - [ ] Remove all legacy interactive editing components (WorkflowBuilder, SelectorsEditor, etc.)
    - [ ] Write unit tests for the new detail view
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Scraper Detail' (Protocol in workflow.md)

## Phase 4: Credential Management UI
- [ ] Task: Create Credentials Management Section
    - [ ] Add a "Credentials" tab to the scraper detail page
    - [ ] Implement a form to view/edit credentials stored in `public.scraper_credentials` table
    - [ ] Ensure this section remains editable in all environments
    - [ ] Write unit tests for the credentials UI and actions
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Credentials' (Protocol in workflow.md)

## Phase 5: Cleanup & Final Verification
- [ ] Task: Remove legacy scraper config API routes and actions
    - [ ] Delete or deprecate legacy server actions related to config editing in Supabase
- [ ] Task: Perform final E2E verification of the new workflow
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Cleanup' (Protocol in workflow.md)
