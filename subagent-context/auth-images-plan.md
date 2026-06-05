# Implementation Plan

## Goal
Make login-protected distributor images (Phillips/Orgill/Pet Food Experts) persist as durable BayState-owned image URLs so later admin/storefront access never depends on vendor credentials.

## Recommendation Summary

**Best immediate direction: introduce a storage abstraction with a phased R2 rollout, but keep the existing Supabase `product-images` bucket as the active provider for Phase 1.**

R2 is a good long-term home for high-read product images because it has S3-compatible APIs, Cloudflare delivery, and no egress fees. However, switching to R2 immediately is not the fastest fix for the current repo because the likely failure is upstream of storage: authenticated image captures are being converted back into vendor URLs before the web callback can upload them. `apps/web/lib/product-image-storage.ts` already knows how to upload inline `data:image/...` payloads to durable storage and is already wired into the enrichment callback. The fastest, lowest-risk fix is to restore/preserve those data URLs through the scraper result contract, validate that Supabase uploads happen, then add a provider seam so R2 can be enabled with configuration after the current path is correct.

## Why This Tradeoff Fits This Repo

- The current web tier already has a durable upload pipeline: `apps/web/lib/product-image-storage.ts` parses inline image data, normalizes with Sharp, uploads to Supabase Storage bucket `product-images`, and returns public URLs.
- The likely root bug is in `apps/scraper/scrapers/ai_search/enrichment_models.py`: `build_nested_product_facts()` currently prefers `img.original_url` over `img.data_url` for dict image entries. For authenticated captures, this turns a successful browser-captured data URL back into the private vendor URL.
- `apps/scraper/scrapers/approved_sources/image_capture.py` already captures protected images inside the authenticated Playwright session. We should preserve that work rather than add R2 first.
- `image_retry_queue` exists but no runtime code processes it. Relying on that queue for the near-term fix would leave entries pending forever.
- Direct scraper-to-R2 upload would require distributing R2 credentials or adding presigned upload endpoints. That is viable later, but it expands the security/ops surface before fixing the current data-flow bug.
- R2 still makes sense as Phase 2 once the canonical durable-image path is passing tests; the abstraction should keep Supabase as default and allow R2 by env/config.

## Tasks

1. **Fix scraper mapping so successful authenticated captures use `data_url`, not `original_url`**
   - File: `apps/scraper/scrapers/ai_search/enrichment_models.py`
   - Changes:
     - In `build_nested_product_facts()`, update the image loop so dict entries with `status == "success"` and a non-empty `data_url` emit that `data_url` as `MediaData.url`.
     - Only use `original_url` for plain/non-capture metadata that does not contain `data_url` or capture status.
     - Do not emit private vendor URLs for capture error objects; skip errored capture entries from `media` unless/until retry handling is implemented.
     - Ensure `EvidenceData.selected_images` mirrors the resulting durable-candidate URLs and does not include protected vendor URLs from capture errors.
   - Acceptance:
     - A result built from `product_fields={"image_urls": [{"status":"success","data_url":"data:image/...","original_url":"https://shop.phillipspet.com/..."}]}` serializes with `product.media[0].url` starting with `data:image/`.
     - An errored capture object with only `original_url` does not leak that private URL into `product.media`.

2. **Add scraper-side regression tests for capture-result mapping**
   - File: `apps/scraper/tests/unit/test_approved_sources_result_builder.py`
   - Changes:
     - Add a success test proving `build_success_result()` preserves `data_url` in nested `product.media` when `image_urls` entries are capture-result dicts.
     - Add an error/leak-prevention test proving errored capture dicts do not become private vendor media URLs.
     - Optionally add the same coverage for `build_partial_result()` if distributor partials can still include images.
   - Acceptance:
     - The new tests fail before Task 1 and pass after Task 1.

3. **Verify web callback uploads nested media data URLs to durable storage**
   - File: `apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts`
   - Changes:
     - Extend the mock Supabase client with `storage.from('product-images').upload()` and `getPublicUrl()` support.
     - Add a callback test for a successful distributor result whose nested `product.media[0].url` is an inline data URL.
     - Assert persisted `products_ingestion.sources.enriched.images`/`image_urls` and `sources.<sourceSlug>.media` (or equivalent nested shape) contain a `/storage/v1/object/public/product-images/` URL, not `data:image` and not `shop.phillipspet.com`.
   - Acceptance:
     - The callback test proves the existing `replaceInlineImageDataUrls()` path handles the fixed scraper output.

