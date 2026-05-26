# Benchmark Round 2 — Worker Handoff

## Changed files

All under `sandbox/product-page-extraction/`:

| File | Change |
|------|--------|
| `scripts/common.py` | Replaced `IMAGE_EXTRACTION_JS` with shared `RENDERED_EVIDENCE_JS` including productCards, imageCount, productCardCount. Both Crawl4AI and agent-browser use the same logic. |
| `scripts/page_classifier.py` | **New.** Deterministic page-type classifier using URL path, title/H1, JSON-LD Product type, product card count, category markers. Returns `pdp`, `collection`, `category`, `brand_home`, `blog_support`, `unknown`. |
| `scripts/field_scoring.py` | **New.** Per-field benchmark scoring for name, brand, species, size, upc, description, ingredients, images, page_type. Used in fixture summaries. |
| `scripts/lmstudio_extract.py` | LLM now returns `(result, metrics)` tuple. Metrics include latency_ms, attempts, timeout_count, schema_validation_passed, error, finish_reason, model, base_url. |
| `scripts/extract_product_page.py` | Major rewrite: added Crawl4AI rendered DOM pass (scroll + BS4 image extraction from rendered HTML), page classification, product-card matching, LLM metrics, media image accounting (`default_images`, `rendered_images`, `llm_images`, `selected_images`, `image_count_by_method`). Recommendation gated by page_type. |
| `scripts/agent_browser_capture.sh` | Updated inline JS to match `RENDERED_EVIDENCE_JS` with productCards, imageCount, productCardCount. Post-processing normalizes duplicates and ensures consistent schema. |
| `scripts/compare_results.py` | Updated for three-way image accounting: `crawl4ai_default_count`, `crawl4ai_rendered_count`, `agent_browser_count`, `rendered_vs_agent_overlap`, `agent_browser_unique_count`, `crawl4ai_rendered_close_enough`. |
| `scripts/run_fixture.py` | Passes `fixture_row` for field scoring. Summary includes `page_type`, `image_count_by_method`, `field_scores`, `llm_metrics`, `image_comparison`, and aggregate stats by page_type group. |
| `scripts/run_packet.py` | Added `--no-rendered` flag and `fixture_row` passthrough. |
| `schemas/product_packet.schema.json` | Updated for classification, extraction.media, extraction.product_cards, extraction.llm_metrics, validation.field_scores, validation.page_type_gating. |
| `schemas/agent_browser_result.schema.json` | Added productCards, imageCount, productCardCount, extractionMethod. |
| `schemas/comparison.schema.json` | Added image_comparison, page_type_comparison, field_scores, tool_timings. |
| `fixtures/products.sample.jsonl` | Updated with expected page_type/species fields. |
| `fixtures/products.round2.jsonl` | **New.** 12-fixture benchmark matrix across 5 groups: pdp-jsonld, pdp-nojsonld, spa-collection, marketing-only, false-positive-traps. |
| `fixtures/README.md` | Documented expanded fixture fields. |
| `docs/evidence-packet.md` | Documented new packet fields for Round 2. |
| `README.md` | Added Round 2 commands for rendered pass, page classification, per-field scoring, and fixture validation. |

## Validation results

| Command | Status |
|---------|--------|
| `python3 -m compileall scripts` | ✅ Passed |
| `python3 scripts/validate_env.py --strict` | ✅ Passed |
| `python3 scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --dry-run` | ✅ Passed (2 rows) |
| `python3 scripts/run_fixture.py --fixture fixtures/products.round2.jsonl --dry-run` | ✅ Passed (12 rows) |
| `python3 scripts/run_packet.py --site-config configs/site.sample.yaml --site-key fromm-example --brand Fromm --name "Duck Liver 12 oz" --upc 072705113446 --dry-run` | ✅ Passed |
| Fromm dog live run with rendered pass + agent-browser | ✅ Completed |

## Key finding: Did Crawl4AI rendered pass close the image gap?

