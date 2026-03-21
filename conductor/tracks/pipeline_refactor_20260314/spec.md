# Specification: Pipeline Resilience and Scalability Refactor

## Overview
This track refactors the product ingestion and consolidation pipeline to eliminate concurrency issues, reduce memory pressure, and improve data reliability. It addresses critical architectural flaws by moving merging logic into the database and leveraging streaming for large data sets.

## Functional Requirements
1. **Database-Level JSONB Merging:**
   - Create a PostgreSQL function `jsonb_deep_merge` to handle recursive merging of product source data.
   - Update the `chunk-callback` and `admin-callback` endpoints to use this function in an `UPSERT` statement, eliminating the Read-Modify-Write race condition.
2. **Streaming Batch Generation:**
   - Refactor `apps/web/lib/consolidation/batch-service.ts` to use Node.js streams when creating OpenAI Batch JSONL files.
   - Avoid loading the entire product list and its sources into memory at once.
3. **Standardized Source Schema:**
   - Define a `ProductSourceSchema` (Zod) in `apps/web/lib/product-sources.ts`.
   - Replace brittle "magic string" fragment matching in `batch-service.ts` with explicit schema-based filtering.
4. **Resilience & Retry Queue:**
   - Implement a `failed_callbacks` table to store callback payloads that failed to process.
   - Add a basic retry mechanism (either a background worker or a manual "Retry All" trigger in the admin UI).

## Non-Functional Requirements
- **Atomicity:** All updates to a product's sources must be atomic and thread-safe.
- **Scalability:** The pipeline must handle batches of 10,000+ products without exceeding Node.js default heap limits.
- **Maintainability:** Replace complex, unreadable regex/substring matching with a declarative schema.

## Acceptance Criteria
- [ ] Multiple scrapers can update the same SKU simultaneously without data loss.
- [ ] Memory usage remains stable (within 20% of baseline) during the generation of 5,000+ product batch files.
- [ ] The `batch-service.ts` file is reduced in complexity and uses the new `ProductSourceSchema`.
- [ ] Failed callbacks are logged to the `failed_callbacks` table and can be retried.

## Out of Scope
- Automating the transition from 'completed' job to 'AI Consolidation' (to be handled in a future track).
- Changes to the frontend UI beyond basic retry triggers.
- Modifying the Python scrapers themselves (this is a backend/pipeline refactor).
