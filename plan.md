# Implementation Plan

## Goal
Harden the login-protected image pipeline so authenticated vendor image URLs are captured as bytes, persisted to durable public storage, retried with correct login semantics, and prevented from escaping as final product image references.

## Tasks

1. **Create shared TypeScript login-detection helper** _(complexity: small)_
   - File: `apps/web/lib/scraper-config-login.ts`
   - Changes:
     - Add an exported `scraperConfigRequiresLogin(config: unknown): boolean` helper.
     - Treat these as login-required:
       - `requires_login === true`
       - `login` is a non-null object
       - any `workflows[]` step whose `action` or JSON-serialized `params` contains one of: `login`, `authenticate`, `sign_in`, `signin`, `password`, `username`.
     - Keep helper defensive for malformed YAML/DB config objects.
   - Tests:
     - New file: `apps/web/lib/__tests__/scraper-config-login.test.ts`
     - Cover `petfoodex.yaml` style config with `login:` but no `requires_login`.
     - Cover workflow-keyword-only login.
     - Cover explicit `requires_login: true`.
     - Cover non-login scraper returns false.
   - Acceptance:
     - `bun run web test -- lib/__tests__/scraper-config-login.test.ts`

2. **Use shared login detection in retry target resolution** _(complexity: small)_
   - File: `apps/web/lib/scraper-callback/image-retry-processor.ts`
   - Changes:
     - Import `scraperConfigRequiresLogin` from `@/lib/scraper-config-login`.
     - Expand `ScraperYamlConfig` to include `login?: unknown`, `workflows?: unknown`, and `requires_login?: boolean`.
     - Replace `requiresLogin: Boolean(parsed.requires_login)` with `requiresLogin: scraperConfigRequiresLogin(parsed)` in `loadScraperRuntimeConfig()`.
     - Keep base URL matching behavior unchanged.
   - Tests:
     - Modify `apps/web/lib/scraper-callback/__tests__/image-retry-processor.test.ts`.
     - Add/adjust a test where the matched scraper YAML has a `login:` block but no `requires_login`; expected `resolveImageRetryTarget(...).requiresLogin === true` and auth refresh/relogin code paths are reachable for `auth_401` retry entries.
   - Acceptance:
     - Existing retry processor tests pass.
     - PetFoodEx-style config no longer resolves to `requiresLogin: false`.

3. **Remove duplicate backfill login detection and fix queued error type** _(complexity: small)_
   - File: `apps/web/scripts/backfill-login-protected-images-logic.ts`
   - Changes:
     - Import and use `scraperConfigRequiresLogin` from `../lib/scraper-config-login`.
     - Remove the local duplicate login-detection function, or keep only a thin wrapper if needed for test exports.
     - For login-protected non-durable URLs queued by backfill, set `error_type: 'auth_401'` instead of `not_found_404` so retry processing can refresh/relogin instead of treating the URL as a permanent missing asset.
     - Keep durable reference filtering unchanged: data URLs and `product-images` storage URLs should not be queued.
   - Tests:
     - Modify `apps/web/__tests__/scripts/backfill-login-protected-images.test.ts`.
     - Add/adjust assertions that PetFoodEx-style configs are detected and queued entries use `auth_401`.
   - Acceptance:
     - `bun run web test -- __tests__/scripts/backfill-login-protected-images.test.ts`

4. **Fix admin manual retry semantics** _(complexity: small)_
   - File: `apps/web/app/api/admin/scraping/retry-image/route.ts`
   - Changes:
     - Keep relying on `resolveImageRetryTarget()`; after Task 2 this will correctly identify login-required scrapers.
     - When `target.requiresLogin` is true, enqueue/update manual retry rows with `error_type: 'auth_401'` instead of `not_found_404`.
     - Preserve current `202` behavior for non-login sources: accepted but not queued.
   - Tests:
     - Modify `apps/web/__tests__/api/admin/scraping/retry-image.test.ts`.
     - Assert login-protected manual retry inserts/updates `auth_401`.
     - Assert non-login source still returns `{ accepted: true, queued: false }`.
   - Acceptance:
     - `bun run web test -- __tests__/api/admin/scraping/retry-image.test.ts`

