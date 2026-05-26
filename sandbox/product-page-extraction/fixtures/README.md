# Fixture Format

Fixtures are JSONL: one product scenario per line.

Required fields:

- `fixture_id`: stable unique id for output directories.
- `site_key`: key from `configs/site.sample.yaml`.
- `mode`: `known_url` or `discover`.
- `url`: required for `known_url`, null for discovery.
- `upc`, `sku`, `brand`, `name`: input hints and validation expectations.
- `expected`: assertions used by validators. May include:
  - `page_type`: expected page classification (pdp, collection, category, brand_home, blog_support, unknown).
  - `species`, `size`: expected species/size tokens.
  - `name_contains`, `brand`: text overlap expectations.
  - `required_fields`: fields that must be present.
  - `product_name`, `expected_tokens`: desired product matching hints.
  - `upc_present_on_page`: whether UPC should appear as page evidence.
  - `product_card_should_match`: whether a collection page should expose a matchable product card.
  - `required_evidence`: evidence types required for the fixture.
  - `carousel_image_urls`: exact/substring truth set for desired product carousel/gallery/card images. Empty means no selected product images are expected.
  - `non_product_image_patterns`: URL substrings that must be rejected as page noise.
  - `min_product_image_precision`, `min_product_image_recall`: selected product-image thresholds.
  - `image_min`, `rendered_image_min`, `agent_browser_image_min`: raw diagnostic count expectations only; these do not imply product-image success.
  - `allow_collection_review`: whether collection/category review is allowed.
- `thresholds`: confidence cutoffs (`accept_confidence`, `manual_review_below`).
- `options`: per-fixture toggles for `allow_llm`, `allow_agent_browser`, `screenshot`.

Benchmark Round 2 fixture file: `fixtures/products.round2.jsonl` (15+ rows across 5 groups).

Image contract: `fields.images` must contain only selected images for the desired product. Use `expected.carousel_image_urls` and image precision/recall scoring to test this. All page images belong in diagnostic media buckets, not product fields.

Do not commit credentials, cookies, generated packets, screenshots, or live scrape dumps.
