# SERP Discovery and Product Extraction Hardening Plan

Date: 2026-05-22
Status: Planning
Scope: `apps/scraper` product URL discovery, Crawl4AI extraction, media selection, and benchmark coverage

## Why this plan exists

A recent SERP Discovery / product extraction run successfully found official Open Farm product URLs, but the downstream extraction produced polluted product records.

The observed failures were not primarily URL discovery failures. The URLs were generally correct. The extraction layer was too permissive, especially for page media, categories, variants, and dirty HTML.

The immediate goal is to make extraction measurable before changing behavior. After that, the extractor should move from a single full-page extraction pass toward an ordered strategy chain that favors deterministic product-page signals before using LLM fallback.

## Current findings

### What worked

- Official product URLs were found for the tested Open Farm products.
- Basic fields such as product name, brand, weight, and description were partially extracted.
- The extracted descriptions were mostly product-relevant.

### What failed

- Image extraction pulled too much page media.
  - Raw image lists contained dozens of URLs per product.
  - Many were duplicate width/crop variants of the same asset.
  - Some were generic brand graphics, recycle graphics, transparency-map graphics, cross-sell thumbnails, Replo assets, or unrelated Unsplash images.
- Image extraction also missed or failed to prioritize the best product packaging/gallery images.
- Category extraction confused protein/flavor with category.
  - Example failure: `Poultry` was treated as a category when it should be a protein/flavor facet.
- Extracted descriptions included DOM/framework junk in some cases.
  - Examples: `bottomSpacer`, `virtual_list`, `data-qa`, `aria-setsize`.
- Variants were flattened into one weight string instead of modeled as structured variants.
- Important ecommerce fields were missing or inconsistently captured.
  - Ingredients
  - Guaranteed analysis
  - Feeding guidelines
  - Calories
  - AAFCO statement
  - Variant options
  - Primary/gallery image roles

## Relevant Crawl4AI docs reviewed

- https://docs.crawl4ai.com/extraction/no-llm-strategies/
- https://docs.crawl4ai.com/extraction/llm-strategies/
- https://docs.crawl4ai.com/extraction/clustring-strategies/
- https://docs.crawl4ai.com/extraction/chunking/
- https://docs.crawl4ai.com/core/link-media/

Key takeaways:

- Use no-LLM CSS/XPath/regex extraction for stable product page layouts.
- Use LLM schema extraction only after reducing the page to product-relevant content.
- Use clustering/content filtering as a pre-filter, not as the final source of truth.
- Avoid full-page chunking before product-region scoping, because unrelated chunks can merge into polluted product records.
- Use Crawl4AI `result.media["images"]` as structured image candidates instead of saving raw image URLs directly.
- Use `wait_for_images=True` for lazy-loaded product media.
- Avoid `exclude_external_images=True` as a default because legitimate ecommerce images may live on Shopify/CDN domains.

## Existing repo context

The current `ProductPageExtractor` is already the right public interface for extraction-only benchmarks. It receives a known URL and context fields, then returns a standardized extraction result. Do not build a separate product extraction entry point unless this interface proves impossible to extend cleanly.

The old official brand benchmark runner should not be revived as-is. It now states that discovery logic moved server-side and recommends rewriting benchmarks to test extraction-only against pre-discovered URLs.

## Target architecture

```text
Known product URL
  -> Crawl/render page with Crawl4AI
  -> Collect raw artifacts
       html
       markdown
       fit_markdown
       links
       media
       json_ld
       meta tags
       platform hints
  -> Run strategy chain
       1. JSON-LD / meta extraction
       2. Platform parser
          - Shopify
          - WooCommerce
          - BigCommerce
          - Demandware / Salesforce Commerce Cloud
       3. Domain schema strategy
          - openfarmpet.com first
          - then other high-value official domains
       4. Product-region scoped LLM schema extraction
       5. Raw full-page LLM extraction only as last-resort baseline
  -> Merge field evidence
  -> Select product media
  -> Normalize facets/categories/variants
  -> Run QA gates
  -> Return final product facts + evidence
```

## Field ownership rules

Do not allow every strategy to overwrite the final product object directly. Each strategy should return field evidence.

Example evidence object:

