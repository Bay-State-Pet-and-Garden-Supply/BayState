# Phase 1 - Auth-Images Durable Pipeline: Implementation Report

## Summary

Implemented Phase 1 of the auth-images plan to fix login-protected distributor image durability. The root cause was that successful authenticated capture dicts in `build_nested_product_facts()` were emitting the private vendor `original_url` instead of the captured `data_url`, causing the web callback to persist broken vendor URLs instead of uploading to durable Supabase Storage.

## Changes Made

### 1. Bugfix: `apps/scraper/scrapers/ai_search/enrichment_models.py`
- **`build_nested_product_facts()`**: Image dict handling now checks `status` field:
  - `status == "success"` + `data_url` → emits `data_url` as `MediaData.url` (not `original_url`)
  - `status == "error"` → **skipped entirely** (no private URL leakage)
  - Plain dict (no `status`) → uses `original_url` then `data_url` fallback (backward compatible)
- Impact: Successful authenticated captures now flow through as inline data URLs → `replaceInlineImageDataUrls()` uploads to durable Supabase Storage. Errored captures don't leak vendor URLs.

### 2. Scraper Tests: `apps/scraper/tests/unit/test_approved_sources_result_builder.py`
- Added `test_success_capture_preserves_data_url_in_media()` — asserts `product.media[0].url` starts with `data:image/` for successful capture dicts
- Added `test_error_capture_does_not_leak_original_url()` — asserts errored capture dicts are skipped, `product.media` contains only the successful entry, and `evidence.selected_images` is clean

### 3. Web Callback Test: `apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts`
- Extended `createMockSupabase()` with `storage.from().upload()`, `getPublicUrl()`, and `image_retry_queue` support
- Added `replaces inline image data URLs in source_results with durable Supabase storage URLs` test — proven that `replaceInlineImageDataUrls()` converts nested `data:image` URLs to `/storage/v1/object/public/product-images/...` URLs during callback processing

### 4. Durable URL Recognition: `apps/web/lib/product-image-storage.ts`
- Added `getConfiguredPublicBaseUrl()` — reads `PRODUCT_IMAGE_PUBLIC_BASE_URL` env var
- Updated `isProductImageStorageUrl()` — also recognizes URLs matching the configured public base URL (R2/custom CDN prep)

### 5. Scraper Durable URL: `apps/scraper/scrapers/approved_sources/image_capture.py`
- Updated `is_durable_image_url()` — recognizes `PRODUCT_IMAGE_PUBLIC_BASE_URL` env var for future R2/custom base URLs
- Prevents re-capture of already-durable images when R2 URLs are in use

### 6. Scraper Tests: `apps/scraper/tests/unit/test_image_capture.py`
- Added `test_is_durable_image_url_custom_public_base()` — proves R2/custom base URL detection works
- Added `test_is_durable_image_url_custom_public_base_unset()` — proves detection absent when env unset

### 7. Backfill Fix: `apps/web/scripts/backfill-login-protected-images-logic.ts`
- Added `resolveLoginProtectedSlugsFromCatalog()` — derives auth-required slugs from `FIXED_DISTRIBUTOR_CATALOG` (`requiresAuth: true`), no local YAML dependency
- Updated `runLoginProtectedImageBackfill()` — uses catalog as primary slug source, YAML configs as fallback
- Fixed cwd assumptions — `loadScraperConfigs()` now tries multiple path resolutions including `import.meta.url`-relative paths
- Added console output showing which slugs were resolved from catalog vs YAML

### 8. Backfill Tests: `apps/web/__tests__/scripts/backfill-login-protected-images.test.ts`
- Added `resolves login-protected slugs from distributor catalog` test — verifies `phillips`, `orgill`, `pet_food_experts` are detected, `bradley`, `amazon`, `chewy` are not

### 9. Documentation: `apps/web/scripts/README.md`
- Updated backfill section with correct script name (`backfill-login-protected-images-logic.ts`)
- Added options table
- Added ⚠️ warning that `image_retry_queue` has no consumer — script is data-preparation, not a complete fix

### 10. Progress: `progress.md`
- Updated with Phase 1 auth-images completion

## Validation Results

### Scraper Unit Tests
```bash
$ python3 -m pytest tests/unit/test_image_capture.py tests/unit/test_approved_sources_result_builder.py tests/unit/test_approved_sources_adapter_fixtures.py -q
```
**49 passed, 6 skipped** — all existing + new tests pass

### Web Unit Tests
```bash
$ node scripts/run-jest.cjs --testPathPatterns="__tests__/app/api/scraper/v1/...|__tests__/scripts/...|lib/__tests__/product-image-storage.test.ts"
```
**17 passed, 0 failed** — all callback, backfill, and image storage tests pass

### TypeScript Typecheck
```bash
$ bun run typecheck
```
**Clean** — no errors

## Changed Files

| File | Change |
|------|--------|
| `apps/scraper/scrapers/ai_search/enrichment_models.py` | Bugfix: image dict handling prefers `data_url` for success, skips errored captures |
| `apps/scraper/tests/unit/test_approved_sources_result_builder.py` | Added 2 regression tests for capture-result mapping |
| `apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts` | Extended mock supabase + added durable URL replacement test |
| `apps/web/lib/product-image-storage.ts` | Added configurable R2/custom base URL recognition |
| `apps/scraper/scrapers/approved_sources/image_capture.py` | Added configurable durable URL recognition |
| `apps/scraper/tests/unit/test_image_capture.py` | Added 2 tests for custom durable base URL |
| `apps/web/scripts/backfill-login-protected-images-logic.ts` | Catalog-based slug resolution, fixed cwd paths, added merge logic |
| `apps/web/__tests__/scripts/backfill-login-protected-images.test.ts` | Added catalog slug resolution test |
| `apps/web/scripts/README.md` | Updated script name, options, and retry-queue warning |
| `progress.md` | Updated with Phase 1 completion |

## Residual Risks

1. **`image_retry_queue` has no consumer** — Entries go in but never come out. A retry queue worker or re-enrichment flow is needed before queue-based retry works. Documented in README.

2. **Sharp processing in test environment** — The `replaceInlineImageDataUrls()` function uses Sharp which may need native bindings in CI. Test observed to work with small PNG but CI environments may need `sharp` prebuilt binaries.

3. **R2 provider not built** — The `PRODUCT_IMAGE_PUBLIC_BASE_URL` env var is recognized for durable URL detection but no upload provider exists yet. Phase 2 should add the provider interface.

4. **No re-enrichment backfill path** — Phase 1 fixes the pipeline for new captures. Existing broken rows need a separate re-enrichment pass (planned as Phase 1 Task 6 in the plan but deferred due to scope).

5. **Callback test doesn't verify `upload()` call count** — Due to Jest pretty-format version compatibility issue with `toHaveBeenCalledTimes` on spy functions. The URL transformation assertion (data URL → Supabase URL) validates the behavior correctly.

## Recommended Next Steps (Phase 2)

1. Build the `image_retry_queue` consumer or wire re-enrichment backfill
2. Extract storage provider interface and add R2/S3-compatible implementation
3. Run live Phillips smoke test with distributor credentials
4. Backfill existing broken rows with `distributor_only` enrichment jobs
