# Design: Redesigned Imported Tab Management UI

**Date:** 2026-05-16  
**Status:** Draft  
**Topic:** Redesign the 'Imported' tab to allow for streamlined assignment of Brands, Distributors, and Official Domains.

---

## 1. Problem Statement
The current Imported tab UI is outdated and requires navigating multiple dialogs/modals to assign critical data (Brand, Distributors, Domains) needed for product extraction. The distinction between "Legacy Scrapers" and the "New Distributor" adapter system is not clear in the current UI.

## 2. Proposed Solution: Master-Detail Management
Replace the cohort-centric preview with a Master-Detail layout.
- **Master (Left):** Navigable list of Cohorts and Products with multi-select support.
  - Includes global actions: "Import Integra" and "Add Product" buttons preserved from the original UI.
- **Detail (Right):** A persistent "Management Panel" that updates based on the current selection.

### 2.1 Management Panel Sections
1. **Selection Header:** Shows selection count and context (e.g., "Batch: KONG-001").
2. **Brand Assignment:** Searchable brand picker. Shows logo and slug.
3. **Distributor Sources:** Clear toggle list for specialized adapters (Bradley, Phillips, etc.). 
   - Uses the new `brand_sources` and adapter registry logic.
   - Highlights "Active" vs "Inactive" sources.
4. **Official Domains:** Multi-tag input for domains. 
   - Visual warnings (Gold/Burgundy) if domains are missing (critical for SERP fallback).
5. **Action Footer:** Single primary button to "Save & Start Scraper".

## 3. Visual Design (Style Alignment)
- **Palette:** High-contrast (Background: `#0a0a0a`, Card: `#111111`, Borders: `#333333`).
- **Accents:** Gold (`#fbbf24`) for warnings/required items, Forest Green (`#10b981`) for active/success states.
- **Borders:** Strict 1px or 2px solid borders (no rounded corners per project convention).
- **Typography:** Bold, uppercase labels for sections (`text-[10px] font-bold tracking-widest`).

## 4. Technical Architecture
- **State Management:** Move from cohort-local state to a selection-driven state in `ImportedResultsView.tsx`.
- **Data Fetching:**
  - `brand_sources` for distributor mapping.
  - `brands` table for official domains.
- **New Components:**
  - `ManagementPanel.tsx`: The primary detail view.
  - `DistributorToggle.tsx`: Specialized toggle for adapters.
  - `DomainTagInput.tsx`: Custom multi-input for domains.

## 5. User Workflow
1. User selects a Cohort or a set of Products.
2. Management Panel reveals current assignments.
3. User selects a Brand (distributors and domains auto-populate if existing).
4. User adds missing domains or toggles specific distributors.
5. User clicks "Save & Start Scraper" to initiate the `extracting` phase.

---

## 6. Implementation Plan Preview
- [ ] Refactor `ImportedResultsView` to support the Master-Detail layout.
- [ ] Create `ManagementPanel` component and sub-components.
- [ ] Implement bulk assignment logic for Brand/Distributors/Domains.
- [ ] Verify persistence in Supabase (`brands`, `brand_scraper_mappings`, `cohort_batches`).
