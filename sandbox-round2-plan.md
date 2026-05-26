# Implementation Plan

## Goal
Create Benchmark Round 2 in `sandbox/product-page-extraction/` so the sandbox can determine whether Crawl4AI rendered DOM extraction can close the image gap vs agent-browser, classify PDP vs collection/category pages, extract product-card evidence, score fixtures per field, and record LM Studio/Gemma reliability metrics without touching production code.

## Tasks

1. **Centralize rendered DOM extraction JavaScript**: Move the current image extraction JS out of shell-only code so Crawl4AI and agent-browser use the same extraction logic.
   - File: `sandbox/product-page-extraction/scripts/common.py`
   - Changes: Replace/extend `IMAGE_EXTRACTION_JS` with a richer `RENDERED_EVIDENCE_JS` string that returns JSON with `url`, `title`, `h1`, `images`, `textSample`, and `productCards`. Product cards should include `title`, `href`, `image_urls`, `onclick`, `data_attributes`, `nearby_text`, and `element_signature` when available. Include selectors for common card patterns (`article`, `[class*=product]`, `[class*=card]`, links containing `/products`, buttons with `onclick`, etc.) and keep URL normalization in the browser JS.
   - Acceptance: Both extraction paths can import or embed the same JS source; no duplicate divergent image extraction logic remains except small shell quoting wrappers.

2. **Add Crawl4AI rendered media pass**: Execute the shared DOM extraction JS inside the Crawl4AI crawl after scroll/wait behavior.
   - File: `sandbox/product-page-extraction/scripts/extract_product_page.py`
   - Changes: Add helper functions such as `build_rendered_js(scroll_steps, wait_ms)`, `parse_rendered_evidence(result)`, and `extract_rendered_evidence(...)`. Use Crawl4AI `CrawlerRunConfig(js_code=...)` or the version-compatible mechanism to scroll the page, wait for lazy-loaded content, and return/evaluate the shared JS payload. Persist raw rendered evidence to `rendered-evidence.json`.
   - Acceptance: Running `extract_product_page.py` against `https://frommfamily.com/products/dog/four-star/` produces a packet with Crawl4AI-rendered image count substantially higher than the current default count of 1, or records a clear failure reason in `errors`.

3. **Add media method accounting to packets**: Track default Crawl4AI images, rendered DOM images, LLM images, and agent-browser images separately.
   - Files: `sandbox/product-page-extraction/scripts/extract_product_page.py`, `sandbox/product-page-extraction/schemas/product_packet.schema.json`, `sandbox/product-page-extraction/docs/evidence-packet.md`
   - Changes: Add `extraction.media` or `crawl.media` object with:
     - `default_images`
     - `rendered_images`
     - `llm_images`
     - `selected_images`
     - `image_count_by_method`
     - `media_extraction_method`
     - `rendered_evidence_path`
   - Acceptance: Packet schema validation passes and packet JSON clearly shows image counts by method.

4. **Update selected image logic**: Populate `fields.images` from the best available evidence without losing method provenance.
   - File: `sandbox/product-page-extraction/scripts/extract_product_page.py`
   - Changes: Prefer page-sourced product JSON-LD/meta images when present; otherwise include filtered rendered images. Keep LLM images only if they are present in source evidence. Store chosen images in `fields.images` and full method-specific lists in the new media object.
   - Acceptance: Fromm category packets still do not become `accept` based on image quantity alone, but `fields.images` no longer remains limited to one hero image when rendered DOM evidence contains many images.

5. **Make agent-browser use the same rendered evidence JS**: Keep the CLI path as a fallback comparator while aligning its output shape with Crawl4AI rendered evidence.
   - File: `sandbox/product-page-extraction/scripts/agent_browser_capture.sh`
   - Changes: Generate or read the shared JS source from `common.py` if practical; otherwise update the shell JS to match `RENDERED_EVIDENCE_JS` exactly and include `productCards`. Add image count and product card count to `dom-extract.json`.
   - Acceptance: `agent_browser_capture.sh https://example.com test` still writes a schema-valid `dom-extract.json`, now including product-card fields even when empty.

