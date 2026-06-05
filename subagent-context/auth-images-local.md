# Authenticated Image Pipeline — Map & Analysis

## Files Examined

| File | Lines | Role |
|------|-------|------|
| `apps/scraper/scrapers/approved_sources/image_capture.py` | 1-155 | Scraper-side: captures protected images via Playwright page session, converts to data URLs |
| `apps/scraper/scrapers/approved_sources/adapters/base.py` | 1-820 | Base adapter with `extract()`, auth flow, and image capture integration (sec 6c) |
| `apps/scraper/scrapers/approved_sources/adapters/phillips.py` | 1-530 | Phillips-specific adapter: search, PDP enrichment, auth image capture |
| `apps/scraper/scrapers/approved_sources/auth.py` | 1-800+ | Login automation: `LoginAutomationConfig`, `ApprovedSourceLoginManager` |
| `apps/web/lib/product-image-storage.ts` | 1-420 | Web-side: durable upload of inline data URLs to Supabase Storage, retry queue fallback |
| `apps/web/lib/image-capture-errors.ts` | 1-65 | Classification helpers, retry limits per error type |
| `apps/web/app/api/scraper/v1/enrichment-callback/route.ts` | 1-300 | Callback endpoint triggers `replaceInlineImageDataUrls` on enriched sources |
| `apps/web/lib/scraper-callback/products-ingestion.ts` | 1-200 | Ingestion persistence with `replaceInlineImageDataUrls` for static scraper/fallback paths |
| `apps/web/scripts/backfill-login-protected-images-logic.ts` | 1-380 | Backfill script: scans existing `products_ingestion` rows, queues non-durable images |
| `apps/web/lib/__tests__/product-image-storage.test.ts` | 1-280 | Tests for the `replaceInlineImageDataUrls` function |
| `apps/web/__tests__/scripts/backfill-login-protected-images.test.ts` | 1-290 | Tests for the backfill script logic |
| `apps/web/supabase/migrations/20250101000000_baseline.sql` (lines 3193-3210) | `image_retry_queue` table schema | |
| `apps/web/lib/supabase/database.types.ts` (lines 1400-1470) | TypeScript types for `image_retry_queue` | |

---

## 1. High-Level Pipeline Flow

```
[Scraper: PhillipsAdapter.extract()]
  │
  ├── 1. Login via ApprovedSourceLoginManager (Playwright + credentials)
  ├── 2. Search product page (quickSearch)
  ├── 3. Navigate to PDP (click product link in Backbone SPA)
  ├── 4. Extract HTML → parse → build product field dict
  ├── 5. Normalize image URLs (/thumb/ → /large/,
  │      cloudfront → shop.phillipspet.com)
  ├── 6. Filter through policy (filter_allowed_assets)
  │
  ├── 7. capture_images_authenticated(page, image_urls)
  │     └── For each URL:
  │         ├── Method A: page.evaluate(fetch + FileReader) → data URL
  │         └── Method B: page.context.request.get() → base64 → data URL
  │             └── Fallback: If /large/ fails, try /thumb/ or /md/
  │         └── Result: { status, data_url, original_url, error_type }
  │
  ├── 8. image_urls now holds list of capture result dicts (data URLs)
  │      mixed with any pre-existing durable URLs
  │
  └── 9. Full product + image results returned as EnrichmentResultV1
          └── image_urls is a list of: ScraperImageCaptureResult objects
              (NOT plain URL strings at this point!)

[Callback: enrichment-callback/route.ts]
  │
  ├── Receives EnrichmentResultV1 with image_urls as [{status, data_url, ...}]
  ├── Calls replaceInlineImageDataUrls(supabase, mergedSources, {...})
  │
  └── [product-image-storage.ts → replaceInlineImageDataUrls]
        │
        ├── Visit every string/value in the sources tree
        │
        ├── For ScraperImageCaptureResult objects:
        │   ├── success + data_url → uploadInlineImageDataUrl()
        │   │   └── parse base64 → sharp resize(1200x1200, inside) → webp(82)
        │   │   └── upload to Supabase Storage bucket "product-images"
        │   │   └── return public URL (durable)
        │   │
        │   └── error / upload fails → enqueueImageRetry()
        │       └── INSERT into image_retry_queue (upc, image_url, error_type, ...)
        │       └── return pending_retry://{errorType}/{hash} marker string
        │
        ├── For plain inline data URLs (no metadata):
        │   └── uploadInlineImageDataUrl() → public URL or enqueueImageRetry()
        │
        └── Final sources dict: durable public URLs + pending_retry markers
              (No vendor URLs leak into the persisted sources storage)

[Later: ?? Nothing reads image_retry_queue ??]
```

