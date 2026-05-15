# Implementation Plan

## Goal
Implement Approved Source Extraction v1 end-to-end with Crawl4AI distributor adapters, legal/source-policy enforcement, deterministic benchmark datasets, and valid enrichment callback results.

## Tasks
1. **Reconcile and fix the enrichment result contract first**
   - File: `apps/scraper/scrapers/ai_search/enrichment_models.py`
   - Changes: Add Python model fields matching `apps/web/lib/enrichment/contracts.ts`: `source.source_type`, `source.source_slug`, `source.approved_source_id`, `source.evidence`, top-level `decision`, `llm_used`, and `source_results`. Generate `extracted_at` with UTC offset (`datetime.now(timezone.utc).isoformat()`). Fix `build_v1_from_extraction_result()` to accept/use `result` consistently and keep `mode` as a string literal, not an enum object.
   - Acceptance: Existing enrichment result serialization still works; approved-source results validate against web Zod schema.

2. **Fix runner dispatch so approved-source jobs execute and always callback**
   - File: `apps/scraper/runner/__init__.py`
   - Changes: Replace the current `approved_source_extraction` not-implemented branch with source-plan parsing and executor/orchestrator invocation. Fix `build_v1_from_extraction_result(extraction_result=...)` to `result=...`. Stop treating `EnrichmentMode` as an enum; use validated mode strings. Submit a failed `EnrichmentResultV1` callback when `source_plan` is missing, executor fails, or all sources fail.
   - Acceptance: A job with `target_url == "approved_source_extraction"` no longer returns `decision: not_implemented`; failed jobs submit callback payloads instead of leaving attempts stuck.

3. **Add approved-source extraction result builder**
   - File: `apps/scraper/scrapers/approved_sources/result_builder.py`
   - Changes: Create helpers to build success, partial, auth-required/auth-expired, policy-blocked, no-match, and generic failed `EnrichmentResultV1` objects. Include `decision`, `llm_used`, `source_results`, source provenance, SKU match validation, warnings, field confidences, and allowed-field filtering.
   - Acceptance: Unit tests can build valid success/partial/failed results without invoking Crawl4AI or network.

4. **Add adapter result/types needed by the executor**
   - File: `apps/scraper/scrapers/approved_sources/types.py`
   - Changes: Add dataclasses or Pydantic models for `ApprovedSourceExtractionResult`, `ApprovedSourceFieldResult`, source attempt metadata, and failure codes (`AUTH_REQUIRED`, `AUTH_EXPIRED`, `POLICY_BLOCKED`, `NO_MATCH`, `EXTRACTION_FAILED`). Keep existing plan parsing backward-compatible.
   - Acceptance: Existing `parse_source_plan()` tests continue to pass; executor/adapters share typed result objects.

5. **Create a common Crawl4AI distributor adapter base**
   - File: `apps/scraper/scrapers/approved_sources/adapters/base.py`
   - Changes: Implement `ApprovedSourceAdapter` plus `BaseDistributorCrawl4AIAdapter` with common methods: alias-safe slug metadata, credential check, search URL construction, policy validation before crawl, Crawl4AI/ProductPageExtractor invocation, deterministic HTML/metadata extraction from fixture or crawl result, image URL normalization/filtering, allowed-field filtering, confidence calculation, and no-result detection.
   - File: `apps/scraper/requirements.txt`
   - File: `apps/scraper/requirements-runtime.txt`
   - Changes: If deterministic selector parsing needs it, add `beautifulsoup4` and `lxml`; otherwise document that parsing uses existing dependencies only.
   - Acceptance: A mock adapter can extract title/brand/SKU/images from fixture HTML and reject disallowed image URLs.

6. **Create adapter registry with required aliases**
   - File: `apps/scraper/scrapers/approved_sources/adapters/registry.py`
   - Changes: Register adapter slugs `bradley_crawl4ai`, `central_pet_crawl4ai`, `orgill_crawl4ai`, `phillips_crawl4ai`, `pet_food_experts_crawl4ai`, and `crawl4ai_direct`. Register aliases `bradley`, `central-pet`, `central_pet`, `orgill`, `phillips`, `petfoodex`, `pet_food_experts`, `pet-food-experts`. Add `normalize_adapter_slug()` / `get_adapter_class()` helpers.
   - Acceptance: All required slugs and aliases resolve in unit tests.

