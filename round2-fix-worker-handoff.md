# Round 2 Fix Worker Handoff

## Changes Applied

All under `sandbox/product-page-extraction/`:

| File | Change |
|------|--------|
| `scripts/common.py` | Added `require_sandbox_path()` (output containment), `validate_llm_base_url()` (private-host restriction), `allow_outside_outputs()`, `allow_remote_llm()`, `store_js_for_dom()`, `RENDERED_EVIDENCE_STORE_JS` |
| `scripts/lmstudio_extract.py` | Uses `validate_llm_base_url()` to restrict to private hosts; now returns `(result, metrics)` tuple with latency_ms, timeout_count, schema_validation_passed |
| `scripts/extract_product_page.py` | JS store approach for rendered pass (falls back to HTML parsing when sentinel not found); merged default+rendered images; removed unverified LLM image fallback; brand_match uses fields.brand; field scoring with fixture row |
| `scripts/page_classifier.py` | Fixed confidence for unknown page type (0.3 instead of 0.8); collection confidence set correctly; Fromm pages classify as unknown (correct — no product cards) |
| `scripts/field_scoring.py` | Added `_ensure_field_not_null()` to enforce `required_fields` from fixture expectations |
| `scripts/compare_results.py` | Added image normalization/filtering (`_normalize_and_filter`, `_is_likely_product_image`); added `product_card_comparison` and `page_type_comparison`; three-way image accounting |
| `scripts/run_fixture.py` | Aggregate image benchmark metrics (mean/median counts, close_enough pass rate, field pass rates, LLM schema failures) |
| `schemas/product_packet.schema.json` | Tightened: `classification`, `extraction.media`, `extraction.llm_metrics` now required |
| `schemas/agent_browser_result.schema.json` | Tightened: `rendered` requires `title`, `h1`, `images`, `textSample`, `imageCount`, `productCardCount` |
| `schemas/comparison.schema.json` | Tightened: requires `image_comparison`, `page_type_comparison` |
| `fixtures/products.round2.jsonl` | Rebuilt: 16 rows, 5 groups, all with `group`, `expected.page_type`, `expected.required_fields` |
| `.gitignore` | Added `.ruff_cache/`, `.mypy_cache/` |
| `docs/experiment-log.md` | Updated with post-review fixes and validation results |

## Validation

| Command | Status |
|---------|--------|
| `python3 -m compileall scripts` | ✅ Passed |
| `python3 scripts/validate_env.py --strict` | ✅ Passed (LM Studio reachable) |
| `python3 scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --dry-run` | ✅ Passed (2 rows) |
| `python3 scripts/run_fixture.py --fixture fixtures/products.round2.jsonl --dry-run` | ✅ Passed (16 rows) |
| `python3 scripts/run_packet.py ... --dry-run` | ✅ Passed |
| Fromm dog four-star live run (with agent-browser) | ✅ Passed |

## Key Metrics from Fromm Live Run

- Crawl4AI default: 0 images
- Crawl4AI rendered: 41 images (scroll+html_fallback)
- agent-browser: 109 images
- Overlap: 36%
- Close enough: No (41 < 80% of 109)
- LLM: gemma-4-e4b, 8.7s, schema validated, brand/name/species extracted correctly
- Brand match: true (from LLM)
- Recommendation: conflict (correct — no PDP evidence)
- Field passes: brand ✅, name ✅, species ✅, description ✅

## Remaining Limitations

1. Crawl4AI v0.8 `result.html` does not include dynamically-created DOM elements. The JS store approach works in theory but the sentinel div is not captured in the HTML snapshot. Falls back to HTML parser (41 images). agent-browser's `eval` returns the JS value directly, capturing 109 images.
2. Fromm pages cannot produce product cards via Crawl4AI rendering. Card count is 0, so page classifier can't identify them as `collection`. Agent-browser finds 50 product cards on the same page.
3. LLM image gap not addressed in field scoring (no hallucination/null-correctness checks in `field_scoring.py`).
