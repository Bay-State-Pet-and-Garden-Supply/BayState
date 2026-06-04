# Implementation Plan

## Goal
Upgrade unknown-site product extraction so `Crawl4AIExtractor` captures canonical product facets, uses deterministic platform schemas before LLM fallback, preserves source-method telemetry, and fails closed on weak/product-listing evidence without touching protected price/stock fields.

## Tasks
1. **Extend the LLM product schema with canonical facets**: Add optional fields to the Pydantic schema used by `LLMExtractionStrategy`.
   - File: `apps/scraper/scrapers/schemas/product.py`
   - Changes: Add optional schema fields: `animal_type`, `life_stage`, `breed_size`, `food_form`, `flavor`, `primary_protein`, `diet_type`, `package_count`, `package_weight`, `dimensions`, `packaging_type`, `material`, `color`. Keep existing fields and exclude price, stock, availability, and operational fields.
   - Acceptance: `ProductData.model_json_schema()` includes the new fields and still excludes protected fields.

2. **Add prompt v6 for canonical-facet extraction**: Create a new prompt version aligned with the expanded schema.
   - File: `apps/scraper/prompts/extraction_v6.txt`
   - Changes: Base it on `extraction_v5.txt`; add field rules for canonical facets; explicitly instruct the model to return empty values when evidence is absent; explicitly exclude price, stock, availability, shipping, and unrelated cross-sells.
   - Acceptance: `build_extraction_instruction(..., prompt_version="v6")` includes every `ProductData` field and contains no price/availability extraction instructions.

3. **Make v6 the default prompt version**: Default unknown-site extraction to the upgraded prompt while preserving older prompt versions.
   - File: `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py`
   - Changes: Change `Crawl4AIExtractor.__init__(..., prompt_version="v5")` to `prompt_version="v6"`.
   - File: `apps/scraper/scrapers/utils/ai_utils.py`
   - Changes: Update `build_extraction_instruction` docstring/default from v5 to v6. Leave hardcoded fallback unchanged or minimally update only if desired; file-backed v6 should be authoritative.
   - Acceptance: Existing v1-v5 prompt loading still works; default extractor instances report `prompt_version == "v6"`.

4. **Normalize new LLM fields without dropping them**: Preserve canonical facets after LLM extraction, fallback extraction, and v1 conversion.
   - File: `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py`
   - Changes: In `_normalize_llm_product_data`, copy/sanitize new fields from `product_data`; normalize numeric/string fields where appropriate (`package_count`, `package_weight`, `unit_value`, `dimensions`), but do not infer unsupported facts. Update `extract_to_v1` to include canonical fields in the returned result and `field_confidence`.
   - File: `apps/scraper/scrapers/ai_search/enrichment_models.py`
   - Changes: In `build_v1_from_extraction_result`, add canonical keys currently missing from the product-facts dicts: `animal_type`, `breed_size`, `primary_protein`, `diet_type`, `package_count`, `package_weight`, `material`, plus any new schema fields not already passed through. Keep existing legacy aliases (`pet_type`, `pet_size`, etc.).
   - File: `apps/scraper/scrapers/product_url_extraction/extractor.py`
   - Changes: Add the canonical fields to both `normalized` and `product_facts` so `source_results[].product` has the new facets.
   - File: `apps/scraper/scrapers/product_url_extraction/known_url_wrapper.py`
   - Changes: Add the canonical fields to `_build_extracted_payload` attributes.
   - Acceptance: A mocked LLM payload containing `animal_type`, `primary_protein`, `diet_type`, `package_count`, and `dimensions` appears in the final extraction result and in `source_results[].product.facets` after v1 conversion.

5. **Add platform fingerprinting and curated schema definitions**: Create deterministic platform detection and schema selection for common commerce platforms.
   - New File: `apps/scraper/scrapers/ai_search/platform_extraction.py`
   - Changes: Implement:
     - `detect_platform(html: str, url: str) -> str | None` for `shopify`, `woocommerce`, `magento`, and `bigcommerce` using fingerprints such as Shopify CDN/scripts, WooCommerce `wp-content/plugins/woocommerce`, Magento `Magento_`/`mage/`/`static/version`, and BigCommerce/stencil/cdn indicators.
     - `build_platform_schema(platform: str) -> dict[str, Any]` returning pre-curated `JsonCssExtractionStrategy` schemas for product name, brand, description, size/spec text, images, categories/breadcrumbs, and spec-table text. Do not include price/stock selectors.
     - `normalize_platform_payload(payload, url, extraction_utils, expected_name, expected_brand) -> dict[str, Any]` to coerce Crawl4AI CSS output into the same flat result shape used by LLM/fallback.
   - Acceptance: Unit tests detect each platform from representative HTML and schemas contain product fields but no protected fields.