---

## 2. Where Private Vendor Image URLs Become Data URLs

**Location**: `apps/scraper/scrapers/approved_sources/image_capture.py`

Two methods, both executed **inside the authenticated Playwright page** so the browser's session cookies/credentials are shared:

### Method A: In-page fetch + FileReader (lines 28-76)
```python
js_code = """
async (url) => {
    const response = await fetch(url);
    const blob = await response.blob();
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
    return { success: true, dataUrl, ... };
}
"""
res = await page.evaluate(js_code, url)
```
- Works when CORS allows (which it usually does in-session for same-origin vendor images).
- If CORS blocks, falls through to Method B.

### Method B: Playwright context request fallback (lines 78-140)
```python
response = await page.context.request.get(url, headers=headers)
body = await response.body()
base64_data = base64.b64encode(body).decode("utf-8")
data_url = f"data:{content_type};base64,{base64_data}"
```
- Shares cookies with the page session → bypasses CORS.
- Self-healing: if `/large/` fails 404, tries `/thumb/` or `_md` fallbacks.

### Entry point from base adapter (base.py lines 740-758)
The base `extract()` method checks `requires_auth` and, if the adapter has a `get_login_config_class()`, creates a Playwright page from the login manager's session and calls `capture_images_authenticated()`.

**PhillipsAdapter** (phillips.py lines 384-430) does the same inline in its custom `extract()` method: creates a session page → calls `capture_images_authenticated(page, image_urls)`.

### Important details:
- **Max 5MB per image** (constant `max_bytes = 5 * 1024 * 1024`)
- **Max 10 images** per product (`max_images=10`)
- Already-durable URLs (data: or Supabase Storage) are passed through without re-capture
- **The result is a list of dicts** (not plain URLs) — each with `{status, data_url, original_url, error_type, status_code}`

---

## 3. Durable Storage (Supabase Storage)

**Location**: `apps/web/lib/product-image-storage.ts`

### uploadInlineImageDataUrl (lines 194-218)
1. Parse base64 data URL
2. **Process with Sharp** (lines 145-168):
   - Flatten with white background
   - Resize: fit inside 1200×1200, no enlargement
   - Encode: WebP quality 82
   - SVG images preserved as-is (no rasterization)
3. SHA-256 hash of processed bytes → first 24 hex chars as filename
4. Upload to Supabase Storage bucket `product-images`
   - Path structure: `{folderPath}/{hash}.webp`
   - Cache-Control: `31536000` (1 year), upsert: true
5. Return public URL via `getPublicUrl()`

### folderPath
- Building: `buildProductImageStorageFolder("pipeline-sources", upc)` → path like `pipeline-sources/{sanitized-upc}`
- Sanitization: lowercased, non-alphanumeric replaced with `-`

### Image processing safety
- `processImageBuffer()` catches Sharp errors and falls back to original buffer if processing fails
- SVG format bypasses Sharp entirely

---

## 4. Retry Queue (image_retry_queue)

### Table schema (from migrations)
```sql
CREATE TABLE public.image_retry_queue (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    upc         text,                      -- FK to products_ingestion(upc) CASCADE
    image_url   text NOT NULL,             -- The original vendor URL
    error_type  image_error_type NOT NULL DEFAULT 'unknown',
    retry_count integer NOT NULL DEFAULT 0,
    max_retries integer NOT NULL DEFAULT 3,
    status      image_retry_status NOT NULL DEFAULT 'pending',
    scheduled_for timestamptz NOT NULL DEFAULT now(),
    last_error  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
```

### Enums
```sql
CREATE TYPE image_error_type AS ENUM ('auth_401','not_found_404','network_timeout','cors_blocked','unknown');
CREATE TYPE image_retry_status AS ENUM ('pending','processing','completed','failed');
```

