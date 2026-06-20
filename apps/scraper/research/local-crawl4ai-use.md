# Crawl4AI Usage Analysis: SERP Discovery & Extraction

**Date:** 2026-06-20
**Scope:** `apps/scraper/` — SERP discovery, crawl4ai extraction integration, variant resolvers, scoring/matching, prompts, and tests.

---

## 1. Architecture Overview

Two distinct paths exist for product page discovery:

### Path A: Approved Sources (Distributor Adapters)
- **Files:** `scrapers/approved_sources/adapters/` — `amazon.py`, `bradley.py`, `central_pet.py`, `orgill.py`, `phillips.py`, `pet_food_experts.py`
- **Base:** `BaseDistributorCrawl4AIAdapter` in `adapters/base.py`
- **Flow:** Build a search URL from UPC → fetch static HTML via `httpx` (with optional browser fallback) → parse with `BeautifulSoup` (deterministic CSS selectors) → return `EnrichmentResultV1`.
- **Crawl4AI usage:** Minimal. Used only as a JS-rendering fallback (`_fetch_html_with_browser`) when static HTML extraction fails. Crawl4AI is NOT used for discovery or LLM extraction here.

### Path B: SERP Discovery (Dynamic URL Discovery)
- **File:** `scrapers/approved_sources/adapters/serp_discovery.py` (2340 lines)
- **Flow:**
  - **Phase 1:** Serper API search for the raw UPC (the only "SERP" step).
  - **Phase 2:** LLM consolidates register name with Serper evidence.
  - **Phase 3:** Serper API `site:` search on the brand domain → LLM picks best URL.
  - **Phase 3b:** Open-web Serper fallback → LLM picks best URL.
  - **Phase 4:** ProductPageExtractor (Crawl4AI-based) extracts from the selected URL.
- **Delegate to Crawl4AI for SERP crawling?** No. Crawl4AI is never used for search/discovery. All search queries go to Serper API. Crawl4AI is only used for extraction after a URL is chosen.

---

## 2. What is Delegated to Serper vs. Crawl4AI vs. LLM

| Step | Tool | File | Lines |
|------|------|------|-------|
| **UPC discovery** (find product pages by UPC) | **Serper API** | `serp_discovery.py` | 180-209 |
| **Brand site search** (`site:domain name`) | **Serper API** | `serp_discovery.py` | 260-300 |
| **Open-web fallback** | **Serper API** | `serp_discovery.py` | 305-350 |
| **Name consolidation** (abbreviations → full name) | **LLM** (via `create_llm_provider`) | `serp_discovery.py` | 215-255 |
| **URL selection** (pick best from candidates) | **LLM** | `serp_discovery.py` | 390-460 |
| **Candidate scoring** (deterministic pre-filter) | **In-code heuristics** | `serp_discovery.py` | 355-395 |
| **URL validation** (policy, safe-for-canonical) | **In-code rules** | `serp_discovery.py` | 10-50 |
| **Product page extraction** | **Crawl4AI + LLM** | See §3 below |

**Key finding:** Serper controls discovery. Crawl4AI is only an extraction engine. LLM is used for both name consolidation and URL selection in the discovery phase.

---

## 3. Crawl4AI Extraction Pipeline (ProductPageExtractor)

**Entry:** `scrapers/product_url_extraction/extractor.py:ProductPageExtractor.extract()` (lines 170-225)
**Engine:** `src/crawl4ai_engine/engine.py:Crawl4AIEngine`

### Pipeline stages (in order):

1. **Crawl4AI fetch** — browser navigation with Playwright, BM25 content filtering, markdown generation (`_extract_inner`, lines ~1370-2110 in `crawl4ai_extractor.py`).
2. **Family variant resolution** — `_resolve_official_family_variant()` dispatches to platform-specific resolvers (Shopify `.js`, WooCommerce `data-product_variations`, Demandware API). These do in-memory matching against extracted variant data.
3. **JSON-LD extraction** — `extract_product_from_html_jsonld()` (deterministic, from `extraction.py`).
4. **Microdata/RDFa extraction** — `extract_product_from_html_microdata()` (deterministic).
5. **Meta tag extraction** — `extract_product_from_meta_tags()` (from `ai_utils.py`).
6. **Completeness check** — if deterministic extraction is incomplete, proceed to:
   - **Platform schema extraction** — `_try_platform_schema_extraction()` uses `JsonCssExtractionStrategy` for Shopify/WooCommerce/Magento/BigCommerce (detected via fingerprints, no Playwright re-navigation).
   - **LLM extraction** — `LLMExtractionStrategy` runs on the already-fetched `fit_markdown` (no second browser navigation). Uses prompt `v6` with full canonical facet schema.