6. **Extend agent-browser schema**: Validate the new rendered evidence and product-card fields.
   - File: `sandbox/product-page-extraction/schemas/agent_browser_result.schema.json`
   - Changes: Add optional/required nested fields for `rendered.images`, `rendered.productCards`, `rendered.image_count`, `rendered.product_card_count`, and `rendered.extraction_method`.
   - Acceptance: `python scripts/validate_packet.py --kind agent-browser agent-browser-runs/<run>/dom-extract.json` passes after a fresh capture.

7. **Add deterministic page-type classifier**: Classify pages as `pdp`, `collection`, `category`, `brand_home`, `blog_support`, or `unknown` without relying on Gemma.
   - New File: `sandbox/product-page-extraction/scripts/page_classifier.py`
   - Changes: Implement `classify_page(url, title, h1, jsonld, meta, markdown, rendered_evidence) -> dict`. Signals should include JSON-LD `Product`, product-card count, URL path markers, title/H1 collection words, homepage path, blog/support path markers, product-specific vs plural/category wording, and query/filter params. Return `page_type`, `confidence`, `signals`, and `warnings`.
   - Acceptance: Fromm dog/cat Four-Star pages classify as `collection` or `category`, not `pdp`; `https://example.com` classifies as `unknown` or `brand_home` with low confidence.

8. **Integrate page type into packet and recommendation**: Use page type as a safety gate for `accept`.
   - Files: `sandbox/product-page-extraction/scripts/extract_product_page.py`, `sandbox/product-page-extraction/schemas/product_packet.schema.json`, `sandbox/product-page-extraction/docs/evidence-packet.md`
   - Changes: Add `classification` object to packet with classifier output. Update recommendation logic so `accept` requires `page_type == "pdp"` plus strong product evidence, while `collection`/`category` can only be `review` unless product-card-level exact match is added later.
   - Acceptance: Existing Fromm fixtures remain `review` or `conflict`; they cannot become `accept` from image count or LLM description alone.

9. **Add product-card extraction and matching**: Surface product-card-level evidence for collection pages.
   - Files: `sandbox/product-page-extraction/scripts/common.py`, `sandbox/product-page-extraction/scripts/extract_product_page.py`
   - Changes: Use `productCards` from rendered evidence. Add `match_product_cards(cards, input_name, upc, expected_tokens)` scoring by title token overlap, species/size tokens, href/product markers, image proximity, data attributes, and onclick/Umbraco IDs. Store top cards in packet under `extraction.product_cards` with `score`, `matched_tokens`, `missing_tokens`, and card evidence.
   - Acceptance: Fromm category pages produce non-empty `product_cards` if rendered DOM exposes cards; if not, packet records `product_card_count: 0` and a warning that card isolation failed.

10. **Add Fromm-specific diagnostics without hardcoding production selectors**: Capture enough rendered DOM/card data to identify Umbraco product IDs if present.
    - Files: `sandbox/product-page-extraction/scripts/common.py`, `sandbox/product-page-extraction/docs/experiment-log.md`
    - Changes: In rendered JS, capture `data-*` attributes, `onclick`, element `id`, class names, nearest link href, nearest heading/text, and image URLs. Do not add Fromm-only selectors as production logic; if Fromm-specific observations are needed, document them in the experiment log.
    - Acceptance: The rendered evidence artifact for Fromm can be inspected to determine whether Umbraco IDs or product-card data exist.

11. **Add per-field benchmark scoring module**: Score expected vs actual independently of the overall packet recommendation.
    - New File: `sandbox/product-page-extraction/scripts/field_scoring.py`
    - Changes: Implement scoring functions for `name`, `brand`, `species`, `size`, `upc`, `description`, `ingredients`, `images`, and `page_type`. Use fixture `expected` data and packet fields/classification/media. Return per-field `expected`, `actual`, `score`, `passed`, and `reason`.
    - Acceptance: Given a packet and fixture row, field scoring returns a stable object even when fields are missing.