```json
{
  "field": "food_form",
  "value": "Dry Food",
  "strategy": "domain_css_schema",
  "source": "breadcrumb",
  "confidence": 0.95,
  "evidence_url": "https://openfarmpet.com/products/goodgut-harvest-chicken-dog-kibble"
}
```

Suggested precedence:

```text
Factual fields:
JSON-LD/meta > platform parser > domain schema > scoped LLM > raw LLM

Category/facet fields:
breadcrumb/category map > platform taxonomy > scoped LLM > raw LLM

Images:
product media DOM / Crawl4AI structured media > JSON-LD image > og:image > LLM never
```

LLM output should never directly select final product images from a full-page image list. It can describe what image type is needed, but the selector should choose from structured media candidates.

## Phase 1: Add extraction-only URL benchmark

### Goal

Create a benchmark that runs actual product URLs through the extractor and scores the output against curated expectations.

This benchmark must test extraction quality separately from SERP discovery quality.

### Location

```text
docs/plans/serp-discovery-extraction-hardening-plan.md
apps/scraper/benchmarks/url_extraction/
  dataset.json
  runner.py
  metrics.py
  report.py
  README.md
```

### Initial dataset

Start with the three Open Farm URLs from the failed run:

```json
{
  "schema_version": "url-extraction-benchmark-v1",
  "entries": [
    {
      "id": "openfarm-goodgut-chicken-19lb",
      "upc": "683547120150",
      "brand": "Open Farm",
      "product_name": "GoodGut Harvest Chicken Dog Kibble - 19 lb",
      "source_url": "https://openfarmpet.com/products/goodgut-harvest-chicken-dog-kibble",
      "expected": {
        "brand": "Open Farm",
        "name_contains": ["GoodGut", "Harvest Chicken", "Dog Kibble"],
        "description_contains": ["Lifeway", "2 billion CFUs", "humanely-raised chicken"],
        "weight": "19 lb",
        "species": "Dog",
        "food_form": "Dry Food",
        "flavor_contains": ["Chicken"],
        "min_approved_images": 1,
        "max_approved_images": 12,
        "forbidden_image_domains": ["unsplash.com"],
        "forbidden_image_path_hints": ["recycle", "transparency-map", "logo", "footer"]
      },
      "tags": ["dog", "dry-food", "open-farm", "shopify", "variant-page"]
    },
    {
      "id": "openfarm-goodgut-salmon-19lb",
      "upc": "683547120167",
      "brand": "Open Farm",
      "product_name": "GoodGut Wild-Caught Salmon Dog Kibble - 19 lb",
      "source_url": "https://openfarmpet.com/products/goodgut-wild-caught-salmon-dog-kibble",
      "expected": {
        "brand": "Open Farm",
        "name_contains": ["GoodGut", "Wild-Caught Salmon", "Dog Kibble"],
        "description_contains": ["Lifeway", "2 billion CFUs", "wild-caught salmon"],
        "weight": "19 lb",
        "species": "Dog",
        "food_form": "Dry Food",
        "flavor_contains": ["Salmon"],
        "min_approved_images": 1,
        "max_approved_images": 12,
        "forbidden_image_domains": ["unsplash.com"],
        "forbidden_image_path_hints": ["recycle", "transparency-map", "logo", "footer"]
      },
      "tags": ["dog", "dry-food", "open-farm", "shopify", "variant-page"]
    },
    {
      "id": "openfarm-cat-chicken-salmon-pate-5-3oz",
      "upc": "683547120785",
      "brand": "Open Farm",
      "product_name": "Chicken & Salmon Pâté for Cats - 5.3 oz Case of 12",
      "source_url": "https://openfarmpet.com/products/chicken-and-salmon-pate-recipe-for-cats",
      "expected": {
        "brand": "Open Farm",
        "name_contains": ["Chicken", "Salmon", "Pâté", "Cats"],
        "description_contains": ["wild-caught salmon", "humanely-raised chicken", "Grain- and legume-free"],
        "weight": "5.3 oz",
        "species": "Cat",
        "food_form": "Wet Food",
        "texture": "Pâté",
        "flavor_contains": ["Chicken", "Salmon"],
        "min_approved_images": 1,
        "max_approved_images": 12,
        "forbidden_image_domains": ["unsplash.com"],
        "forbidden_image_path_hints": ["recycle", "transparency-map", "logo", "footer"]
      },
      "tags": ["cat", "wet-food", "pate", "open-farm", "shopify", "variant-page"]
    }
  ]
}
```

