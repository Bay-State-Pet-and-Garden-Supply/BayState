# Implementation Plan

## Goal
Fix the three live-tested scraper data-loss bugs so Orgill images normalize correctly, Central Pet extracts all available specs/features/dimensions, and adapter identifier fields survive result normalization.

## Tasks
1. **Normalize Orgill image backslashes before quality upgrades**: Update Orgill image URL normalization to convert vendor backslashes to forward slashes before `/websmall/` and `_thumb.` replacements.
   - File: `apps/scraper/scrapers/approved_sources/adapters/orgill.py`
   - Changes: In `OrgillAdapter.normalize_images()`, add `url = url.replace("\\", "/")` as the first per-URL transform. Keep existing `/websmall/ -> /web/` and `_thumb. -> .` logic after the cleanup.
   - Acceptance: A URL like `https://images1.orgill.com/web/10031\7618085.jpg` normalizes to `https://images1.orgill.com/web/10031/7618085.jpg`; existing thumb/websmall normalization still works.

2. **Add a global image URL cleanup safety net**: Make the base adapter normalize obvious URL backslash corruption for adapters that do not override image normalization.
   - File: `apps/scraper/scrapers/approved_sources/adapters/base.py`
   - Changes: Change `BaseDistributorCrawl4AIAdapter.normalize_images()` from `return list(urls)` to returning a list where each string URL has backslashes replaced with `/`. Preserve non-empty strings only as currently expected; do not alter non-string inputs unless type hints/tests require it.
   - Acceptance: Public adapters that inherit the base method no longer pass raw backslash URLs into policy filtering or image capture.

3. **Add unit coverage for Orgill/backslash normalization**: Add deterministic tests for the Orgill override and, if task 2 is implemented, the base fallback.
   - File: `apps/scraper/tests/unit/test_approved_sources_adapter_fixtures.py` or `apps/scraper/tests/unit/test_approved_sources_adapters.py`
   - Changes: Add a test that instantiates `OrgillAdapter` with a minimal plan/entry and asserts `normalize_images(["https://images1.orgill.com/web/10031\\7618085_thumb.jpg"])` returns a URL with `/10031/7618085.jpg` and no `\\`.
   - Acceptance: Focused unit test passes with `uv run --with-requirements requirements.txt pytest tests/unit/test_approved_sources_adapter_fixtures.py -q` from `apps/scraper`.

4. **Fix Central Pet weight extraction for mixed-content `<li>` nodes**: Replace the broken BeautifulSoup `string=` lookup with text-based `<li>` iteration.
   - File: `apps/scraper/scrapers/approved_sources/adapters/central_pet.py`
   - Changes: In the `# --- Weight ---` block, iterate `soup.find_all("li")`, inspect `li.get_text(" ", strip=True)`, and when it contains `Product Gross Weight`, prefer the child `<span>` text; otherwise remove the label via regex and store the remaining value in `product["weight"]`. Add `weight` to `matched` only once.
   - Acceptance: Fixture/live HTML containing `<li>Product Gross Weight:<span>0.1100 lb</span></li>` yields `product["weight"] == "0.1100 lb"`.

5. **Extract Central Pet accordion specs/features from `.resp-tab-content`**: Add parsing for the current Central Pet responsive accordion content.
   - File: `apps/scraper/scrapers/approved_sources/adapters/central_pet.py`
   - Changes: Extend the `# --- Features ---` block to collect feature/spec lines from `.resp-tab-content` when `#tst_productDetail_features li` / `.product-features li` are absent. Split by `<li>` when present; otherwise split normalized text on known labels such as `Product Gross Weight`, `Product Net Weight`, `Product Height`, `Product Length`, `Product Width`, `Recommended For`. Avoid duplicating the weight line if it is already stored separately.
   - Acceptance: Central Pet live/fixture HTML with `.resp-tab-content` yields `features` containing meaningful feature lines such as `Recommended For: Chew; Fetch; Interactive Play` and additional non-empty spec lines.

