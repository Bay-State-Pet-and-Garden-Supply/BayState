# OCR `image_text` Handling — Web Coordinator Side

## Verdict: ✅ End-to-end flow is intact. Web app receives, stores, and forwards `image_text` to the consolidation LLM.

---

## 1. API Endpoints Receiving Scrape Results

Two endpoints receive scrape results from runners:

| Endpoint | File | Used For |
|---|---|---|
| `POST /api/admin/scraping/callback` | `apps/web/app/api/admin/scraping/callback/route.ts` | Legacy (non-chunked) job completion |
| `POST /api/scraper/v1/chunk-callback` | `apps/web/app/api/scraper/v1/chunk-callback/route.ts` | Chunked job results |

Both handlers call `normalizeProductSources(scrapedDataContainer)` where `scrapedDataContainer` is the raw per-SKU payload from the runner. They do NOT validate against a fixed schema — they accept any keys and normalize via aliasing.

## 2. How `image_text` Gets Past Field Normalization

In `apps/web/lib/product-sources.ts`:

**`SOURCE_FIELD_ALIASES`** (line 94):
```ts
image_text: 'image_text',
```

**`normalizeSourceFieldName`** (line 105-108) applies `toSnakeCaseKey` then lookups aliases. The scraper sends `image_text` (already snake_case), so it passes through unchanged via the alias.

**`isExcludedKeyName`** (in `batch-service.ts` line 136) has an explicit carve-out:
```ts
if (normalized === 'image_text') return false;
```
This prevents `image_text` from being blocked by the generic `includes('image')` exclusion rule (which is meant to filter out image URL fields).

## 3. How `image_text` Flows Into the DB

The callbacks write to `products_ingestion.sources` (JSONB column), **not** the `scrape_results` table.

Flow:
```
raw runner data → normalizeProductSources() → filterMeaningfulProductSources()
→ makeIncomingSourcesDurable() → mergeProductSources(existingRow.sources, scrapedData)
→ upsert into products_ingestion.sources
```

- `makeIncomingSourcesDurable` (lib/scraper-callback/products-ingestion.ts:34) handles inline image data URLs (base64 → storage upload). It does NOT strip `image_text` — `image_text` is a plain text string, not a URL.
- `mergeProductSources` merges sources at the source-name level (e.g., merging data from "scraper1" and "scraper2" for the same SKU). `image_text` is a flat field, so it lives alongside `title`, `brand`, etc. in the source payload dict.

**`scrape_results` table schema** (migration `20260101003000_create_scraping_tables.sql`):
```sql
CREATE TABLE IF NOT EXISTS public.scrape_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.scrape_jobs(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}',
  ...
```
This table exists but is **not used** by the callback paths. The callback routes write to `products_ingestion` directly.

## 4. `buildConsolidationSourcesPayload()` Includes `image_text`

File: `apps/web/lib/product-sources.ts`, line 527-545.

Called by:
- `POST /api/admin/consolidation/scraped` (line 50)
- `POST /api/admin/consolidation/submit` (line 50)

Implementation:
```ts
export function buildConsolidationSourcesPayload(rawSources, rawInput) {
    const normalizedSources = normalizeProductSources(rawSources);
    const payload = { ...normalizedSources };
    // ... adds shopsite_input and _input
    return payload;
}
```

`normalizeProductSources` returns a `ProductSourceMap` where each source's payload dict includes `image_text` (if present in the raw data). The spread `{...normalizedSources}` includes it.

## 5. How `image_text` Reaches the LLM Prompt

In `apps/web/lib/consolidation/batch-service.ts`:

**Inclusion in `RELEVANT_FIELDS`** (line 91):
```ts
const RELEVANT_FIELDS = [
    'title', 'brand', 'weight', /* ... */ 'confidence',
    'image_text',     // ← included
];
```

**Not in `EXCLUDED_FROM_LLM`** (line 153):
```ts
const EXCLUDED_FROM_LLM = new Set([
    'ratings', 'reviews_count', 'availability', 'scraped_at',
    'search_keywords', 'is_taxable', 'taxable', /* ... */
    // image_text NOT in this set
]);
```

**`filterSourceData()`** (line 274) iterates `RELEVANT_FIELDS`, includes any with non-empty values, and sends them to `buildPromptSourceEvidence()`.

**`isExcludedKeyName()`** (line 133-151) explicitly allows `image_text` through (line 136).

The user prompt then includes the OCR text inline, and `prompt-builder.ts` (line 223-228) provides explicit LLM instructions:
> *"When a source provides image_text (OCR extracted from product packaging photos), treat it as authoritative for the physical packaging text."*

## 6. Scraper → Network Payload Contract

In `apps/scraper/scrapers/result_collector.py` (line 85):
```python
image_text=result_data.get("Image Text"),
```

In `apps/scraper/core/models.py` (line 105, 163):
```python
image_text: str | None = Field(
    default=None, description="Text extracted from product images via OCR"
)
# serialized in to_db_dict():
"image_text": self.image_text,
```

The runner packages this in `data_for_db` dict, which flows as `results.data[sku][scraper_name].image_text` in the callback payload (`callback.py` transform logic at line 60-105).

---

## Summary

| Step | Status | Details |
|---|---|---|
| Scraper captures OCR text | ✅ | `RawScrapedProduct.image_text`, emitted as snake_case `image_text` in results dict |
| Web callback receives `image_text` | ✅ | Both admin and chunk callbacks accept it via generic `normalizeProductSources()` |
| Normalization preserves `image_text` | ✅ | `SOURCE_FIELD_ALIASES['image_text'] = 'image_text'`, `isExcludedKeyName` carves it out |
| Stored in `products_ingestion.sources` JSONB | ✅ | Not in `scrape_results` table |
| `buildConsolidationSourcesPayload()` includes it | ✅ | Spreads `{...normalizedSources}` |
| `filterSourceData()` passes it to LLM | ✅ | In `RELEVANT_FIELDS`, not in `EXCLUDED_FROM_LLM` |
| LLM instructed how to use it | ✅ | `prompt-builder.ts` has OCR packaging evidence rules |

No gaps found. The pipe is complete.