7. **Fallback extraction** — `_extract_with_fallback()` runs HTTP GET + JSON-LD/meta parsing, then optionally an LLM second pass if still incomplete.
8. **Image enrichment** — via `ProductMediaSelector` (heuristic) or `LLMMediaSelector` (LLM, controlled by `IMAGE_SELECTOR_MODE` env var).

### Crawl4AI features USED:
- BM25 content filtering (`pruning_user_query` with product name, UPC, brand) — line ~1440
- `Magic` mode (auto anti-bot), `simulate_user`, `override_navigator` — engine config
- `fit_markdown` and `raw_markdown` generation
- `LLMExtractionStrategy` with `chunk_token_threshold=12000`, `overlap_rate=0.15` — lines 1780-1820
- `JsonCssExtractionStrategy` for platform schemas — lines 1620-1700
- Result caching (`cache_mode: ENABLED`) — line 1450
- Session management with dynamic session IDs + session cleanup — engine.py

### Crawl4AI features NOT USED (potential improvements):
- **`arun_many()` / batch crawling** — The engine implements `crawl_many()` with `MemoryAdaptiveDispatcher` but it's only used by `test_data_extraction.py` tests. Production extraction uses single-URL `arun()` in a loop with semaphore (max 4 concurrent in `extract_products_from_urls_batch()`).
- **Crawl4AI's built-in search integration** — Crawl4AI has `SearchContext` and `DeepCrawlStrategy` but neither is used. All search is Serper-based.
- **Content safety strategies** — Crawl4AI has strategies for handling malicious content; not configured.
- **Crawl4AI's built-in chunking strategies** — Custom `chunk_token_threshold` used but Crawl4AI's automatic chunking is partially bypassed by the pre-markdown selection logic.

---

## 4. Variant Resolvers

**Files:** `scrapers/ai_search/variant_resolvers/`

| Resolver | File | Detection | How it works |
|----------|------|-----------|-------------|
| **Shopify** | `shopify.py` (160 lines) | HTML fingerprints (`cdn.shopify.com`, `window.Shopify`) | Fetches `<url>.js` → parses JSON variants → matches by UPC or variant token overlap → constructs mock JSON-LD HTML |
| **WooCommerce** | `woocommerce.py` (130 lines) | HTML (`wp-content/plugins/woocommerce`) | Extract `data-product_variations` JSON from HTML → parse → match by UPC → construct mock JSON-LD HTML |
| **Demandware** | `demandware.py` (100 lines) | Only runs if `scoring.is_product_line_page(url)` and official domain | Fetches variant API endpoint → matches UPC → resolves `selectedProductUrl` |

**Orchestration:** `variant_resolvers/__init__.py:resolve_family_variant()` runs all three in sequence (Shopify → WooCommerce → Demandware) and returns on first `"exact_variant"` status.

**Key observation:** All three resolvers are **deterministic parsers that construct mock HTML with synthetic JSON-LD** to feed back into the standard extraction pipeline. They do NOT run Crawl4AI against resolved URLs. They are pure in-memory operations. This is efficient but means they only work for known platforms — custom or headless CMS storefronts get `"ambiguous"` or `"family_page_default"`.

---

## 5. Scoring & Matching

### `scoring.py` — SearchScorer (400 lines)
- **Purpose:** Score search result relevance for candidate ranking.
- **Used by:** `SerpDiscoveryAdapter._score_candidates()` (simplified heuristic), `search.py` (not used directly in current discovery path), and `variant_resolvers/`.
- **Key signals:** UPC match (+5), brand token match (up to +3), product name overlap (up to +4), variant token overlap (up to +3), variant conflict (-12), domain tier (official +6-8, major retailer +2.5, marketplace -3.5), domain success history, category bonus/penalty.
- **Has `has_structured_data()`** — async HTTP HEAD check for JSON-LD presence (not used in actual discovery flow).

### `matching.py` — MatchingUtils (250 lines)
- Token-based brand/product name matching with:
  - Diacritic normalization
  - Dimension token normalization (`24x36` == `36x24`)
  - Variant token extraction (`count`, `weight`, `volume`, `dimension`)
  - Variant conflict detection (same kind, different value)
  - Flavor/species conflict detection
  - Contextual product name matching with brand-domain leniency