12. **Integrate per-field scoring into fixture summaries**: Batch output should show which fields passed or failed.
    - File: `sandbox/product-page-extraction/scripts/run_fixture.py`
    - Changes: After each packet, call `field_scoring.score_fixture(packet, row)`. Include `field_scores`, `page_type`, `image_count_by_method`, `llm_metrics`, and `agent_browser_delta` in each `summary.json` result. Keep existing `recommendation` and `confidence` keys for compatibility.
    - Acceptance: Running `run_fixture.py --fixture fixtures/products.sample.jsonl --limit 1` writes `summary.json` with per-field scores, not just a packet path and recommendation.

13. **Add LLM reliability metrics**: Record latency, model id, timeout/retry count, schema validation status, and conservative-null checks.
    - Files: `sandbox/product-page-extraction/scripts/lmstudio_extract.py`, `sandbox/product-page-extraction/scripts/extract_product_page.py`, `sandbox/product-page-extraction/schemas/product_packet.schema.json`
    - Changes: Return both extraction result and metrics from LM Studio helper, or add a wrapper such as `extract_product_fields_with_metrics`. Metrics should include `latency_ms`, `model`, `base_url`, `attempts`, `timeout_count`, `schema_validation_passed`, `error`, and `finish_reason` when available. Store under `extraction.llm_metrics` even when skipped/timed out.
    - Acceptance: A Gemma timeout produces `llm_metrics.schema_validation_passed=false`, `timeout_count>=1`, and a clear skipped reason without crashing in `auto` mode.

14. **Add LLM hallucination/null-correctness checks**: Flag values that appear unsupported by the evidence.
    - Files: `sandbox/product-page-extraction/scripts/field_scoring.py`, `sandbox/product-page-extraction/scripts/extract_product_page.py`
    - Changes: Compare LLM output for UPC, SKU, price, ingredients, size, and image URLs against source evidence strings/JSON-LD/meta/rendered images. Add `llm_metrics.null_correctness` and `llm_metrics.hallucination_flags` or place flags under `validation.llm_safety`.
    - Acceptance: If Gemma invents a UPC or ingredient not in source evidence, the packet validation warns and per-field score fails. Existing Gemma behavior with nulls should score as safe.

15. **Extend fixture schema by convention**: Add expected page type, tokens, species, size, and rendered-fallback expectations to fixture rows.
    - Files: `sandbox/product-page-extraction/fixtures/products.sample.jsonl`, `sandbox/product-page-extraction/fixtures/README.md`
    - Changes: Update fixture docs and sample rows to include:
      - `expected.page_type`
      - `expected.expected_tokens`
      - `expected.species`
      - `expected.size`
      - `expected.should_find_upc`
      - `expected.rendered_image_min`
      - `expected.agent_browser_image_min`
      - `expected.allow_collection_review`
    - Acceptance: `run_fixture.py --dry-run` validates these optional fields and prints fixture IDs without errors.

16. **Build Benchmark Round 2 fixture matrix**: Add 15-25 fixtures across the oracle’s five categories.
    - File: `sandbox/product-page-extraction/fixtures/products.round2.jsonl`
    - Changes: Create a new fixture file rather than overloading `products.sample.jsonl`. Include groups:
      - `canonical_jsonld_pdp` — at least 5 real PDP URLs known to expose Product JSON-LD
      - `canonical_html_pdp` — at least 5 PDP URLs without JSON-LD but useful meta/HTML
      - `spa_lazy_collection` — at least 5 including Fromm dog/cat Four-Star
      - `marketing_only` — 3-5 official brand pages/home/category pages with no exact PDP
      - `false_positive_traps` — at least 3 blog/recipe/store-locator/wrong-species/retailer URLs
    - Acceptance: Fixture file contains at least 15 rows, each with `fixture_id`, `group`, `mode`, URL/site info, input fields, expected page type, required evidence, and options.

