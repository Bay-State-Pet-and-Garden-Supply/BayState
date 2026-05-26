I did **not** write `/Users/nickborrello/Desktop/Projects/BayState/sandbox-research/crawl4ai-blueprint.md` because the task also said “Do not edit files.” Below is the implementation blueprint content intended for that file.

```md
# Crawl4AI Local Product-Page Discovery/Extraction Sandbox Blueprint

## Goal

Create a minimal, repo-local sandbox for experimenting with Crawl4AI product-page discovery and extraction without integrating into the BayState web app, scraper daemon, API coordinator, database, or production YAML config flow.

This sandbox should:
- Use existing scraper dependencies where convenient.
- Stay fully local/offline except for target site crawling and optional LM Studio calls.
- Produce evidence packets for review.
- Prefer deterministic extraction: sitemap URL filtering, JSON-LD, meta tags, CSS schema.
- Use a local LM Studio OpenAI-compatible model only as an explicit fallback.

## Non-goals

- No app integration.
- No Supabase access.
- No scraper daemon changes.
- No coordinator callbacks.
- No production migrations.
- No production selector hardcoding.
- No use of Selenium or sync Playwright.

---

## Proposed location

```text
sandbox-research/
  crawl4ai-product-sandbox/
    README.md
    configs/
      sample-site.yaml
      page-extraction.yaml
      lmstudio.yaml.example
    schemas/
      product-css.schema.json
      product-llm.schema.json
    scripts/
      common.py
      discover_from_sitemap.py
      extract_product_page.py
      run_packet.py
    inputs/
      sample-products.csv
    outputs/
      .gitignore
```

This keeps the sandbox separate from `apps/web` and `apps/scraper` runtime code.

---

## Runtime approach

Run from the scraper dependency environment:

```bash
cd /Users/nickborrello/Desktop/Projects/BayState/apps/scraper

uv run --with-requirements requirements.txt \
  python ../../sandbox-research/crawl4ai-product-sandbox/scripts/run_packet.py \
  --site-config ../../sandbox-research/crawl4ai-product-sandbox/configs/sample-site.yaml \
  --page-config ../../sandbox-research/crawl4ai-product-sandbox/configs/page-extraction.yaml \
  --upc 072705113446 \
  --brand Fromm \
  --name "Fromm Four-Star Nutritionals"
```

This reuses installed Crawl4AI/Playwright packages but does not import app or runner internals.

---

## Minimal script responsibilities

### `scripts/common.py`

Shared helpers only:

- Load YAML/JSON config.
- Normalize URLs.
- Create run IDs.
- Write JSON evidence packets.
- Save optional markdown/screenshot artifacts.
- Calculate simple confidence scores.
- Ping LM Studio `/v1/models` before LLM use.

No BayState app imports.

### `scripts/discover_from_sitemap.py`

Responsibilities:

1. Resolve sitemap URLs:
   - Explicit `sitemap_urls` from config.
   - Optionally `robots.txt` sitemap discovery.
2. Fetch sitemap XML.
3. Recurse sitemap indexes.
4. Extract candidate URLs from `<loc>`.
5. Apply local include/exclude URL filters.
6. Score candidates:
   - Product URL markers: `/product/`, `/products/`, `/p/`, `/shop/`.
   - Brand/name token overlap.
   - UPC/GTIN/SKU presence.
   - Exclude category/blog/search/store-locator pages.
7. Optionally verify top candidates with Crawl4AI markdown/title/meta crawl.
8. Emit `outputs/<run_id>/candidates.json`.

### `scripts/extract_product_page.py`

Responsibilities:

1. Crawl a selected product URL with Crawl4AI.
2. Save raw evidence artifacts:
   - Markdown.
   - Optional screenshot.
   - Extracted JSON-LD snippets.
   - Metadata/title/final URL.
3. Extract product facts in this order:
   1. JSON-LD `Product`.
   2. OpenGraph/meta tags.
   3. CSS schema via `JsonCssExtractionStrategy`.
   4. Optional LM Studio fallback.
4. Produce one evidence packet.

### `scripts/run_packet.py`

Small orchestration wrapper:

1. Run sitemap discovery.
2. Pick top N candidates.
3. Extract each until confidence threshold is met.
4. Write final packet:
   - `outputs/<run_id>/packet.json`
   - `outputs/<run_id>/packet.md`

---

## Sitemap discovery config

Example: `configs/sample-site.yaml`

```yaml
site:
  name: fromm-example
  base_url: "https://example.com"
  allowed_domains:
    - "example.com"

