# Real PDP Seed Verification + Image Candidate Builder — Implementation Result

## Summary

Implemented the full PDP seed verification replacement and Image Candidate builder for the scraper runner. The static fixture in `profile_maintenance.py` has been replaced with a real Crawl4AI crawl pipeline that classifies pages, builds image candidates, and returns versioned verification artifacts.

## Changed Files

| File | Action | Description |
|------|--------|-------------|
| `apps/scraper/scrapers/product_url_extraction/image_candidates.py` | **CREATE** | ImageCandidate dataclass, `build_image_candidates()` extracting from crawl media/JSON-LD/OG+Twitter meta/DOM, `select_image_candidates()` wrapper using ProductMediaSelector |
| `apps/scraper/scrapers/product_url_extraction/page_classifier.py` | **CREATE** | PageClassification dataclass, `classify_page()` with pure signal-based classification (no LLM), `build_identity_evidence()`, `format_classification_evidence()` |
| `apps/scraper/runner/profile_maintenance.py` | **MODIFY** | Replaced static fixture in `_run_verify_pdp_seed` with real Crawl4AI crawl + page classification + image candidate builder + identity evidence |
| `apps/scraper/tests/unit/test_image_candidates.py` | **CREATE** | 23 tests for candidate builder (empty crawl, media images, JSON-LD, meta tags, dedup, selection, real fixtures) |
| `apps/scraper/tests/unit/test_page_classifier.py` | **CREATE** | 22 tests for page classifier (PDP detection, non-PDP types, domain verification, evidence helpers, real fixtures) |
| `apps/scraper/tests/unit/test_profile_maintenance.py` | **MODIFY** | Updated to use mock Crawl4AIEngine; added 8 new async tests for real crawl paths (verified, rejected, error, domain mismatch, artifact schema) |
| `apps/scraper/tests/fixtures/crawl4ai/pdp_crawl_result.json` | **CREATE** | Realistic PDP crawl result fixture (Open Farm product page with 3 images) |
| `apps/scraper/tests/fixtures/crawl4ai/category_crawl_result.json` | **CREATE** | Category page crawl result fixture (collection with 3 images) |
| `apps/scraper/tests/fixtures/crawl4ai/blocked_crawl_result.json` | **CREATE** | Blocked page crawl result fixture (403 error) |

## Commands Run

```bash
# Image candidate tests
uv run pytest tests/unit/test_image_candidates.py -v
# → 23 passed

# Page classifier tests
uv run pytest tests/unit/test_page_classifier.py -v
# → 22 passed

# Profile maintenance tests (updated + new async tests)
uv run pytest tests/unit/test_profile_maintenance.py -v
# → 22 passed

# All combined
uv run pytest tests/unit/test_profile_maintenance.py tests/unit/test_page_classifier.py tests/unit/test_image_candidates.py -v
# → 67 passed

# Existing selector tests (no regression)
uv run pytest tests/unit/test_image_enrichment.py -k "ProductMediaSelector or product_media_selector"
# → 5 passed

# Ruff lint
uv run ruff check runner/profile_maintenance.py scrapers/product_url_extraction/image_candidates.py scrapers/product_url_extraction/page_classifier.py tests/unit/test_profile_maintenance.py tests/unit/test_image_candidates.py tests/unit/test_page_classifier.py
# → No errors
```

## Implementation Details

### `page_classifier.py`
- Pure signal-based classification (no LLM)
- Detects: `product_detail_page`, `category_page`, `search_result`, `home_page`, `blog_article`, `login_page`, `blocked_page`, `error_page`, `wrong_domain`, `unknown`
- Uses 20+ signal detectors: JSON-LD Product schema, `og:type=product`, add-to-cart forms, variant selectors, price patterns, product H1, multiple product links, collection paths, search paths, blog paths, login forms, blocked text, error titles
- Domain verification: matches exact domain or subdomain of canonical domain
- Confidence scoring with signal weighting (positive PDP signals vs negative non-PDP signals)

### `image_candidates.py`
- `ImageCandidate` dataclass with full provenance metadata
- `build_image_candidates()` extracts from 4 sources:
  1. `crawl_result["media"]["images"]` — Crawl4AI detected images
  2. JSON-LD Product schema (parsed from HTML `script[type="application/ld+json"]`)
  3. OpenGraph/Twitter meta tags (`og:image`, `twitter:image`)
  4. DOM `<img>`/data-src/srcset via reuse of `media_selector._extract_html_image_candidates()`
- Deduplication by canonical URL (reuses `canonicalize_image_url` from `media_selector.py`)
- `select_image_candidates()` wraps `ProductMediaSelector` and maps results back to ImageCandidate objects

### `profile_maintenance.py`
- `_run_verify_pdp_seed` now:
  1. Crawls URL via `Crawl4AIEngine` with PDP-appropriate config
  2. Classifies page with `classify_page()`
  3. If non-PDP → `_build_rejected_result()` with classification evidence
  4. If PDP → builds image candidates, runs media selection, collects identity evidence
- Artifact envelope: `kind: "verify_pdp_seed"`, `schema_version: "v1"`, with `page_classification_evidence`, `identity_evidence`, `image_candidates`, `image_selection`, `observed_selectors`
- Error results use `verification_status: "rejected"` (not "error") to stay within web contract
- Domain mismatch → `wrong_domain` type with clear rejection reason