17. **Update comparison script for three-way image accounting**: Compare default Crawl4AI, Crawl4AI-rendered, and agent-browser images.
    - File: `sandbox/product-page-extraction/scripts/compare_results.py`
    - Changes: Read `packet.extraction.media` and `agent_browser.rendered.images`. Output scores for `crawl4ai_default_count`, `crawl4ai_rendered_count`, `agent_browser_count`, `rendered_vs_agent_overlap`, `agent_browser_unique_count`, and `crawl4ai_rendered_close_enough` (for example rendered count >= 80% of agent-browser count or overlap threshold). Keep CLI flags stable.
    - Acceptance: Comparison for Fromm clearly answers whether Crawl4AI rendered extraction closed the previous 1 vs 109 gap.

18. **Update comparison schema**: Validate new image and field score comparison details.
    - File: `sandbox/product-page-extraction/schemas/comparison.schema.json`
    - Changes: Add optional schema properties for `image_comparison`, `field_scores`, `page_type_comparison`, and `tool_timings`. Keep `additionalProperties: true` for flexibility.
    - Acceptance: Fresh comparison output validates with `validate_packet.py`.

19. **Add benchmark runner summary fields**: Make batch summaries useful for deciding next architecture step.
    - File: `sandbox/product-page-extraction/scripts/run_fixture.py`
    - Changes: Aggregate totals by fixture group and page type. Include counts for `accept`, `review`, `conflict`, LLM timeouts, schema failures, suspected hallucinations, Crawl4AI rendered image success, and agent-browser added-useful-images cases.
    - Acceptance: `summary.json` has a top-level `aggregate` object with group/page-type statistics.

20. **Update validation docs and README**: Document Round 2 workflow and new output fields.
    - Files: `sandbox/product-page-extraction/README.md`, `sandbox/product-page-extraction/docs/evidence-packet.md`, `sandbox/product-page-extraction/docs/experiment-log.md`
    - Changes: Add commands for Round 2 benchmark, describe media extraction methods, page classification, product-card evidence, field scoring, and LLM metrics. Add a new experiment-log section template for Round 2 results.
    - Acceptance: A developer can run Round 2 from README without reading the implementation code.

21. **Run static validation after structural changes**: Ensure scripts and schemas still work before live crawling.
    - File: N/A
    - Changes: Run:
      ```bash
      cd sandbox/product-page-extraction
      python3 -m compileall scripts
      python3 scripts/validate_env.py --strict
      python3 scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --dry-run
      python3 scripts/run_packet.py --site-config configs/site.sample.yaml --site-key fromm-example --brand Fromm --name "Duck Liver 12 oz" --upc 072705113446 --dry-run
      ```
    - Acceptance: All commands pass, or failures are documented in `docs/experiment-log.md` with exact remediation.

22. **Run focused Fromm live validation**: Verify the central hypothesis on known problem pages.
    - File: N/A
    - Changes: Run:
      ```bash
      cd sandbox/product-page-extraction
      python3 scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --fixture-id fromm-four-star-dog --agent-browser-fallback
      python3 scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --fixture-id fromm-cat-four-star --agent-browser-fallback
      ```
    - Acceptance: Packets show `image_count_by_method.default` vs `rendered` vs `agent_browser`; summary indicates whether Crawl4AI rendered pass closed the image gap.

23. **Run Round 2 benchmark matrix**: Execute the full fixture matrix once static and Fromm checks pass.
    - File: N/A
    - Changes: Run:
      ```bash
      cd sandbox/product-page-extraction
      python3 scripts/run_fixture.py --fixture fixtures/products.round2.jsonl --agent-browser-fallback
      ```
      If runtime is too long, use `--limit` or group-specific fixture files in chunks.
    - Acceptance: `summary.json` includes aggregate metrics across at least 15 fixtures and identifies whether Crawl4AI rendered media extraction is good enough to avoid agent-browser as a production dependency.