### Runner requirements

The runner should support:

```bash
python -m benchmarks.url_extraction.runner \
  --dataset apps/scraper/benchmarks/url_extraction/dataset.json \
  --output-dir apps/scraper/benchmarks/url_extraction/reports/latest \
  --max-concurrency 2 \
  --fail-under 0.80
```

It should produce:

```text
reports/latest/
  extraction-report.json
  extraction-report.md
  raw/
    openfarm-goodgut-chicken-19lb.json
    openfarm-goodgut-salmon-19lb.json
    openfarm-cat-chicken-salmon-pate-5-3oz.json
```

### Metrics

Score field quality instead of exact full JSON equality.

Required checks:

- extraction success
- normalized brand match
- product name token containment
- description phrase containment
- weight/size containment
- species match
- food form match
- flavor/protein match
- category is not protein-only
- approved image count within bounds
- image canonical duplicate ratio
- forbidden image domains absent
- forbidden image path hints absent
- dirty HTML markers absent
- latency
- token usage/cost, when available

Hard fail checks:

- forbidden image domain appears
- category equals protein-only value such as `Poultry`, `Chicken`, `Beef`, `Salmon`, `Turkey`, or `Fish`
- dirty DOM marker appears in final description
- approved image list is empty when `image_required` is true

Warning checks:

- raw image count above 25
- approved image count above 12
- canonical duplicate ratio above 0.25
- extraction duration above 30 seconds
- token usage unavailable for LLM strategy

### Strategy comparison mode

The benchmark should eventually compare strategy modes:

```text
jsonld_meta
platform_parser
domain_css_schema
cosine_prefilter_llm
scoped_llm
raw_llm
```

Each strategy should be scored separately so we can see whether failures come from missing fields, media pollution, dirty HTML, high latency, or high cost.

Do not make raw full-page LLM extraction the default path. Keep it as a baseline and fallback.

## Phase 2: Add ProductMediaSelector

### Goal

Stop saving raw page media directly into product `image_urls`.

Crawl4AI already exposes structured media candidates through `result.media["images"]`. Use those candidates as input to a product media selector.

### Required behavior

The selector should:

1. Receive structured image candidates.
2. Normalize/canonicalize image URLs.
3. Remove query-only duplicates such as different `width`, `height`, `crop`, `auto`, `fit`, and `q` params.
4. Score image candidates by product relevance.
5. Reject blocked domains and obvious non-product assets.
6. Assign media roles.
7. Return approved primary/gallery media plus rejected-media evidence.

### Suggested module

```text
apps/scraper/scrapers/product_url_extraction/media_selector.py
```

### Candidate input shape

```json
{
  "src": "https://openfarmpet.com/cdn/shop/files/example.png?width=832",
  "alt": "GoodGut Harvest Chicken Dog Kibble",
  "desc": "Nearby text from Crawl4AI",
  "score": 7,
  "width": 832,
  "height": 832,
  "type": "image",
  "group_id": 0
}
```

### Output shape

```json
{
  "primary_image": {
    "src": "https://...",
    "canonical_src": "https://...",
    "alt": "GoodGut Harvest Chicken Dog Kibble",
    "score": 87,
    "role": "primary",
    "reasons": ["allowed_domain", "name_token:goodgut", "product_hint:front"]
  },
  "gallery_images": [],
  "rejected_images": [
    {
      "src": "https://images.unsplash.com/...",
      "canonical_src": "https://images.unsplash.com/...",
      "score": -100,
      "role": "rejected",
      "reasons": ["blocked_domain"]
    }
  ],
  "stats": {
    "raw_count": 65,
    "canonical_count": 25,
    "approved_count": 8,
    "rejected_count": 17,
    "duplicate_ratio": 0.62
  }
}
```

### Scoring rules

Positive signals:

- source domain or approved CDN domain
- product name token appears in `src`, `alt`, or `desc`
- brand appears in `src`, `alt`, or `desc`
- path/alt contains product hints:
  - `hero`
  - `front`
  - `back`
  - `topdown`
  - `pdp`
  - `product`
  - `render`
  - `packaging`