6. **Parse Central Pet dimensions from individual height/length/width labels**: Convert height/length/width values in the accordion into a single `dimensions` facet string.
   - File: `apps/scraper/scrapers/approved_sources/adapters/central_pet.py`
   - Changes: Replace or supplement the existing `soup.find("li", string=re.compile(r"Dimension", re.I))` lookup with text-based parsing. First keep supporting explicit `Dimension` labels. Then parse `Product Height`, `Product Length`, and `Product Width` from `.resp-tab-content`/`li` text and set `product["dimensions"]` to a normalized string such as `Height: 2.50 in; Length: 2.50 in; Width: 2.50 in` when any dimension component is found.
   - Acceptance: Live Central Pet KONG page extracts the three dimension components reported by the diagnostic; old fixtures with a single `Dimension` label still pass.

7. **Extract additional Central Pet package/spec fields**: Preserve currently visible package quantities beyond case quantity.
   - File: `apps/scraper/scrapers/approved_sources/adapters/central_pet.py`
   - Changes: In the `.product-spec` loop, add mappings for `sell pk qty` and `pallet qty` to flat keys such as `sell_pack_qty` and `pallet_qty`. Keep existing `case qty -> case_pack` behavior. If the result-builder mappings are not extended for these new keys in this pass, ensure they remain harmless extra flat fields.
   - Acceptance: Adapter flat result includes `sell_pack_qty` and `pallet_qty` when those labels exist; no existing tests fail.

8. **Add/update Central Pet fixture coverage for weight/features/dimensions**: Make the offline tests guard the selector fixes.
   - File: `apps/scraper/benchmarks/approved_sources/fixtures/html/central_pet/product_38777520.html`
   - Changes: If the current fixture does not include `.resp-tab-content`, add a minimal representative accordion block with `Product Gross Weight`, `Product Height`, `Product Length`, `Product Width`, and `Recommended For` lines, while keeping the existing product identity fields.
   - File: `apps/scraper/benchmarks/approved_sources/fixtures/distributor_extraction_fixtures.json`
   - Changes: Add expected fields/facets for Central Pet where appropriate: `weight`, `features`, and `dimensions`. Do not require fields that are not present in every Central Pet fixture.
   - File: `apps/scraper/tests/unit/test_approved_sources_adapter_fixtures.py`
   - Changes: Add explicit assertions for Central Pet 38777520 that `extract_from_html()` returns `weight`, non-empty `features`, and `dimensions` when the fixture includes those blocks.
   - Acceptance: `uv run --with-requirements requirements.txt pytest tests/unit/test_approved_sources_adapter_fixtures.py -q` passes.

9. **Map `product_number` and `upc` through normalized product facts**: Stop silently dropping these adapter fields.
   - File: `apps/scraper/scrapers/ai_search/enrichment_models.py`
   - Changes: In `build_nested_product_facts()`:
     - Add `"product_number": "item_number"` to `LEGACY_FACET_ALIASES` so Central Pet product numbers survive as `item_number` facets.
     - Add `"upc"` to `single_facet_keys` so adapter UPCs survive as an `upc` facet.
     - Consider adding an `EnrichedProductFacts.upc` property implementation that returns `self._get_facet("upc")` instead of `None` so existing convenience accessors work.
   - Acceptance: `build_nested_product_facts({"product_number": "ABC123", "upc": "035585775203"})` produces facets `item_number=ABC123` and `upc=035585775203`; `facts.upc` returns the UPC if the property is updated.

10. **Add result-builder tests for identifier preservation**: Lock in the mapping behavior for all adapters.
    - File: `apps/scraper/tests/unit/test_enrichment_models.py`
    - Changes: Add a test for `build_nested_product_facts()` that passes `product_number`, `upc`, and an existing `item_number`; assert facets include `item_number` and `upc`. Include the `facts.upc` assertion if the property is updated.
    - File: `apps/scraper/tests/unit/test_approved_sources_result_builder.py`
    - Changes: Extend `TestBuildSuccessResult.test_returns_valid_result` or add a new test asserting `build_success_result(... product_fields={"name": ..., "product_number": ..., "upc": ...})` retains `item_number` and `upc` facets and still sets `validation.upc_match` correctly.
    - Acceptance: `uv run --with-requirements requirements.txt pytest tests/unit/test_enrichment_models.py tests/unit/test_approved_sources_result_builder.py -q` passes.

