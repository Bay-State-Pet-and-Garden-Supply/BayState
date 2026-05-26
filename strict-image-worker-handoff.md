# Strict Product Image Semantics Handoff

## Implemented

All changes are within `sandbox/product-page-extraction/**`.

- Added `scripts/media_scoring.py` for strict desired-product image selection and precision/recall scoring.
- Updated `scripts/extract_product_page.py` so `fields.images` / `fields.image_urls` contain only `selected_product_images`, not all page images.
- Added media buckets under `extraction.media`:
  - `all_page_images`
  - `candidate_product_images`
  - `selected_product_images`
  - `rejected_images`
  - existing default/rendered/LLM image diagnostics
- Updated `scripts/field_scoring.py` so image field scoring uses selected product-image precision/recall and fixture carousel truth.
- Updated `scripts/compare_results.py` to report raw counts separately from product-image success metrics.
- Updated schemas for packet/comparison media buckets.
- Updated fixtures with expected product image semantics fields.
- Updated README, fixture docs, and evidence packet docs.

## Validation

Passed:

```bash
cd sandbox/product-page-extraction
python3 -m compileall scripts
python3 scripts/validate_env.py --strict
python3 scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --dry-run
python3 scripts/run_fixture.py --fixture fixtures/products.round2.jsonl --dry-run
python3 scripts/validate_packet.py outputs/20260526T194234Z-fixture-batch/20260526T194235Z-fromm-four-star-dog/packet.json
python3 scripts/validate_packet.py outputs/20260526T194234Z-fixture-batch/20260526T194235Z-fromm-four-star-dog/comparison.json
```

Live Fromm dog run with agent-browser fallback passed.

## Fromm strict-image result

For latest `fromm-four-star-dog` run (`outputs/20260526T195013Z-fixture-batch/...`):

- page type: collection
- raw rendered images: 41
- all page images: 41
- agent-browser raw images: 109
- selected product images: 0
- candidate product images: 0
- rejected images: 41
- `fields.images`: 0
- recommendation: conflict
- image precision/recall: 1.0 / 1.0 for empty expected carousel truth

This satisfies the user requirement: the sandbox no longer treats all page images as product image URLs.

## Reviewer follow-up fixes

- Removed fixture truth leakage from extraction selection: `expected.carousel_image_urls` is now used only by scoring, not selection.
- Product-card matching no longer uses fixture `expected_tokens`; extraction uses only input name/UPC and runtime evidence.
- Fromm `/products/dog/four-star/` now classifies as `collection` via generic `product_line_path` signal even when Crawl4AI product cards are unavailable.

## Remaining gaps

- Exact carousel truth is still unknown for many public fixtures; image scoring is conservative when `expected.carousel_image_urls` is empty.
- Fromm category pages still lack Crawl4AI product cards because Crawl4AI cannot currently capture the direct JS eval return the way agent-browser can.
- The round2 matrix still needs more manually verified PDP fixtures with known carousel images for strong precision/recall benchmarking.