- reasonable image dimensions
- Crawl4AI relevance score is present and positive

Negative signals:

- blocked domain
- unknown external domain
- tiny dimensions
- generic/global asset hints:
  - `recycle`
  - `transparency-map`
  - `promise`
  - `lifestyle`
  - `logo`
  - `icon`
  - `footer`
  - `social`
- cross-sell or other-flavor hints that do not match the expected product/flavor

Initial domain policy:

```python
BLOCKED_IMAGE_DOMAINS = {
    "images.unsplash.com",
}

SOFT_BLOCKED_DOMAINS = {
    "assets.replocdn.com",
}

ALLOWED_CDN_DOMAINS_BY_SITE = {
    "openfarmpet.com": {
        "openfarmpet.com",
        "cdn.shopify.com",
    },
}
```

Do not globally set `exclude_external_images=True` until each brand/domain has an allowlist. Many valid ecommerce product images are served from CDNs outside the page hostname.

### Product record behavior

Only approved images should be flattened into the final product facts:

```python
product["image_urls"] = [
    media["primary_image"]["src"],
    *[img["src"] for img in media["gallery_images"]],
]
```

Rejected image evidence should be retained in telemetry/debug output, not inserted into the product record.

## Phase 3: Add Crawl4AI strategy orchestration

### Goal

Replace the implicit full-page extraction behavior with an explicit strategy chain behind `ProductPageExtractor`.

### Suggested modules

```text
apps/scraper/scrapers/product_url_extraction/strategies/
  __init__.py
  base.py
  jsonld_meta.py
  platform_shopify.py
  domain_schema.py
  scoped_llm.py
  raw_llm.py
  merge.py
```

### Strategy interface

```python
class ExtractionStrategyResult(TypedDict):
    strategy: str
    success: bool
    confidence: float
    fields: dict[str, list[FieldEvidence]]
    telemetry: dict[str, Any]
    errors: list[str]
```

```python
class FieldEvidence(TypedDict):
    field: str
    value: Any
    confidence: float
    source: str
    strategy: str
    evidence_url: str | None
    raw: Any | None
```

### Strategy order

```text
1. JsonLdMetaStrategy
2. PlatformShopifyStrategy
3. DomainSchemaStrategy
4. ScopedLlmStrategy
5. RawLlmStrategy
```

### JSON-LD/meta strategy

Extract:

- name
- brand
- description
- image
- SKU/MPN/GTIN/UPC, when present
- offers/price, when present
- breadcrumbs, when present

### Platform Shopify strategy

Detect and extract from:

- Shopify product JSON
- `window.ShopifyAnalytics`
- `application/json` product blobs
- selected variant info
- variant options
- product media arrays

Expected fields:

- variants
- selected variant
- price
- compare-at price
- selected size
- product media
- product handle
- canonical product URL

### Domain schema strategy

Use Crawl4AI no-LLM `JsonCssExtractionStrategy` or `JsonXPathExtractionStrategy` for known stable domains.

First implementation target:

```text
openfarmpet.com
```

Open Farm schema should target:

- title
- breadcrumb
- selected variant
- all variant options
- overview/description
- product media carousel
- ingredients
- guaranteed analysis
- feeding guidelines
- calories
- AAFCO statement

### Scoped LLM strategy

Use LLM schema extraction only after page scoping.

Preferred settings:

```python
LLMExtractionStrategy(
    extraction_type="schema",
    input_format="html",
    apply_chunking=False,
    extra_args={"temperature": 0.0},
)
```

Use chunking only if scoped content exceeds provider limits.

When chunking is required:

```python
LLMExtractionStrategy(
    extraction_type="schema",
    input_format="html",
    chunk_token_threshold=1200,
    overlap_rate=0.1,
    apply_chunking=True,
    extra_args={"temperature": 0.0},
)
```

Avoid chunking the full page before product-region scoping. Full-page chunking can merge unrelated product thumbnails, marketing copy, footer content, and recommendations into the final product.

### Raw LLM strategy

Keep raw full-page LLM extraction only as:

- a fallback for pages where deterministic/scoped strategies fail
- a benchmark baseline
- a debug tool

