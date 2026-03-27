## 2026-03-26 - Task 2 image handler

- Added lazy-load priming directly in page-side capture script using configurable `SCROLL_STEP_PX` and `SCROLL_WAIT_MS` before image fetch attempts.
- Kept non-login flow unchanged; login-required flow now stores structured capture metadata in `ctx.results["<field>_capture_metadata"]` while preserving `ctx.results[field]` as successful image URLs.
- Added compatibility normalization for legacy evaluate payloads that still return `{error, data_url}` so existing tests/callers do not break during transition.

## 2026-03-26 - Task 4 storage retry queue

-  now returns , so callers can persist transformed data and still inspect which protected images were queued for retry.
- Upload failures only enqueue retries when an original protected URL is available from scraper metadata; otherwise the helper preserves the previous inline-data fallback for backward compatibility.
- Pending retry image markers use  so product data keeps a non-secret placeholder string that survives existing source normalization.

## 2026-03-26 - Task 4 storage retry queue

- replaceInlineImageDataUrls() now returns { value, queuedImages }, so callers can persist transformed data and still inspect which protected images were queued for retry.
- Upload failures only enqueue retries when an original protected URL is available from scraper metadata; otherwise the helper preserves the previous inline-data fallback for backward compatibility.
- Pending retry image markers use pending_retry://<error_type>/<hash> so product data keeps a non-secret placeholder string that survives existing source normalization.

## 2026-03-26 - Task 5 retry processor

- Added `ImageRetryProcessor` with `pollAndProcess()` using `get_pending_image_retries(10)` and async bounded concurrency so retries are processed off the callback path.
- Implemented per-domain in-memory circuit breaker (5 failures in 60s opens for 5 minutes) with explicit logging and deferred scheduling when open.
- Retry failure handling now increments `retry_count`, uses `getRetryDelay(errorType, retryCount)` for `scheduled_for`, and hard-fails non-retryable `not_found_404` cases.

## 2026-03-26 - Task 6 re-authentication flow

- `ImageRetryProcessor` now reloads scraper YAML config from `scraper_configs.file_path`, so auth retries can recover `base_url`/`requires_login` even though those fields were removed from the DB table.
- Auth retry state is serialized into `last_error` with a stable prefix and JSON payload, which preserves `reloginAttempts` and `sessionExpiresAt` without needing a schema change.
- Expired or unknown browser sessions trigger a re-login before retrying capture, and repeated `auth_401` responses can force one more re-login inside the same processor pass before the job is failed permanently.

## 2026-03-26 - Task 7 ongoing 404 detection

- Frontend-side 404 recovery works cleanly as a fire-and-forget `fetch()` from `onError`, so the admin UI never waits on retry queue writes.
- Reusing retry-target resolution from `image-retry-processor.ts` lets the new API verify `requires_login` against the same scraper YAML metadata used by the backend processor.
- A module-level in-memory timestamp map is enough to debounce duplicate browser retry triggers for the same `product_id:image_url` pair across re-renders.

## 2026-03-26 - Task 8 backfill retry queue integration

- A reliable non-durable backfill scan can combine scraper login metadata (from local YAML) with per-source `requires_login=true` flags in `products_ingestion.sources` to avoid missing protected sources.
- Batch pagination with `range(offset, offset + batchSize - 1)` keeps memory stable and gives deterministic 100/100/50 style progress logs for large backfills.
- Retry queue insertion is safest when it first checks existing `(product_id, image_url)` rows and then performs insert; this keeps the script idempotent across repeated runs.

- 2026-03-26:  reaches 17 passing cases with fully mocked storage, scraper capture, and browser-session persistence, so the retry flow stays CI-safe and network-independent.
- 2026-03-26: Duplicate retry inserts can happen when the same failed image is traversed concurrently; guarding  with an in-flight promise cache removes duplicate queue rows without changing marker output.
- 2026-03-26: apps/web/lib/scraper-callback/__tests__/image-retry-flow.test.ts now covers 8 required scenarios plus helper-path assertions, and the mock-only suite passes without reaching external services.
- 2026-03-26: Using an in-flight promise cache inside apps/web/lib/product-image-storage.ts prevents duplicate image_retry_queue inserts when identical failures are traversed concurrently.


- Compliance audit: core retry queue, storage handling, backfill, and retry processor files exist, but plan/evidence alignment is incomplete.
