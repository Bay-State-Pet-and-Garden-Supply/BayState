# Implementation Plan: Pipeline Resilience and Scalability Refactor

## Phase 1: Infrastructure - Database-Level Merging
- [ ] Task: Create PostgreSQL migration for `jsonb_deep_merge` function.
- [ ] Task: Write Tests for `jsonb_deep_merge` SQL function (via Supabase/pgTAP or integration tests).
- [ ] Task: Implement `jsonb_deep_merge` function in Supabase.
- [ ] Task: Write Tests for atomic `chunk-callback` updates using the new merge function.
- [ ] Task: Refactor `apps/web/app/api/scraper/v1/chunk-callback/route.ts` to use SQL-based merging.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Infrastructure - Database-Level Merging' (Protocol in workflow.md)

## Phase 2: Standardization - Product Source Schema
- [ ] Task: Define `ProductSourceSchema` using Zod in `apps/web/lib/product-sources.ts`.
- [ ] Task: Write Tests for `ProductSourceSchema` validation and sanitization.
- [ ] Task: Implement standardized filtering in `apps/web/lib/product-sources.ts` using the schema.
- [ ] Task: Write Tests for `batch-service.ts` using the new schema-based filtering.
- [ ] Task: Refactor `apps/web/lib/consolidation/batch-service.ts` to remove legacy "magic string" heuristics.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Standardization - Product Source Schema' (Protocol in workflow.md)

## Phase 3: Efficiency - Streaming Batch Generation
- [ ] Task: Write Tests for streaming JSONL generation with large datasets (mocking).
- [ ] Task: Implement Node.js stream-based batch file creation in `apps/web/lib/consolidation/batch-service.ts`.
- [ ] Task: Write Tests for `submitBatch` ensuring memory stability.
- [ ] Task: Refactor `submitBatch` to use the new streaming implementation.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Efficiency - Streaming Batch Generation' (Protocol in workflow.md)

## Phase 4: Reliability - Resilience & Retry Queue
- [ ] Task: Create PostgreSQL migration for `failed_callbacks` table.
- [ ] Task: Write Tests for logging failed callbacks to the new table.
- [ ] Task: Implement error handling in callback routes to persist failed payloads.
- [ ] Task: Write Tests for the retry mechanism (e.g., API endpoint or script).
- [ ] Task: Implement a basic "Retry All" API endpoint for failed callbacks.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Reliability - Resilience & Retry Queue' (Protocol in workflow.md)
