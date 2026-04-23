# AI Search Official-First Resolver Design

**Goal:** Rework the AI Search scraper so official manufacturer domains win whenever the exact product variant can be resolved from an official family page, while preserving retailer fallback only when the official site cannot prove the exact match.

## Problem Summary

The current AI Search pipeline still fails on brand-owned family pages that represent multiple purchasable variants behind one product shell. The Scotts mulch example shows the main failure modes:

- A smaller secondary retailer can outrank the official Scotts domain because the official result initially looks like a family page instead of a direct PDP.
- The system already contains Demandware-specific variant extraction logic in `apps/scraper/scrapers/ai_search/extraction.py`, but that logic runs during extraction after source selection, which is too late to influence ranking.
- `apps/scraper/scrapers/ai_search/source_selector.py` lets the LLM choose only from the top five raw search results, so it never reasons over resolved child variants generated from an official family page.
- The production batch path in `apps/scraper/scrapers/ai_search/batch_search.py` and the single-product path in `apps/scraper/scrapers/ai_search/scraper.py` still have overlapping but different selection, fallback, and validation behavior.

The result is structural, not cosmetic: ranking operates on the wrong unit. The pipeline ranks raw URLs, but the correct unit is the resolved product candidate that may be derived from a family page.

## Design Principles

- Official-first means official manufacturer domains should outrank distributors and retailers when the exact variant can be proven from the official site.
- Candidate resolution must happen before final ranking, not after extraction.
- Batch and single-product scraping must use the same candidate selection flow.
- Cohort behavior must reinforce official-domain convergence, not retailer frequency.
- Benchmarking must measure official-family resolution and variant correctness, not only raw top-1 URL equality.

## Desired End State

Every SKU should flow through the same pipeline:

`search results -> candidate resolution -> candidate ranking -> extraction -> validation -> cohort feedback`

In this model, search results are only discovery inputs. Official family pages can emit exact resolved child candidates, and the ranking stage compares those resolved candidates directly against retailer PDPs.

For the Scotts case, the family page on `scottsmiraclegro.com` should be expanded into color and size candidates before the pipeline decides whether a secondary retailer or Lowe's result is acceptable.

## Architecture

### 1. Discovery Layer

Discovery stays close to the current two-step search flow in `apps/scraper/scrapers/ai_search/batch_search.py`:

- SKU-first search remains the first pass.
- Consolidated-name search remains the second pass.
- URL normalization, deduplication, and blocked-domain filtering still happen early.

The main change is that discovery no longer decides the winner. It produces a pool of raw inputs for resolution.

### 2. Candidate Resolution Layer

Add a dedicated resolver module at `apps/scraper/scrapers/ai_search/candidate_resolver.py`.

This module converts a raw search result into one or more resolved candidates. A resolved candidate may be:

- the original URL when it already looks like a direct PDP,
- a child variant URL derived from an official family page,
- an unresolved family-page fallback when the official page is relevant but variant resolution is incomplete.

The resolver should only spend extra work on promising candidates:

- official domains,
- preferred cohort domains,
- major retailers when no official candidate resolves,
- direct PDP-looking results with strong identifier evidence.

The resolver must initially support the existing Demandware/Scotts pattern already exercised in `apps/scraper/tests/unit/test_extraction_utils.py`:

- detect family pages and variation endpoints,
- extract color and size combinations,
- compute variant-text evidence,
- emit child URLs and variant metadata,
- keep the unresolved family page as a lower-ranked fallback.

The existing logic in `ExtractionUtils.extract_demandware_variant_candidates(...)` should be moved or wrapped so source selection can use it before extraction.

### 3. Candidate Ranking Layer

Final ranking should operate on resolved candidates, not raw search results.

Add a ranking helper at `apps/scraper/scrapers/ai_search/candidate_ranker.py` or extend the existing scorer through a dedicated adapter. The ranking inputs should include:

- resolved URL,
- original source result URL,
- source tier,
- resolver type,
- variant text,
- exact identifier evidence,
- brand match evidence,
- conflicting variant evidence,
- cohort official-domain preference.

Ranking priority must be:

1. Exact resolved official variant
2. Exact official PDP
3. Official family-page retry on the cohort's dominant official domain
4. Exact major retailer PDP
5. Exact secondary retailer PDP
6. Marketplace result only when SKU or UPC evidence is explicit

Specific ranking rules:

- A resolved official child candidate must outrank any secondary retailer if both refer to the same exact variant.
- An unresolved official family page must rank below its resolved child candidates.
- A small retailer cannot outrank a resolved official candidate because it looks like a cleaner PDP.
- Conflicting variant tokens must be a heavy penalty regardless of source tier.
- Retailer frequency should never become a self-reinforcing shortcut that beats official-domain evidence.