6. **Run platform schema extraction before LLM fallback**: Add a deterministic pre-LLM pass inside `Crawl4AIExtractor` without changing `Crawl4AIEngine` semantics.
   - File: `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py`
   - Changes: After JSON-LD/microdata/meta extraction is incomplete and before constructing `LLMExtractionStrategy`, call a helper like `_try_platform_schema_extraction(engine, url, html, markdown, crawl_media, upc, product_name, brand)`. The helper should:
     - Detect the platform from first-crawl HTML/URL.
     - Build `JsonCssExtractionStrategy(schema=platform_schema)`.
     - Set `engine.config["crawler"]["extraction_strategy"]` for a second Crawl4AI run only when a platform fingerprint exists.
     - Normalize output with existing `_normalize_llm_product_data`/shared utilities.
     - Accept only if `_check_extraction_completeness` says it is complete and evidence quality is acceptable; otherwise keep it as `jsonld_fallback`/partial fallback and continue to LLM.
     - Set `method` to `platform-schema:<platform>` and include platform in telemetry.
   - Acceptance: Mocked Shopify/BigCommerce HTML with no JSON-LD uses `JsonCssExtractionStrategy` before LLM, returns `method == "platform-schema:shopify"` or equivalent, and does not instantiate `LLMExtractionStrategy` when complete.

7. **Use richer LLM input when fit markdown is too narrow**: Prevent BM25 filtering from hiding spec tables and facet evidence from the LLM.
   - File: `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py`
   - Changes: Track `fit_markdown`, `raw_markdown`, and `markdown_value` separately after the first crawl. Add helper `_select_llm_markdown(fit_markdown, raw_markdown, markdown_value, html, upc, brand, product_name) -> tuple[str, str]` that returns `(text, source_label)`:
     - Use raw markdown when available and reasonably sized.
     - Use a hybrid of fit markdown plus raw/spec snippets when raw is large.
     - Pull snippets around terms like `ingredients`, `guaranteed analysis`, `analysis`, `dimensions`, `weight`, `size`, `life stage`, `breed size`, `flavor`, `protein`, `NPK`, `material`, `color`, and `package`.
     - Fall back to current `fit_markdown or raw_markdown or markdown_value` behavior.
   - Changes: Replace both LLM call sites so `safe_markdown` comes from `_select_llm_markdown`, not always the BM25-filtered `markdown` variable.
   - Acceptance: Unit tests prove raw/spec snippets are passed to `LLMExtractionStrategy.extract` when fit markdown lacks those sections, while existing no-second-browser-navigation behavior remains unchanged.

8. **Strengthen completeness and evidence-quality gates**: Ensure weak/listing/search pages and logo-only media fall through or fail closed.
   - File: `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py`
   - Changes: Expand `_check_extraction_completeness` to accept `url` and optional `method/platform` context. Add flags for:
     - `weak_evidence_url`: search/listing/category/cart URLs unless the path also includes a product identifier such as `/products/`.
     - `missing_images` or `logo_only_images`: all images look like logo/icon/placeholder/banner/sprite/favicon/no-image.
     - `facet_sparse`: product appears pet/garden/hardware-relevant but has no canonical facets and only generic categories.
     - Existing generic description and brand-only title checks.
   - Changes: Update all call sites to pass `url`. LLM escalation should happen for incomplete deterministic results; final LLM/platform acceptance should reject weak evidence unless identity fields are strong.
   - Acceptance: Tests cover `/search?q=...`, collection/category pages without `/products/`, and logo-only image payloads; these must not short-circuit as successful deterministic results.

9. **Return and persist extraction-method telemetry per source**: Make method visibility reliable beyond logs.
   - File: `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py`
   - Changes: Add lightweight telemetry fields to returned result dicts, e.g. `method`, `platform`, `llm_input_source`, and `telemetry.image_diagnostics` where already available. Keep existing logger telemetry.
   - File: `apps/scraper/scrapers/product_url_extraction/extractor.py`
   - Changes: Include `extractionMethod`, `platform`, and `llmUsed` in each `source_results` entry based on `result.get("method")` and `result.get("platform")`.
   - File: `apps/scraper/scrapers/ai_search/enrichment_models.py`
   - Changes: Add optional fields to `SourceResultInfo`: `extractionMethod: Optional[str]`, `platform: Optional[str]`, `llmUsed: Optional[bool]`. Populate them in `build_v1_from_extraction_result` when source result dicts include them.
   - File: `apps/web/lib/enrichment/contracts.ts`
   - Changes: Add optional `extractionMethod?: string | null`, `platform?: string | null`, `llmUsed?: boolean | null` to `SourceResultInfo`.
   - File: `apps/web/lib/enrichment/validation.ts`
   - Changes: Update `sourceResultInfoSchema` to accept the optional telemetry fields.
   - Acceptance: Web validation accepts enriched callbacks containing the new source-result fields, and legacy source_results without them still pass.