It should not be the default path for known official product pages.

## Phase 4: Normalize categories, facets, and variants

### Category/facet separation

Do not use protein/flavor as category.

Bad:

```json
{
  "category": "Poultry"
}
```

Good:

```json
{
  "canonical_category": "Dog > Food > Dry Food",
  "species": "Dog",
  "food_form": "Dry Food",
  "product_line": "GoodGut",
  "primary_protein": "Chicken",
  "flavor": "Harvest Chicken"
}
```

For the cat pâté example:

```json
{
  "canonical_category": "Cat > Food > Wet Food > Pâtés",
  "species": "Cat",
  "food_form": "Wet Food",
  "texture": "Pâté",
  "primary_protein": ["Chicken", "Salmon"],
  "flavor": "Chicken & Salmon",
  "size_display": "5.3 oz",
  "pack_count": 12
}
```

### Variant model

Do not flatten all variant information into one `weight` field.

Use:

```json
{
  "variants": [
    {
      "size_display": "3.5 lb",
      "package_weight_value": 3.5,
      "package_weight_unit": "lb",
      "pack_count": null,
      "price": null,
      "upc": null,
      "selected": false
    },
    {
      "size_display": "19 lb",
      "package_weight_value": 19,
      "package_weight_unit": "lb",
      "pack_count": null,
      "price": null,
      "upc": "683547120150",
      "selected": true
    }
  ]
}
```

## Phase 5: Add QA gates

Add QA gates before data is accepted into Supabase or the admin review queue.

Suggested checks:

```python
PROTEIN_ONLY_CATEGORY_VALUES = {
    "poultry",
    "chicken",
    "beef",
    "salmon",
    "turkey",
    "fish",
    "lamb",
    "duck",
}

DIRTY_DESCRIPTION_MARKERS = {
    "virtual_list",
    "bottomSpacer",
    "data-qa=",
    "aria-setsize",
}

FORBIDDEN_IMAGE_DOMAINS = {
    "unsplash.com",
}
```

Gate rules:

- flag if category is protein-only
- flag if species is missing for pet products
- flag if food form is missing for food products
- flag if final approved image list is empty
- flag if raw image count is high but approved image count is low
- flag if forbidden image domains appear
- flag if duplicate image ratio is high
- flag if description contains dirty DOM markers
- flag if selected product URL redirects to a different product/family page without selected variant confirmation
- flag if variant options exist but `variants` is empty

Each QA result should include:

```json
{
  "code": "category_probably_protein",
  "severity": "error",
  "message": "Category 'Poultry' appears to be a protein/facet, not a taxonomy category.",
  "field": "category",
  "value": "Poultry"
}
```

## Acceptance criteria

### Benchmark acceptance

- A live URL extraction benchmark exists under `apps/scraper/benchmarks/url_extraction`.
- The benchmark can run the initial three Open Farm URLs.
- Reports are written as JSON and Markdown.
- Raw extractor output is saved per benchmark entry.
- The benchmark can fail under a configurable score threshold.
- Metrics include media quality, duplicate image ratio, dirty HTML, category/facet quality, field accuracy, latency, and token usage/cost when available.

### Media acceptance

- Final `image_urls` contains only approved product media.
- Rejected media is preserved in telemetry/debug output.
- Unsplash images are never accepted as product images.
- Width/crop variants are canonicalized.
- Open Farm benchmark entries return a reasonable number of approved images, not dozens of raw URLs.

### Strategy acceptance

- `ProductPageExtractor` still remains the public extraction interface.
- Strategy execution is visible in telemetry.
- Strategy field evidence is preserved before merging.
- Raw full-page LLM extraction is not the default for Open Farm.
- Open Farm has a deterministic or mostly deterministic extraction path.

### Category/variant acceptance

- Protein/facet values are not stored as canonical category.
- Dog dry food resolves to a dog dry-food category/facet set.
- Cat pâté resolves to a cat wet-food pâté category/facet set.
- Variant options are represented as structured variants where available.

## Suggested implementation order for agents

### Step 1: scout

Ask `scout` to inspect:

- current `ProductPageExtractor`
- current Crawl4AI extractor implementation
- current benchmark directories
- current fixture/test structure
- how extraction results flow into admin/Supabase

