# Real PDP Verification — Final Narrow Review

## Review

- **Correct:** Focused scraper tests pass: `python3 -m pytest tests/unit/test_profile_maintenance.py tests/unit/test_image_candidates.py tests/unit/test_page_classifier.py -q` collected 79 tests and reported `79 passed`.
- **Fixed:** None by this reviewer; review-only run, no source/test files modified.
- **Blocker:** `apps/scraper/scrapers/product_url_extraction/page_classifier.py:575-578` still has no effective confidence threshold before returning `product_detail_page`. A low-confidence single-signal page can still be verified because `apps/scraper/runner/profile_maintenance.py:107-108` rejects only non-`product_detail_page`, and `apps/scraper/runner/profile_maintenance.py:431-435` emits `verification_status: verified` for every PDP classification. Ad-hoc probe results: `price_only product_detail_page 0.25`; `add_only product_detail_page 0.3`; `jsonld_collection_title product_detail_page 0.25`. This means blocker 2 is only partially fixed: `og:type`-only and JSON-LD-only are rejected, but weak low-confidence signals are still accepted.
- **Note:** The JSON-LD `@type` array crash/failure is fixed in `image_candidates.py`, but `page_classifier.py:136-145` still uses regexes that detect only string-valued JSON-LD `@type`; if classifier array detection was intended by the blocker wording, that remains a follow-up risk.

## Pass/Fail per requested blocker

1. **PASS — Crawl4AI dict config with `wait_for_images`/`scan_full_page`.** `apps/scraper/runner/profile_maintenance.py:177-193` passes a dict to `Crawl4AIEngine(config=...)` with `crawler.wait_for_images=True`, `crawler.scan_full_page=True`, and timeouts. Test coverage at `apps/scraper/tests/unit/test_profile_maintenance.py:405-435` captures the config and asserts these settings.
2. **FAIL — weak classifier signals require confidence threshold.** `apps/scraper/scrapers/product_url_extraction/page_classifier.py:575-578` allows PDP with `confidence = min(pdp_score / 100.0, 0.95)` as low as 0.25/0.30, and the runner verifies solely by page type (`apps/scraper/runner/profile_maintenance.py:107-108`, `apps/scraper/runner/profile_maintenance.py:431-435`). Existing tests cover `og:type`-only and JSON-LD-only rejection (`apps/scraper/tests/unit/test_page_classifier.py:211-249`) but not low-confidence price-only/add-to-cart-only PDP promotion.
3. **PASS — JSON-LD `@type` arrays handled in image candidate extraction.** `apps/scraper/scrapers/product_url_extraction/image_candidates.py:115-130` guards `item` type and normalizes `@type` strings/lists before matching Product/ProductGroup/ItemPage. Tests at `apps/scraper/tests/unit/test_image_candidates.py:215-247` verify array and mixed array/string cases produce candidates.
4. **PASS — observed selectors regex fixed.** `apps/scraper/runner/profile_maintenance.py:252-291` now matches `class=`/`id=` HTML attributes instead of literal `.class`/`#id` text. Test coverage at `apps/scraper/tests/unit/test_profile_maintenance.py:611-642` asserts `.product-title`, `.price`, `.add-to-cart`, and `#product-form` are extracted from real HTML attributes.
5. **PASS — `selection_role`/`rejection_reasons` in `ImageCandidate`.** Fields are present at `apps/scraper/scrapers/product_url_extraction/image_candidates.py:45-46`; selection maps roles/reasons back at `apps/scraper/scrapers/product_url_extraction/image_candidates.py:458-475`; artifact serialization uses `to_dict()` via `apps/scraper/runner/profile_maintenance.py:427-460`. Tests at `apps/scraper/tests/unit/test_image_candidates.py:390-454` and `apps/scraper/tests/unit/test_profile_maintenance.py:572-608` cover role/reason and artifact presence.
6. **PASS — empty `canonical_domain` rejected.** `apps/scraper/runner/profile_maintenance.py:83-89` returns rejected with `error_code="missing_canonical_domain"` before crawling. Test coverage at `apps/scraper/tests/unit/test_profile_maintenance.py:387-394` verifies rejected status and a canonical-domain rejection message.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete pass/fail findings include file paths and line numbers for all 6 requested blockers; blocker 2 remains failing with an ad-hoc classifier probe and runner evidence."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "cd /Users/nickborrello/Desktop/Projects/BayState/apps/scraper && python3 -m pytest tests/unit/test_profile_maintenance.py tests/unit/test_image_candidates.py tests/unit/test_page_classifier.py -q",
      "result": "passed",
      "summary": "79 passed, 3973 warnings in 0.79s"
    },
    {
      "command": "cd /Users/nickborrello/Desktop/Projects/BayState/apps/scraper && python3 - <<'PY' ... classify_page weak-signal probe ... PY",
      "result": "completed",
      "summary": "og_only and jsonld_only returned unknown, but price_only returned product_detail_page 0.25, add_only returned product_detail_page 0.3, and jsonld_collection_title returned product_detail_page 0.25."
    },
    {
      "command": "git -C /Users/nickborrello/Desktop/Projects/BayState diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files."
    }
  ],
  "validationOutput": [
    "Focused unit tests passed: 79 passed.",
    "Per-blocker status: PASS for 1, 3, 4, 5, 6; FAIL for 2."
  ],
  "residualRisks": [
    "Blocker 2 remains: weak single commerce/non-commerce signals can still produce product_detail_page with confidence below a practical threshold and the runner verifies solely by page_type.",
    "page_classifier.py still does not detect array-valued JSON-LD @type in its regex helpers; image candidate extraction handles arrays, but classifier array support remains a follow-up if required.",
    "No live crawling was run; validation is static/unit-test based."
  ],
  "noStagedFiles": true,
  "diffSummary": "Review-only; no source or test files modified by this reviewer. Required validation report was written to validation/real-pdp-verification-final-narrow-review.md.",
  "reviewFindings": [
    "blocker: apps/scraper/scrapers/product_url_extraction/page_classifier.py:575 - no effective confidence threshold; price-only/add-only examples classify as product_detail_page with confidence 0.25/0.30 and apps/scraper/runner/profile_maintenance.py:107 verifies solely by page_type.",
    "no blocker: apps/scraper/runner/profile_maintenance.py:177 - Crawl4AI config is a dict with wait_for_images/scan_full_page enabled.",
    "no blocker: apps/scraper/scrapers/product_url_extraction/image_candidates.py:115 - JSON-LD @type arrays are normalized for image candidate extraction.",
    "no blocker: apps/scraper/runner/profile_maintenance.py:252 - observed selector regexes match class/id attributes.",
    "no blocker: apps/scraper/scrapers/product_url_extraction/image_candidates.py:45 - ImageCandidate includes selection_role and rejection_reasons and selection populates them.",
    "no blocker: apps/scraper/runner/profile_maintenance.py:83 - missing canonical_domain is rejected before crawl."
  ],
  "manualNotes": "Report-only run. Existing worktree was already dirty/untracked before this review; no source/test edits were made."
}
```
