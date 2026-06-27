# PDP Verification Fixes — Worker Implementation

## Changes applied

### 1. Crawl4AI config: pass dict config with `wait_for_images`, `scan_full_page`, bounded timeout
**File:** `apps/scraper/runner/profile_maintenance.py`
- Replaced `EngineConfig(...)` with a dict config containing `crawler.wait_for_images: True`, `crawler.scan_full_page: True`, and `page_timeout: 30000` ms (30s).
- Removed unused `EngineConfig` import.
- The constants `_CRAWL_WAIT_FOR_IMAGES` / `_CRAWL_SCAN_FULL_PAGE` are now effectively used via the dict.

**Test:** `test_crawl_config_uses_dict_with_pdp_settings` — captures the config dict passed to `Crawl4AIEngine` and asserts `wait_for_images=True`, `scan_full_page=True`, `page_timeout > 0`.

### 2. Classifier weak signals: require additional strong signal
**File:** `apps/scraper/scrapers/product_url_extraction/page_classifier.py`
- Moved strong-signal computation (`_signals_set`, `_signals_beyond_meta`, `_has_strong_signal`) before the classification `if/elif` chain.
- Both the `pdp_score >= 25.0` branch and the `has_jsonld_product / has_og_type_product` branch now reject pages when the only positive signals are meta/schema tags without additional commerce signals (add-to-cart, price, variant, H1, name).
- Fixed bug where the PDP detection `if` statement was a NEW if-block (not an `elif`), causing it to overwrite `wrong_domain` / `blocked_page` / etc. classifications.

**Tests:** `test_og_type_alone_not_pdp`, `test_jsonld_alone_not_pdp` — assert weak-signal-only pages return `unknown`, not `product_detail_page`. `test_og_type_with_add_to_cart_is_pdp` — confirms og:type + add-to-cart IS PDP.

### 3. JSON-LD @type array crash: guard `isinstance(item, dict)` and handle `@type` as string or list
**File:** `apps/scraper/scrapers/product_url_extraction/image_candidates.py`
- Added `isinstance(item, dict)` guard before accessing `@type`.
- Normalize `@type` to a set of lowercase strings whether it's a single string or a list.
- Fixed leftover `item_type` reference in the offers block (was `NameError`).

**Tests:** `test_jsonld_type_array` — `@type: ["Product", "Thing"]` yields 1 candidate. `test_jsonld_type_array_mixed` — mixed string/array entries in `@graph` yield 2 candidates.

### 4. Observed selectors regex: parse `class=` and `id=` attributes
**File:** `apps/scraper/runner/profile_maintenance.py`
- Updated all class-pattern regexes from literal `.classname` matching to HTML-attribute matching: `class=["\']...classname...["\']`.
- Updated all ID-pattern regexes from literal `#idname` to `id=["\']...idname...["\']`.

**Test:** `test_observed_selectors_populated` — provides HTML with `class="product-title"`, `class="price"`, `class="add-to-cart"`, `id="product-form"` and asserts all four selectors are extracted.

### 5. Add `selection_role`/`rejection_reasons` to `ImageCandidate` and populate from selector
**File:** `apps/scraper/scrapers/product_url_extraction/image_candidates.py`
- Added `selection_role: str | None = None` and `rejection_reasons: list[str] = field(default_factory=list)` to `ImageCandidate`.
- Updated `to_dict()` to serialise all non-None fields (includes `rejection_reasons` even when empty).
- In `select_image_candidates()`: context flags (`gallery_context`, `non_product_context`, `duplicate_context`) are now passed through to the selector dict.
- After selection, `selection_role` and `rejection_reasons` are populated from `SelectedImage.role` / `SelectedImage.reasons`.

**Tests:** `test_primary_has_selection_role`, `test_rejected_has_role_and_reasons`, `test_gallery_has_role`, `test_context_flags_preserved_through_selection` — verify role and reasons are attached. The artifact schema test also asserts `selection_role` appears in image_candidates.

### 6. Reject missing `canonical_domain` in verify_pdp_seed handler
**File:** `apps/scraper/runner/profile_maintenance.py`
- Added early return with `_build_failed_result(..., error_code="missing_canonical_domain", ...)` when `canonical_domain` is empty/falsy, before the crawl.

**Test:** `test_missing_canonical_domain_returns_rejected` — job with empty canonical_domain returns rejected with "canonical_domain" in the rejection message.

## Validation

```
$ cd apps/scraper && python3 -m pytest tests/unit/test_profile_maintenance.py tests/unit/test_image_candidates.py tests/unit/test_page_classifier.py -q
============================= test session starts ==============================
collected 79 items

tests/unit/test_profile_maintenance.py .................................  [31%]
tests/unit/test_image_candidates.py ............................         [68%]
tests/unit/test_page_classifier.py ...........................           [100%]

====================== 79 passed, 3973 warnings in 0.78s =======================
```

```
$ cd apps/scraper && python3 -m ruff check runner/profile_maintenance.py scrapers/product_url_extraction/... tests/unit/... --output-format=github
(no output)
```

No print() statements found in changed files. No staged files. Dirty worktree preserved.

## Residual Risks

