## Review

- **Correct:** Static `example.com` fixture logic is gone from `apps/scraper/runner/profile_maintenance.py`; `_run_verify_pdp_seed` now crawls, classifies, builds/selects Image Candidates, and returns a `verify_pdp_seed` artifact for verified PDPs (`apps/scraper/runner/profile_maintenance.py:84-150`, `apps/scraper/runner/profile_maintenance.py:430-452`).
- **Correct:** The handler does not emit `verification_status = "error"`; crawl failures and non-PDP pages are rejected, not verified (`apps/scraper/runner/profile_maintenance.py:86-93`, `apps/scraper/runner/profile_maintenance.py:281-333`, `apps/scraper/runner/profile_maintenance.py:354-384`). Grep found no Supabase queries or Browser Profile identity terms in the reviewed runner/classifier/candidate files.
- **Correct:** Domain mismatch is modeled as `wrong_domain` before PDP classification (`apps/scraper/scrapers/product_url_extraction/page_classifier.py:548-552`), and the handler verifies only after `classification.page_type == "product_detail_page"` (`apps/scraper/runner/profile_maintenance.py:98-110`).
- **Correct:** `ProductMediaSelector` itself was not modified; focused existing selector/enrichment tests passed.
- **Fixed:** None. Review-only task; no source files were modified.

- **Blocker:** `apps/scraper/scrapers/product_url_extraction/page_classifier.py:560-568` can classify a page as `product_detail_page` from only `og:type=product` or only JSON-LD `Product`, and `apps/scraper/runner/profile_maintenance.py:140-150` / `:414-417` then marks that page verified with no confidence/strong-signal gate. Verified evidence from an ad-hoc classifier run: `og_only product_detail_page 0.35 ['has_og_type_product'] []`; `jsonld_only product_detail_page 0.4 ['has_jsonld_product'] []`. **Smallest fix:** require at least one additional strong PDP/commerce signal (add-to-cart, price, variant, product H1/name consistency) and/or a minimum classifier confidence before returning `product_detail_page`/`verified`.
- **Blocker:** `_crawl_target` declares PDP image crawl constants but constructs `Crawl4AIEngine` with `EngineConfig` only (`apps/scraper/runner/profile_maintenance.py:167-177`). `EngineConfig` normalizes only timeout/concurrency/retry fields (`apps/scraper/src/crawl4ai_engine/engine.py:60-67`), while Crawl4AI defaults `wait_for_images=False` and `scan_full_page=False` unless supplied in the config dict (`apps/scraper/src/crawl4ai_engine/engine.py:293-298`). This violates the guardrail for real PDP/image-candidate crawling and can miss lazy/gallery images. **Smallest fix:** instantiate `Crawl4AIEngine` with a dict config containing `crawler.wait_for_images: true`, `crawler.scan_full_page: true`, and an appropriate timeout/page_timeout; add a test that inspects the config passed to the engine.
- **Blocker:** Image Candidate selection drops selector context and role/rejection evidence. `ImageCandidate` has no `selection_role` or `rejection_reasons` fields (`apps/scraper/scrapers/product_url_extraction/image_candidates.py:27-48`); `select_image_candidates` converts candidates to bare Crawl4AI media without `gallery_context`, `non_product_context`, or `duplicate_context` (`apps/scraper/scrapers/product_url_extraction/image_candidates.py:397-408`), and `ProductMediaSelector.select` resets those context flags to `False` for crawl-media inputs (`apps/scraper/scrapers/product_url_extraction/media_selector.py:851-861`). The verified artifact serializes the original candidates unchanged (`apps/scraper/runner/profile_maintenance.py:409-442`), so rejected summaries/reasons are not attached. **Smallest fix:** pass/preserve context flags into the selector in a backward-compatible way, then annotate artifact candidates with selector role and rejection reasons from `SelectedImage`.

- **Note:** `_domain_matches()` returns `True` when `canonical_domain` is empty (`apps/scraper/scrapers/product_url_extraction/page_classifier.py:124-127`). The web enqueue path currently supplies a canonical domain, but if a malformed/legacy job omits it, a PDP can be verified without a real domain match. Consider rejecting missing canonical domain in the handler for `verify_pdp_seed`.
- **Note:** `_extract_jsonld_images()` assumes `@type` is a string (`apps/scraper/scrapers/product_url_extraction/image_candidates.py:95-97`); list-valued JSON-LD types are common and can raise during candidate building. Add a small guard/test while fixing candidate evidence.

