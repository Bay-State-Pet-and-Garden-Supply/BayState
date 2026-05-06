# Scout: `image_text` End-to-End Implementation

## Summary

**Partially implemented — broken at the runner → web callback handoff.** The scraper side has all the pieces (config, action handler, model field, collector extraction), but `image_text` is **dropped before the callback payload is sent to the web coordinator**. The web side is ready to receive and use it (normalization, persistence, consolidation prompts all reference `image_text`). One missing line in `runner/__init__.py` would fix the gap.

---

## Findings by Question

### 1. Configs with `ocr_config.enabled: true`

**One config: `phillips.yaml` only.**

File: `apps/scraper/scrapers/configs/phillips.yaml` (lines 160-164)
```yaml
ocr_config:
  enabled: true
  max_images: 2
  language: eng
  preprocess: true
```

No other config in `apps/scraper/scrapers/configs/` (13 total) has `ocr_config` or `ocr_images`.

### 2. `RawScrapedProduct` model includes `image_text` — YES

File: `apps/scraper/core/models.py` (lines 104-107, 160-166)

```python
# OCR-extracted text from product packaging images
image_text: str | None = Field(
    default=None, description="Text extracted from product images via OCR"
)
```

`to_db_dict()` outputs it: `"image_text": self.image_text` (line 163). Used local-only.

### 3. `ocr_images` action in workflow YAML — YES for phillips

File: `apps/scraper/scrapers/configs/phillips.yaml` (lines 111-115)
```yaml
- action: ocr_images
  name: Extract packaging text
  params:
    field: Image URLs
    max_images: 2
    output_field: Image Text
```

This is the only config with the action step. The `ocr_images` action handler is in `apps/scraper/scrapers/actions/handlers/ocr.py` (registered at line 137 via `@ActionRegistry.register("ocr_images")`). It writes OCR text to `self.ctx.results[output_field]` where `output_field` defaults to `"Image Text"`.

### 4. Web callback: does it accept/store `image_text`? — Ready but never receives it

The callback route (`apps/web/app/api/admin/scraping/callback/route.ts`) receives the payload and calls `normalizeProductSources(scrapedDataContainer)` on each SKU's results.

`apps/web/lib/product-sources.ts`:
- `CanonicalProductSourceRecord` has `image_text?: string` (line 31)
- `SOURCE_FIELD_ALIASES` includes `image_text: 'image_text'` (line 94)

So if `image_text` arrived in the callback payload, it would survive normalization and be stored in `products_ingestion.sources`. The consolidation layer also handles it:
- `batch-service.ts` line 91: `'image_text'` in `INCLUDE_KEYS`
- `batch-service.ts` line 136: explicitly excludes `image_text` from image-field stripping
- `prompt-builder.ts` lines 223-228: OCR packaging evidence instructions in the AI prompt

**The web side is fully wired up for `image_text` — but it never arrives.**

### 5. `ocr.py` action handler — Referenced only in `phillips.yaml`

`apps/scraper/scrapers/actions/handlers/ocr.py` is a complete, well-implemented OCR action handler using Tesseract via pytesseract. It:
- Fetches images from HTTP URLs or decodes data URIs
- Preprocesses with Pillow (grayscale, contrast, sharpen, denoise)
- Runs Tesseract with `--psm 6 --oem 3`
- Cleans output and writes to `self.ctx.results[output_field]` (default: `"Image Text"`)

Only referenced in `phillips.yaml`.

### 6. `to_db_dict()` / callback payload — THE BREAK

File: `apps/scraper/runner/__init__.py` (lines 830-870)

The callback payload is built here:
```python
payload = {
    "title": extracted_data.get("Name"),
    "brand": extracted_data.get("Brand"),
    ...
    "reviews_count": extracted_data.get("Reviews"),
    "url": page_url,
    "scraped_at": datetime.now().isoformat(),
}
sanitized_payload, quality_warnings = sanitize_product_payload(payload)
results["data"][sku][cfg_name] = sanitized_payload
```

**There is NO `image_text` field in this payload dict.** The `extracted_data` from the workflow DOES contain `"Image Text"` (set by the OCR action), but it's never read or passed into the payload dict.

Meanwhile, `collector.add_result(sku, cfg_name, extracted_data)` at line 890 IS called with the raw `extracted_data`, so the collector's local JSON storage does include `Image Text` → `RawScrapedProduct.image_text` → `to_db_dict()["image_text"]`. But this is **local-only**. The collector's stored data is never merged back into the callback results dict.

`sanitize_product_payload` in `apps/scraper/validation/result_quality.py` also has no `image_text` mapping in `FIELD_ALIASES`.

---

## Data Flow Diagram

```
Workflow executor (raw results)
  └─ extracted_data = {"Name": ..., "Image Text": "PRODUCT NAME 5LB", ...}
       │
       ├─► collector.add_result(sku, cfg, extracted_data)
       │     └─ RawScrapedProduct.image_text ✓
       │     └─ to_db_dict()["image_text"] ✓
       │     └─ saved to local JSON ✓
       │     └─ NEVER SENT BACK TO WEB ✗
       │
       └─► payload = {"title": ..., ...}  ← NO image_text here
             └─ sanitize_product_payload() ← also no image_text
             └─ results["data"][sku][cfg] ← what gets POSTed
                   │
                   ▼
            Web callback (/api/admin/scraping/callback)
              └─ normalizeProductSources()  ← ready for image_text ✓
              └─ persist to products_ingestion.sources  ← ready ✓
              └─ consolidation pipeline  ← ready ✓
```

## Fix Required

**One addition** in `apps/scraper/runner/__init__.py` around line 830:
```python
# Add alongside other extracted_data mappings:
"image_text": extracted_data.get("Image Text"),
```

And `sanitize_product_payload` in `apps/scraper/validation/result_quality.py` could optionally normalize `image_text` (strip, max length check) but it's not strictly necessary — OCR text passes through the normalization pipeline as `image_text` currently passes through `product-sources.ts` unmodified.

## Files Involved

| File | Role |
|---|---|
| `apps/scraper/scrapers/configs/phillips.yaml` (L160-164) | Only config with `ocr_config.enabled: true` |
| `apps/scraper/scrapers/actions/handlers/ocr.py` (L137) | `ocr_images` action handler — works correctly |
| `apps/scraper/core/models.py` (L104-107, 163) | `RawScrapedProduct.image_text` + `to_db_dict()` includes it |
| `apps/scraper/scrapers/result_collector.py` (L85, 99) | Extracts `Image Text` from raw results, uses for `has_data` check |
| `apps/scraper/runner/__init__.py` (L830-870) | **THE GAP** — builds callback payload without `image_text` |
| `apps/scraper/validation/result_quality.py` | `sanitize_product_payload` — no `image_text` handling |
| `apps/web/lib/product-sources.ts` (L31, 94) | Ready — `CanonicalProductSourceRecord` + alias |
| `apps/web/lib/scraper-callback/products-ingestion.ts` | Persists into `products_ingestion.sources` — transparent pass-through |
| `apps/web/lib/consolidation/batch-service.ts` (L91, 136) | Includes `image_text` in relevant keys, doesn't strip as image |
| `apps/web/lib/consolidation/prompt-builder.ts` (L223-228) | AI prompt instructions for OCR evidence |

## Risk Assessment

**Low risk to fix.** Adding the one line is non-destructive — existing scraper configs that don't have `ocr_images` simply won't produce `Image Text` data, so the field will be `None/null` and be omitted during persistence. Only `phillips.yaml` will produce it.