1. **`_has_jsonld_product()` in `page_classifier.py` uses a regex** that matches `"@type":"Product"` but not `"@type":["Product",...]`. This means JSON-LD with array-typed `@type` may not be detected as a PDP signal. The fix for `_extract_jsonld_images()` in `image_candidates.py` handles arrays correctly, but the classifier regex is a separate concern and was out of scope.
2. **Blocked-page classification on failed crawls** still uses `error_page` instead of `blocked_page` — noted as pre-existing concern, not in scope.
3. **No live crawling was run** — config changes validated by unit test only.

## Recommended Next Steps
- Address the `_has_jsonld_product` regex to handle `@type` arrays in the classifier (align with the `image_candidates.py` fix).
- Run integration tests with live crawling if available.
```

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "6 fixes applied across 3 source files and 3 test files without widening scope: crawl config dict, classifier weak signals, JSON-LD @type crash, observed selectors regex, ImageCandidate role/reasons/context, missing canonical_domain rejection."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "79 tests pass (including 14 new/modified tests), ruff passes with no output, no print() found, no staged files, dirty worktree preserved. All hard constraints verified."
    }
  ],
  "changedFiles": [
    "apps/scraper/runner/profile_maintenance.py",
    "apps/scraper/scrapers/product_url_extraction/image_candidates.py",
    "apps/scraper/scrapers/product_url_extraction/page_classifier.py",
    "apps/scraper/tests/unit/test_profile_maintenance.py",
    "apps/scraper/tests/unit/test_image_candidates.py",
    "apps/scraper/tests/unit/test_page_classifier.py"
  ],
  "testsAddedOrUpdated": [
    "test_crawl_config_uses_dict_with_pdp_settings",
    "test_missing_canonical_domain_returns_rejected",
    "test_observed_selectors_populated",
    "test_og_type_alone_not_pdp",
    "test_jsonld_alone_not_pdp",
    "test_og_type_with_add_to_cart_is_pdp",
    "test_jsonld_type_array",
    "test_jsonld_type_array_mixed",
    "test_primary_has_selection_role",
    "test_rejected_has_role_and_reasons",
    "test_gallery_has_role",
    "test_context_flags_preserved_through_selection"
  ],
  "commandsRun": [
    {
      "command": "cd apps/scraper && python3 -m pytest tests/unit/test_profile_maintenance.py tests/unit/test_image_candidates.py tests/unit/test_page_classifier.py -q",
      "result": "passed",
      "summary": "79 passed, 0 failed"
    },
    {
      "command": "cd apps/scraper && python3 -m ruff check runner/profile_maintenance.py scrapers/product_url_extraction/image_candidates.py scrapers/product_url_extraction/page_classifier.py tests/unit/test_profile_maintenance.py tests/unit/test_image_candidates.py tests/unit/test_page_classifier.py --output-format=github",
      "result": "passed",
      "summary": "No ruff findings"
    },
    {
      "command": "git diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files"
    },
    {
      "command": "grep -n 'print(' runner/profile_maintenance.py scrapers/product_url_extraction/image_candidates.py scrapers/product_url_extraction/page_classifier.py tests/unit/*.py",
      "result": "passed",
      "summary": "No print() found in changed files"
    }
  ],
  "validationOutput": [
    "79 tests passed (14 new/updated tests).",
    "Ruff check: no output (clean).",
    "No staged files; dirty worktree preserved.",
    "No print() calls in changed files."
  ],
  "residualRisks": [
    "_has_jsonld_product() regex in page_classifier.py does not match @type arrays (out of scope, separate from _extract_jsonld_images fix).",
    "Blocked-page classification on failed crawls still uses error_page (pre-existing, not in scope).",
    "No live crawling was run."
  ],
  "noStagedFiles": true,
  "diffSummary": "3 source files and 3 test files modified across 6 fixes: crawl config dict with wait_for_images/scan_full_page; classifier requires additional strong signal for meta-only pages; JSON-LD @type array crash fix with isinstance/string-list normalization; observed selectors regex now matches HTML class/id attributes; ImageCandidate gains selection_role/rejection_reasons with context preservation through selection; early reject when canonical_domain is missing.",
  "reviewFindings": [
    "blocker: apps/scraper/scrapers/product_url_extraction/page_classifier.py:560 - fixed weak single meta signal producing product_detail_page",
    "blocker: apps/scraper/runner/profile_maintenance.py:167 - fixed Crawl4AI config to use dict with wait_for_images/scan_full_page",
    "blocker: apps/scraper/scrapers/product_url_extraction/image_candidates.py:397 - fixed context flags dropped during selection; selection_role/rejection_reasons now populated",
    "blocker: apps/scraper/scrapers/product_url_extraction/image_candidates.py:95 - fixed JSON-LD @type array crash",
    "note: apps/scraper/runner/profile_maintenance.py:245 - fixed observed selectors regex to match HTML class/id attributes",
    "note: apps/scraper/runner/profile_maintenance.py:84 - fixed missing canonical_domain rejection (pre-empt domain_match returning True)",
    "note: apps/scraper/scrapers/product_url_extraction/page_classifier.py:563 - fixed elif chain bug where PDP detection if-block overwrote earlier classifications"
  ],
  "manualNotes": "All 6 accepted fixes implemented and validated. 79 unit tests pass. Key structural fix: moved elif chain variable computation before the chain starts to avoid the classification-overwrite bug that affected domain mismatch, login, blocked, and error pages."
}
```