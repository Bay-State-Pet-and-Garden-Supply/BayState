# Fix Protected Images 404 Errors

## TL;DR

> **Problem**: Images from login-protected sites show as 404s in Scraped tab. Root cause: Image capture failures are silently dropped instead of being queued for retry.
> 
> **Solution**: Implement per-image retry queue with smart failure classification (401=retry with re-login, 404=permanent fail, timeout=retry). Queue failures for separate retry jobs. Backfill existing 404s.
> 
> **Deliverables**:
> - Modified `image.py` with error metadata and scroll-to-load
> - Image retry queue table + functions
> - Smart failure classification in storage layer
> - Enhanced backfill script with retry integration
> - Ongoing 404 detection with auto-re-scrape
> 
> **Estimated Effort**: Medium (6-8 tasks)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: T1 (scraper) → T2 (storage) → T3 (retry queue) → T4 (backfill) → F1-F4 (verification)

---

## Context

### Original Request
Images from login-protected sites are showing as "not found" in the Scraped tab after scraping completes. Previous solution not working.

### Interview Summary
**Key Discussions**:
- **User doesn't know which specific sites** are affected, but it's all login-protected sites
- **Previous solution unknown** - something was tried but details unclear
- **Error type**: 404 Not Found errors in browser console
- **Retry strategy**: Queue for separate job (eventual consistency)
- **Existing 404s**: Both backfill + ongoing detection
- **Failure classification**: Smart (401 vs 404 vs timeout)
- **Partial failures**: Fail entire product (conservative)

### Research Findings

**1. Current Flow Analysis**:
- **Scraper** (`image.py:14-115`): Captures images as base64 data URLs for login-protected sites using Playwright with `credentials: 'include'`
- **Failure behavior**: Failed captures are **silently dropped** (line 100-114 logs warning but doesn't track)
- **Web app** (`products-ingestion.ts:29-40`): Calls `replaceInlineImageDataUrls()` which uploads data URLs to Supabase Storage
- **Storage** (`product-image-storage.ts:131-172`): Uploads to Supabase, on failure keeps data URL

**2. Root Cause**:
- Images are **silently dropped** on capture failure, not stored as raw URLs
- No retry mechanism exists at image level (only job/chunk level)
- Raw protected URLs appearing = sites marked `requires_login: false` but actually requiring auth

**3. Solution Architecture**:
```
Scraper (image.py)
    ↓ Captures images with scroll + retry
    ↓ Returns structured result: {data_url} or {error, error_type}
    
Web App Callback
    ↓ On success: upload to Supabase Storage
    ↓ On failure: create retry queue entry with error_type
    
Retry Job Processor
    ↓ Polls queue for pending retries
    ↓ 401 errors: re-authenticate then retry
    ↓ Timeout: retry with backoff
    ↓ 404: mark permanent failure
    
Ongoing Detection
    ↓ Frontend detects 404 on image load
    ↓ Triggers re-scrape for that product
```

### Metis Review
**Identified Gaps** (addressed in this plan):
- ✅ Retry strategy: Queue for separate job (chosen)
- ✅ Failure classification: Smart (401/404/timeout) (chosen)
- ✅ Existing 404s: Backfill + ongoing detection (chosen)
- ✅ Partial failures: Fail entire product (chosen)
- ✅ Scope guardrails: NO frontend changes, NO non-login-protected changes
- ✅ Rollback plan included

---

## Work Objectives

### Core Objective
Implement robust image capture and retry system for login-protected sites, eliminating 404s through smart failure handling and queued retries.

### Concrete Deliverables
1. Modified scraper image capture with scroll, retry, and error metadata
2. Image retry queue table using existing `pipeline_retry_queue` pattern
3. Smart failure classification (HTTP 401, 404, timeout, CORS)
4. Modified storage layer to enqueue failures instead of dropping
5. Retry job processor with re-authentication for 401s
6. Enhanced backfill script for existing 404s
7. Ongoing 404 detection with auto-re-scrape trigger

### Definition of Done
- [ ] All image capture failures create retry queue entries
- [ ] Retry jobs successfully re-capture images with fresh login
- [ ] 404 errors permanently fail (not retried indefinitely)
- [ ] Existing 404 products are detected and re-scraped
- [ ] Frontend 404 detection triggers automatic re-scrape
- [ ] Tests pass for all failure scenarios

### Must Have
- Image-level retry queue using existing pattern
- Smart failure classification (401/404/timeout)
- Scroll-to-load for lazy images
- Backfill for existing 404s
- Ongoing 404 detection

### Must NOT Have (Guardrails)
- ❌ NO changes to frontend display logic (ScrapedResultsView.tsx)
- ❌ NO changes to non-login-protected image handling
- ❌ NO database schema changes beyond retry queue table
- ❌ NO changes to image selection/approval UI
- ❌ NO deletion of existing working images

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Jest + pytest)
- **Automated tests**: TDD approach (RED → GREEN → REFACTOR)
- **Framework**: Jest for web app, pytest for scraper
- **Coverage target**: Test all failure scenarios (401, 404, timeout, CORS)

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Start Immediately):
├── T1: Add image retry queue schema (uses existing pipeline_retry_queue pattern)
├── T2: Modify image.py to return error metadata + add scroll
└── T3: Add failure classification types and utilities
    