### Focused validation

- `cd apps/scraper && uv run pytest tests/unit/test_profile_maintenance.py tests/unit/test_image_candidates.py tests/unit/test_page_classifier.py tests/unit/test_image_enrichment.py -k 'ProductMediaSelector or product_media_selector or image_candidates or page_classifier or profile_maintenance'` — **passed**, 72 selected tests passed, 5 deselected.
- `cd apps/scraper && uv run python - <<'PY' ... classify_page minimal og/jsonld cases ... PY` — **passed**, demonstrated the weak-signal false-positive classification noted above.
- `git diff --cached --name-only` — **passed**, no staged files.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete review findings cite apps/scraper/runner/profile_maintenance.py, apps/scraper/scrapers/product_url_extraction/image_candidates.py, apps/scraper/scrapers/product_url_extraction/page_classifier.py, and media_selector.py with blocker severity and smallest fixes."
    }
  ],
  "changedFiles": [
    "validation/real-pdp-verification-correctness-review.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git status --short && git diff --stat -- apps/scraper/runner/profile_maintenance.py apps/scraper/scrapers/product_url_extraction/image_candidates.py apps/scraper/scrapers/product_url_extraction/page_classifier.py apps/scraper/tests tests && git diff --name-only",
      "result": "passed",
      "summary": "Inspected working tree; target implementation files are new/untracked amid many unrelated pre-existing changes."
    },
    {
      "command": "cd apps/scraper && uv run pytest tests/unit/test_profile_maintenance.py tests/unit/test_image_candidates.py tests/unit/test_page_classifier.py tests/unit/test_image_enrichment.py -k 'ProductMediaSelector or product_media_selector or image_candidates or page_classifier or profile_maintenance'",
      "result": "passed",
      "summary": "72 selected tests passed; 5 deselected; warnings were pytest_asyncio/Python 3.14 deprecations and requests dependency warning."
    },
    {
      "command": "cd apps/scraper && uv run python - <<'PY' ... classify_page minimal og/jsonld cases ... PY",
      "result": "passed",
      "summary": "Demonstrated classifier returns product_detail_page for only og:type=product or only JSON-LD Product."
    },
    {
      "command": "git diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files."
    }
  ],
  "validationOutput": [
    "Focused scraper tests: 72 passed, 5 deselected.",
    "Classifier weak-signal probe: og_only product_detail_page 0.35; jsonld_only product_detail_page 0.4.",
    "Reviewed grep checks found no verification_status=error, Supabase queries, or Browser Profile identity terms in target implementation artifacts."
  ],
  "residualRisks": [
    "No live crawling was run; crawl config concern is based on code-path inspection.",
    "Working tree has many unrelated unstaged/untracked changes outside this review scope.",
    "Candidate evidence remains compact; object storage evidence upload is still out of scope."
  ],
  "noStagedFiles": true,
  "diffSummary": "Runner PDP verification, page classifier, image candidate builder, fixtures, and focused scraper tests are newly added/untracked; ProductMediaSelector source is unchanged.",
  "reviewFindings": [
    "blocker: apps/scraper/scrapers/product_url_extraction/page_classifier.py:560 - weak single metadata signals can produce product_detail_page and become verified.",
    "blocker: apps/scraper/runner/profile_maintenance.py:167 - Crawl4AI config does not enable wait_for_images/scan_full_page.",
    "blocker: apps/scraper/scrapers/product_url_extraction/image_candidates.py:397 - selector context and role/rejection evidence are dropped before artifact serialization.",
    "note: apps/scraper/scrapers/product_url_extraction/page_classifier.py:124 - empty canonical_domain is treated as a match.",
    "note: apps/scraper/scrapers/product_url_extraction/image_candidates.py:95 - JSON-LD @type list values can break image extraction."
  ],
  "manualNotes": "No source fixes were applied per review-only instructions."
}
```