7. **Create approved-source executor/orchestrator**
   - File: `apps/scraper/scrapers/approved_sources/executor.py`
   - File: `apps/scraper/scrapers/approved_sources/orchestrator.py`
   - Changes: Implement `ApprovedSourceExecutor.execute(plan, extractor, api_client=None)` and keep `ApprovedSourceOrchestrator` as a compatibility wrapper if imported elsewhere. Sort entries with `runFirst=True` first, then priority. Apply global and entry-level policy before dispatch. Run distributor adapters by registry. Merge partial results only from approved sources. Invoke LLM fallback only when `plan.llmPolicy.enabled` is true, deterministic extraction is insufficient, and the evidence URL is approved. Return failed result if no source succeeds.
   - Acceptance: Executor honors selected distributor ordering, blocks disallowed domains, returns valid failed/partial/success `EnrichmentResultV1`, and never returns `None` to the runner.

8. **Implement Bradley adapter**
   - File: `apps/scraper/scrapers/approved_sources/adapters/bradley.py`
   - Changes: Use legacy config reference `legacy-scraper-archive/configs/bradley.yaml`: base URL `https://www.bradleycaldwell.com`, search URL `/search?term={sku}`, selectors for Name, Brand, Weight, Image URLs, BCI Item Number, UPC, Case Pack, Dimensions, Ingredients, Description, no-results patterns, and image quality replacements. Requires no auth.
   - Acceptance: Fixture tests extract expected legacy assertion for SKU `001135` (`E-Z HANG SCALE`, `KERBL`), handle fake SKU no-match, and filter images to approved domains.

9. **Implement Central Pet adapter**
   - File: `apps/scraper/scrapers/approved_sources/adapters/central_pet.py`
   - Changes: Use legacy config `central-pet.yaml`: base URL `https://www.centralpet.com`, search URL `/Search?criteria={sku}`, selectors for product description/name, brand, product number, UPC, image, description, features, dimensions, no-results patterns, and image quality replacements. Treat credentials as optional only if the plan/source says auth is not required; if `requiresAuth` is true and credentials are unavailable, return `AUTH_REQUIRED`.
   - Acceptance: Fixture tests extract expected assertions for SKUs `38777520` and `43580233`, support `central-pet`/`central_pet` aliases, and cleanly fail auth-required cases.

10. **Implement Orgill adapter with clean auth-blocked behavior**
   - File: `apps/scraper/scrapers/approved_sources/adapters/orgill.py`
   - Changes: Use legacy config `orgill.yaml`: base URL `https://www.orgill.com`, search URL `/SearchResultN.aspx?ddlhQ={sku}`, selectors for Name, Brand, model number, UPC, image, description, features, category. Resolve credentials via `api_client.get_credentials("orgill")` or entry `credentialRef`. If credentials/session profile is absent, return `AUTH_REQUIRED`; if credentials exist but login/session execution is not implemented, return `AUTH_EXPIRED`/actionable warning rather than fake extraction.
   - Acceptance: Tests prove no network crawl occurs without auth and returned result has failed/partial status with `AUTH_REQUIRED` or `AUTH_EXPIRED` warning.

11. **Implement Phillips adapter with clean auth-blocked behavior**
   - File: `apps/scraper/scrapers/approved_sources/adapters/phillips.py`
   - Changes: Replace stub with Crawl4AI adapter using `phillips.yaml`: base URL `https://shop.phillipspet.com`, Salesforce Commerce quick search URL, selectors for Name, Brand, UPC, ItemNumber, Image URLs, Description, Weight, Features, no-results patterns, and image replacement rules. Check `api_client.get_credentials("phillips")`; fail with `AUTH_REQUIRED`/`AUTH_EXPIRED` when session support is unavailable.
   - Acceptance: Fixture tests extract legacy assertion for SKU `072705115310`; auth-blocked test returns actionable failure; no fake success.

12. **Implement Pet Food Experts adapter with clean auth-blocked behavior**
   - File: `apps/scraper/scrapers/approved_sources/adapters/pet_food_experts.py`
   - Changes: Use `petfoodex.yaml`: base URL `https://www.petfoodexperts.com` / order URL `https://orders.petfoodexperts.com/Search?query={sku}`, selectors for Name, Attributes, Product Meta, UoM, Image URLs, Description, Weight, Features, Ingredients, transform regexes for Brand/ItemNumber/UPC. Check `api_client.get_credentials("petfoodex")`; fail cleanly without usable auth session.
   - Acceptance: Fixture tests cover at least one positive HTML extraction and one auth-required result; aliases `petfoodex`, `pet_food_experts`, and `pet-food-experts` resolve.