sitemap:
  sitemap_urls:
    - "https://example.com/sitemap.xml"
  discover_from_robots: true
  max_sitemaps: 20
  max_urls: 1000

candidate_filters:
  include_regex:
    - "/product"
    - "/products"
    - "/shop"
    - "/p/"
  exclude_regex:
    - "/category"
    - "/collections$"
    - "/blog"
    - "/news"
    - "/store-locator"
    - "/where-to-buy"
    - "/cart"
    - "/account"
    - "/search"

candidate_scoring:
  product_url_marker_bonus: 3
  brand_token_bonus: 2
  name_token_bonus: 1
  upc_token_bonus: 5
  category_penalty: -3
  low_quality_penalty: -5

crawl4ai_verify:
  enabled: true
  top_n: 10
  max_concurrent: 3
  page_timeout_ms: 30000
```

---

## Crawl4AI browser/run configs

### Browser config

```python
from crawl4ai import BrowserConfig

BROWSER_CONFIG = BrowserConfig(
    headless=True,
    viewport_width=1365,
    viewport_height=900,
    user_agent=(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
)
```

### Sitemap/candidate verification crawl

```python
from crawl4ai import CrawlerRunConfig, CacheMode

SITEMAP_VERIFY_CONFIG = CrawlerRunConfig(
    cache_mode=CacheMode.ENABLED,
    page_timeout=30000,
    wait_for="css:body",
    remove_overlay_elements=True,
    excluded_tags=["nav", "footer", "aside", "script", "style"],
    screenshot=False,
)
```

### Product page extraction crawl

```python
from crawl4ai import CrawlerRunConfig, CacheMode
from crawl4ai import JsonCssExtractionStrategy

PRODUCT_CSS_SCHEMA = {
    "name": "product",
    "baseSelector": "body",
    "fields": [
        {"name": "h1", "selector": "h1", "type": "text"},
        {"name": "title", "selector": "title", "type": "text"},
        {"name": "description", "selector": "meta[name='description']", "type": "attribute", "attribute": "content"},
        {"name": "og_title", "selector": "meta[property='og:title']", "type": "attribute", "attribute": "content"},
        {"name": "og_description", "selector": "meta[property='og:description']", "type": "attribute", "attribute": "content"},
        {"name": "og_image", "selector": "meta[property='og:image']", "type": "attribute", "attribute": "content"},
        {"name": "images", "selector": "img", "type": "attribute", "attribute": "src", "all": True},
        {"name": "breadcrumbs", "selector": "[aria-label='breadcrumb'], .breadcrumb, nav.breadcrumb", "type": "text"},
        {"name": "price", "selector": "[itemprop='price'], .price, [class*='price']", "type": "text"}
    ]
}

PRODUCT_RUN_CONFIG = CrawlerRunConfig(
    cache_mode=CacheMode.ENABLED,
    page_timeout=45000,
    wait_for="css:body",
    remove_overlay_elements=True,
    wait_for_images=True,
    screenshot=True,
    extraction_strategy=JsonCssExtractionStrategy(schema=PRODUCT_CSS_SCHEMA),
)
```

---

## Evidence packet shape

```json
{
  "run_id": "2026-05-24T213000Z-fromm-072705113446",
  "created_at": "2026-05-24T21:30:00Z",
  "sandbox_version": "crawl4ai-product-sandbox-v0",
  "input": {
    "upc": "072705113446",
    "brand": "Fromm",
    "name": "Expected product name",
    "site": "fromm-example"
  },
  "discovery": {
    "sitemap_urls": ["https://example.com/sitemap.xml"],
    "candidate_count": 42,
    "selected_url": "https://example.com/products/example-product",
    "candidates": [
      {
        "url": "https://example.com/products/example-product",
        "source": "sitemap",
        "score": 12.5,
        "reasons": ["product URL marker", "brand token match", "name token overlap"],
        "lastmod": "2026-05-01"
      }
    ]
  },
  "crawl": {
    "success": true,
    "requested_url": "https://example.com/products/example-product",
    "final_url": "https://example.com/products/example-product",
    "title": "Product page title",
    "markdown_path": "outputs/run-id/page.md",
    "screenshot_path": "outputs/run-id/page.png",
    "html_length": 245000,
    "markdown_length": 18000,
    "jsonld_count": 2
  },
  "extraction": {
    "method": "jsonld+css",
    "llm_used": false,
    "model": null,
    "confidence": 0.86,
    "fields": {
      "name": "Product name",
      "brand": "Brand",
      "description": "Description",
      "upc": "072705113446",
      "images": ["https://example.com/image.jpg"],
      "price": "$19.99",
      "category": "Dog Food",
      "ingredients": null,
      "guaranteed_analysis": null,
      "weight": "4 lb"
    },
    "field_evidence": {
      "name": {
        "value": "Product name",
        "source": "jsonld",
        "path": "$.name",
        "confidence": 0.95,
        "snippet": "\"name\": \"Product name\""
      },
      "description": {
        "value": "Description",
        "source": "meta",
        "selector": "meta[name='description']",
        "confidence": 0.75
      }
    }
  },
  "validation": {
    "brand_match": true,
    "upc_match": true,
    "name_token_overlap": 0.72,
    "warnings": []
  },
  "errors": []
}
```

---

## LM Studio fallback policy

Default: no LLM.

Use LM Studio only when:

- JSON-LD/meta/CSS extraction misses required fields.
- Candidate page is likely correct but facts are incomplete.
- Multiple values conflict and deterministic confidence is low.
- One-time CSS schema generation is desired for a site pattern.

Do not use LM Studio for every page in a batch.

### Environment

```bash
export C4AI_LLM_MODE=auto
export LMSTUDIO_BASE_URL="http://localhost:1234/v1"
export LMSTUDIO_MODEL="local-model-name-from-lm-studio"
export LMSTUDIO_API_KEY="lm-studio"
```

### Crawl4AI LLM config

```python
import os
from crawl4ai import LLMConfig
from crawl4ai import LLMExtractionStrategy

def lmstudio_strategy(schema: dict) -> LLMExtractionStrategy:
    return LLMExtractionStrategy(
        llm_config=LLMConfig(
            provider=f"openai/{os.environ['LMSTUDIO_MODEL']}",
            api_token=os.getenv("LMSTUDIO_API_KEY", "lm-studio"),
            base_url=os.getenv("LMSTUDIO_BASE_URL", "http://localhost:1234/v1"),
        ),
        schema=schema,
        extraction_type="schema",
        instruction=(
            "Extract product facts from this product page. "
            "Return null for fields not explicitly present. "
            "Do not invent UPCs, ingredients, weights, or prices. "
            "Prefer JSON-LD and visible product content over navigation/footer text."
        ),
        extra_args={
            "temperature": 0,
            "max_tokens": 2000
        },
    )
```

Before creating the LLM strategy, `common.py` should call:

```text
GET http://localhost:1234/v1/models
```

If LM Studio is not available, record:

```json
{
  "llm_used": false,
  "llm_skipped_reason": "LM Studio unavailable"
}
```

---

## Confidence scoring

Suggested baseline:

- `+0.25` URL is product-like.
- `+0.20` JSON-LD `@type=Product`.
- `+0.15` brand match.
- `+0.15` UPC/GTIN match.
- `+0.10` expected name token overlap.
- `+0.10` image found.
- `+0.05` description found.

Penalties:

- `-0.25` category/listing page markers.
- `-0.30` wrong brand.
- `-0.40` conflicting UPC.
- `-0.20` page title indicates search/no results/404.

Thresholds:

```yaml
accept_confidence: 0.75
llm_fallback_below: 0.70
manual_review_below: 0.60
```

---

## Suggested first test

Use one known product URL first, then enable sitemap discovery.

```bash
uv run --with-requirements requirements.txt \
  python ../../sandbox-research/crawl4ai-product-sandbox/scripts/extract_product_page.py \
  --url "https://example.com/products/example-product" \
  --upc "072705113446" \
  --brand "Fromm" \
  --name "Known product name"
```

Then:

```bash
uv run --with-requirements requirements.txt \
  python ../../sandbox-research/crawl4ai-product-sandbox/scripts/run_packet.py \
  --site-config ../../sandbox-research/crawl4ai-product-sandbox/configs/sample-site.yaml \
  --upc "072705113446" \
  --brand "Fromm" \
  --name "Known product name" \
  --llm auto
```

---

## Boundary checklist

- [ ] No changes to `apps/web`.
- [ ] No changes to scraper daemon.
- [ ] No Supabase access.
- [ ] No API callbacks.
- [ ] No production YAML publication.
- [ ] No hardcoded vendor logic outside sandbox config.
- [ ] Async Crawl4AI only.
- [ ] Structured logging, not print-heavy production-style code.
- [ ] Evidence packet saved for every run.
```
