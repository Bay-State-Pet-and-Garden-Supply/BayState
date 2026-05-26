## Review

- Correct:
  - `fields.images` / `fields.image_urls` are populated from `selected_images`, not raw page images (`sandbox/product-page-extraction/scripts/extract_product_page.py:252-253`).
  - Raw and selected image buckets are separated in packet media (`extract_product_page.py:342-351`) and schema/docs (`schemas/product_packet.schema.json:221-230`, `docs/evidence-packet.md:14-27`, `README.md:160`).
  - Latest Fromm dog Four-Star output does **not** select all images: `fields.images=[]` (`outputs/.../packet.json:64-65`), while raw counts remain diagnostic (`all_page=41`, `rendered=41`, `selected_product=0`, `rejected_noise=41`; `packet.json:152-158`).
  - Existing latest packet/comparison/agent-browser artifacts validate against schemas.

- Blocker:
  - Benchmark truth leaks into extraction selection. `extract_product_page.py` passes `fixture_row` into image selection (`scripts/extract_product_page.py:224-228`), and `media_scoring.select_product_images()` reads `expected.carousel_image_urls` (`scripts/media_scoring.py:106-107`) then promotes matching URLs into selected product images (`scripts/media_scoring.py:133-136`). That makes fixture expected answers influence actual extracted `fields.images`. Fix now: use fixture carousel truth only in scoring, not selection.

- Blocker:
  - Fromm category/collection classification still fails. Current classifier only returns collection when product cards are captured or category markers exist (`scripts/page_classifier.py:89-94`); latest Fromm dog Four-Star packet is `unknown` (`outputs/.../packet.json:11-20`) and page_type score fails `expected=collection != actual=unknown` (`packet.json:431-434`). Fix now if Round 2 requires Fromm category semantics: classify `/products/<species>/<line>/` no-JSON-LD pages as collection/category without relying on Crawl4AI product cards.

- Note:
  - Round2 fixtures are internally inconsistent: rows labeled `canonical_jsonld_pdp` / `canonical_html_pdp` expect `page_type:"collection"` (`fixtures/products.round2.jsonl:1-4`), and rows 5-6 require `images` while `carousel_image_urls` is empty, which docs define as “no selected product images are expected” (`fixtures/README.md:21`). This will make image/page benchmarks hard to trust.
  - I did not write `sandbox-review/strict-image-review.md` because the task also said “Do not edit files”; per review-only instructions, no-edit wins.