### Hard Constraints Met
- ❌ No web/admin files, migrations, or enrichment code modified
- ❌ No Browser Profile identity data in artifacts
- ❌ No direct Supabase queries from runner
- ✅ Async-first for runtime code
- ✅ Structured logger used (no `print()`)
- ✅ ProductMediaSelector backward compatible (existing tests pass)
- ✅ No staged files
- ✅ No `verification_status=error` emitted

## Residual Risks

1. **Brand/name inputs limited**: Current job payload doesn't include `brand_name` or product name. Identity evidence falls back to `source_slug`/domain. A future payload addition for `brand_name` would improve verification quality.
2. **No live crawl in unit tests**: All tests use mock/fixture data. Live integration testing requires coordinator + scraper env.
3. **Classification edge cases**: Some Shopify hybrid pages (collection pages with product schema in footer JSON-LD) may get borderline classifications. The conservative heuristics are designed to reject uncertain cases.
4. **Large evidence references**: `evidence_refs` is empty in artifacts; object storage upload is still a 501 stub.
5. **Page HTML size**: Passing full HTML (potentially 50KB+) through `build_image_candidates()` is fine for PDP verification but could be optimized later.

## Recommended Next Steps

1. Add `brand_name` field to PDP seed creation payload (web route)
2. Live smoke test with coordinator running (requires `PROFILE_MAINTENANCE_JOBS_ENABLED=true`)
3. Add `draft_site_extraction_profile` and `validate_profile_version` handler stubs
4. Formalize ImageCandidate as shared API schema (Phase 3.1)
5. Wire `evidence_refs` to object storage upload when available

## Acceptance Report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Static fixture replaced with real Crawl4AI crawl, page classification, and image candidate builder. All 67 new/updated tests pass. All lint checks pass. No scope widening."
    }
  ],
  "changedFiles": [
    "apps/scraper/scrapers/product_url_extraction/image_candidates.py",
    "apps/scraper/scrapers/product_url_extraction/page_classifier.py",
    "apps/scraper/runner/profile_maintenance.py",
    "apps/scraper/tests/unit/test_image_candidates.py",
    "apps/scraper/tests/unit/test_page_classifier.py",
    "apps/scraper/tests/unit/test_profile_maintenance.py",
    "apps/scraper/tests/fixtures/crawl4ai/pdp_crawl_result.json",
    "apps/scraper/tests/fixtures/crawl4ai/category_crawl_result.json",
    "apps/scraper/tests/fixtures/crawl4ai/blocked_crawl_result.json"
  ],
  "testsAddedOrUpdated": [
    "apps/scraper/tests/unit/test_image_candidates.py",
    "apps/scraper/tests/unit/test_page_classifier.py",
    "apps/scraper/tests/unit/test_profile_maintenance.py"
  ],
  "commandsRun": [
    {
      "command": "uv run pytest tests/unit/test_image_candidates.py -v",
      "result": "passed",
      "summary": "23 tests passed"
    },
    {
      "command": "uv run pytest tests/unit/test_page_classifier.py -v",
      "result": "passed",
      "summary": "22 tests passed"
    },
    {
      "command": "uv run pytest tests/unit/test_profile_maintenance.py -v",
      "result": "passed",
      "summary": "22 tests passed"
    },
    {
      "command": "uv run pytest tests/unit/test_profile_maintenance.py tests/unit/test_page_classifier.py tests/unit/test_image_candidates.py -v",
      "result": "passed",
      "summary": "67 tests passed"
    },
    {
      "command": "uv run ruff check runner/profile_maintenance.py scrapers/product_url_extraction/image_candidates.py scrapers/product_url_extraction/page_classifier.py tests/unit/test_profile_maintenance.py tests/unit/test_image_candidates.py tests/unit/test_page_classifier.py",
      "result": "passed",
      "summary": "No lint errors"
    },
    {
      "command": "uv run pytest tests/unit/test_image_enrichment.py -k 'ProductMediaSelector or product_media_selector'",
      "result": "passed",
      "summary": "5 existing selector tests still pass (no regression)"
    }
  ],
  "validationOutput": [
    "23 image_candidate tests: PASS",
    "22 page_classifier tests: PASS",
    "22 profile_maintenance tests: PASS (8 new async mock-crawl tests)",
    "Ruff lint: PASS (0 errors)",
    "Existing ProductMediaSelector tests: PASS (backward compatible)"
  ],
  "residualRisks": [
    "brand_name absent from job payload limits identity evidence",
    "No live crawl integration testing in unit tests",
    "Object storage evidence_upload is a 501 stub",
    "Classification edge cases for hybrid collection/PDP pages",
    "Large HTML size passed through candidate builder (performance optimization deferred)"
  ],
  "noStagedFiles": true,
  "diffSummary": "Replaced static fixture in profile_maintenance.py verify_pdp_seed handler with real Crawl4AI crawl + page classification + image candidate builder. Created image_candidates.py (builder + selector wrapper), page_classifier.py (pure signal-based classification with 20+ detectors). Added 3 fixture JSONs. Added 45 new tests across 2 new test files + 8 new async tests in updated test file.",
  "reviewFindings": [
    "no blockers",
    "note: Fixed _has_multiple_product_links regex pattern (improper greedy matching)",
    "note: Fixed _has_nav_only_content to not penalize short PDPs",
    "note: Added _has_collection_path for better collection page detection",
    "note: Mock async context manager in tests required _AsyncEngineMock helper"
  ],
  "manualNotes": "All hard constraints met. No web/admin migrations, enrichment code, or Browser Profile storage touched. Use 'brand_name' payload field when available for better identity evidence. Ready for live smoke test with coordinator running."
}
```