### 4. Unified Selection Flow

The selection pipeline must be shared by both:

- `apps/scraper/scrapers/ai_search/batch_search.py`
- `apps/scraper/scrapers/ai_search/scraper.py`

Create one shared orchestration helper, likely under `apps/scraper/scrapers/ai_search/selection_pipeline.py`, that performs:

- pre-resolution filtering,
- candidate resolution,
- candidate ranking,
- extraction attempts,
- validation,
- retry decisions,
- telemetry.

The batch and single-product entrypoints should become thin wrappers around that shared selection pipeline.

This removes the current pattern where one path receives feature work while production uses another path with weaker behavior.

### 5. LLM Source Selection Role

`apps/scraper/scrapers/ai_search/source_selector.py` should no longer be the primary chooser over raw search results.

The LLM, when enabled, should become an optional tiebreaker over the top resolved candidates after heuristic ranking. It should never be the gate that prevents official-family children from competing.

This means:

- remove the assumption that the top five raw results are the final candidate universe,
- if LLM selection remains enabled, pass resolved candidates instead of raw search results,
- include resolver metadata and source tier in the LLM prompt,
- keep a deterministic heuristic-only path for fixtures, benchmarks, and low-cost runs.

## Candidate Model

Add a dedicated resolved-candidate type in `apps/scraper/scrapers/ai_search/models.py` or a new colocated models module.

Each candidate should capture at least:

- `raw_result_url`
- `resolved_url`
- `canonical_url`
- `family_url`
- `source_tier`
- `resolver`
- `brand`
- `product_name`
- `variant_text`
- `variant_tokens`
- `exact_identifier_match`
- `brand_match`
- `name_match`
- `conflicting_variant_match`
- `preferred_domain_match`
- `resolution_score`
- `resolution_evidence`

This model gives ranking, validation, telemetry, and benchmarks a shared vocabulary.

## Runtime Data Flow

For each SKU:

### Step 1: Discovery

- Run SKU-first discovery.
- Run consolidated-name discovery.
- Merge and canonicalize search results.

### Step 2: Pre-Resolution Filtering

- Drop blocked domains.
- Drop obvious category, listing, and search pages.
- Classify source tier for each result.

### Step 3: Candidate Resolution

- Resolve official-domain results first.
- Expand official family pages into child candidates when structured variant state exists.
- Keep unresolved family pages as fallback candidates with a penalty.
- Only evaluate retailer candidates as direct PDPs unless future resolvers are added for them.

### Step 4: Candidate Ranking

- Score resolved candidates using the shared candidate ranker.
- Apply official-domain, identifier, and variant-match bonuses.
- Apply strong penalties for conflicting variants, listing behavior, and weak source evidence.

### Step 5: Extraction and Validation

- Attempt extraction from the highest-ranked candidate.
- Reuse the current extraction validator in `apps/scraper/scrapers/ai_search/validation.py`.
- Preserve the existing relaxation for resolved official family pages only when the resolver explicitly proves the selected variant.

### Step 6: Cohort Feedback and Retry

- Record successful official-domain resolutions in `_BatchCohortState`.
- If sibling SKUs converge on an official domain, unresolved siblings must receive an official-domain targeted retry before retailer fallback.
- Only after official-domain retry fails may the pipeline advance to major retailers and then secondary retailers.

### Step 7: Telemetry

Emit structured telemetry for:

- raw result URL chosen for resolution,
- resolved child URL chosen for extraction,
- resolver type,
- candidate rank scores and rejection reasons,
- official-family resolution success rate,
- cohort convergence events,
- fallback tier used for the final accepted source.

## Cohort Strategy

`apps/scraper/scrapers/ai_search/cohort_state.py` already tracks preferred and official domains. Extend its usage, not its sprawl.

The cohort rules should be:

- Successful official-domain resolutions increase official-domain confidence for sibling SKUs.
- Secondary retailer success may help later fallback ordering, but it must not outrank an official-domain retry.
- If two or more siblings resolve successfully to the same official domain, unresolved siblings should receive targeted site search and candidate resolution on that official domain before weaker domains are considered.
- Cohort state should remember successful resolver types so the system can distinguish a direct official PDP from a resolved official family page.

This directly addresses the missing feedback loop identified in `docs/audits/2026-04-10-ai-search-cohort-logic.md`.

## Validation Rules

`apps/scraper/scrapers/ai_search/validation.py` already contains the correct starting point and should remain the final acceptance gate.

Validation changes should be minimal and explicit:

- Accept relaxed name matching for official family pages only when `resolved_variant.resolver` is present and the variant evidence overlaps the expected product tokens.
- Reject official candidates that resolve to the wrong sibling variant even if the domain is brand-owned.
- Preserve stronger skepticism for unknown and marketplace domains.
- Preserve image-quality filtering and exact-identifier checks.