13. **Update approved-source package exports**
   - File: `apps/scraper/scrapers/approved_sources/__init__.py`
   - File: `apps/scraper/scrapers/approved_sources/adapters/__init__.py`
   - Changes: Export executor, result builder, registry, base classes, and distributor adapters for test/import stability.
   - Acceptance: `python -c "from scrapers.approved_sources.executor import ApprovedSourceExecutor"` works from `apps/scraper`.

14. **Add fixed approved distributor catalog for v1 source-plan fallback**
   - File: `apps/web/lib/approved-sources/distributor-catalog.ts`
   - Changes: Add static catalog entries for Bradley, Central Pet, Orgill, Phillips, and Pet Food Experts with source slug, adapter slug, display name, domains, asset domains, auth requirement, credential ref, search mode `sku_search`, allowed fields, and default priority.
   - File: `apps/web/lib/approved-sources/source-plan.ts`
   - Changes: Normalize selected distributor aliases. If `selectedDistributorSlug` is set and no enabled `brand_sources` distributor entry matches, synthesize the matching fixed catalog distributor entry into the plan and source policy. Preserve existing brand-source behavior and still reject unbranded products.
   - Acceptance: Web tests show `selectedDistributorSlug: "petfoodex"` creates a run-first Pet Food Experts entry even when DB has only official sources.

15. **Build approved-source benchmark datasets**
   - File: `apps/scraper/benchmarks/approved_sources/README.md`
   - File: `apps/scraper/benchmarks/approved_sources/fixtures/approved_source_dataset.json`
   - File: `apps/scraper/benchmarks/approved_sources/fixtures/distributor_extraction_fixtures.json`
   - File: `apps/scraper/benchmarks/approved_sources/fixtures/serp_discovery_dataset.json`
   - File: `apps/scraper/benchmarks/approved_sources/fixtures/serp_search_fixtures.json`
   - File: `apps/scraper/benchmarks/approved_sources/fixtures/official_extraction_dataset.json`
   - File: `apps/scraper/benchmarks/approved_sources/fixtures/negative_source_dataset.json`
   - Changes: Create the split datasets requested in the prompt. Seed distributor entries from the five legacy YAML `test_skus`, `fake_skus`, and `test_assertions`; document distributor count gaps where legacy has fewer than 5 positive assertions. Include auth-required and no-match cases. Copy only official rows from `official_brand/fixtures/extraction_seed.json` into official extraction positives. Move `thepetbeastro.com` and `bigdweb.com` retailer rows into the negative dataset. Add 50 SERP discovery cases with deterministic search fixtures including hard cases, retailer top-result rejection, official/preferred domains, garden/farm, pet food/treat, and accessory cases.
   - Acceptance: Dataset validator passes; no positive extraction entry has `source_type: retailer` or a disallowed domain.

16. **Add deterministic HTML/JSON fixture files for adapter tests**
   - File: `apps/scraper/benchmarks/approved_sources/fixtures/html/bradley/*.html`
   - File: `apps/scraper/benchmarks/approved_sources/fixtures/html/central_pet/*.html`
   - File: `apps/scraper/benchmarks/approved_sources/fixtures/html/orgill/*.html`
   - File: `apps/scraper/benchmarks/approved_sources/fixtures/html/phillips/*.html`
   - File: `apps/scraper/benchmarks/approved_sources/fixtures/html/pet_food_experts/*.html`
   - Changes: Add minimal, source-shaped fixture HTML that contains the legacy selectors/fields, plus auth/login/no-results fixtures. These are deterministic CI fixtures, not live scraped truth.
   - Acceptance: Adapter tests use these fixtures and do not require network or credentials.

17. **Add scraper tests for policy, registry, models, adapters, executor, runner, and datasets**
   - File: `apps/scraper/tests/unit/test_approved_sources_policy.py`
   - File: `apps/scraper/tests/unit/test_approved_sources_registry.py`
   - File: `apps/scraper/tests/unit/test_approved_sources_result_builder.py`
   - File: `apps/scraper/tests/unit/test_approved_sources_adapters.py`
   - File: `apps/scraper/tests/unit/test_approved_sources_executor.py`
   - File: `apps/scraper/tests/unit/test_approved_sources_dataset.py`
   - File: `apps/scraper/tests/unit/test_runner_approved_source_extraction.py`
   - Changes: Cover disallowed domain/image blocking, alias resolution, result shape, adapter fixture extraction, auth-required failures, selected-distributor ordering, LLM policy disabled, runner callback submission, and dataset legality/schema rules.
   - Acceptance: Targeted pytest command passes without live network.

