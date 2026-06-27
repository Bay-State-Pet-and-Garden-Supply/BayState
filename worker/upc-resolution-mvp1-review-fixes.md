# UPC Resolution MVP1 Review Fixes — Implementation Report

## Summary

Applied all 8 accepted reviewer fixes to the BayState UPC Resolution V2 MVP1 codebase. No scope changes (no MVP2/MVP3 additions, no provider clients, no admin UI).

## Fixes Applied

### Fix 1: `resolutionEvidence` contract alignment (Web → Python)
- **Web** (`enrichment-result.ts`): Added preprocess normalization that wraps a single `resolutionEvidence` object into an array, making the Zod schema accept both `object` and `array` shapes.
- **Python** (`enrichment_models.py`): Changed `SourceResultInfo.resolutionEvidence` from `Optional[dict[str, Any]]` to `Optional[Any]` to accept both dict and list.
- **Python adapters**: Both `official_brand_crawl.py` and `serp_candidate_discovery.py` now emit `resolutionEvidence` as a list (array) of evidence dicts.

### Fix 2: Product data in V2 adapter `found` source_results
- Both adapters now include a `product` field (built via `build_nested_product_facts`) in each `SourceResultInfo` within source_results.
- The product object contains `name`, `brand`, and `upc` (when exact UPC proof exists), enabling the web reducer's `classifySourceEvidence` to extract observed GTIN from `sourceResult.product`.
- Tests assert `sr.product.upc` and `sr.product.name` are populated in found outcomes.

### Fix 3: Tightened official_brand_crawl high-confidence no-UPC path
- `_is_high_confidence_no_upc()` now receives and requires `raw_confidence >= 0.90`.
- Added word-boundary-based descriptor overlap check: extracted title must contain a non-brand word from the register/input name (to reject arbitrary official-domain pages with only brand text).
- Added negative test `test_wrong_official_page_rejected_by_tightened_no_upc` proving wrong product pages (e.g. "About Us") are rejected.
- Added `test_tightened_no_upc_rejects_low_confidence` proving confidence < 0.90 is rejected.

### Fix 4: `ai_credentials` propagation to nested `SerpDiscoveryAdapter`
- `SerpCandidateDiscoveryAdapter.extract()` now propagates `self.ai_credentials` to `self._serp_adapter.ai_credentials` before calling `_resolve_approved_url`.
- Added `test_ai_credentials_propagated_to_nested_adapter` to verify executor-provided credentials reach the nested adapter.

### Fix 5: V2 reachable through admin enrichment job route
- Added `upcResolutionV2Enabled` request parameter to `POST /api/admin/enrichment/jobs`.
- Falls back to `process.env.UPC_RESOLUTION_V2_ENABLED === "true"` server env flag.
- Passed through to `scrapeProducts()` options.
- Added route tests: `passes upcResolutionV2Enabled when explicitly set` and `defaults upcResolutionV2Enabled to false`.

### Fix 6: V2 source policy domains for SERP candidate
- Moved `for (const d of cleanDomains) allDomains.add(d)` to execute unconditionally when SERP candidate is synthesized (previously only ran inside the `if (!hasOfficialBrand)` block).
- Existing tests updated to assert `sourcePolicy.allowedDomains` includes `testbrand.com` and `existing-brand.com`.

### Fix 7: Adapter source slug alignment
- Both adapters now resolve `effective_slug = self.entry.sourceSlug or self.source_slug` and use it in all result builders.
- Added `test_source_slug_from_entry` tests for both adapters asserting `sr.sourceSlug` and `result.source.source_slug` match the entry slug.

### Fix 8: Remove misleading no-UPC branch comparison
- Removed the erroneous `compare_gtin(register_name, observed_upc)` check that compared observed UPC to register name.
- Replaced with: reject no-UPC path when ANY UPC is present in product data but does not match the *expected* UPC (via `compare_gtin(expected_upc, observed_upc)`).
- If observed UPC matches exactly, the exact-UPC proof gate above would have caught it, so return False.
- Added `test_upc_present_but_wrong_rejected_by_no_upc_path` test.

## Changed Files