11. **Refresh live diagnostic fixtures for Orgill**: Use the known-good Orgill UPC supplied during live testing so workers can validate real extraction after fixes.
    - File: `apps/scraper/tests/live/test_all_adapters_live.py`
    - Changes: Update the Orgill `TEST_SKUS` entry to UPC `755625321923`, name `Landscapers Select 34609 PCL-P Shovel, 16 ga, Hardwood Handle, 45 in L Handle`, brand `LANDSCAPERS SELECT`.
    - File: `apps/scraper/tests/live/run_adapter_test.py`
    - Changes: Mirror the same Orgill test UPC/name/brand if this live helper remains in the tree.
    - Acceptance: Live Orgill diagnostic returns the shovel product and no longer logs 404 for `...10031\7618085.jpg` due to backslash corruption. If the source image itself is unavailable, the URL should at least be normalized with `/` rather than `\`.

12. **Run focused verification**: Execute offline checks first, then live spot checks only if credentials/browser dependencies are available.
    - File: N/A
    - Changes: No code change; validation step.
    - Acceptance:
      - Offline: from `apps/scraper`, run `uv run --with-requirements requirements.txt pytest tests/unit/test_enrichment_models.py tests/unit/test_approved_sources_result_builder.py tests/unit/test_approved_sources_adapter_fixtures.py -q`.
      - Live Orgill: `uv run --with-requirements requirements.txt python tests/live/run_adapter_test.py orgill --upc 755625321923 --name "Landscapers Select Shovel" --brand "LANDSCAPERS SELECT"`.
      - Live Central Pet: `uv run --with-requirements requirements.txt python tests/live/run_adapter_test.py central_pet` and verify additional fields now include `weight_lbs`/`package_weight`, `dimensions`, and `features` facets if the live page exposes them.

## Files to Modify
- `apps/scraper/scrapers/approved_sources/adapters/orgill.py` - clean backslashes in Orgill image URL normalization.
- `apps/scraper/scrapers/approved_sources/adapters/base.py` - optional/base global backslash cleanup for image URLs.
- `apps/scraper/scrapers/approved_sources/adapters/central_pet.py` - fix weight selector, add accordion feature extraction, parse dimensions, and optionally preserve sell/pallet quantities.
- `apps/scraper/scrapers/ai_search/enrichment_models.py` - map `product_number` and `upc` into facets and update `EnrichedProductFacts.upc` property.
- `apps/scraper/tests/unit/test_enrichment_models.py` - add unit tests for identifier facet mapping.
- `apps/scraper/tests/unit/test_approved_sources_result_builder.py` - add/extend result-builder identifier preservation tests.
- `apps/scraper/tests/unit/test_approved_sources_adapter_fixtures.py` or `apps/scraper/tests/unit/test_approved_sources_adapters.py` - add adapter-level tests for Orgill URL normalization and Central Pet extraction.
- `apps/scraper/benchmarks/approved_sources/fixtures/html/central_pet/product_38777520.html` - add representative accordion content if absent from existing fixture.
- `apps/scraper/benchmarks/approved_sources/fixtures/distributor_extraction_fixtures.json` - update expected Central Pet fields/facets if fixture content is enhanced.
- `apps/scraper/tests/live/test_all_adapters_live.py` - update Orgill live test SKU to known current product.
- `apps/scraper/tests/live/run_adapter_test.py` - mirror Orgill live helper SKU if kept.

## New Files
- None required.

## Dependencies
- Tasks 1-3 are independent of Central Pet and result-builder work.
- Tasks 4-8 should be completed together because Central Pet tests depend on the selector changes and fixture expectations.
- Tasks 9-10 should be completed together because result-builder tests depend on the new mappings.
- Task 12 depends on all code/test updates.
- Task 11 can be done any time before live validation but should not block offline unit tests.

## Risks
- `upc` as a facet may require a matching facet definition downstream; if the web/API schema rejects unknown facet slugs, confirm `upc` is an allowed facet or add a compatible identifier field instead.
- Mapping `product_number` to `item_number` could duplicate `item_number` if both are present; implementation should prefer explicit `item_number` and use `product_number` only as an alias/fallback.
- Central Pet accordion text can vary by product; parsing should be label-driven and tolerant rather than hard-coded to one KONG page layout.
- Live Central Pet searched UPC `38777520` differs from the page UPC `035585775203`; avoid tightening identifier matching in this change or the existing successful search flow may become a false no-match.
- Orgill image capture may still fail if the vendor image truly does not exist or requires auth/session handling, but the visible corruption (`\`) must be removed first.
- Updating live test UPCs changes diagnostic expectations and may affect historical docs; keep fixture tests deterministic and live tests clearly marked as live/current-catalog checks.
