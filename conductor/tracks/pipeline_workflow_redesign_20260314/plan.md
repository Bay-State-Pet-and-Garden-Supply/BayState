# Implementation Plan: Pipeline Workflow Redesign & Enrichment Enhancements

## Phase 1: Incremental Enrichment Backend & API
- [ ] Task: Define updated Supabase schema for product sources (merging/updating source data)
- [ ] Task: Write Tests for incremental source update logic (TDD)
- [ ] Task: Implement backend logic for adding/updating source data for existing products
- [ ] Task: Write Tests for triggering re-scrapes from the API (TDD)
- [ ] Task: Implement API endpoint for triggering a re-scrape for a specific product
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Incremental Enrichment' (Protocol in workflow.md)

## Phase 2: Automated AI Consolidation
- [ ] Task: Define AI consolidation prompt and logic for merging multiple sources into a Master record
- [ ] Task: Write Tests for AI consolidation logic (TDD)
- [ ] Task: Implement automated AI consolidation trigger on source data updates
- [ ] Task: Implement logic to update the Master product record with AI-consolidated data
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Automated AI Consolidation' (Protocol in workflow.md)

## Phase 3: Unified Finalization & Image Selection UI
- [ ] Task: Design and scaffold the new 'Finalize' view component in the admin dashboard
- [ ] Task: Write Tests for the image selection UI component (TDD)
- [ ] Task: Implement image batch selection and verification within the 'Finalize' view
- [ ] Task: Write Tests for the data verification and approval flow (TDD)
- [ ] Task: Implement product data verification and final approval action in the 'Finalize' view
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Unified Finalization UI' (Protocol in workflow.md)

## Phase 4: Workflow Orchestration & Cleanup
- [ ] Task: Update the main product pipeline to use the new Scrape -> Consolidate -> Finalize flow
- [ ] Task: Remove or deprecate old image selection and verification components
- [ ] Task: Perform end-to-end testing of the new pipeline workflow
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Workflow Orchestration' (Protocol in workflow.md)
