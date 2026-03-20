# Specification: Pipeline Workflow Redesign & Enrichment Enhancements

## Overview
This track aims to overhaul the product pipeline workflow to support incremental data enrichment, automated AI consolidation of multiple data sources, and a unified finalization process that includes image selection directly within the dashboard.

## Functional Requirements
1. **Incremental Enrichment & Reruns**
   - Support triggering a scrape/enrichment job for products that are already in the system.
   - New scrape data should be treated as an incremental addition to the product's source data (e.g., adding a new supplier's data or updating existing supplier data).
   - Any new or updated source data should automatically trigger the AI Consolidation step.

2. **Automated AI Consolidation**
   - Implement an automated step that merges data from all available sources for a single product into one "Master" product record.
   - AI logic will be used to intelligently select the best name, description, and other attributes from the competing sources.

3. **Integrated Finalization Step**
   - Move the image selection process into the admin dashboard as a primary pipeline step.
   - Provide a "Finalize" view for each product where operators can:
     - Review and edit the AI-consolidated master product data.
     - Browse and select the preferred image batch from the available sources.
     - Set the product status to 'Approved' or 'Published'.

4. **Workflow Sequence**
   - **Step 1: Scrape/Enrich** -> Data is collected from one or more sources.
   - **Step 2: AI Consolidate** -> Automatically triggered; merges sources into a Master record.
   - **Step 3: Finalize** -> Manual verification of data and selection of images.

## Acceptance Criteria
- [ ] Operators can trigger a re-scrape for an existing product from the UI.
- [ ] New source data correctly updates the product's source list without losing historical data.
- [ ] AI consolidation automatically updates the master product record upon source updates.
- [ ] A new "Finalize" UI exists within the dashboard that combines data verification and image selection.
- [ ] Products can only be finalized/published after this unified verification step.
