## Review

- Correct: The focused tests are not purely snapshot/implementation matching. The web source-plan suite asserts legacy preservation and V2 plan shape (`apps/web/__tests__/lib/approved-sources/source-plan-modes.test.ts:539-835`), the executor suite asserts V2 stage call/skip behavior (`apps/scraper/tests/unit/test_approved_sources_executor.py:1314-1708`), and adapter tests exercise gate outcomes and evidence payloads (`apps/scraper/tests/unit/test_official_brand_crawl_adapter.py:60-230`, `apps/scraper/tests/unit/test_serp_candidate_discovery.py:60-165`).
- Correct: Core V2 stage labels are mostly consistent. Web emits `resolutionStage: "official_brand"` and `"serp"` (`apps/web/lib/approved-sources/source-plan.ts:436-440`, `apps/web/lib/approved-sources/source-plan.ts:486-502`), job config emits `upc_resolution_v2`, `upc_resolution_policy`, and `cascade_version: "v2"` (`apps/web/lib/pipeline-scraping.ts:584-607`), and the scraper executor routes on `upc_resolution_v2` plus those stage names (`apps/scraper/scrapers/approved_sources/executor.py:112-117`, `apps/scraper/scrapers/approved_sources/executor.py:204-213`).
- Correct: Scope is still MVP1-sized. I did not find provider bakeoff clients, admin UI/publish guard work, packaging VLM integration, or other obvious MVP2/MVP3 starts in the inspected files.
- Fixed: None. Review-only; I did not modify project/source files.

### Severity-ranked findings

- Must-fix: `SerpCandidateDiscoveryAdapter` drops coordinator-provided AI/search credentials before delegating SERP discovery. The executor sets `adapter.ai_credentials` only on the instantiated adapter (`apps/scraper/scrapers/approved_sources/executor.py:423-426`), but `SerpCandidateDiscoveryAdapter` creates a nested `SerpDiscoveryAdapter` at construction time (`apps/scraper/scrapers/approved_sources/adapters/serp_candidate_discovery.py:52-56`) and calls its private resolver (`apps/scraper/scrapers/approved_sources/adapters/serp_candidate_discovery.py:74-81`). The nested adapter is the object that reads `ai_credentials` for LLM/SearchClient setup (`apps/scraper/scrapers/approved_sources/adapters/serp_discovery.py:301-331`), while the runner explicitly says claimed job credentials should be preferred over env (`apps/scraper/runner/__init__.py:55-60`) and passes them to the executor (`apps/scraper/runner/__init__.py:324-329`). Small safe fix: before calling `_resolve_approved_url`, assign `self._serp_adapter.ai_credentials = getattr(self, "ai_credentials", None)` (or expose a public resolver/helper that accepts credentials). Add a focused test proving executor-provided `serper_api_key` reaches `SearchClient` through `SerpCandidateDiscoveryAdapter`.
- Must-fix for end-to-end activation: I found no current web caller that can turn on `ScrapeOptions.upcResolutionV2Enabled`; the admin enrichment endpoint only reads `upcs`, `retryMode`, `testMode`, and `serpDiscoveryEnabled` (`apps/web/app/api/admin/enrichment/jobs/route.ts:23-29`) and builds options without the V2 flag (`apps/web/app/api/admin/enrichment/jobs/route.ts:71-75`). The library plumbing is present (`apps/web/lib/pipeline-scraping-types.ts:32-39`, `apps/web/lib/pipeline-scraping.ts:537-549`), but without a route/env/config handoff the V2 job config at `apps/web/lib/pipeline-scraping.ts:600-607` is not reachable through the existing admin job path. Small safe fix: add an explicit request or server-side feature flag path and test that the inserted `enrichment_jobs.config` contains the V2 keys.
- Should-fix: V2 source plans can synthesize a SERP candidate whose domain is not in `sourcePolicy.allowedDomains` when an official-brand source already exists. `cleanDomains` from `brand.official_domains` are only added to `allDomains` inside `if (!hasOfficialBrand)` (`apps/web/lib/approved-sources/source-plan.ts:459-483`), but the SERP candidate is always created from those `cleanDomains` afterward (`apps/web/lib/approved-sources/source-plan.ts:485-503`), and the policy is built from `allDomains` (`apps/web/lib/approved-sources/source-plan.ts:557-563`). This is easy to miss because the existing-source test uses different domains (`apps/web/__tests__/lib/approved-sources/source-plan-modes.test.ts:667-670`) but only asserts the SERP entry exists. Small safe fix: add `for (const d of cleanDomains) allDomains.add(d)` whenever the SERP candidate is created, and assert policy domains in that test.
- Should-fix: The new adapters ignore `entry.sourceSlug`, so source attempts/evidence can be recorded under generic adapter slugs instead of the source-plan slugs. The source plan uses brand/source slugs such as `brand.slug` and `serp_candidate` (`apps/web/lib/approved-sources/source-plan.ts:463-489`), but `OfficialBrandCrawlAdapter` and `SerpCandidateDiscoveryAdapter` hard-code class slugs (`apps/scraper/scrapers/approved_sources/adapters/official_brand_crawl.py:42-44`, `apps/scraper/scrapers/approved_sources/adapters/serp_candidate_discovery.py:48-50`) and pass those into result builders (`apps/scraper/scrapers/approved_sources/adapters/official_brand_crawl.py:139-166`, `apps/scraper/scrapers/approved_sources/adapters/serp_candidate_discovery.py:147-174`). Since executor result merging is keyed by `SourceResultInfo.sourceSlug` (`apps/scraper/scrapers/approved_sources/executor.py:562-581`), multiple official entries can collapse together and web persistence will not align cleanly to the plan source slug. Small safe fix: initialize/use `self.entry.sourceSlug or self.source_slug` for all result builders; add adapter tests asserting returned `source.source_slug` and `source_results[0].sourceSlug` match the entry.
- Note: The SERP candidate adapter is tightly coupled to private legacy `SerpDiscoveryAdapter` internals (`_resolve_approved_url` and `_last_consolidated_name`) at `apps/scraper/scrapers/approved_sources/adapters/serp_candidate_discovery.py:74-102`. Reusing discovery is reasonable for MVP1, but the credential bug above shows the coupling is already leaking. Prefer extracting a small public URL-discovery helper or subclassing with an explicit public method before expanding V2 behavior.
- Note: Test coverage should be extended around integration seams rather than only the direct functions: web job-config insertion/V2 activation, source-policy domains for synthesized SERP entries, credential propagation through `SerpCandidateDiscoveryAdapter`, adapter source-slug preservation, and executor behavior when SERP discovery returns no URL.
- Note: `OfficialBrandCrawlAdapter._is_high_confidence_no_upc()` compares `observed_upc` to `register_name` (`apps/scraper/scrapers/approved_sources/adapters/official_brand_crawl.py:246-253`). Because exact UPC proof is checked before this branch, this is unlikely to accept bad evidence, but it is misleading maintainability-wise. The smallest cleanup is to reject whenever a UPC is present in the no-UPC branch, or pass the expected UPC explicitly.