5. **Add callback/storage persistence regression coverage** _(complexity: medium)_
   - File: `apps/web/lib/__tests__/product-image-storage.test.ts`
   - Changes:
     - Add a regression test for a source payload containing:
       - a successful scraper image capture result object with `status: 'success'`, `data_url`, and `original_url`.
       - a failed capture result object with `status: 'error'`, `error_type: 'auth_401'`, and `original_url`.
     - Expected behavior from `replaceInlineImageDataUrls()`:
       - success becomes a public Supabase `product-images` URL.
       - failure becomes a `pending_retry://auth_401/...` marker and inserts into `image_retry_queue`.
       - no protected vendor URL is returned as a final image value except inside retry queue metadata/`image_url`.
   - Optional integration file if existing mocks are better suited: `apps/web/__tests__/lib/scraper-callback/products-ingestion-callback.test.ts`
   - Acceptance:
     - `bun run web test -- lib/__tests__/product-image-storage.test.ts`

6. **Harden scraper authenticated image capture primary path** _(complexity: medium)_
   - File: `apps/scraper/scrapers/actions/handlers/image.py`
   - Changes:
     - Add Python-side URL normalization using the current page URL, e.g. `urllib.parse.urljoin(page.url, raw_url)`, before attempting capture.
     - Ensure every capture metadata `original_url` for HTTP(S) images is absolute, including failures.
     - Add a Playwright authenticated request capture path as the primary attempt:
       - Use the active page or browser context request object (`page.request` or `page.context.request`) so cookies/session state are shared.
       - Send image-friendly headers: `referer: page.url`, `accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8`.
       - Use existing `FETCH_TIMEOUT_MS` and `fail_on_status_code=False` if supported by the Playwright Python API.
       - On 401/403 classify as `auth_401`; 404 as `not_found_404`; timeout/network as `network_timeout`; unexpected non-image content as `cors_blocked` or `unknown`.
       - Convert successful response bytes to `data:<content-type>;base64,...`.
     - Keep current browser-side `fetch(..., { credentials: 'include' })` implementation as fallback when the primary request path fails because of network/CORS/browser-header quirks.
     - Do not return raw protected URLs as successful `data_url` values for login-required scrapers. If no page/authenticated context is available, return structured errors for those images instead of `_build_success_result(url)`.
     - If adding `unknown` as a Python-side `error_type`, update the `ImageCaptureResult` TypedDict literal accordingly; web already has `unknown` in the `image_error_type` enum.
   - Tests:
     - Modify `apps/scraper/tests/unit/test_process_images_action.py`.
     - Add tests that:
       - login-required capture uses request-context response bytes and stores a data URL.
       - relative image URLs are recorded as absolute `original_url`.
       - request-context failure falls back to browser-side fetch.
       - missing page/context for login-required capture yields structured errors, not raw URL successes.
   - Acceptance:
     - `cd apps/scraper && pytest tests/unit/test_process_images_action.py`

7. **Confirm no protected vendor URL escapes from fresh login scrapes** _(complexity: small)_
   - Files:
     - `apps/scraper/tests/unit/test_process_images_action.py`
     - `apps/web/lib/__tests__/product-image-storage.test.ts`
   - Changes:
     - Add explicit regression assertions in the tests from Tasks 5 and 6:
       - For login-required process_images, `ctx.results[field]` contains only data URLs for successes, not `https://orders.petfoodexperts.com/...` URLs.
       - For callback/storage processing, returned source payload image fields contain storage URLs or pending retry markers, not protected vendor URLs.
   - Acceptance:
     - The focused scraper and web tests fail before the hardening changes and pass after.

8. **Audit production retry processor wiring** _(complexity: small investigation; implementation may be medium/large if missing)_
   - Files to inspect:
     - `apps/web/lib/scraper-callback/image-retry-processor.ts`
     - `apps/web/scripts/*`
     - `apps/web/app/api/**`
     - deployment/cron files if present.
   - Changes:
     - Search for non-test instantiations of `new ImageRetryProcessor()` and for a real `captureImage` implementation.
     - If a production worker exists, add/update a test or inline assertion that it supplies `captureImage` and does not rely on the throwing default.
     - If no production worker exists, do **not** silently claim retry recovery is complete. Record this as a follow-up implementation/design task because wiring real retry capture requires deciding how web invokes scraper-side authenticated capture in production.
   - Acceptance:
     - A worker can answer: “queued image retries are processed by `<file/job>` using `<captureImage implementation>`” or the gap is explicitly documented as unresolved.