24. **Record conclusions without production changes**: Summarize benchmark findings for the next oracle review.
    - File: `sandbox/product-page-extraction/docs/experiment-log.md`
    - Changes: Add Round 2 section with commands, fixture count, Crawl4AI rendered vs agent-browser image results, PDP/category classifier accuracy, Gemma metrics, field scoring trends, and remaining gaps.
    - Acceptance: The experiment log contains enough evidence for oracle to decide whether to keep improving Crawl4AI-only extraction or consider an interactive fallback.

## Files to Modify

- `sandbox/product-page-extraction/scripts/common.py` - shared rendered evidence JS, product-card extraction helpers, common media/card normalization helpers.
- `sandbox/product-page-extraction/scripts/extract_product_page.py` - Crawl4AI rendered media pass, page classification integration, product-card matching, packet media fields, LLM metrics, revised recommendation gating.
- `sandbox/product-page-extraction/scripts/agent_browser_capture.sh` - align rendered evidence output with shared JS/product-card schema.
- `sandbox/product-page-extraction/scripts/compare_results.py` - compare Crawl4AI default/rendered images vs agent-browser and include page/field scoring details.
- `sandbox/product-page-extraction/scripts/run_fixture.py` - per-field scoring, richer summary output, aggregate metrics, Round 2 fixture support.
- `sandbox/product-page-extraction/scripts/lmstudio_extract.py` - LLM latency/retry/schema metrics and structured return wrapper.
- `sandbox/product-page-extraction/schemas/product_packet.schema.json` - schema for `classification`, `extraction.media`, `extraction.product_cards`, `extraction.llm_metrics`, and field scores.
- `sandbox/product-page-extraction/schemas/agent_browser_result.schema.json` - schema for product cards and rendered evidence counts.
- `sandbox/product-page-extraction/schemas/comparison.schema.json` - schema for three-way media comparison and field/page comparison details.
- `sandbox/product-page-extraction/fixtures/products.sample.jsonl` - update existing Fromm fixtures with expected page type/media expectations.
- `sandbox/product-page-extraction/fixtures/README.md` - document expanded fixture fields.
- `sandbox/product-page-extraction/README.md` - Round 2 usage and validation commands.
- `sandbox/product-page-extraction/docs/evidence-packet.md` - document new packet fields.
- `sandbox/product-page-extraction/docs/experiment-log.md` - record Round 2 validation and results.

## New Files

- `sandbox/product-page-extraction/scripts/page_classifier.py` - deterministic page-type classification.
- `sandbox/product-page-extraction/scripts/field_scoring.py` - per-field expected-vs-actual benchmark scoring.
- `sandbox/product-page-extraction/fixtures/products.round2.jsonl` - 15-25 fixture benchmark matrix.

## Dependencies

- Tasks 1-2 must happen before meaningful Crawl4AI vs agent-browser image comparisons.
- Tasks 3-4 depend on Task 2 because packet media fields need rendered evidence.
- Tasks 5-6 can run after Task 1 and should be completed before comparison updates.
- Tasks 7-8 depend on available crawl/rendered evidence from Tasks 2-3.
- Tasks 9-10 depend on rendered evidence/product-card fields from Task 1.
- Tasks 11-12 depend on packet classification/media fields from Tasks 3, 8, and 9.
- Tasks 13-14 depend on `lmstudio_extract.py` and packet schema changes.
- Tasks 15-16 depend on field scoring and page classification conventions being defined.
- Tasks 17-19 depend on media fields, agent-browser schema updates, field scoring, and fixture metadata.
- Tasks 21-24 are validation and reporting and should run only after implementation tasks complete.

## Risks