10. **Add tests for schema, prompt, normalization, platform pass, and fail-closed gates**: Cover the new behavior with focused unit tests.
   - File: `apps/scraper/tests/unit/test_prompt_loading.py`
   - Changes: Update default prompt-version expectation to v6; add a v6 field coverage test for all schema fields; keep v5 backward-compat tests.
   - File: `apps/scraper/tests/unit/test_extractor_optimization.py`
   - Changes: Add tests for canonical facet preservation, richer LLM markdown selection, platform-schema-before-LLM behavior, and quality gates.
   - New File: `apps/scraper/tests/unit/test_platform_extraction.py`
   - Changes: Unit-test platform detection and schema contents for Shopify, WooCommerce, Magento, and BigCommerce.
   - File: `apps/scraper/tests/unit/test_official_brand_scraper.py`
   - Changes: Verify `ProductPageExtractor` preserves canonical fields and source-result method telemetry.
   - File: `apps/scraper/tests/unit/test_known_url_wrapper.py`
   - Changes: Verify known-URL JSON output includes canonical fields.
   - File: `apps/web/__tests__/lib/enrichment/merge-enriched-source.test.ts` or a new validation-focused test
   - Changes: Verify optional source-result telemetry survives merge/validation and does not break legacy payloads.
   - Acceptance: Focused tests pass without live network or real LLM calls.

11. **Run focused validation**: Validate scraper and web changes with targeted commands.
   - File: N/A
   - Changes: Run from repo root or workspaces:
     - `cd apps/scraper && python -m pytest tests/unit/test_prompt_loading.py tests/unit/test_extractor_optimization.py tests/unit/test_platform_extraction.py tests/unit/test_official_brand_scraper.py tests/unit/test_known_url_wrapper.py tests/unit/crawl4ai_engine/test_strategies.py`
     - `bun run web test -- --testPathPatterns="lib/enrichment|detail-enrichment|merge-enriched-source"`
   - Acceptance: Targeted scraper and web tests pass. If full web tests are run, document any unrelated pre-existing failures separately.

## Files to Modify
- `apps/scraper/scrapers/schemas/product.py` - expanded `ProductData` schema used by `LLMExtractionStrategy`.
- `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py` - default v6 prompt, platform pass, richer LLM markdown selection, completeness gates, normalization, telemetry.
- `apps/scraper/scrapers/utils/ai_utils.py` - default prompt-version documentation and v6 handling expectations.
- `apps/scraper/scrapers/ai_search/enrichment_models.py` - canonical facet passthrough and source-result telemetry fields.
- `apps/scraper/scrapers/product_url_extraction/extractor.py` - canonical facet passthrough and per-source extraction telemetry.
- `apps/scraper/scrapers/product_url_extraction/known_url_wrapper.py` - canonical facet passthrough for JSON boundary output.
- `apps/scraper/tests/unit/test_prompt_loading.py` - v6 prompt/default tests.
- `apps/scraper/tests/unit/test_extractor_optimization.py` - extractor pipeline and quality-gate tests.
- `apps/scraper/tests/unit/test_official_brand_scraper.py` - ProductPageExtractor passthrough/telemetry tests.
- `apps/scraper/tests/unit/test_known_url_wrapper.py` - known URL output tests.
- `apps/web/lib/enrichment/contracts.ts` - source-result telemetry contract additions.
- `apps/web/lib/enrichment/validation.ts` - source-result telemetry validation additions.
- `apps/web/__tests__/lib/enrichment/merge-enriched-source.test.ts` - telemetry preservation/legacy compatibility tests if using existing test file.

## New Files
- `apps/scraper/prompts/extraction_v6.txt` - expanded schema-aligned LLM instruction prompt.
- `apps/scraper/scrapers/ai_search/platform_extraction.py` - platform fingerprinting, curated schemas, and platform payload normalization.
- `apps/scraper/tests/unit/test_platform_extraction.py` - platform detection/schema tests.
- Optional: `apps/web/__tests__/lib/enrichment/validation.test.ts` - focused validation test if adding to merge tests is awkward.

## Dependencies
- Task 2 depends on Task 1 so the prompt field list matches the schema.
- Task 3 depends on Task 2 because v6 must exist before becoming the default.
- Task 4 depends on Task 1 and should be completed before platform/LLM pipeline changes are considered done.
- Task 6 depends on Task 5 and should reuse Task 8 quality gates.
- Task 7 can be implemented independently after understanding current first-crawl markdown variables, but its acceptance tests overlap with Task 10.
- Task 8 should be implemented before final acceptance of Tasks 6 and 7 so platform/LLM outputs share the same fail-closed behavior.
- Task 9 depends on extraction methods from Tasks 6 and 7 and requires both scraper and web contract updates.
- Task 10 depends on the implementation tasks it validates.

## Risks
- Crawl4AI `JsonCssExtractionStrategy` schema details may differ from assumed generic CSS schema shape; verify with unit tests and current Crawl4AI version before relying on platform schemas.
- Generic platform CSS selectors can rot or over-extract related products; accept platform output only after identity/completeness gates pass.
- "Any website" is not achievable; the target should remain best-effort extraction with fail-closed validation.
- Using raw/hybrid markdown increases token volume and cost; telemetry should track `llm_input_source` so quality/cost can be measured.
- LLM facet hallucination risk increases with more fields; v6 prompt and post-validation must prefer empty values over guesses.
- Web contract changes should be backward compatible because new source-result fields are optional; still validate callback parsing.
- Do not include or optimize price, stock, availability, shipping cost, or protected operational fields anywhere in schema, prompts, platform selectors, or downstream mappings.