9. **Run focused validation commands** _(complexity: small)_
   - Files: no code changes unless failures reveal test updates needed.
   - Commands:
     - `bun run web test -- lib/__tests__/scraper-config-login.test.ts lib/scraper-callback/__tests__/image-retry-processor.test.ts __tests__/scripts/backfill-login-protected-images.test.ts __tests__/api/admin/scraping/retry-image.test.ts lib/__tests__/product-image-storage.test.ts`
     - `cd apps/scraper && pytest tests/unit/test_process_images_action.py`
   - Acceptance:
     - All focused tests pass.
     - No new lint/type errors in changed TypeScript files.

## Files to Modify

- `apps/web/lib/scraper-callback/image-retry-processor.ts` - use shared YAML login detection; fix PetFoodEx-style `requiresLogin` resolution.
- `apps/web/scripts/backfill-login-protected-images-logic.ts` - use shared login detection; enqueue login-protected non-durable images with `auth_401`.
- `apps/web/app/api/admin/scraping/retry-image/route.ts` - enqueue/update manual login-protected retries with `auth_401`.
- `apps/web/lib/__tests__/product-image-storage.test.ts` - add durable persistence and retry marker regression coverage.
- `apps/web/lib/scraper-callback/__tests__/image-retry-processor.test.ts` - add retry target login detection coverage.
- `apps/web/__tests__/scripts/backfill-login-protected-images.test.ts` - update login detection/error type expectations.
- `apps/web/__tests__/api/admin/scraping/retry-image.test.ts` - update manual retry error type expectations.
- `apps/scraper/scrapers/actions/handlers/image.py` - add request-context primary capture, absolute `original_url`, fallback behavior, and no raw protected URL success for login-required capture.
- `apps/scraper/tests/unit/test_process_images_action.py` - add scraper capture hardening tests.

## New Files

- `apps/web/lib/scraper-config-login.ts` - shared TypeScript helper for login-required scraper config detection.
- `apps/web/lib/__tests__/scraper-config-login.test.ts` - unit tests for shared login detection helper.

## Dependencies

- Task 1 must happen before Tasks 2 and 3.
- Task 2 must happen before Task 4 can be fully trusted, because the admin route depends on `resolveImageRetryTarget()`.
- Tasks 2, 3, and 4 can run in parallel after Task 1.
- Task 5 can run after or alongside Tasks 2-4; it validates callback/storage behavior independent of retry target resolution.
- Task 6 is independent of TypeScript helper work but should be completed before claiming fresh scrape hardening is done.
- Task 7 depends on Tasks 5 and 6.
- Task 8 can run anytime, but any production retry implementation follow-up should wait until Tasks 1-6 define correct semantics.
- Task 9 runs last.

## Suggested Order of Execution

1. Task 1 - create shared login detection helper and tests.
2. Task 2 - wire helper into retry processor and add PetFoodEx-style retry tests.
3. Task 3 - wire helper into backfill and change queued error type to `auth_401`.
4. Task 4 - change admin manual retry error type to `auth_401`.
5. Task 5 - add callback/storage persistence regression coverage.
6. Task 6 - harden scraper request-context image capture and fallback behavior.
7. Task 7 - add explicit no-protected-URL escape assertions.
8. Task 8 - audit production retry worker wiring and document unresolved gap if absent.
9. Task 9 - run focused validation commands.

## Risks

- Fixing `Boolean(parsed.requires_login)` only repairs retry/manual/backfill login detection; it will not fix fresh scrape failures if scraper-side capture is failing before callback persistence.
- Playwright Python request APIs differ slightly by version. Implement primary request capture defensively (`page.request` vs `page.context.request`, supported keyword arguments) and cover with mocks.
- Browser-side `fetch(credentials: include)` can still fail due to CORS; request-context primary capture reduces this but screenshot fallback is intentionally out of scope for this focused hardening pass.
- Existing queued rows created with `not_found_404` may need migration or requeueing after code changes; this plan changes new rows but does not rewrite historical queue entries.
- `image_retry_queue` lacks explicit `scraper_slug`/`source_name`, so retry source matching remains brittle when only `pending_retry://` markers remain. Treat schema changes for that as a separate follow-up unless current tests prove it is blocking.
- No production `captureImage` wiring was found in the provided context. If Task 8 confirms it is absent, retry recovery remains operationally incomplete and needs a separate implementation/design decision.