18. **Add web tests for source-plan fallback, aliases, SERP rejection, and callback contract**
   - File: `apps/web/__tests__/lib/approved-sources/source-plan.test.ts`
   - File: `apps/web/__tests__/lib/official-brand-scoring.test.ts`
   - File: `apps/web/__tests__/lib/official-brand-discovery.test.ts`
   - File: `apps/web/__tests__/app/api/scraper/v1/enrichment-callback/route.test.ts`
   - Changes: Add/update tests for unbranded product rejection, selected distributor run-first behavior, fixed catalog synthesis, disallowed domain filtering, retailer top-result rejection, no selected URL means no extraction, and callback acceptance/persistence of approved-source provenance.
   - Acceptance: Focused Jest tests pass.

19. **Add benchmark/validation CLI support or documented commands**
   - File: `apps/scraper/benchmarks/approved_sources/README.md`
   - Optional File: `apps/scraper/benchmarks/approved_sources/dataset.py`
   - Optional File: `apps/scraper/benchmarks/approved_sources/runner.py`
   - Optional File: `apps/scraper/cli/main.py`
   - Changes: At minimum document pytest-based dataset validation and adapter benchmark commands. If CLI structure is straightforward, add `benchmark approved-sources` subcommands for dataset validation, distributor fixture extraction, official extraction fixture validation, and negative-source rejection.
   - Acceptance: README contains exact commands and expected output paths; any added CLI command is covered by tests.

20. **Run focused validation and record limitations**
   - Files: No code file unless docs need final updates.
   - Changes: Run targeted checks listed below. Update README/source notes with honest gaps: auth session/profile setup not fully implemented, live official extraction target of 30 may require manual source review, and fixture tests are deterministic rather than proof of live portal access.
   - Acceptance: Validation results are available for the final handoff, including exact command failures if dependencies/env are missing.

## Files to Modify
- `apps/scraper/runner/__init__.py` - route approved-source extraction to executor, fix callback/result builder bugs.
- `apps/scraper/scrapers/ai_search/enrichment_models.py` - align Python result contract with TypeScript v1 contract.
- `apps/scraper/scrapers/approved_sources/types.py` - add adapter/extraction result types and failure codes.
- `apps/scraper/scrapers/approved_sources/policy.py` - keep existing gate; add tests and small helpers only if needed for entry-level policy composition.
- `apps/scraper/scrapers/approved_sources/__init__.py` - export new modules.
- `apps/scraper/scrapers/approved_sources/adapters/__init__.py` - export new adapters/registry.
- `apps/scraper/scrapers/approved_sources/adapters/phillips.py` - replace stub with real adapter/auth failure path.
- `apps/scraper/requirements.txt` - add parser dependency only if needed.
- `apps/scraper/requirements-runtime.txt` - mirror runtime parser dependency only if needed.
- `apps/web/lib/approved-sources/source-plan.ts` - alias normalization and fixed catalog selected-distributor fallback.
- `apps/web/__tests__/lib/official-brand-scoring.test.ts` - add legal rejection coverage.
- `apps/web/__tests__/lib/official-brand-discovery.test.ts` - add fixture-based official discovery coverage.
- `apps/scraper/benchmarks/official_brand/fixtures/extraction_seed.json` - either remove retailer positives or mark source notes that positives moved; do not keep retailer rows as positive truth.