4. **Make durable-reference detection ready for R2 without switching providers yet**
   - Files:
     - `apps/web/lib/product-image-storage.ts`
     - `apps/web/scripts/backfill-login-protected-images-logic.ts`
     - `apps/scraper/scrapers/approved_sources/image_capture.py`
   - Changes:
     - Centralize/configure durable URL recognition to include current Supabase URLs and an optional R2/custom CDN base URL (for example `PRODUCT_IMAGE_PUBLIC_BASE_URL` / `R2_PUBLIC_BASE_URL`).
     - Keep Supabase URLs recognized for backward compatibility.
     - In scraper `is_durable_image_url()`, recognize R2/custom-domain URLs so future reruns do not try to re-fetch BayState-owned images as vendor images.
   - Acceptance:
     - Existing Supabase durable URL tests still pass.
     - New tests can mark an R2/custom-domain URL as durable without enabling R2 upload.

5. **Fix the login-protected image backfill detector so it does not depend on nonexistent local YAML**
   - Files:
     - `apps/web/scripts/backfill-login-protected-images-logic.ts`
     - `apps/web/__tests__/scripts/backfill-login-protected-images.test.ts`
     - `apps/web/scripts/README.md`
   - Changes:
     - Derive auth-required distributor slugs from `FIXED_DISTRIBUTOR_CATALOG` in `apps/web/lib/approved-sources/distributor-catalog.ts` (`phillips`, `orgill`, `pet_food_experts`, and aliases) instead of relying only on `apps/scraper/scrapers/configs`, which is absent in the current repo.
     - Fix cwd assumptions in the script/README; current code joins `process.cwd()` with `apps/scraper/...`, while README says to run from `apps/web`.
     - Make dry-run behavior explicit and safe. Do not encourage `--execute` as a complete fix while `image_retry_queue` has no consumer.
   - Acceptance:
     - Unit tests cover catalog-derived login-protected slugs.
     - Dry-run scans find existing private URLs under known login-protected source names.
     - Documentation warns that queueing retries alone does not resolve images until a retry/re-enrichment worker exists.

6. **Add Phase 1 operational backfill path: re-run distributor extraction for affected UPC/source pairs**
   - Files likely to modify or add:
     - `apps/web/scripts/backfill-login-protected-images-logic.ts` (or new `apps/web/scripts/rescrape-login-protected-images.ts`)
     - `apps/web/app/api/admin/enrichment/jobs/route.ts` only if shared enqueue helpers are extracted/reused
     - Potential shared helper: `apps/web/lib/enrichment/enqueue-job.ts` if route logic needs reuse outside HTTP
   - Changes:
     - Prefer re-enrichment over dead `image_retry_queue` consumption for Phase 1 backfill.
     - For rows with private login-protected image URLs, create distributor-only enrichment jobs/attempts with `selectedDistributorSlug` or source plans for that source, using the same schema path as `apps/web/app/api/admin/enrichment/jobs/route.ts`.
     - Provide `--dry-run`, `--execute`, `--upc`, `--source`, `--limit`, and batch-size options.
     - Keep existing product rows in `extracting` only when execute mode actually enqueues jobs.
   - Acceptance:
     - Dry-run reports UPC/source/image counts.
     - Execute mode inserts `enrichment_jobs` and `enrichment_attempts` for targeted UPCs in `distributor_only` mode.
     - No scraper direct DB access is introduced.