- Crawl4AI may not expose evaluated JS return values in the expected way for the installed version; implementation may need a version-compatible fallback using `js_code` side effects or parsing rendered HTML after JS execution.
- Image count can overstate quality because menus, logos, category art, and tracking pixels are not product images; product-image relevance scoring must be conservative.
- Product-card extraction may be noisy across sites; keep generic selectors broad for evidence capture but conservative for scoring.
- Fromm category pages should not be promoted to `accept` unless a specific product card is isolated with strong token/size/species evidence.
- LM Studio is on a network endpoint and already timed out once; metrics and retry counts are required before trusting batch reliability.
- `response_format: json_schema` behavior can vary by LM Studio/model version; the code should retain code-fence recovery and schema validation.
- Adding 15-25 live fixtures can make runs slow and flaky; support `--limit`, fixture IDs, and grouping so failures do not block all learning.
- Keep all work inside `sandbox/product-page-extraction/**`; no production files, root scripts, migrations, or app/scraper runtime code should be touched.

## Expected Output Shape Changes

Packets should keep the existing top-level shape and add these fields:

```json
{
  "classification": {
    "page_type": "pdp | collection | category | brand_home | blog_support | unknown",
    "confidence": 0.0,
    "signals": [],
    "warnings": []
  },
  "extraction": {
    "media": {
      "default_images": [],
      "rendered_images": [],
      "llm_images": [],
      "selected_images": [],
      "image_count_by_method": {
        "default": 0,
        "rendered": 0,
        "llm": 0,
        "agent_browser": 0
      },
      "media_extraction_method": "default | rendered_dom | llm | mixed",
      "rendered_evidence_path": "outputs/.../rendered-evidence.json"
    },
    "product_cards": [
      {
        "title": "...",
        "href": "...",
        "image_urls": [],
        "nearby_text": "...",
        "data_attributes": {},
        "onclick": "...",
        "score": 0.0,
        "matched_tokens": [],
        "missing_tokens": []
      }
    ],
    "llm_metrics": {
      "model": "google/gemma-4-e4b",
      "base_url": "http://192.168.0.29:1234/v1",
      "latency_ms": 0,
      "attempts": 1,
      "timeout_count": 0,
      "schema_validation_passed": true,
      "error": null,
      "null_correctness": {},
      "hallucination_flags": []
    }
  },
  "validation": {
    "field_scores": {
      "name": {"score": 0.0, "passed": false, "reason": "..."},
      "brand": {"score": 0.0, "passed": false, "reason": "..."},
      "species": {"score": 0.0, "passed": false, "reason": "..."},
      "size": {"score": 0.0, "passed": false, "reason": "..."},
      "upc": {"score": 0.0, "passed": false, "reason": "..."},
      "description": {"score": 0.0, "passed": false, "reason": "..."},
      "ingredients": {"score": 0.0, "passed": false, "reason": "..."},
      "images": {"score": 0.0, "passed": false, "reason": "..."},
      "page_type": {"score": 0.0, "passed": false, "reason": "..."}
    }
  }
}
```

Comparison output should add:

```json
{
  "image_comparison": {
    "crawl4ai_default_count": 1,
    "crawl4ai_rendered_count": 100,
    "agent_browser_count": 109,
    "rendered_vs_agent_overlap": 0.8,
    "agent_browser_unique_count": 9,
    "crawl4ai_rendered_close_enough": true
  },
  "page_type_comparison": {
    "packet_page_type": "collection",
    "expected_page_type": "collection",
    "passed": true
  }
}
```

## Benchmark Round Success Criteria

- Crawl4AI rendered media pass gets within roughly 80% of agent-browser image count or overlap on Fromm dog/cat fixtures, or records why it cannot.
- Page-type classifier correctly marks Fromm pages as `collection`/`category`, not `pdp`.
- Canonical JSON-LD PDP fixtures produce high-confidence packets without requiring agent-browser.
- No-PDP/marketing/false-positive fixtures remain `review` or `conflict`; none become `accept` from LLM text alone.
- Gemma metrics are recorded for every LLM attempt, including timeout cases.
- Batch summary clearly answers whether agent-browser adds unique useful evidence after Crawl4AI rendered extraction.