Deliverable:

```text
apps/scraper/docs/plans/url-extraction-context.md
```

### Step 2: planner

Ask `planner` to produce an implementation plan for:

- benchmark runner
- metrics module
- report writer
- initial Open Farm dataset
- unit tests for metrics

The planner should not edit code.

### Step 3: worker

Ask `worker` to implement the benchmark first.

Validation:

- run metrics unit tests
- run the benchmark locally if environment variables and browser dependencies allow it
- include sample report output

### Step 4: reviewer

Ask a fresh `reviewer` to review:

- scoring logic
- false positives/false negatives
- report readability
- CI safety
- whether live network calls are excluded from default unit tests

### Step 5: worker

Ask `worker` to implement `ProductMediaSelector` and wire media QA into benchmark scoring.

### Step 6: reviewer

Ask a fresh `reviewer` to validate:

- image canonicalization
- blocked domain handling
- Open Farm media results
- whether `image_urls` now contains only approved product media

### Step 7: planner then worker

Plan and implement Crawl4AI strategy orchestration after benchmark/media results are measurable.

## Agent prompt: benchmark implementation

```text
Implement the extraction-only URL benchmark described in docs/plans/serp-discovery-extraction-hardening-plan.md.

Do not revive the old official brand discovery benchmark.
Do not benchmark SERP discovery and extraction in the same score.
Use ProductPageExtractor as the extraction entry point.

Create:
- apps/scraper/benchmarks/url_extraction/dataset.json
- apps/scraper/benchmarks/url_extraction/runner.py
- apps/scraper/benchmarks/url_extraction/metrics.py
- apps/scraper/benchmarks/url_extraction/report.py
- tests for metrics

Start with the three Open Farm entries listed in the plan.

The benchmark must write:
- extraction-report.json
- extraction-report.md
- raw result JSON per entry

The benchmark must score:
- success
- brand
- name_contains
- description_contains
- weight
- species
- food_form
- category/facet sanity
- approved image count
- duplicate image ratio
- forbidden image domains
- dirty HTML markers
- duration
- token usage/cost when available

Live URL runs must not be part of default unit tests.
```

## Agent prompt: media selector implementation

```text
Implement ProductMediaSelector as described in docs/plans/serp-discovery-extraction-hardening-plan.md.

Use Crawl4AI result.media["images"] as structured candidates.
Do not save raw page images directly into product image_urls.

The selector must:
- canonicalize image URLs
- dedupe width/crop variants
- score images by product relevance
- use domain allow/block lists
- reject forbidden image domains such as images.unsplash.com
- reject obvious global assets such as recycle/transparency-map/logo/footer/social images
- assign primary/gallery/rejected roles
- preserve rejected image evidence in telemetry
- expose media stats for benchmark reporting

Wire approved images into final product facts only after selection.
```

## Agent prompt: Crawl4AI strategy orchestration

```text
Implement strategy orchestration behind ProductPageExtractor as described in docs/plans/serp-discovery-extraction-hardening-plan.md.

Do not replace ProductPageExtractor as the public interface.

Add strategy modules for:
- JSON-LD/meta
- Shopify/platform parser
- domain CSS/XPath schema
- scoped LLM schema extraction
- raw LLM fallback
- field evidence merge

Each strategy should return field evidence with confidence and source metadata.
Final product facts should be produced by a merge layer, not by whichever strategy ran last.

Use deterministic strategies before LLM fallback.
Use scoped LLM extraction before raw full-page LLM extraction.
Do not use the LLM to directly select final product images.
```

## Open questions

- Should benchmark reports be committed only as examples, or always generated locally and ignored?
- Which CI job should run fixture-mode benchmark checks?
- Should live URL benchmarks run manually only, or as scheduled nightly CI?
- Where should media evidence be stored in Supabase/admin review records?
- Which domains should receive deterministic schemas after Open Farm?

## Final target state

The pipeline should be able to say, for each product URL:

```text
We found the right URL.
We extracted the correct product facts.
We rejected unrelated media.
We separated taxonomy from flavor/protein facets.
We modeled variants correctly.
We know which strategy produced each field.
We have benchmark evidence that quality improved.
```

That is the difference between a scraper and a page-shaped garbage disposal.