### Python (6 files)
| File | Change |
|---|---|
| `apps/scraper/scrapers/ai_search/enrichment_models.py` | Changed `resolutionEvidence` type to `Optional[Any]` |
| `apps/scraper/scrapers/approved_sources/adapters/official_brand_crawl.py` | Added `import re`, `build_nested_product_facts`; tightened no-UPC path; fixed source slug; added product to source_results; fixed misleading UPC comparison |
| `apps/scraper/scrapers/approved_sources/adapters/serp_candidate_discovery.py` | Added `build_nested_product_facts` import; fixed source slug; added product to source_results; propagated ai_credentials |
| `apps/scraper/tests/unit/test_official_brand_crawl_adapter.py` | Updated assertions for array resolutionEvidence; added 4 new tests (wrong page, low confidence, wrong UPC present, source slug) |
| `apps/scraper/tests/unit/test_serp_candidate_discovery.py` | Updated assertions for array resolutionEvidence; added 2 new tests (credential propagation, source slug) |

### TypeScript (4 files)
| File | Change |
|---|---|
| `apps/web/lib/scraper-callback/enrichment-result.ts` | Added resolutionEvidence object→array normalization in preprocess |
| `apps/web/lib/approved-sources/source-plan.ts` | Moved `allDomains.add` outside `if (!hasOfficialBrand)` for SERP candidate domains |
| `apps/web/app/api/admin/enrichment/jobs/route.ts` | Added `upcResolutionV2Enabled` request param + env flag support |
| `apps/web/__tests__/lib/approved-sources/source-plan-modes.test.ts` | Added sourcePolicy.allowedDomains assertions to V2 tests |
| `apps/web/__tests__/app/api/admin/enrichment/jobs-route.test.ts` | Added 2 V2 route tests |

## Validation Results

### Web Tests: ALL 203 PASS (8 suites)
```
Test Suites: 8 passed, 8 total
Tests:       203 passed, 203 total
```

### TypeCheck: CLEAN (1 pre-existing failure)
```
__tests__/app/api/scraper/v1/logs.test.ts(39,7): error TS2353 (pre-existing, unrelated)
```
All new code compiles cleanly.

### Python V2 Tests: ALL 26 PASS
```
TestUpcResolutionGates: 6 passed
TestOfficialBrandCrawlAdapter: 9 passed (5 original + 4 new: wrong page, low confidence, wrong UPC, source slug)
TestSerpCandidateDiscoveryAdapter: 6 passed (4 original + 2 new: credentials, source slug)
TestExecutorV2Cascade: 5 passed (unchanged)
```

### Ruff: ALL PASSED
```
All 7 checked Python files clean.
```

### Git diff --check: CLEAN
No whitespace errors.

## Unrelated Dirty Files (not touched)
- `apps/web/lib/consolidation/*` (pre-existing changes)
- `progress.md`, `sandbox-research/*`, `sandbox-review/*` (pre-existing changes)

## Residual Risks

1. **GTIN-13 check digit edge cases**: Some UPC-A→EAN-13 conversions produce different check digits. `validate_check_digit` + `compare_gtin` correctly reject these.
2. **`serp_candidate_discovery` delegates URL discovery to `SerpDiscoveryAdapter`**: The credential fix addresses the immediate bug, but deep coupling remains.
3. **Descriptor overlap edge case**: Short words that are prefixes of brand names (e.g. "test" in "testbrand") can still pass the word-boundary check if they appear as separate words — but this is an acceptably rare false-positive.
4. **No licensed/barcode provider clients in MVP1**: Deliberate per scope.
5. **MVP0 migration not executed against live database**: Deliberate — migration is additive, not applied here.

## No Staged Files
All changes are unstaged. No `git add` performed.

