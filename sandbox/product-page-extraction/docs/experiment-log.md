# Experiment Log

## Strict product image semantics update

Implemented strict semantics: `fields.images` now means selected desired-product carousel/gallery/card images only. Raw page images are preserved separately in `extraction.media.all_page_images`, candidates in `candidate_product_images`, accepted product images in `selected_product_images`, and noise/unbound images in `rejected_images`.

Validation on Fromm dog Four-Star category page:

- raw rendered page images: 41
- agent-browser raw images: 109
- selected product images: 0
- `fields.images`: 0
- rejected images: 41
- recommendation: conflict

This is correct for current evidence: Fromm is a collection/category page and Crawl4AI did not isolate a desired product card, so it must not expose all page images as product image URLs.


Use this file to record local runs. Do not paste huge markdown, HTML, screenshots, cookies, or credentials.

## Template

### YYYY-MM-DD — Short hypothesis

- Hypothesis:
- Fixture(s):
- Command(s):
- Output packet(s):
- Result:
- Crawl4AI observations:
- LM Studio observations:
- agent-browser observations:
- Decision:
- Follow-up:

## Initial setup validation

- `python -m compileall scripts`: passed on local Python 3.14.5
- `python scripts/validate_env.py`: passed; Crawl4AI, Playwright, jsonschema, PyYAML, and agent-browser available; LM Studio skipped because `C4AI_LLM_MODE=off`
- `python scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --dry-run`: passed; 2 valid fixture rows
- `python scripts/discover_from_sitemap.py --site-config configs/site.sample.yaml --site-key fromm-example --brand Fromm --name 'Duck Liver 12 oz' --upc 072705113446 --dry-run`: passed
- `python scripts/extract_product_page.py --url https://example.com --brand Example --name 'Example Domain' --fixture-id example-smoke --output-dir outputs --timeout-ms 15000`: passed; packet generated and schema-validated
- `bash scripts/agent_browser_capture.sh https://example.com example-smoke agent-browser-runs`: passed; agent-browser result generated and schema-validated
- `python scripts/compare_results.py --packet outputs/<example-smoke>/packet.json --agent-browser agent-browser-runs/<example-smoke>/dom-extract.json --out outputs/<example-smoke>/comparison.json`: passed; comparison generated and schema-validated

## Post-review fixes

- Fixed `agent_browser_capture.sh` default output root to be script-relative and cwd-independent.
- Fixed `extract_product_page.py --screenshot` to persist `screenshot.png` and populate packet artifact paths.
- Fixed `run_packet.py --dry-run` so discovery dry runs do not fetch robots/sitemaps.
- Fixed discovery metadata persistence: discovered candidates and selected URL now flow into the final packet.
- Tightened LM Studio output schema, added OpenAI-compatible `response_format: json_schema`, and validate parsed LLM output before merging.
- Centralized env-backed defaults after `.env` loading for output dir, page timeout, screenshots, and LLM mode.
- Routed fixture execution through `run_packet.py` and wired optional agent-browser fallback/comparison.
- Changed scoring/comparison so input brand hints do not count as page evidence and comparisons cannot `accept` when the packet is conflict or lacks PDP evidence.

## Post-review validation

- `python -m compileall scripts`: passed
- `python scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --dry-run`: passed
- `python scripts/run_packet.py ... --dry-run`: passed without live discovery
- `python scripts/validate_env.py --strict`: passed
- `python scripts/extract_product_page.py --url https://example.com ... --screenshot`: passed; screenshot exists and packet schema validates
- `bash scripts/agent_browser_capture.sh https://example.com cwd-default-test`: passed with cwd-independent default output root
- `python scripts/compare_results.py ...`: passed; comparison schema validates and correctly remains `conflict` for non-PDP example.com packet
- `python scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --fixture-id fromm-homepage-smoke --no-llm --agent-browser-fallback`: passed; summary includes packet, agent-browser result, and comparison paths
- `python scripts/validate_packet.py --kind llm /tmp/bad-llm.json`: correctly rejects empty LLM output

## Post-review fixes applied (2026-05-25)

### Isolation/safety
1. Output containment: `require_sandbox_path()` rejects paths outside ROOT unless `SANDBOX_ALLOW_OUTSIDE_OUTPUTS=true`
2. LM Studio URL restricted to RFC1918/private hosts unless `SANDBOX_ALLOW_REMOTE_LLM=true`
3. `.gitignore` now includes `.ruff_cache/` and `.mypy_cache/`

### Correctness
4. Crawl4AI rendered pass now attempts JS store via `RENDERED_EVIDENCE_STORE_JS`. Falls back to HTML parsing (finds 41 images vs 1 baseline)
5. Shared `RENDERED_EVIDENCE` JS now includes `nearby_text`, `element_signature`, `data_attributes` in product cards
6. Product-card matching passes expected_tokens where available
7. Page classifier no longer assigns 0.8 confidence to `unknown` from `deep_product_url` alone
8. Selected images: merges default + rendered images (was dropping rendered when meta image existed)
9. LLM image safety: removed unverified LLM-only image fallback
10. LLM metrics captured for all paths (timeout, schema failures, errors). `lmstudio_extract.py` now returns `(result, metrics)` tuple
11. Field scoring enforces `expected.required_fields` — required but null fields fail
12. Schemas tightened: `classification`, `extraction.media`, `extraction.llm_metrics`, `image_comparison` now required

### Experiment quality
13. `fixtures/products.round2.jsonl`: rebuilt to 16 rows with explicit group, page_type, required_fields
14. `run_fixture.py` aggregates image benchmark metrics (mean/median rendered/agent counts, close_enough pass rate, field pass rates)
15. `compare_results.py` normalizes/filters images; reports all-image vs product-estimate counts
16. Added `product_card_comparison` to comparison output
17. Brand match uses `fields.brand` (which includes LLM) not just `page_brand` (JSON-LD only)