### Max retries per error type (from image-capture-errors.ts)
| Error Type | Max Retries | Notes |
|------------|-------------|-------|
| `auth_401`    | 2 | Session may have expired |
| `not_found_404` | 0 | Resource doesn't exist |
| `network_timeout` | 3 | Transient, worth retrying |
| `cors_blocked`   | 1 | May be transient |
| `unknown`     | 2 | Conservative |

Retry delay: exponential backoff `2^retry * 1000ms` (1s, 2s, 4s...)

### Database helper functions
- `get_pending_image_retries(p_limit integer)` — returns rows where `status='pending' AND scheduled_for <= now() AND retry_count < max_retries`, ordered by scheduled_for ASC, retry_count ASC
- `get_product_image_retry_history(p_upc text)` — returns retry history for a product

### Indexes
- `idx_image_retry_queue_processing` — partial index on (status, scheduled_for, retry_count, max_retries) WHERE status IN ('pending','processing')
- `idx_image_retry_queue_scheduled` — on scheduled_for
- `idx_image_retry_queue_sku` — on upc
- `idx_image_retry_queue_error_type` — on error_type
- `idx_image_retry_queue_status` — on status

### Retry markers in stored sources
When a retry is enqueued during `replaceInlineImageDataUrls`, the stored value becomes a marker string:
```
pending_retry://{errorType}/{sha256-16-char-hash}
```
This is what persists in `products_ingestion.sources` until the retry is processed. The markers are detected by `isPendingRetryImageReference()`.

---

## 5. Backfill Path

**Location**: `apps/web/scripts/backfill-login-protected-images-logic.ts`

### What it does
1. Scans `products_ingestion` rows (batches of 100)
2. For each source entry linked to a login-protected scraper (phillips, orgill, petfoodex):
   - Extracts image URL candidates using `extractImageCandidatesFromSourcePayload`
   - Checks if they're already durable (Supabase Storage URL or data URL)
   - If not durable → enqueue to `image_retry_queue` (if not already queued)
3. Determines login-protected scrapers by checking YAML config files (either `login` block in workflows, or `requires_login: true`)

### How to run
```bash
# Dry-run (scan only, no inserts)
bun run web ts-node -- apps/web/scripts/backfill-login-protected-images-logic.ts --dry-run

# Execute (default)
bun run web ts-node -- apps/web/scripts/backfill-login-protected-images-logic.ts --execute

# With options
bun run web ts-node -- apps/web/scripts/backfill-login-protected-images-logic.ts \
  --upc 012345678901 --limit 500 --batch-size 50
```