- **Critical function:** `is_contextual_product_name_match()` — used as gatekeeper for all extraction completeness checks. When it returns False, the extraction output is treated as incomplete and falls through to LLM.
- **Token-matching flaw:** `tokenize_keywords()` drops tokens < 3 chars and stop words. Short product names like "BG" (Breeder's Gold) or "CP" (Chicken Pâté) lose all identifying signal.

---

## 6. Prompt Analysis

**Location:** `prompts/extraction_v1.txt` through `extraction_v6.txt`, plus `image_selection_v1.txt`

| Version | Fields | Notes |
|---------|--------|-------|
| **v1** | 6 required fields | Original, minimal |
| **v2-v4** | 6 required fields | Iterative improvements to instructions and examples |
| **v5** | 6 required + 5 optional (ingredients, guaranteed_analysis, npk_ratio, unit_value, unit_type) | Added vertical-specific fields |
| **v6 (current)** | 6 required + 5 optional + 10 canonical facets (animal_type, life_stage, breed_size, food_form, flavor, primary_protein, diet_type, package_count, package_weight, dimensions, packaging_type, material, color) | Full pet/garden/hardware schema. **Excludes price, stock, availability per policy.** |

**Image selection prompt:** `image_selection_v1.txt` — LLM prompt to classify crawl images into `primary`/`gallery`/`rejected`. Uses `ProductMediaSelector` for heuristic fallback when `IMAGE_SELECTOR_MODE != "llm"` or no API key.

**Prompt versioning:** `build_extraction_instruction()` in `scrapers/utils/ai_utils.py` (lines 208-230) loads the correct file by version string and formats with UPC/brand/product_name.

---

## 7. Search Provider (`search.py`)

**Location:** `scrapers/ai_search/search.py` (200 lines)

- **Single provider:** Serper (via `SerperSearchClient`). `SUPPORTED_SEARCH_PROVIDERS = {"auto", "serper"}`. Legacy aliases for Brave/SerpAPI map to Serper.
- **Caching:** LRU cache (OrderedDict, max 500 entries) with deduplication.
- **Batch queries:** `search_many_with_cost()` supports concurrent deduplicated batch searches.
- **Cost tracking:** Returns cost (currently $0 for all providers).
- **Crawl4AI search integration:** NOT used. Crawl4AI has no search provider role here.

---

## 8. Dead Ends & Architectural Concerns

### 8a. Crawl4AI for SERP Discovery (Not Used)
Crawl4AI has no role in SERP/discovery. The `SerpDiscoveryAdapter` **never calls Crawl4AI for searching**. All search goes through Serper. Crawl4AI is purely an extraction engine.

**Could Crawl4AI help with discovery?** Potentially, if:
- Crawl4AI's `AsyncWebCrawler` could crawl brand site sitemaps for product pages.
- Crawl4AI's `DeepCrawlStrategy` could crawl a brand domain to find all product URLs for a brand.
- A hybrid approach could use Crawl4AI to visit search result pages directly (rendering JS-heavy search results that Serper misses).

### 8b. No Content Recycling Between Pipeline Stages
The SerpDiscoveryAdapter runs 3-4 Serper queries (UPC search, brand site search, open-web fallback) and 2 LLM calls (name consolidation, URL selection) before even starting extraction. If extraction fails, the cost is already sunk — there's no partial reuse of the discovery data.

### 8c. Platform Schema Duplication
Platform detection logic appears in **two separate code paths** with different schema definitions:
1. `platform_extraction.py` — `detect_platform()`, `build_platform_schema()`, `normalize_platform_payload()` — used by `_try_platform_schema_extraction()` in the Crawl4AI pipeline.
2. `variant_resolvers/` — separate platform detection in `ShopifyVariantResolver._is_shopify()`, `WooCommerceVariantResolver._is_woocommerce()`.

These duplicate detection logic. The variant resolvers don't use `JsonCssExtractionStrategy` — they construct synthetic HTML instead.

### 8d. LLM URL Selection Without Context
The LLM URL selection prompt (`_llm_select_url` in `serp_discovery.py`, lines 410-460) receives only Serper snippet metadata (title/description/URL), not the actual page content. An LLM cannot meaningfully verify that a URL leads to the correct product variant from a 150-character snippet. This is a weak link — improvements could use Crawl4AI to quickly fetch candidate URLs for light verification before committing to full extraction.

### 8e. No Coherent Test Suite for the Discovery Path
- `test_serper_search_client.py` — tests Serper HTTP client.
- `test_ai_search_e2e_live.py` — live E2E test (requires credentials, marked `@pytest.mark.live`).
- `test_ai_search_search_client.py` — tests `SearchClient`.
- `test_ai_search_e2e_dataset.py` / `test_ai_search_e2e_metrics.py` / `test_ai_search_e2e_report.py` — E2E test framework.
- `test_extraction_utils.py`, `test_prompt_loading.py`, `test_platform_extraction.py` — unit tests for sub-modules.
- **No unit tests for `SerpDiscoveryAdapter`** — the core discovery logic is untested in isolation.
- **No unit tests for `variant_resolvers/__init__.py:resolve_family_variant()`** — the coordination layer.
- Fixture-based testing (`test_official_brand_extraction_seed.py`, `test_official_extraction_fixtures.py`) tests extraction, not discovery.

---

## 9. Concrete Improvement Opportunities

### High-Impact

1. **Crawl4AI as a Secondary Search Provider** — Serper is a single point of failure. Crawl4AI could crawl brand site sitemaps or navigation pages to find product URLs when Serper returns nothing. This would reduce open-web fallback reliance.

2. **Lightweight Crawl4AI Candidate Verification** — Before LLM URL selection, do a quick Crawl4AI fetch of candidate URLs (HEAD + first 8KB) to verify page content has the right product name/UPC. This would reject bad URLs before the expensive LLM call.

3. **Pre-fetch Content for Reuse** — If Crawl4AI is already fetching a page for verification (improvement #2), the fetched HTML/markdown could be reused in the extraction phase rather than fetching again.

4. **Batch Discovery for Brands** — When a brand has multiple products to discover, use Crawl4AI to crawl the brand's product navigation once and discover all product URLs in one session, rather than individual Serper queries per UPC.

### Medium-Impact

5. **Platform Schema + Variant Resolver Unification** — Merge `platform_extraction.py`'s platform detection and CSS schemas with the variant resolvers so that platform-specific extraction is also used for variant resolution. Currently both systems exist but operate independently.

6. **Missing Test Coverage** — Add unit tests for:
   - `serp_discovery.SerpDiscoveryAdapter._score_candidates()`
   - `serp_discovery.SerpDiscoveryAdapter._resolve_approved_url()` with mocked Serper/LLM
   - `variant_resolvers/__init__.py:resolve_family_variant()` with mock resolvers
   - Individual variant resolvers with fixture HTML for each platform

7. **Crawl4AI `arun_many()` in Production** — The batch extraction path (`ProductPageExtractor.extract_products_from_urls_batch()`) uses a Python semaphore loop instead of Crawl4AI's `MemoryAdaptiveDispatcher`. Switch to `engine.crawl_many()` for proper memory-managed concurrency.

### Low-Impact

8. **Tune BM25 Threshold** — Currently uses default `bm25_threshold=1.0`. Could be tuned per product category or brand domain for better content retention.

9. **Short Token Handling** — `MatchingUtils.tokenize_keywords()` drops tokens < 3 chars. Brands like "BG" (Breeder's Gold) are invisible to matching. Add a short-token allowlist or special handling for known short brands.

10. **Prompt Experiment Logging** — `prompts/EXPERIMENTS.md` documents only 1 experiment. The current prompt v6 changes (adding 10 canonical facets) are not tracked as an experiment. Formalize prompt iteration tracking.

---

## 10. Summary Verdict

**Are we making full use of Crawl4AI for SERP result crawling and variant selection? No.**

- **SERP crawling:** Crawl4AI is completely absent. 100% of search/discovery goes through Serper API. This is a deliberate architectural choice (Serper is a specialized SERP API), but it means Crawl4AI's rendering capabilities are never used for discovery — even when Serper returns nothing and the system falls back to open-web search.

- **Variant selection:** Crawl4AI is used for extraction only. Variant resolution is deterministic (platform-specific API/markup parsing) without browser rendering. The three platform resolvers (Shopify, WooCommerce, Demandware) build synthetic HTML from variant data rather than crawling resolved URLs. This works for those platforms but not for custom or headless storefronts.

- **Extraction:** Crawl4AI is used well here — full pipeline with BM25 filtering, markdown selection, LLM extraction strategy, platform schema fallback. The v6 prompt with canonical facets is comprehensive.

- **What is delegated to Serper vs. Crawl4AI vs. LLM:** Serper handles all discovery/search. LLM handles name consolidation, URL selection, and fallback extraction. Crawl4AI handles page rendering, markdown generation, deterministic extraction (JSON-LD/meta/microdata), and platform schema extraction. The LLM and Crawl4AI layers overlap (both can do extraction) but Crawl4AI never searches.