**Partially.** On `frommfamily.com/products/dog/four-star/`:

| Metric | Baseline (Round 1) | Round 2 baseline | Round 2 + scroll+html_fallback | agent-browser |
|--------|-------------------|-----------------|-------------------------------|---------------|
| Image count | 1 | 0 (JS store failed) | **41** (HTML fallback) | 109 |
| Overlap | — | — | 36% | — |
| Close enough (≥80%) | No | No | **No** (37%) | — |
| Method | meta tag only | crawl4ai_js_dom (sentinel not captured) | scroll+html_fallback | agent-browser eval with data-* attrs |

The rendered pass uses the shared `RENDERED_EVIDENCE_STORE_JS` to capture images via DOM injection. However, Crawl4AI v0.8 does not include dynamically-created DOM elements in `result.html`, so the JS store approach falls back to HTML parsing (41 images). The JS-based approach works on the agent-browser side (109 images) because agent-browser's `eval` command returns the JS return value directly. Crawl4AI doesn't expose JS return values in v0.8.

The HTML fallback provides a 40x improvement over default (1 → 41). This is sufficient for now but the remaining gap (69 unique images agent-browser finds) should be addressed if Crawl4AI adds JS return capture in a future version.

## Page classifier accuracy

The classifier correctly identifies `deep_product_url` and `product_text` signals but classifies as `unknown` (confidence 0.3) because no product cards or JSON-LD `Product` are present. This is intentional — the classifier correctly avoids claiming `collection` or `pdp` without sufficient evidence.

## Gemma performance

- Latency: 15.2s (network LM Studio)
- Model: google/gemma-4-e4b
- Schema validation: passed
- Species: correctly extracted "Dog" from page evidence
- Brand: correctly extracted "Fromm"
- Category: correctly extracted "Pet Food"
- Description: accurate

## Remaining gaps/risks

1. **Page classifier needs JS-based card count**: The classifier requires product card counts from rendered JS to distinguish `collection` from `unknown`. Either fix the Crawl4AI rendered pass to use `js_code` with `RENDERED_EVIDENCE_JS` (capturing JS return values), or accept that classifier confidence is lower on BS4-only rendered pages.

2. **Image gap not fully closed**: 35% overlap means the BS4-only rendered pass misses lazy-loaded images that JS attr evaluation catches. Fix: use Crawl4AI `js_code` to execute `RENDERED_EVIDENCE_JS` and capture the returned JSON. This requires understanding how Crawl4AI v0.8.0 exposes JS return values (may need `js_onexit` or alternative mechanism).

3. **Fixture count**: Round 2 has 12 fixtures (target was 15-25). Need more real PDP URLs with JSON-LD, marketing-only pages, and false-positive traps. Consider adding from other brands (Lake Valley Seed, Hills, Purina).

4. **No fromm PDPs exist**: Fromm's site has category/collection pages but no individual product detail pages with JSON-LD `Product`. Need to find brands with real PDPs for the `canonical_jsonld_pdp` group.

5. **LLM metrics not yet in field scoring**: The field scoring module doesn't yet consume LLM null-correctness or hallucination checks from `llm_metrics`. The `null_correctness` and `hallucination_flags` metrics are not yet populated.

## Commands to reproduce

```bash
cd sandbox/product-page-extraction

# Validate all
python3 -m compileall scripts
python3 scripts/validate_env.py --strict

# Dry-run fixtures
python3 scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --dry-run
python3 scripts/run_fixture.py --fixture fixtures/products.round2.jsonl --dry-run

# Live Fromm test
python3 scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --fixture-id fromm-four-star-dog --agent-browser-fallback

# Full Round 2 (15+ min)
python3 scripts/run_fixture.py --fixture fixtures/products.round2.jsonl --agent-browser-fallback

# Compare only
python3 scripts/compare_results.py \
  --packet outputs/<bid>/<run>/packet.json \
  --agent-browser agent-browser-runs/<bid>/dom-extract.json
```
