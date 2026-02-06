# Migration Guide: Pipeline v2

This guide covers upgrading from the legacy import system to the new ETL Pipeline (v2).

## Overview
The new pipeline introduces a multi-stage ingestion process:
1. **Staging**: Initial import from ShopSite XML.
2. **Scraped**: Data enriched from external web scrapers.
3. **Consolidated**: Data merged from multiple sources (B2B, Scrapers).
4. **Approved**: Verified by an admin.
5. **Published**: Synced to the live product catalog.

## Database Changes
The pipeline uses the `products_ingestion` table as a buffer. Live products remain in the `products` table.

### New Tables
- `products_ingestion`: Stores all raw and consolidated data.
- `pipeline_audit_log`: Tracks all status changes and deletions.

## Migration Steps

### 1. Update Environment Variables
Ensure Supabase credentials have permissions for the new tables.

### 2. Run Migrations
Apply the SQL migrations for `products_ingestion` and `pipeline_audit_log`.

### 3. Switch Import Logic
Instead of importing directly to the `products` table, use the new pipeline API or `lib/pipeline.ts` to insert into `products_ingestion` with status `staging`.

### 4. Data Transformation
Use `transformShopSiteProduct` from `lib/admin/migration/product-sync.ts` to prepare data for the pipeline.

## Rollback Plan
If issues occur, the legacy `products` table remains intact. You can continue using the old import scripts while the pipeline is being stabilized.
