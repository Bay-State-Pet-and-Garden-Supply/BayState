## Review

- Correct: Legacy mode is still gated off by default: `buildApprovedSourcePlans()` defaults `upcResolutionV2Enabled` to `false` (`apps/web/lib/approved-sources/source-plan.ts:196-198`), scraper executor only enters V2 when `job_config.upc_resolution_v2` is truthy (`apps/scraper/scrapers/approved_sources/executor.py:112-117`), and web job config only adds proof-required flags when the option is enabled (`apps/web/lib/pipeline-scraping.ts:600-608`).
- Correct: V2 plan/routing mostly matches the intended distributor cascade: web synthesizes `official_brand_crawl` and `serp_candidate_discovery` stages (`apps/web/lib/approved-sources/source-plan.ts:455-503`), and the executor runs distributors first, skips later stages on distributor `found`, blocks later stages on non-Amazon distributor `source_error`, and otherwise proceeds to official then SERP (`apps/scraper/scrapers/approved_sources/executor.py:221-285`).
- Fixed: None. Review-only task; no project/source files modified.

- Blocker: `resolutionEvidence` is shaped incompatibly between scraper and web, so MVP1 V2 callbacks from the new adapters can be rejected before the reducer runs. Web requires `resolutionEvidence` to be an array (`apps/web/lib/scraper-callback/enrichment-result.ts:62-66`) and returns HTTP 400 on schema failure (`apps/web/app/api/scraper/v1/enrichment-callback/route.ts:117-132`). Python declares it as a dict (`apps/scraper/scrapers/ai_search/enrichment_models.py:417-419`), and both new adapters emit an object (`apps/scraper/scrapers/approved_sources/adapters/official_brand_crawl.py:157-164`, `apps/scraper/scrapers/approved_sources/adapters/serp_candidate_discovery.py:165-172`). Smallest safe fix: align the contract, preferably by accepting/normalizing object-or-array in the web schema and/or emitting an array from Python, then add a callback-route test using real adapter-shaped `source_results`.
- Blocker: V2 adapter `found` results do not include `product` on each `SourceResultInfo`, but the MVP0 reducer derives proof only from `sourceResult.product` and ignores `resolutionEvidence`. The reducer calls `classifySourceEvidence()` per source (`apps/web/lib/upc-resolution/source-results.ts:66-69`), which extracts observed GTIN only from `sourceResult.product` (`apps/web/lib/upc-resolution/gates.ts:112-115`). The new adapter source-result objects include evidence fields but no `product` (`apps/scraper/scrapers/approved_sources/adapters/official_brand_crawl.py:148-166`, `apps/scraper/scrapers/approved_sources/adapters/serp_candidate_discovery.py:156-174`). I verified an official exact-UPC adapter result serializes as `product: null` and `resolutionEvidence: { ... }`. Consequences: SERP exact UPC proof will be reduced as below-gate candidate instead of confirmed; official exact UPC may be misclassified as high-confidence no-UPC rather than exact UPC; candidate URLs in not-stocked evidence are not preserved because non-`found` outcomes immediately become `no_upc_evidence` (`apps/web/lib/upc-resolution/gates.ts:126-139`). Smallest safe fix: include the nested product facts in every proof-bearing source result, or teach the web reducer to consume normalized `resolutionEvidence`; cover official exact, SERP exact, and candidate/no-proof callback payloads.
- Blocker: `official_brand_crawl` has a fail-open high-confidence no-UPC path. It parses extractor confidence (`apps/scraper/scrapers/approved_sources/adapters/official_brand_crawl.py:122-127`) but does not pass or use it in `_is_high_confidence_no_upc()` (`apps/scraper/scrapers/approved_sources/adapters/official_brand_crawl.py:169-203`, `226-265`). The gate only checks that a domain exists, the extracted title contains the brand, and some content exists; it does not require raw confidence, descriptor/variant overlap with the input product, or size/flavor match. This can promote an arbitrary official-domain page with brand text to `found` at 0.92 without UPC proof. Smallest safe fix for MVP1: fail closed unless exact UPC is present, or require raw confidence plus explicit title/variant overlap and add negative tests for wrong official product pages.