## New Files
- `apps/scraper/scrapers/approved_sources/result_builder.py` - build valid approved-source `EnrichmentResultV1` objects.
- `apps/scraper/scrapers/approved_sources/executor.py` - execute source plans and enforce policy/LLM rules.
- `apps/scraper/scrapers/approved_sources/orchestrator.py` - compatibility wrapper around executor if absent in current checkout.
- `apps/scraper/scrapers/approved_sources/adapters/base.py` - common adapter interface and Crawl4AI distributor base.
- `apps/scraper/scrapers/approved_sources/adapters/registry.py` - adapter registration and alias resolution.
- `apps/scraper/scrapers/approved_sources/adapters/bradley.py` - Bradley adapter.
- `apps/scraper/scrapers/approved_sources/adapters/central_pet.py` - Central Pet adapter.
- `apps/scraper/scrapers/approved_sources/adapters/orgill.py` - Orgill adapter.
- `apps/scraper/scrapers/approved_sources/adapters/pet_food_experts.py` - Pet Food Experts adapter.
- `apps/web/lib/approved-sources/distributor-catalog.ts` - fixed approved distributor catalog for selected-distributor v1 fallback.
- `apps/scraper/benchmarks/approved_sources/README.md` - dataset schemas and benchmark commands.
- `apps/scraper/benchmarks/approved_sources/fixtures/*.json` - six requested dataset/fixture JSON files.
- `apps/scraper/benchmarks/approved_sources/fixtures/html/**` - deterministic adapter HTML fixtures.
- `apps/scraper/tests/unit/test_approved_sources_*.py` - scraper unit tests.
- `apps/web/__tests__/lib/approved-sources/source-plan.test.ts` - web source-plan tests.
- `apps/web/__tests__/app/api/scraper/v1/enrichment-callback/route.test.ts` - callback contract/provenance tests.

## Dependencies
- Tasks 1-4 must precede executor/adapters because the adapter and runner output shape depends on the contract and shared types.
- Task 6 depends on adapter class names from Tasks 8-12 but can be scaffolded first with lazy imports.
- Task 7 depends on Tasks 1-6.
- Tasks 8-12 depend on Tasks 3-7.
- Task 14 depends on the chosen fixed distributor catalog and alias mapping from Task 6.
- Tasks 15-16 depend on legacy YAML fields/test SKUs and should be completed before tests in Tasks 17-18.
- Tasks 17-18 depend on implementation and datasets.
- Task 19 depends on dataset files and, optionally, existing CLI benchmark structure.
- Task 20 depends on all implementation and test tasks.

## Validation Commands
Run from repo root unless noted:

```bash
cd apps/scraper && python -m pytest \
  tests/unit/test_approved_sources_policy.py \
  tests/unit/test_approved_sources_registry.py \
  tests/unit/test_approved_sources_result_builder.py \
  tests/unit/test_approved_sources_adapters.py \
  tests/unit/test_approved_sources_executor.py \
  tests/unit/test_approved_sources_dataset.py \
  tests/unit/test_runner_approved_source_extraction.py
```

```bash
cd apps/scraper && python -m pytest tests/unit/test_official_brand_extraction_seed.py tests/unit/test_official_brand_benchmark_dataset.py
```

```bash
bun run web test -- --testPathPatterns="approved-sources|official-brand|enrichment-callback|enrichment/jobs"
```

```bash
bun run web lint
```

```bash
cd apps/scraper && pytest -m "not benchmark and not live and not performance" --ignore=tests/benchmarks
```

If CLI benchmark support is added:

```bash
cd apps/scraper && python3 -m cli.main benchmark approved-sources --dataset benchmarks/approved_sources/fixtures/approved_source_dataset.json --fixtures benchmarks/approved_sources/fixtures/distributor_extraction_fixtures.json
```

## Risks
- Current checkout appears to still have a runner `not_implemented` approved-source branch and no `orchestrator.py`/adapter base files, while prior scout context reported those files. Implementers should trust the actual checkout and create/replace files as needed.
- Auth/session support for Orgill, Phillips, and Pet Food Experts may not be production-ready; v1 must return `AUTH_REQUIRED`/`AUTH_EXPIRED` instead of pretending live extraction works.
- Legacy selectors mix Playwright CSS pseudo-selectors and XPath; deterministic parser support may require translation or adding `beautifulsoup4`/`lxml`.
- The fixed distributor catalog is a v1 fallback for selected distributor execution; long-term production should move distributor source configuration into `brand_sources` admin data.
- The existing official extraction seed has only seven official positives after quarantining retailer rows; reaching 30 reviewed official extraction entries requires manual/live source review and should not be fabricated.
- SERP discovery logic lives mostly in `apps/web/lib/official-brand-*`; do not duplicate a new Python discovery implementation just for benchmarks unless explicitly required.
- Callback validity is the highest integration risk: every executor outcome must serialize to a web-accepted `EnrichmentResultV1` and include provenance.

## Known Limitations
- Live login automation/session profiles for auth-gated distributors are out of scope for the first safe v1 unless existing credentials and profile support are proven during implementation.
- Fixture extraction proves selectors and policy gates, not live portal availability.
- Price/availability/case pack should be extracted only when visible and allowed; missing fields should produce partial results and warnings, not hallucinated values.
- The official extraction dataset should document any gap below the requested 30 reviewed positives.