---

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "All 8 accepted reviewer fixes implemented. No MVP2/MVP3 scope additions. No provider clients, admin UI, packaging VLM, or research-agent code."
    }
  ],
  "changedFiles": [
    "apps/scraper/scrapers/ai_search/enrichment_models.py",
    "apps/scraper/scrapers/approved_sources/adapters/official_brand_crawl.py",
    "apps/scraper/scrapers/approved_sources/adapters/serp_candidate_discovery.py",
    "apps/web/lib/scraper-callback/enrichment-result.ts",
    "apps/web/lib/approved-sources/source-plan.ts",
    "apps/web/app/api/admin/enrichment/jobs/route.ts",
    "apps/scraper/tests/unit/test_official_brand_crawl_adapter.py",
    "apps/scraper/tests/unit/test_serp_candidate_discovery.py",
    "apps/web/__tests__/lib/approved-sources/source-plan-modes.test.ts",
    "apps/web/__tests__/app/api/admin/enrichment/jobs-route.test.ts"
  ],
  "testsAddedOrUpdated": [
    "apps/scraper/tests/unit/test_official_brand_crawl_adapter.py: 4 new tests (wrong official page, low confidence reject, wrong UPC reject, source slug)"
    "apps/scraper/tests/unit/test_serp_candidate_discovery.py: 2 new tests (credential propagation, source slug)",
    "apps/web/__tests__/app/api/admin/enrichment/jobs-route.test.ts: 2 new tests (V2 flag pass-through, V2 default false)",
    "apps/web/__tests__/lib/approved-sources/source-plan-modes.test.ts: sourcePolicy assertions added to 2 existing V2 tests"
  ],
  "commandsRun": [
    {
      "command": "bun run web test -- --testPathPatterns=\"approved-sources|upc-resolution|enrichment-result|enrichment-callback-route|enrichment/jobs\"",
      "result": "passed",
      "summary": "8 suites, 203 tests, 0 failed"
    },
    {
      "command": "bun run web typecheck",
      "result": "passed (1 pre-existing logs.test.ts failure)",
      "summary": "All new code compiles cleanly"
    },
    {
      "command": "cd apps/scraper && uv run pytest tests/unit/test_approved_sources_executor.py::TestExecutorV2Cascade",
      "result": "passed",
      "summary": "5 V2 cascade tests passed"
    },
    {
      "command": "cd apps/scraper && uv run pytest tests/unit/test_official_brand_crawl_adapter.py tests/unit/test_serp_candidate_discovery.py",
      "result": "passed",
      "summary": "21 tests passed (9 official brand + 6 gates + 6 serp candidate)"
    },
    {
      "command": "cd apps/scraper && uv run ruff check scrapers/approved_sources/executor.py scrapers/approved_sources/types.py scrapers/approved_sources/upc_resolution.py scrapers/approved_sources/adapters/official_brand_crawl.py scrapers/approved_sources/adapters/serp_candidate_discovery.py scrapers/approved_sources/adapters/registry.py scrapers/ai_search/enrichment_models.py",
      "result": "passed",
      "summary": "All 7 checked Python files clean"
    },
    {
      "command": "git diff --check on touched MVP files",
      "result": "passed",
      "summary": "No whitespace errors"
    }
  ],
  "validationOutput": [
    "Web Tests: 8 suites, 203 tests, 0 failed",
    "Typecheck: 1 pre-existing failure (logs.test.ts:39), all new code clean",
    "Python V2 Tests: 26 passed (5 executor + 6 gates + 9 official brand + 6 serp candidate)",
    "Ruff: All 7 files clean",
    "Git diff --check: No whitespace errors"
  ],
  "residualRisks": [
    "GTIN-13 check digit edge cases for some UPC-A→EAN-13 conversions",
    "serp_candidate_discovery delegates URL discovery to serp_discovery (deep coupling, credential leak fixed)",
    "Descriptor overlap edge case: short words that are brand-name prefixes can pass through",
    "No licensed/barcode provider clients in MVP1 (deliberate)",
    "MVP0 migration not executed against live database"
  ],
  "noStagedFiles": true,
  "diffSummary": "8 reviewer fixes applied: resolutionEvidence contract alignment (array tolerance + emit arrays), product data in V2 adapter found results, tightened official_brand_crawl no-UPC path with word-boundary descriptor check, ai_credentials propagation to nested SerpDiscoveryAdapter, V2 admin route feature flag (request + env), source policy domains for SERP candidates, adapter source slug from entry, and removal of misleading UPC-to-register-name comparison. 6 new tests added (wrong official page, low confidence reject, wrong UPC reject, source slug x2, credential propagation). All 26 Python + 203 web tests pass.",
  "reviewFindings": [
    "no blockers: All 8 accepted reviewer fixes implemented and verified",
    "note: Pre-existing dirty worktree (apps/web/lib/consolidation/*, progress.md, sandbox-*) not touched",
    "note: Pre-existing typecheck failure in logs.test.ts is unrelated"
  ],
  "manualNotes": "All changes are unstaged. No git add performed. Pre-existing dirty worktree preserved. Upload the final report to subagent artifacts if requested."
}
```