## Validation notes

- I did not rerun the full focused test suites because the parent validation reported web focused tests exit 0, scraper V2 focused tests exit 0 (20 passed), focused ruff exit 0, and only a pre-existing web typecheck failure in `logs.test.ts`.
- I did run read-only inspection commands (`git status`, `git diff --stat`, targeted `grep`, and line-numbered `nl` snippets) and verified no staged files before writing this review artifact.
- `plan.md` and `progress.md` in the repo are unrelated/stale for this UPC V2 review; I used the MVP1 worker report and final MVP0 review as the relevant context.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete severity-ranked findings are listed above with file/line references, including credential propagation, activation wiring, source-policy domains, sourceSlug preservation, and adapter coupling/test gaps."
    }
  ],
  "changedFiles": [
    "review/upc-mvp1-tests-maintainability.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git status --short -- <MVP1 files>",
      "result": "passed",
      "summary": "Confirmed the expected MVP1 files are modified/untracked and no review artifact existed yet."
    },
    {
      "command": "git diff --stat -- <MVP1 tracked files>",
      "result": "passed",
      "summary": "Inspected change size across web/scraper MVP1 files."
    },
    {
      "command": "targeted grep/nl inspections for V2 flags, stage labels, adapters, executor, route wiring, and tests",
      "result": "passed",
      "summary": "Collected file/line evidence for the review findings."
    },
    {
      "command": "git diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files reported before writing the review artifact."
    }
  ],
  "validationOutput": [
    "Parent validation reported: web focused tests exit 0; scraper V2 focused tests exit 0 (20 passed); focused ruff exit 0; web typecheck exit 1 only for pre-existing logs.test.ts mock type error.",
    "This review did not modify project/source files."
  ],
  "residualRisks": [
    "I did not rerun the focused test suites locally during review.",
    "The existing admin route activation finding references apps/web/app/api/admin/enrichment/jobs/route.ts, which was outside the explicit MVP1 file list but is relevant to integration cleanliness."
  ],
  "noStagedFiles": true,
  "diffSummary": "Review artifact only; no project/source files changed by this review.",
  "reviewFindings": [
    "must-fix: apps/scraper/scrapers/approved_sources/adapters/serp_candidate_discovery.py:52-81 - nested SerpDiscoveryAdapter does not receive executor-provided ai_credentials before using SearchClient/LLM credentials.",
    "must-fix-for-integration: apps/web/app/api/admin/enrichment/jobs/route.ts:23-75 - existing admin job path does not accept/pass upcResolutionV2Enabled, so V2 job config is not reachable through that route.",
    "should-fix: apps/web/lib/approved-sources/source-plan.ts:459-503 - SERP candidate domains are not always added to sourcePolicy.allowedDomains when an official brand source already exists.",
    "should-fix: apps/scraper/scrapers/approved_sources/adapters/official_brand_crawl.py:42-166 and apps/scraper/scrapers/approved_sources/adapters/serp_candidate_discovery.py:48-174 - adapters hard-code generic source slugs instead of preserving entry.sourceSlug.",
    "note: apps/scraper/scrapers/approved_sources/adapters/serp_candidate_discovery.py:74-102 - adapter is coupled to private SerpDiscoveryAdapter internals; acceptable short-term but should be isolated before MVP2 expansion."
  ],
  "manualNotes": "Tests are meaningful for core source-plan, stage-routing, and gate behavior, but should add integration seam tests for activation/job config, policy domains, credential propagation, and sourceSlug preservation."
}
```