- Note: Existing explicit `licensed_feed`/other entries are grouped as `other_entries` and run after SERP, including after official `found` (`apps/scraper/scrapers/approved_sources/executor.py:267-290`). This is not a current MVP1 blocker if no licensed providers are configured, but it should be revisited before MVP2 because the planned order is official → licensed → SERP.
- Note: The admin enrichment endpoint currently accepts only `upcs`, `retryMode`, `testMode`, and `serpDiscoveryEnabled`, then calls `scrapeProducts()` without `upcResolutionV2Enabled` (`apps/web/app/api/admin/enrichment/jobs/route.ts:23-29`, `71-77`). If V2 is expected to be runnable from the existing admin/API path before bakeoff, add a guarded option/env flag there.

Residual risks: strict official crawling is currently a narrow `/products?q=<upc>` probe; SERP candidate discovery delegates URL discovery to the legacy SERP adapter. Those are acceptable MVP1 coverage risks once the callback contract/proof-gate issues above are fixed.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Severity-ranked review findings provided with file/line references, concrete regression risks, and smallest safe fixes. Correct legacy/V2 routing evidence and residual risks are documented."
    }
  ],
  "changedFiles": [
    "review/upc-mvp1-correctness.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git status --short && git diff --stat -- <MVP1 files>",
      "result": "passed",
      "summary": "Inspected changed-file set and MVP1 diff summary."
    },
    {
      "command": "cd apps/scraper && uv run --with-requirements requirements.txt python - <<'PY' ...",
      "result": "passed",
      "summary": "Confirmed official_brand_crawl exact-UPC result serializes source_results[0].product as null and resolutionEvidence as an object."
    },
    {
      "command": "git diff --cached --name-only && git status --short review/upc-mvp1-correctness.md",
      "result": "passed",
      "summary": "No staged files; review artifact is untracked."
    }
  ],
  "validationOutput": [
    "Parent validation accepted as context: web focused tests exit 0; scraper V2 focused tests exit 0 (20 passed); focused ruff exit 0; web typecheck only pre-existing logs.test.ts mock type error.",
    "Adapter serialization check showed: sourceSlug=official_brand_crawl, outcome=found, product=null, resolutionStage=official_brand, resolutionEvidence={...}."
  ],
  "residualRisks": [
    "Official crawl coverage is narrow (/products?q=<upc>) until broader discovery/sitemap probing is added.",
    "SERP candidate discovery remains coupled to legacy SerpDiscoveryAdapter URL selection.",
    "V2 may not be reachable from the existing admin enrichment endpoint unless a guarded option/env flag is added."
  ],
  "noStagedFiles": true,
  "diffSummary": "Review only; wrote review/upc-mvp1-correctness.md. No source/project implementation files modified.",
  "reviewFindings": [
    "blocker: apps/web/lib/scraper-callback/enrichment-result.ts:62 and apps/scraper/scrapers/ai_search/enrichment_models.py:419 - resolutionEvidence array-vs-object contract mismatch can make V2 callbacks return 400.",
    "blocker: apps/web/lib/upc-resolution/gates.ts:112 and apps/scraper/scrapers/approved_sources/adapters/serp_candidate_discovery.py:156 - adapter source_results omit product while reducer relies on sourceResult.product, so exact SERP proof is not accepted and official exact proof is misclassified.",
    "blocker: apps/scraper/scrapers/approved_sources/adapters/official_brand_crawl.py:169 - high-confidence no-UPC path does not use raw confidence or descriptor matching and can emit found without UPC proof.",
    "note: apps/scraper/scrapers/approved_sources/executor.py:287 - licensed/other entries run after SERP; revisit before MVP2 provider work."
  ],
  "manualNotes": "An initial Python inspection without --with-requirements failed due missing pydantic; reran with requirements successfully. No source edits were made."
}
```