The script also handles the `priority` column gracefully — it tries to insert with `priority: 'backfill'`, and if that fails (column doesn't exist), falls back to inserting without it.

### Test coverage
- `apps/web/__tests__/scripts/backfill-login-protected-images.test.ts`: tests `resolveLoginProtectedScraperSlugs`, `collectLoginProtectedImageBackfillCandidates`, and `executeLoginProtectedImageBackfillWithClient`

---

## 6. CONCRETE GAPS AND MISSING PIECES

### 🔴 Gap #1 (Critical): No consumer/worker processes `image_retry_queue`

**Evidence**: I searched for `get_pending_image_retries`, `processImageRetry`, `retryWorker`, `retry.*consumer`, `retry.*handler`, `cron.*retry`, `schedule.*retry` across the entire codebase. The only references to `get_pending_image_retries` are in:
- SQL migrations (creating the function)
- Database type definitions (TypeScript types for Supabase function)

There is **zero runtime code** that polls the queue, selects pending entries, re-launches a scraper session, re-captures the image, uploads to durable storage, and marks the entry as `completed`. The retry queue is a dead letter — entries go in but never come out.

### 🟡 Gap #2: Retry markers in persisted sources are unresolved

When a `pending_retry://` marker is stored in `products_ingestion.sources`, nothing in the pipeline looks for these markers and resolves them to real URLs. The UI/API would see these marker strings where images should be. Any code path that reads `products_ingestion.sources` images must handle (or hard-fail on) these markers.

### 🟡 Gap #3: No re-scrape/retry linkage from web to scraper

The retry queue holds vendor URLs and error types, but retrying would require:
1. Authenticating again via the ApprovedSourceLoginManager (scraper-side)
2. Re-navigating to the vendor page that contains the image
3. Re-capturing via `capture_image_authenticated`
4. Uploading the new data URL to Supabase Storage
5. Updating `products_ingestion.sources` with the durable URL
6. Marking the retry entry as `completed`

None of this is wired. The scraper runner has no endpoint/method to process a retry queue entry.

### 🟢 Gap #4 (Minor): Captured data URLs have a 5MB limit enforcement

The `capture_image_authenticated` function rejects images over `max_bytes` (5MB). If a vendor image exceeds this, it falls through as an error. For next-gen products with high-res photography this might be hit. Sharp processing in the web tier doesn't add a second size gate.

### 🟢 Gap #5: Backfill script scans local YAML configs, not DB configs

The backfill script loads scraper configs from `apps/scraper/scrapers/configs/*.yaml` on disk. If a login-protected scraper config is only in the database (admin UI), it won't be detected. This is a deployment concern (the web process needs the YAML files present).

### 🟢 Gap #6 (Minor): Hardcoded test image data URL

The test file `product-image-storage.test.ts` uses a 1×1 pixel PNG hardcoded as base64. The "sharp" processing path has limited test coverage — no test verifies the actual resize/convert-to-webp logic with a real image buffer.

---

## 7. Where To Add The Missing Consumer

The most natural place to add the retry queue consumer would be:

**Option A: Scraper-side as a new endpoint**
- New endpoint in the scraper runner (e.g., `POST /api/scraper/v1/retry-image`)
- Web-side cron/scheduled function calls the scraper with queued entries
- Scraper authenticates, captures, returns new data URL
- Web uploads and updates the source

**Option B: Web-side scheduled function**
- Supabase Edge Function or `setTimeout`/cron job that:
  1. Calls `get_pending_image_retries(10)` via Supabase client
  2. For each entry, somehow re-captures the image (this is hard without Playwright)
  3. Uploads result and marks `completed`

**Option C: Extend existing enrichment pipeline**
- When a product's sources contain `pending_retry://` markers, flag it for re-enrichment as a "distributor_only" mode
- The scraper re-runs the full extraction for that source slug, re-capturing images
- This is the most robust but most expensive option

---

## 8. Summary Data Flow Diagram

```
VENDOR SERVER (shop.phillipspet.com)
  │ Protected, requires login + session cookies
  │
  ▼
PLAYWRIGHT PAGE (authenticated session)
  │
  ├── page.evaluate(fetch + FileReader)          ─── CORS-permitted path
  └── page.context.request.get(url, headers)     ─── bypasses CORS, shares cookies
      │
      └─► base64 data URL (data:image/...;base64,...)
            │
            ▼
EXTRACTION RESULT (image_urls = list of {status, data_url, ...})
  │
  └─→ Callback POST /api/scraper/v1/enrichment-callback
        │
        ▼
replaceInlineImageDataUrls()
  │
  ├── success + data URL ──→ Sharp(1200x1200 webp82)
  │                           └─→ Supabase Storage "product-images"
  │                                 └─→ public URL (durable)
  │
  └── error or upload fail ──→ image_retry_queue INSERT
                                  └─→ pending_retry:// marker in sources
                                       └─→ 🔴 NOTHING READS THIS QUEUE
```

---

## 9. Recommended Next Steps

1. **Build a retry queue worker** — an Edge Function or server endpoint that polls `get_pending_image_retries`, interacts with the scraper to re-capture images, uploads results, and marks entries complete. This is the single biggest gap.

2. **Resolve pending_retry markers in existing data** — either run the backfill script if products haven't been retried yet, or build migration logic to re-process sources with `pending_retry://` markers.

3. **Add a `priority` column migration** to `image_retry_queue` — the backfill script has fallback logic for this, but having it in schema would be cleaner.

4. **Consider a retry health check** — track how many `pending_retry://` markers exist in `products_ingestion.sources` to monitor the gap.

5. **Audit all consumers of `product_images` sources** — ensure nobody reads the raw sources without handling `pending_retry://` markers gracefully.