7. **Introduce the storage provider abstraction for R2 rollout**
   - Files to modify:
     - `apps/web/lib/product-image-storage.ts`
     - `apps/web/package.json`
     - `bun.lock` / lockfile if dependency install updates it
   - New files:
     - `apps/web/lib/product-image-storage-provider.ts` (or `apps/web/lib/storage/product-image-store.ts`) - interface and provider selection.
     - `apps/web/lib/product-image-storage-r2.ts` - R2/S3-compatible implementation.
     - `apps/web/lib/product-image-storage-supabase.ts` - Supabase implementation extracted from current function.
     - `apps/web/lib/__tests__/product-image-storage-provider.test.ts` - provider selection/unit tests.
   - Changes:
     - Define an interface like `uploadProductImage({ path, bytes, contentType, cacheControl }): Promise<{ publicUrl: string; storagePath: string; provider: 'supabase' | 'r2' }>`.
     - Keep Supabase as default when no R2 env is configured.
     - Add R2 provider using S3-compatible APIs (`@aws-sdk/client-s3` or a minimal signed `fetch` implementation; AWS SDK is simpler and safer).
     - Configure with env such as `PRODUCT_IMAGE_STORAGE_PROVIDER=supabase|r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `R2_PUBLIC_BASE_URL`/custom domain.
     - Continue Sharp processing and deterministic hash paths before provider upload so URLs remain stable.
   - Acceptance:
     - Existing `replaceInlineImageDataUrls()` tests pass unchanged with default Supabase provider.
     - R2 provider unit tests mock S3 `PutObjectCommand` and assert correct bucket/key/content-type/cache-control and public URL construction.

8. **Optional later optimization: direct or presigned scraper uploads**
   - Files likely to modify:
     - `apps/web/app/api/scraper/v1/*` or a new scraper-authenticated presign endpoint
     - `apps/scraper/scrapers/approved_sources/image_capture.py`
     - `apps/scraper/core/api_client.py`
   - Changes:
     - Add a web API endpoint that authenticated runners can call to get a presigned R2 PUT URL or to POST image bytes/data URLs for server-side upload.
     - Keep raw R2 credentials in the web coordinator, not in the scraper runner, unless explicitly approved.
   - Acceptance:
     - Runner uploads never expose vendor credentials to clients.
     - Runner still uses `X-API-Key: bsr_*` to talk to the web coordinator and does not get DB credentials.

## Files to Modify

### Phase 1 (recommended first implementation)
- `apps/scraper/scrapers/ai_search/enrichment_models.py` - preserve authenticated capture `data_url` through product facts and prevent private URL leakage from capture errors.
- `apps/scraper/tests/unit/test_approved_sources_result_builder.py` - regression tests for capture-result mapping.
- `apps/web/__tests__/app/api/scraper/v1/enrichment-callback-route.test.ts` - callback-level durable upload regression test.
- `apps/web/lib/product-image-storage.ts` - add configurable durable URL recognition in preparation for R2 (no provider switch yet).
- `apps/web/scripts/backfill-login-protected-images-logic.ts` - fix login-protected source detection and safe dry-run/backfill behavior.
- `apps/web/__tests__/scripts/backfill-login-protected-images.test.ts` - cover catalog-derived login-protected detection and dry-run behavior.
- `apps/web/scripts/README.md` - correct commands and document that queue-only retry is not a full fix.
- `apps/scraper/scrapers/approved_sources/image_capture.py` - recognize configured durable public image base URLs once R2/custom domains are introduced.
- `apps/scraper/tests/unit/test_image_capture.py` - durable URL recognition coverage for R2/custom public base.

### Phase 2 (R2 provider rollout)
- `apps/web/lib/product-image-storage.ts` - route uploads through provider interface.
- `apps/web/package.json` - add AWS SDK dependencies if using `@aws-sdk/client-s3`.
- `bun.lock` - update after dependency install.
- `apps/web/next.config.ts` - optionally add the R2 custom image hostname if `next/image` strict hostname handling is tightened later (currently `hostname: "**"` allows all HTTPS images).

## New Files

- `apps/web/lib/product-image-storage-provider.ts` - provider interface and environment-based provider selection.
- `apps/web/lib/product-image-storage-supabase.ts` - extracted current Supabase upload implementation.
- `apps/web/lib/product-image-storage-r2.ts` - Cloudflare R2/S3-compatible upload implementation.
- `apps/web/lib/__tests__/product-image-storage-r2.test.ts` - R2 provider unit tests.
- Optional: `apps/web/lib/enrichment/enqueue-job.ts` - shared job enqueue helper extracted from `apps/web/app/api/admin/enrichment/jobs/route.ts` for scripts/backfills.
- Optional: `apps/web/scripts/rescrape-login-protected-images.ts` - explicit re-enrichment backfill script if modifying the existing backfill script would blur queue vs re-scrape responsibilities.

## Validation

Run focused checks before any live scrape:

```bash
cd apps/scraper
python -m pytest tests/unit/test_image_capture.py tests/unit/test_approved_sources_result_builder.py tests/unit/test_approved_sources_adapter_fixtures.py -q
```

```bash
cd apps/web
bun run test -- __tests__/lib/product-image-storage.test.ts __tests__/app/api/scraper/v1/enrichment-callback-route.test.ts __tests__/scripts/backfill-login-protected-images.test.ts
bun run typecheck
```

If R2 provider is added:

```bash
cd apps/web
bun run test -- __tests__/lib/product-image-storage.test.ts __tests__/lib/product-image-storage-r2.test.ts
```

If live distributor credentials are available, run a Phillips smoke after unit tests:

```bash
cd apps/scraper
python -m pytest tests/live/test_approved_sources_login_live.py -k phillips -q
```

Then verify with a real enrichment callback/job:

1. Run a Phillips `distributor_only` enrichment for one known UPC.
2. Inspect `products_ingestion.sources` for that UPC.
3. Acceptance: no `shop.phillipspet.com` image URLs remain in `sources.phillips`, `sources.enriched.images`, or selected/consolidated image arrays for successful captures; images should be Supabase/R2 durable URLs.
4. Acceptance: no `pending_retry://` marker is presented as a selectable image in admin UI unless explicitly labeled as pending/unavailable.

## Backfill / Migration Considerations

- **Already-broken rows should be re-enriched, not just queued into `image_retry_queue`, until a consumer exists.** The queue currently has no runtime worker, so executing the existing backfill script only creates pending records and does not repair product sources.
- Start with a dry-run that identifies login-protected private image URLs by source slug/domain:
  - `phillips`: `shop.phillipspet.com`, `d56ygyjv466yj.cloudfront.net`
  - `orgill`: `orgill.com`
  - `pet_food_experts`: `orders.petfoodexperts.com`, `petfoodexperts.com`, `cdn.insitecloud.net`
- For each affected UPC/source, enqueue a `distributor_only` enrichment job using the existing enrichment job/attempt schema so the scraper logs in, captures images, and posts a fresh callback through the fixed path.
- Keep old Supabase Storage URLs valid indefinitely during R2 rollout; do not rewrite them unless/until a separate migration is planned.
- If migrating Supabase objects to R2 later, use a dual-read/durable detection period:
  1. Keep Supabase provider default.
  2. Enable R2 for new uploads only.
  3. Recognize both Supabase and R2 URLs as durable.
  4. Optionally copy old Supabase `product-images` objects to R2 via Cloudflare Super Slurper/rclone.
  5. Rewrite stored URLs only after confirming copied object parity.

## Dependencies

- Task 2 depends on Task 1.
- Task 3 depends on Task 1 because the callback test should use the fixed scraper output shape.
- Task 5 can run in parallel with Tasks 1-3, but execute-mode backfill should wait until Tasks 1-3 pass.
- Task 6 depends on Task 5 and the existing enrichment job route/schema.
- Task 7 should wait until Phase 1 happy-path upload is proven, otherwise R2 may mask the real bug.
- Task 8 depends on Task 7 and requires an explicit security decision about whether runners may receive R2 credentials or must use web-issued presigned upload URLs.

## Risks

- **Contract drift between Python Pydantic and TypeScript Zod**: If Python adds fields to carry capture metadata, `apps/web/lib/enrichment/validation.ts` and `apps/web/lib/enrichment/contracts.ts` must be updated together.
- **Private URL leakage**: Any fallback that uses `original_url` for capture-result dicts can reintroduce the bug. Tests should assert that protected domains do not appear in persisted source images.
- **Retry queue dead letters**: `image_retry_queue` should not be treated as a complete remediation path until a worker exists.
- **R2 access model not yet chosen**: Need decide public custom domain vs presigned GETs vs Cloudflare Access/Worker gate. Product/storefront images likely benefit from public custom domain + CDN; internal-only distributor assets may need session-gated/presigned delivery.
- **R2 credentials in scraper**: Direct scraper uploads are simpler operationally but conflict with the repo's coordinator-runner boundary if not carefully designed. Prefer web-side upload or web-issued presigned PUT URLs.
- **Image size limits**: Scraper capture rejects images >5MB. Large vendor images may still fail until limits/processing strategy are revisited.
- **Backfill volume**: Re-enriching many UPCs against login-protected vendors can trigger throttling/session issues. Use small batches and source-specific concurrency controls.
- **Missing env docs**: The web app does not appear to have a committed `.env.local.example`; R2 env requirements need a safe documentation location before rollout.