Wave 2 (Core Logic - After Wave 1):
├── T4: Update storage layer to enqueue failures (product-image-storage.ts)
├── T5: Create retry job processor with smart handling
├── T6: Add re-authentication flow for 401 errors
└── T7: Implement ongoing 404 detection + auto-re-scrape
    
Wave 3 (Backfill + Integration - After Wave 2):
├── T8: Enhance backfill script with retry queue integration
└── T9: Add comprehensive tests for all failure scenarios
    
Wave FINAL (Verification - After ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| T1 | — | T4, T8 |
| T2 | — | T4 |
| T3 | — | T4, T5 |
| T4 | T1, T2, T3 | T5 |
| T5 | T4 | T6, T7 |
| T6 | T5 | T8 |
| T7 | T5 | — |
| T8 | T1, T6 | — |
| T9 | T1-T8 | — |
| F1-F4 | T1-T9 | — |

### Agent Dispatch Summary

- **Wave 1 (3 tasks)**: T1→`quick`, T2→`deep`, T3→`quick`
- **Wave 2 (4 tasks)**: T4→`unspecified-high`, T5→`deep`, T6→`unspecified-high`, T7→`unspecified-high`
- **Wave 3 (2 tasks)**: T8→`deep`, T9→`unspecified-high`
- **Wave FINAL (4 tasks)**: F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep`

---

## TODOs

- [x] 1. Add Image Retry Queue Schema

  **What to do**:
  - Create migration extending `pipeline_retry_queue` pattern for image-specific retries
  - Add columns: `image_url`, `product_id`, `error_type` (401|404|timeout|cors), `retry_count`, `last_error`
  - Create indexes on `status`, `error_type`, `scheduled_for`
  - Add TypeScript types in shared types file

  **Must NOT do**:
  - Don't create separate table - extend existing pattern
  - Don't modify existing pipeline_retry_queue (create image_retry_queue)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: Database schema work, straightforward migration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T4, T8
  - **Blocked By**: None

  **References**:
  - `apps/web/supabase/migrations/20260131000000_pipeline_audit_retry_schema.sql` - Existing pipeline_retry_queue schema to follow
  - `apps/web/lib/supabase/database.types.ts` - Type definitions location

  **Acceptance Criteria**:
  - [ ] Migration creates `image_retry_queue` table
  - [ ] TypeScript types match schema exactly
  - [ ] Indexes created for query performance
  - [ ] `bun run supabase db reset` runs without errors

  **QA Scenarios**:
  ```
  Scenario: Migration applies successfully
    Tool: Bash
    Steps:
      1. Run `bun run supabase db reset`
      2. Run `bun run supabase db diff`
    Expected Result: No schema differences (migration applied cleanly)
    Evidence: .sisyphus/evidence/task-1-migration-success.log
  ```

  **Commit**: YES
  - Message: `feat(db): add image_retry_queue table for failed image capture retries`
  - Files: `apps/web/supabase/migrations/`, `apps/web/lib/supabase/database.types.ts`
  - Pre-commit: `bun run supabase db reset`

- [x] 2. Modify Image Capture with Scroll and Error Metadata

  **What to do**:
  - Modify `apps/scraper/scrapers/actions/handlers/image.py` lines 14-115
  - Add scroll-to-trigger-lazy-loading before capture:
    ```python
    await page.evaluate("""
      async () => {
        const scrollStep = 500;
        for (let y = 0; y < document.body.scrollHeight; y += scrollStep) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 100));
        }
      }
    """)
    await page.wait_for_load_state('networkidle')
    ```
  - Change return type from `List[str]` to `List[Dict]` with error metadata:
    ```python
    {
      "status": "success" | "error",
      "data_url": "data:image/..." | None,
      "error_type": None | "auth_401" | "not_found_404" | "network_timeout" | "cors_blocked",
      "error_message": str | None
    }
    ```
  - Add 2 retries with exponential backoff (1s, 2s delays)
  - Classify errors: HTTP 401→auth_401, 404→not_found_404, timeout→network_timeout

  **Must NOT do**:
  - Don't change behavior for non-login-protected images
  - Don't remove existing functionality - only enhance

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Reason: Complex Playwright interactions, error classification logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T4
  - **Blocked By**: None

  **References**:
  - `apps/scraper/scrapers/actions/handlers/image.py:14-115` - Main capture function
  - `apps/scraper/scrapers/actions/handlers/login.py` - For understanding auth flow

  **Acceptance Criteria**:
  - [ ] Scroll triggers lazy-loaded images
  - [ ] Return type includes error metadata
  - [ ] Retry logic works (2 attempts with backoff)
  - [ ] Error classification correct (401, 404, timeout)
  - [ ] Tests pass for all error scenarios

  **QA Scenarios**:
  ```
  Scenario: Lazy-loaded images are captured
    Tool: Bash (pytest)
    Preconditions: Test page with lazy-loaded images
    Steps:
      1. Run test with page containing images below fold
      2. Verify scroll is triggered
      3. Check all images are captured
    Expected Result: All 5 images captured (not just above-fold)
    Evidence: .sisyphus/evidence/task-2-lazy-load-test.log

  Scenario: Error metadata returned on 401
    Tool: Bash (pytest)
    Steps:
      1. Mock HTTP 401 response
      2. Call image capture
    Expected Result: Returns {status: "error", error_type: "auth_401", ...}
    Evidence: .sisyphus/evidence/task-2-error-metadata.json
  ```

  **Commit**: YES
  - Message: `feat(scraper): add scroll, retry, and error metadata to image capture`
  - Files: `apps/scraper/scrapers/actions/handlers/image.py`
  - Pre-commit: `python -m pytest apps/scraper/tests/ -v`

- [x] 3. Add Failure Classification Types and Utilities

  **What to do**:
  - Create shared types/enums for error classification:
    ```typescript
    enum ImageCaptureErrorType {
      AUTH_401 = 'auth_401',
      NOT_FOUND_404 = 'not_found_404',
      NETWORK_TIMEOUT = 'network_timeout',
      CORS_BLOCKED = 'cors_blocked',
      UNKNOWN = 'unknown'
    }
    ```
  - Create utility functions:
    - `classifyHttpError(statusCode: number): ImageCaptureErrorType`
    - `shouldRetry(errorType: ImageCaptureErrorType, retryCount: number): boolean`
    - `getRetryDelay(errorType: ImageCaptureErrorType, retryCount: number): number`
  - Rules:
    - AUTH_401: retry up to 2 times, requires re-login
    - NETWORK_TIMEOUT: retry up to 3 times with exponential backoff (1s, 2s, 4s)
    - NOT_FOUND_404: no retry (permanent failure)
    - CORS_BLOCKED: retry once, then permanent fail

  **Must NOT do**:
  - Don't hardcode retry counts - make them configurable constants

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: Type definitions and utility functions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T4, T5
  - **Blocked By**: None

  **References**:
  - `apps/web/lib/product-image-storage.ts` - Where these utilities will be used
  - Existing error handling patterns in codebase

  **Acceptance Criteria**:
  - [ ] Enum and types defined
  - [ ] Classification function handles all HTTP codes correctly
  - [ ] Retry logic follows rules above
  - [ ] Unit tests for all utility functions

  **QA Scenarios**:
  ```
  Scenario: Error classification works correctly
    Tool: Bash (jest)
    Steps:
      1. Test classifyHttpError(401) returns AUTH_401
      2. Test classifyHttpError(404) returns NOT_FOUND_404
      3. Test classifyHttpError(0) returns NETWORK_TIMEOUT
    Expected Result: All classifications correct
    Evidence: .sisyphus/evidence/task-3-classification-test.log
  ```

  **Commit**: YES
  - Message: `feat(types): add image capture error classification utilities`
  - Files: `apps/web/lib/image-capture-errors.ts` (new file)
  - Pre-commit: `bun test apps/web/lib/__tests__/image-capture-errors.test.ts`

- [x] 4. Update Storage Layer to Enqueue Failures

  **What to do**:
  - Modify `apps/web/lib/product-image-storage.ts` lines 131-172
  - Update `replaceInlineImageDataUrls()` to handle error metadata from scraper
  - On successful upload: proceed normally
  - On upload failure:
    - Extract error_type from metadata (or classify if not present)
    - Create entry in `image_retry_queue` with:
      - `product_id`, `image_url`, `error_type`, `retry_count=0`, `status='pending'`
      - `scheduled_for = now + getRetryDelay(error_type, 0)`
    - Mark image as "pending_retry" in product data (don't drop!)
  - Update return type to indicate which images failed and were queued

  **Must NOT do**:
  - Don't silently drop failed images anymore
  - Don't store raw protected URLs - queue for retry instead

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Reason: Complex error handling, database operations

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Wave 1)
  - **Parallel Group**: Wave 2
  - **Blocks**: T5
  - **Blocked By**: T1, T2, T3

  **References**:
  - `apps/web/lib/product-image-storage.ts:131-172` - Main upload function
  - `apps/web/lib/image-capture-errors.ts` - Error classification (from T3)
  - New `image_retry_queue` table (from T1)

  **Acceptance Criteria**:
  - [ ] Upload failures create retry queue entries
  - [ ] Error type is correctly classified
  - [ ] Images marked as "pending_retry" not dropped
  - [ ] Return value indicates which images were queued

  **QA Scenarios**:
  ```
  Scenario: Upload failure creates retry queue entry
    Tool: Bash (curl to Supabase REST API)
    Preconditions: Mock Supabase storage to return 500 error
    Steps:
      1. Call replaceInlineImageDataUrls() with failing image
      2. Check image_retry_queue table
    Expected Result: Entry created with error_type, status='pending'
    Evidence: .sisyphus/evidence/task-4-retry-queue-entry.json
  ```

  **Commit**: YES
  - Message: `feat(storage): enqueue upload failures instead of dropping`
  - Files: `apps/web/lib/product-image-storage.ts`
  - Pre-commit: `bun test apps/web/lib/__tests__/product-image-storage.test.ts`

- [x] 5. Create Retry Job Processor

  **What to do**:
  - Create `apps/web/lib/scraper-callback/image-retry-processor.ts`
  - Poll `image_retry_queue` for entries with `status='pending'` and `scheduled_for <= now`
  - For each pending entry:
    - Fetch the product's scrape job configuration
    - Re-run image capture using scraper API
    - Update entry status:
      - Success: `status='completed'`, update product with new image URL
      - Failure with retry: `retry_count++`, update `scheduled_for`, `status='pending'`
      - Permanent failure (404 or max retries): `status='failed'`, log error
  - Implement exponential backoff for retries
  - Add circuit breaker to prevent overwhelming source sites

  **Must NOT do**:
  - Don't process retries synchronously with main scrape
  - Don't retry 404s or max-reached entries

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Reason: Complex job processing, retry logic, circuit breaker

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Wave 2 start)
  - **Parallel Group**: Wave 2
  - **Blocks**: T6, T7
  - **Blocked By**: T4

  **References**:
  - `apps/scraper/core/retry_executor.py` - Existing retry pattern
  - `apps/web/lib/scraper-callback/products-ingestion.ts` - How products are created

  **Acceptance Criteria**:
  - [ ] Processor polls queue periodically (every 60s)
  - [ ] Successful retries update product images
  - [ ] Failed retries increment counter and reschedule
  - [ ] Permanent failures marked correctly
  - [ ] Circuit breaker prevents site overload

  **QA Scenarios**:
  ```
  Scenario: Retry processor handles pending entries
    Tool: Bash (curl to test endpoint)
    Preconditions: Insert test entry in image_retry_queue
    Steps:
      1. Insert entry with status='pending', scheduled_for=now
      2. Trigger processor
      3. Check entry status and product images
    Expected Result: Entry processed, product updated or retry scheduled
    Evidence: .sisyphus/evidence/task-5-retry-processor.json
  ```

  **Commit**: YES
  - Message: `feat(retry): add image retry job processor with circuit breaker`
  - Files: `apps/web/lib/scraper-callback/image-retry-processor.ts` (new)
  - Pre-commit: `bun test apps/web/lib/scraper-callback/__tests__/image-retry-processor.test.ts`

- [x] 6. Add Re-authentication Flow for 401 Errors

  **What to do**:
  - When retry processor encounters `error_type='auth_401'`:
    - Check if session is expired (compare `session_expires_at` with now)
    - If expired: trigger re-login using existing login handler
    - Use `apps/scraper/scrapers/actions/handlers/login.py` to re-authenticate
    - Update session cookies in browser persistence
    - Retry image capture with fresh session
  - Add session refresh logic to retry processor
  - Track re-login attempts to prevent infinite loops (max 2 re-logins per job)

  **Must NOT do**:
  - Don't create new login logic - use existing handler
  - Don't store credentials in retry queue

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Reason: Authentication flow integration

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T5)
  - **Parallel Group**: Wave 2
  - **Blocks**: T8
  - **Blocked By**: T5

  **References**:
  - `apps/scraper/scrapers/actions/handlers/login.py` - Login handler
  - `apps/scraper/core/browser_persistence.py` - Session storage

  **Acceptance Criteria**:
  - [ ] 401 errors trigger re-authentication
  - [ ] Fresh session used for retry
  - [ ] Max 2 re-login attempts per job
  - [ ] Session cookies updated correctly

  **QA Scenarios**:
  ```
  Scenario: 401 error triggers re-authentication
    Tool: Bash (integration test)
    Preconditions: Test entry with error_type='auth_401'
    Steps:
      1. Create entry with expired session
      2. Run retry processor
      3. Verify re-login is triggered
      4. Check image capture uses fresh session
    Expected Result: Re-login succeeds, image captured with new session
    Evidence: .sisyphus/evidence/task-6-reauth-flow.log
  ```

  **Commit**: YES
  - Message: `feat(auth): add re-authentication flow for 401 image errors`
  - Files: `apps/web/lib/scraper-callback/image-retry-processor.ts` (update)
  - Pre-commit: Integration test passes

- [x] 7. Implement Ongoing 404 Detection + Auto-re-scrape

  **What to do**:
  - Modify image display to detect 404s:
    - In `ScrapedResultsView.tsx` or image loader, add `onError` handler to `<img>` tags
    - When 404 detected, check if image is from login-protected source
    - If yes: trigger re-scrape via API call to `/api/admin/scraping/retry-image`
  - Create API route `POST /api/admin/scraping/retry-image`:
    - Accept `product_id` and `image_url`
    - Check if product exists and source requires login
    - Create or update entry in `image_retry_queue` with `priority='high'`
    - Return 202 Accepted immediately
  - Add debouncing (don't trigger multiple re-scrapes for same image within 5 minutes)

  **Must NOT do**:
  - Don't block UI on re-scrape trigger (async)
  - Don't trigger for non-login-protected sources (those are permanent 404s)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Reason: Frontend detection + backend API + debouncing

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T5)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: T5

  **References**:
  - `apps/web/components/admin/pipeline/ScrapedResultsView.tsx:406-458` - Image display
  - `apps/web/lib/supabase/image-loader.ts` - Image loading logic

  **Acceptance Criteria**:
  - [ ] 404 detection works on image load failure
  - [ ] API route creates retry queue entries
  - [ ] Debouncing prevents duplicate triggers
  - [ ] Only triggers for login-protected sources

  **QA Scenarios**:
  ```
  Scenario: 404 detection triggers re-scrape
    Tool: Playwright
    Preconditions: Product with broken image URL
    Steps:
      1. Navigate to Scraped tab
      2. Wait for image to load (will 404)
      3. Check image_retry_queue for new entry
    Expected Result: Entry created with priority='high'
    Evidence: .sisyphus/evidence/task-7-404-detection.png (screenshot)
  ```

  **Commit**: YES
  - Message: `feat(detection): add ongoing 404 detection with auto-re-scrape`
  - Files: `apps/web/app/api/admin/scraping/retry-image/route.ts`, `ScrapedResultsView.tsx`
  - Pre-commit: Playwright test passes

- [x] 8. Enhance Backfill Script with Retry Queue Integration

  **What to do**:
  - Modify `apps/web/scripts/backfill-login-protected-images-logic.ts` (or create new)
  - Query `products_ingestion` for products with:
    - `source.requires_login = true`
    - Images that are NOT durable (raw URLs instead of data URLs or Supabase URLs)
  - For each affected product:
    - Check if already in `image_retry_queue` (avoid duplicates)
    - Create retry queue entry with `priority='backfill'`
    - Log the backfill action
  - Add batching (process 100 products at a time)
  - Add dry-run mode (`--dry-run` flag)
  - Create report: total found, already queued, newly queued, errors

  **Must NOT do**:
  - Don't modify existing images in place (create retry entries instead)
  - Don't delete anything

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Reason: Complex backfill logic, batching, reporting

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Wave 2 complete)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T1, T6

  **References**:
  - `apps/web/scripts/backfill-login-protected-images-logic.ts` - Existing backfill script
  - `apps/web/lib/product-sources.ts` - Product source queries

  **Acceptance Criteria**:
  - [ ] Script finds all products with non-durable images
  - [ ] Creates retry queue entries (no duplicates)
  - [ ] Batching works (100 at a time)
  - [ ] Dry-run mode shows what would be done
  - [ ] Report generated with counts

  **QA Scenarios**:
  ```
  Scenario: Backfill script queues existing 404s
    Tool: Bash (node script)
    Preconditions: Test products with non-durable images
    Steps:
      1. Run backfill script --dry-run
      2. Verify report shows correct counts
      3. Run script without --dry-run
      4. Check image_retry_queue for entries
    Expected Result: Entries created, no duplicates
    Evidence: .sisyphus/evidence/task-8-backfill-report.json
  ```

  **Commit**: YES
  - Message: `feat(backfill): enhance backfill script with retry queue integration`
  - Files: `apps/web/scripts/backfill-login-protected-images-logic.ts`
  - Pre-commit: Script runs without errors

- [x] 9. Add Comprehensive Tests for All Failure Scenarios

  **What to do**:
  - Create test file `apps/web/lib/scraper-callback/__tests__/image-retry-flow.test.ts`
  - Test scenarios:
    1. **Success path**: Image captured → uploaded → stored
    2. **Auth failure**: 401 → queued → re-login → retry → success
    3. **Permanent failure**: 404 → queued → marked failed (no retry)
    4. **Timeout**: Timeout → queued → retry with backoff → success
    5. **CORS**: CORS blocked → queued → retry → fail permanently
    6. **Partial product**: 3 images succeed, 2 fail → entire product marked for retry
    7. **Concurrent retry**: Two jobs retry same image → no duplicates
    8. **Circuit breaker**: Many failures → circuit opens → stops retrying
  - Mock scraper API, Supabase storage, and browser persistence
  - Test both Python scraper tests and TypeScript web app tests

  **Must NOT do**:
  - Don't skip any failure scenarios
  - Don't rely on external services in tests (mock everything)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Reason: Comprehensive test suite for complex retry logic

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all previous tasks)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T1-T8

  **References**:
  - All files from T1-T8
  - Existing test patterns in codebase

  **Acceptance Criteria**:
  - [ ] All 8 test scenarios pass
  - [ ] 90%+ code coverage for new logic
  - [ ] Tests run in CI without external dependencies

  **QA Scenarios**:
  ```
  Scenario: All failure scenarios tested
    Tool: Bash (jest)
    Steps:
      1. Run `bun test apps/web/lib/scraper-callback/__tests__/image-retry-flow.test.ts`
    Expected Result: All 8 scenarios pass, coverage >= 90%
    Evidence: .sisyphus/evidence/task-9-test-coverage.log
  ```

  **Commit**: YES
  - Message: `test(retry): add comprehensive tests for all image retry scenarios`
  - Files: `apps/web/lib/scraper-callback/__tests__/image-retry-flow.test.ts` (new)
  - Pre-commit: `bun test apps/web/lib/scraper-callback/__tests__/image-retry-flow.test.ts --coverage`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

```
Commit 1: feat(db): add image_retry_queue table for failed image capture retries
Commit 2: feat(scraper): add scroll, retry, and error metadata to image capture
Commit 3: feat(types): add image capture error classification utilities
Commit 4: feat(storage): enqueue upload failures instead of dropping
Commit 5: feat(retry): add image retry job processor with circuit breaker
Commit 6: feat(auth): add re-authentication flow for 401 image errors
Commit 7: feat(detection): add ongoing 404 detection with auto-re-scrape
Commit 8: feat(backfill): enhance backfill script with retry queue integration
Commit 9: test(retry): add comprehensive tests for all image retry scenarios
```

---

## Success Criteria

### Verification Commands
```bash
# Database migration
bun run supabase db reset
bun run supabase db diff

# Type checking
bun run tsc --noEmit

# Linting
bun run web lint

# Tests
bun test apps/web/lib/scraper-callback/__tests__/image-retry-flow.test.ts --coverage
python -m pytest apps/scraper/tests/ -v

# Integration test
bun run web test:integration
```

### Final Checklist
- [ ] All 9 tasks completed
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (90%+ coverage)
- [ ] All evidence files captured
- [ ] Final verification wave APPROVED
- [ ] User explicit "okay" obtained
