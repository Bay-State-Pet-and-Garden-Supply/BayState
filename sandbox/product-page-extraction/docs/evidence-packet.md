# Evidence Packet Contract

The canonical output is `outputs/<run-id>/packet.json` matching `schemas/product_packet.schema.json`.

## New for Round 2

### `classification` — page-type classification
- `page_type`: `pdp`, `collection`, `category`, `brand_home`, `blog_support`, `unknown`
- `confidence`: classifier confidence score
- `product_card_count`: number of product cards found in rendered DOM
- `signals`: list of classification signals used
- `warnings`: low-confidence or ambiguous signals

### `extraction.media` — strict product-image provenance
- `all_page_images`: all diagnostic page images discovered by default/rendered extraction
- `candidate_product_images`: images with some product-binding signal
- `selected_product_images`: images accepted for the desired product; mirrors `fields.images`
- `rejected_images`: rejected page images with `{url, reason}`
- `default_images`: images from JSON-LD/meta (deterministic)
- `rendered_images`: images from Crawl4AI scroll + DOM extraction
- `llm_images`: images proposed by LM Studio
- `selected_images`: backward-compatible alias for selected product images
- `image_count_by_method`: counts for default, rendered, llm, all_page, candidate_product, selected_product, rejected_noise
- `media_extraction_method`: how images were sourced
- `rendered_evidence_path`: path to rendered-evidence.json artifact

`fields.images` / `image_urls` means **selected desired-product carousel/gallery/card images only**. It must not contain every image found on the page. Collection/category pages may have many images but should select product images only when a specific product card/gallery is matched strongly enough.

### `extraction.product_cards` — product-card evidence
Each card: title, href, image_urls, onclick, data_attributes, element_signature, score, matched_tokens, missing_tokens.

### `extraction.llm_metrics` — LM Studio reliability
- model, base_url, latency_ms, attempts, timeout_count, schema_validation_passed, error, finish_reason

### `validation.field_scores` — per-field benchmark scoring
Each field: name, brand, species, size, upc, description, ingredients, images, page_type.
Each has: score, passed, reason.

### `validation.page_type_gating`
- page_type, gated (boolean), reason

## Rules

1. UPC, SKU, price, ingredients, and images must not be invented by LM Studio.
2. Every high-confidence field should have field evidence.
3. `accept` requires `page_type == "pdp"` plus strong product evidence.
4. `review` for collection/category pages unless product-card match is certain.
5. `conflict` for mismatch, weak evidence, extraction failure, or low-confidence page type.
6. Raw image count is diagnostic only; product-image success is measured by selected product-image precision/recall.