### Validation
- `python3 -m compileall scripts`: passed
- `python3 scripts/validate_env.py --strict`: passed (LM Studio available at network endpoint)
- `python3 scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --dry-run`: passed (2 rows)
- `python3 scripts/run_fixture.py --fixture fixtures/products.round2.jsonl --dry-run`: passed (16 rows, meets >=15)
- `python3 scripts/run_packet.py ... --dry-run`: passed
- Fromm dog four-star live run with agent-browser: **passed**
  - Crawl4AI default: 0 images
  - Crawl4AI rendered: 41 images (scroll+html_fallback)
  - agent-browser: 109 images
  - Overlap: 36%
  - Close enough: No (41 < 80% of 109)
  - Recommendation: conflict (correct for unknown page type, no JSON-LD)
  - LLM metrics captured: model=google/gemma-4-e4b, latency=8.7s, schema_passed=true
  - Brand_match: true
  - Field passes: brand, name, species, size, description all passed
  - Page_type: unknown (0.3 confidence) — correct for SPA collection page without product cards

### Remaining limitation
Crawl4AI v0.8 `result.html` does not include dynamically-created DOM elements. The JS store approach (which works in agent-browser via `eval` return) cannot be captured. Fallback HTML parser finds 41 images but misses data-attribute/lazy-loaded images that agent-browser captures. Upgrade Crawl4AI or add JS return capture when available.

## Gemma Live Experiments (2026-05-25)

- LM Studio instance: `http://192.168.0.29:1234/v1` with `google/gemma-4-e4b`
- Gemma returns JSON wrapped in markdown code fences — added code-fence stripping to `lmstudio_extract.py`
- `response_format: json_schema` with `strict: True` works for this Gemma version

### Crawl4AI + Gemma on frommfamily.com/products/dog/four-star/
- Crawl4AI: 5.4s fetch, 13175 chars markdown, 0 JSON-LD, 1 image
- Gemma extracted: name="Four-Star Nutritionals for Dogs", brand="Fromm", species="Dog", category="Pet Food", description (accurate), 1 image URL
- Gemma correctly left null: size, ingredients, upc, sku, price, guaranteed_analysis
- Recommendation: conflict (category page, not PDP; confidence 0.233) — correct behavior

### agent-browser on same page
- Found 109 images (vs Crawl4AI's 1) — lazy-loaded CDN images captured via JS extraction
- Comparison: review (upgraded from conflict due to 108 image gain)

### Crawl4AI + Gemma on frommfamily.com/products/cat/four-star/
- Gemma request timed out (network) — sandbox correctly fell back to deterministic only
- Recorded `llm_skipped_reason` and continued
- agent-browser found 101 images vs Crawl4AI's 1
- Comparison: review due to image gain

### Key Findings (Round 1)
1. Crawl4AI deterministic extraction works on Fromm's JS-rendered category pages
2. Gemma extraction is accurate and conservative (no hallucination)
3. agent-browser captures 100x more images on lazy-loaded pages — clear fallback value
4. Sandbox correctly handles LLM failures without crashing
5. Scoring correctly identifies category pages as non-PDP (conflict recommendation)

## Benchmark Round 2 (2026-05-25)

Implemented (sandbox-only, no production code):

### Changes
- **Rendered DOM media pass**: Crawl4AI now does a second crawl with scroll JS + BS4 image extraction from rendered HTML. Pushes images from rendered HTML into `extraction.media.rendered_images`.
- **Page-type classifier**: `scripts/page_classifier.py` — deterministic classification using URL, title/H1, JSON-LD Product, product card count, category markers.
- **Per-field scoring**: `scripts/field_scoring.py` — name, brand, species, size, upc, description, ingredients, images, page_type scored independently.
- **LLM metrics**: lmstudio_extract.py now returns `(result, metrics)` with latency_ms, attempts, timeout_count, schema_validation_passed, model.
- **Three-way comparison**: compare_results.py compares default/rendered/agent-browser image counts.
- **Joint rendered JS**: `RENDERED_EVIDENCE_JS` in common.py shared by both Crawl4AI and agent-browser, with productCards, imageCount, productCardCount.
- **Round 2 fixtures**: 12-fixture matrix at `fixtures/products.round2.jsonl` with 5 groups.

### Live test: frommfamily.com/products/dog/four-star/

| Metric | Round 1 (default) | Round 2 (rendered) | agent-browser 
|--------|-------------------|-------------------|---------------
| Image count | 1 | 41 | 109 
| Overlap | — | 35% | — 
| Close enough (>=80%) | No | No (37%) | — 
| Extraction | META tag | scroll+BS4 | JS data-* attr 
| Classifier | N/A | unknown | — 
| LLM latency | 15.2s | 15.2s | — 
| Recommendation | conflict | review | review 

### Key Findings
1. **Rendered pass found 40x more images** (1 → 41). Clear improvement.
2. **Gap not fully closed**: agent-browser still finds 70 unique images (109 vs 41). The BS4 approach misses `data-src`, `data-srcset`, inline styles, etc.
3. **Page classifier needs JS card count**: Classified as `unknown` instead of `collection` because the BS4 pass doesn't produce product cards. Fix: use `RENDERED_EVIDENCE_JS` through Crawl4AI `js_code` and capture the return value.
4. **Gemma**: 15.2s latency, passed schema validation, correctly extracted Dog species, Fromm brand.
5. **Next fix**: Switch Crawl4AI rendered pass to use `js_code` + `RENDERED_EVIDENCE_JS` (same JS as agent-browser) instead of BS4. This should close the remaining image gap and provide product card counts for classification.