The key change is not looser validation. The key change is better upstream candidate resolution so validation sees the right candidate earlier.

## Benchmarking Strategy

The benchmark system already exists in:

- `apps/scraper/scripts/benchmark_ai_search.py`
- `apps/scraper/scripts/ab_test_prompts.py`
- `docs/ai_search_benchmarking.md`

It must be extended to measure the architecture we are actually introducing.

### Dataset Additions

Add fixture-backed entries covering:

- Scotts family-page variants that share one official page but resolve to different child URLs,
- brands where the official site exists but only exposes a family page,
- brands where the official site truly lacks an exact variant and a trusted retailer should win,
- sibling SKU cohorts that should converge on one official domain.

Existing dataset entries can stay unchanged. New optional fields should be allowed for richer evaluation, such as:

- `expected_source_tier`
- `expected_family_url`
- `expected_variant_label`
- `cohort_key`

### New Benchmark Metrics

Extend benchmark reporting with:

- `official_source_selection_rate`
- `resolved_variant_selection_rate`
- `cohort_consistency_rate`
- `false_official_rate`

Definitions:

- `official_source_selection_rate`: percent of examples where an official domain was correctly selected when the dataset expects an official source.
- `resolved_variant_selection_rate`: percent of family-page examples where the pipeline selected the exact resolved child variant.
- `cohort_consistency_rate`: percent of products in a cohort whose accepted source domain matches the dominant correct cohort domain.
- `false_official_rate`: percent of examples where an official domain was selected but the wrong variant or wrong product was accepted.

### A/B Benchmarking

Use the existing A/B runner to compare:

- current architecture,
- unified official-first resolver.

The rollout gate should be:

- statistically significant improvement on the family-page cohort, and
- no statistically significant regression on the overall benchmark accuracy.

For the handcrafted Scotts family-page fixtures, the wrong-variant rate should be zero.

## File Map

The design expects work in these files:

- Create: `apps/scraper/scrapers/ai_search/candidate_resolver.py`
- Create: `apps/scraper/scrapers/ai_search/selection_pipeline.py`
- Create or extend: `apps/scraper/scrapers/ai_search/candidate_ranker.py`
- Modify: `apps/scraper/scrapers/ai_search/extraction.py`
- Modify: `apps/scraper/scrapers/ai_search/source_selector.py`
- Modify: `apps/scraper/scrapers/ai_search/batch_search.py`
- Modify: `apps/scraper/scrapers/ai_search/scraper.py`
- Modify: `apps/scraper/scrapers/ai_search/cohort_state.py`
- Modify: `apps/scraper/scrapers/ai_search/validation.py`
- Modify: `apps/scraper/scrapers/ai_search/models.py`
- Modify: `apps/scraper/scripts/benchmark_ai_search.py`
- Modify: `apps/scraper/scripts/ab_test_prompts.py`
- Add tests under: `apps/scraper/tests/unit/` and `apps/scraper/tests/`

## Non-Goals

- Do not introduce a large per-brand rules engine as the primary solution.
- Do not relax validation broadly just to increase match rate.
- Do not replace the benchmark system; extend the existing one.
- Do not allow retailer frequency or LLM preference to override exact official variant evidence.

## Risks and Mitigations

### Risk: More page-resolution work increases latency

Mitigation:

- Only resolve promising official and preferred-domain candidates.
- Cache lightweight resolution results by canonical URL when possible.
- Keep heuristic-only benchmark mode available.

### Risk: Official family pages resolve to the wrong sibling variant

Mitigation:

- Require explicit variant-token overlap.
- Penalize conflicting variant tokens heavily.
- Keep validation strict for wrong-variant evidence.
- Add zero-tolerance fixture tests for the Scotts cohort.

### Risk: Batch and single paths drift again

Mitigation:

- Centralize selection in one shared pipeline module.
- Keep entrypoints thin and test them against the same fixtures.

## Acceptance Criteria

- The Scotts family-page fixtures select `scottsmiraclegro.com` child variant URLs for the exact requested color and size instead of secondary retailers.
- A resolved official candidate outranks an exact secondary-retailer PDP when both point to the same product variant.
- When the official site cannot resolve the exact variant, the pipeline falls back to major retailers before secondary retailers.
- Batch and single-product flows both use the same selection pipeline.
- Benchmark reports include official-source, variant-resolution, and cohort-consistency metrics.
- The new architecture beats the current baseline on the family-page benchmark cohort without a statistically significant regression on overall benchmark accuracy.

## Recommended Rollout

Implement behind a feature flag first, benchmark both paths, then promote the unified resolver to the default once the acceptance criteria above are met.
