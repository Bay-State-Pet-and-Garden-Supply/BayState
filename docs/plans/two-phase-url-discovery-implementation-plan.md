# Implementation Plan: Two-Phase Official Brand URL Discovery

## Goal
Replace the single-pass URL discovery in `OfficialBrandScraper` with a two-phase pipeline (SKU search → LLM name consolidation → product-name search → tiered ranking), add extraction fallback loops, and update the coordinator schema, types, pipeline builder, and callback persistence so the entire stack is consistent and testable.

---

## Phase 1 — Database Schema (safe, no runtime impact)

### 1.1 Migration
**File:** `apps/web/supabase/migrations/20260501120000_enrich_official_brand_candidates.sql`

Run the migration from the high-level plan exactly:

```sql
ALTER TABLE public.official_brand_url_candidates
  ADD COLUMN IF NOT EXISTS predicted_name text,
  ADD COLUMN IF NOT EXISTS appeared_in_phases integer[],
  ADD COLUMN IF NOT EXISTS selection_tier text,
  ADD COLUMN IF NOT EXISTS composite_score numeric;

COMMENT ON COLUMN public.official_brand_url_candidates.predicted_name IS 'LLM-consolidated full product name from Phase 1.5';
COMMENT ON COLUMN public.official_brand_url_candidates.appeared_in_phases IS 'Which discovery phases produced this candidate (1, 2, or both)';
COMMENT ON COLUMN public.official_brand_url_candidates.selection_tier IS 'Ranking tier: official_domain, preferred_domain, knowledge_graph, llm_scored, organic';
COMMENT ON COLUMN public.official_brand_url_candidates.composite_score IS 'Normalized composite relevance score from Phase 3 ranking';
```

- **Acceptance:** `supabase db diff` or local `supabase start` applies cleanly; table has the four new nullable columns.
- **Rollback:** `ALTER TABLE ... DROP COLUMN` script kept in the same file as comments for emergency revert.

---

## Phase 2 — Scraper Query Builder

### 2.1 Add discovery query helpers
**File:** `apps/scraper/scrapers/ai_search/query_builder.py`

Add two methods inside `QueryBuilder`:

```python
def build_sku_discovery_query(self, sku: Optional[str], brand: Optional[str] = None) -> str:
    sku_clean = self._clean_text(sku)
    if not sku_clean:
        return ""
    if brand and self.is_ambiguous_identifier(sku_clean):
        return f"{self._clean_text(brand)} {sku_clean}"
    return sku_clean

def build_name_discovery_query(
    self,
    predicted_name: Optional[str],
    brand: Optional[str],
    exclusions: list[str],
) -> str:
    name_clean = self._clean_text(predicted_name)
    brand_clean = self._clean_text(brand)
    parts = [p for p in (name_clean, brand_clean) if p]
    query = " ".join(parts)
    if exclusions:
        query += " " + " ".join([f"-site:{excl}" for excl in exclusions])
    return query
```

- Reuse existing `_clean_text` and `is_ambiguous_identifier`.
- **Acceptance:** Unit tests (new file, Phase 9) assert correct query strings for short numeric SKUs, long SKUs, missing brand, and exclusion lists.

---

## Phase 3 — Scraper Core: New Types & Phase Methods

### 3.1 Add dataclasses
**File:** `apps/scraper/scrapers/ai_search/official_brand_scraper.py`

Insert at the top of the file (after imports, before `OfficialBrandScraper`):

```python
from dataclasses import dataclass, field

@dataclass
class RankedUrlCandidate:
    url: str
    domain: str
    rank: int
    score: float
    selection_tier: str       # "official_domain", "preferred_domain", "knowledge_graph", "llm_scored", "organic"
    appeared_in_phases: list[int]
    title: str | None
    snippet: str | None
    confidence: float

@dataclass
class DiscoveryResult:
    sku: str
    predicted_name: str
    ranked_candidates: list[RankedUrlCandidate]
    selected_url: str | None
    selection_method: str
    fallback_urls: list[str]
    phase1_result_count: int
    phase2_result_count: int
```

### 3.2 Add Phase 1 – SKU search
**File:** `apps/scraper/scrapers/ai_search/official_brand_scraper.py`

Add method to `OfficialBrandScraper`:

```python
async def _search_sku_for_names(
    self,
    sku: str,
    brand: str | None,
    register_name: str | None,
) -> list[dict[str, Any]]:
    query = self._query_builder.build_sku_discovery_query(sku, brand)
    results, error = await self._search_client.search(query)
    if error:
        logger.error("[Phase 1] SKU search error for %s: %s", sku, error)
        return []
    return results or []
```

### 3.3 Add Phase 1.5 – LLM name consolidation
**File:** `apps/scraper/scrapers/ai_search/official_brand_scraper.py`

Add method using `create_llm_provider` directly (not via `_llm_runtime` wrapper):

```python
async def _consolidate_product_name(
    self,
    register_name: str | None,
    brand: str | None,
    search_titles: list[str],
) -> str:
    if not register_name and not brand:
        return ""

    from scrapers.providers.factory import create_llm_provider

    provider = create_llm_provider("openai", "gpt-4o-mini", api_key=self._llm_runtime.api_key)
    titles_block = "\n".join(f"- {t}" for t in search_titles[:8] if t)
    prompt = f"""Given the raw product name and search result titles, predict the most accurate full product name.

Raw name: {register_name or "N/A"}
Brand: {brand or "N/A"}
Search titles:
{titles_block}

Return valid JSON ONLY:
{{"predicted_name": "string"}}"""

    try:
        response = await provider.generate_text(
            system_prompt=None,
            user_prompt=prompt,
            temperature=0.0,
            response_schema={
                "type": "object",
                "properties": {"predicted_name": {"type": "string"}},
                "required": ["predicted_name"],
            },
        )
        data = json.loads(response.text)
        return str(data.get("predicted_name") or "").strip()
    except Exception as e:
        logger.warning("[Phase 1.5] Name consolidation failed: %s", e)
        return register_name or ""
```

- **Decision to confirm:** If consolidation fails, fallback is `register_name` (raw import name). This preserves searchability.

### 3.4 Add Phase 2 – Product name search
**File:** `apps/scraper/scrapers/ai_search/official_brand_scraper.py`

```python
async def _search_by_predicted_name(
    self,
    predicted_name: str,
    brand: str | None,
    official_domains: list[str] | None,
    preferred_domains: list[str] | None,
) -> list[dict[str, Any]]:
    exclusions = [
        "amazon.com", "ebay.com", "walmart.com", "target.com",
        "chewy.com", "petco.com", "petsmart.com",
        "homedepot.com", "lowes.com", "tractorsupply.com",
    ]
    query = self._query_builder.build_name_discovery_query(predicted_name, brand, exclusions)

    # Also build site-constrained variants using predicted name + SKU (if available)
    site_queries = self._query_builder.build_site_query_variants(
        official_domains or preferred_domains,
        None,  # SKU omitted to avoid over-constraining; predicted name is primary
        predicted_name,
        brand,
        None,
    )

    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for q in [*site_queries, query]:
        results, error = await self._search_client.search(q)
        if error:
            continue
        for r in results or []:
            url = str(r.get("url") or "").strip()
            if url and url not in seen:
                seen.add(url)
                merged.append(r)
    return merged
```

### 3.5 Add Phase 3 – Tiered ranking
**File:** `apps/scraper/scrapers/ai_search/official_brand_scraper.py`

```python
def _rank_url_candidates(
    self,
    sku: str,
    phase1_results: list[dict[str, Any]],
    phase2_results: list[dict[str, Any]],
    official_domains: list[str] | None,
    preferred_domains: list[str] | None,
    predicted_name: str,
) -> DiscoveryResult:
    from scrapers.ai_search.scoring import SearchScorer, get_domain_success_rate

    scorer = SearchScorer()
    normalized_official = [self._normalize_domain(d) for d in (official_domains or []) if d]
    normalized_preferred = [self._normalize_domain(d) for d in (preferred_domains or []) if d]

    # Merge and tag by phase
    by_url: dict[str, dict[str, Any]] = {}
    for r in phase1_results:
        url = str(r.get("url") or "").strip()
        if not url:
            continue
        by_url.setdefault(url, {**r, "phases": set()})
        by_url[url]["phases"].add(1)
    for r in phase2_results:
        url = str(r.get("url") or "").strip()
        if not url:
            continue
        by_url.setdefault(url, {**r, "phases": set()})
        by_url[url]["phases"].add(2)

    candidates: list[RankedUrlCandidate] = []
    for url, data in by_url.items():
        domain = self._normalize_domain(url) or ""
        phases = sorted(data["phases"])
        appeared = list(phases)

        # Base score from existing scorer (organic relevance)
        base_score = scorer.score_search_result(
            data, sku, None, predicted_name, None, prefer_manufacturer=True, preferred_domains=preferred_domains
        )

        # Tiered boosts
        tier = "organic"
        score = base_score
        in_official = any(domain == d or domain.endswith(f".{d}") for d in normalized_official)
        in_preferred = any(domain == d or domain.endswith(f".{d}") for d in normalized_preferred)

        if in_official and 2 in phases:
            score += 100
            tier = "official_domain"
        elif in_official and 1 in phases:
            score += 80
            tier = "official_domain"
        elif in_preferred and 2 in phases:
            score += 60
            tier = "preferred_domain"
        elif in_preferred and 1 in phases:
            score += 50
            tier = "preferred_domain"
        elif data.get("result_type") == "knowledge_graph":
            score += 40
            tier = "knowledge_graph"

        # Additive bonuses
        if sku and sku.lower() in f"{url} {data.get('title','')} {data.get('description','')}".lower():
            score += 5
        if predicted_name:
            pred_tokens = set(predicted_name.lower().split())
            title_tokens = set(str(data.get("title") or "").lower().split())
            overlap = len(pred_tokens & title_tokens)
            if overlap >= 2:
                score += 3
        if len(phases) > 1:
            score += 10
        success_rate = get_domain_success_rate(domain)
        score += success_rate * 5  # 0..5

        candidates.append(RankedUrlCandidate(
            url=url,
            domain=domain,
            rank=0,  # assigned after sort
            score=round(score, 2),
            selection_tier=tier,
            appeared_in_phases=appeared,
            title=data.get("title"),
            snippet=data.get("description"),
            confidence=min(1.0, max(0.0, score / 200)),  # rough normalization
        ))

    candidates.sort(key=lambda c: c.score, reverse=True)
    for i, c in enumerate(candidates, start=1):
        c.rank = i

    selected = candidates[0] if candidates else None
    fallback = [c.url for c in candidates[1:4]]  # next 3 URLs

    return DiscoveryResult(
        sku=sku,
        predicted_name=predicted_name,
        ranked_candidates=candidates,
        selected_url=selected.url if selected else None,
        selection_method=selected.selection_tier if selected else "none",
        fallback_urls=fallback,
        phase1_result_count=len(phase1_results),
        phase2_result_count=len(phase2_results),
    )
```

- **Risk:** `SearchScorer.score_search_result` expects `sku`, `brand`, `product_name`, `category`. We pass `brand=None` and `category=None` because the tiered bonuses already handle domain/brand logic. Verify this does not crash (it has safe defaults).
- **Decision to confirm:** Should `identify_official_url` (used by legacy combined mode) also use this two-phase pipeline? **Recommendation:** Have `identify_official_url` delegate to `_search_sku_for_names` → `_consolidate_product_name` → `_search_by_predicted_name` → `_rank_url_candidates` and return `DiscoveryResult.selected_url`. This keeps behavior consistent.

---

## Phase 4 — Scraper Core: Refactor Public Methods

### 4.1 Refactor `discover_official_url_candidates`
**File:** `apps/scraper/scrapers/ai_search/official_brand_scraper.py`

Replace the body with the 3-phase pipeline:

```python
async def discover_official_url_candidates(
    self,
    sku: str,
    brand: str,
    product_name: str | None = None,
    official_domains: list[str] | None = None,
    preferred_domains: list[str] | None = None,
    register_name: str | None = None,
) -> dict[str, Any]:
    effective_brand = brand.strip() if brand and brand.lower() != "none" else ""
    if not sku or (not effective_brand and not product_name and not register_name):
        return {"success": False, "sku": sku, "status": "error", "error": "Missing context", "candidates": []}

    # Phase 1
    phase1 = await self._search_sku_for_names(sku, effective_brand or product_name, register_name)
    titles = [str(r.get("title") or "") for r in phase1]

    # Phase 1.5
    raw_name = register_name or product_name or ""
    predicted = await self._consolidate_product_name(raw_name, effective_brand, titles)
    if not predicted:
        predicted = raw_name

    # Phase 2
    phase2 = await self._search_by_predicted_name(
        predicted, effective_brand, official_domains, preferred_domains
    )

    # Phase 3
    discovery = self._rank_url_candidates(
        sku, phase1, phase2, official_domains, preferred_domains, predicted
    )

    # Build backward-compatible candidate list
    candidates = [
        {
            "url": c.url,
            "domain": c.domain,
            "title": c.title,
            "snippet": c.snippet,
            "result_type": "organic",  # legacy key; tier is more specific
            "rank": c.rank,
            "confidence": c.confidence,
            "selection_method": discovery.selection_method if c.url == discovery.selected_url else None,
            "selection_tier": c.selection_tier,
            "appeared_in_phases": c.appeared_in_phases,
            "composite_score": c.score,
        }
        for c in discovery.ranked_candidates[:10]
    ]

    if not discovery.selected_url:
        return {
            "success": False,
            "sku": sku,
            "status": "not_found",
            "error": "Could not identify official brand URL",
            "predicted_name": discovery.predicted_name,
            "candidates": candidates,
            "phase1_result_count": discovery.phase1_result_count,
            "phase2_result_count": discovery.phase2_result_count,
        }

    return {
        "success": True,
        "sku": sku,
        "status": "found",
        "selected_url": discovery.selected_url,
        "confidence": discovery.ranked_candidates[0].confidence if discovery.ranked_candidates else 0.0,
        "selection_method": discovery.selection_method,
        "predicted_name": discovery.predicted_name,
        "fallback_urls": discovery.fallback_urls,
        "candidates": candidates,
        "phase1_result_count": discovery.phase1_result_count,
        "phase2_result_count": discovery.phase2_result_count,
    }
```

- `register_name` is a new optional parameter. Existing callers that only pass `product_name` will still work; `register_name` defaults to `product_name` behavior.

### 4.2 Refactor `extract_products_from_urls_batch` for fallback
**File:** `apps/scraper/scrapers/ai_search/official_brand_scraper.py`

Update `_extract_single` inside `extract_products_from_urls_batch`:

```python
async def _extract_single(product: dict[str, Any]) -> AISearchResult:
    async with semaphore:
        sku = str(product.get("sku") or "").strip()
        brand = str(product.get("brand") or "").strip()
        primary_url = str(product.get("source_url") or product.get("known_url") or product.get("url") or "").strip()
        fallback_urls = [str(u).strip() for u in (product.get("fallback_urls") or []) if str(u).strip()]
        max_fallbacks = int(product.get("max_fallbacks") or 3)

        if not sku:
            return AISearchResult(success=False, sku=sku, error="Missing SKU")

        urls_to_try = [primary_url, *fallback_urls][:max_fallbacks]
        last_error = "Missing source URL"

        for attempt_url in urls_to_try:
            if not attempt_url:
                continue
            res = await self.extract_data(attempt_url)
            if res.get("success"):
                data = res.get("data")
                if isinstance(data, list) and data and isinstance(data[0], dict):
                    data = data[0]
                if isinstance(data, dict):
                    return AISearchResult(
                        success=True,
                        sku=sku,
                        product_name=data.get("name"),
                        brand=data.get("brand") or brand,
                        description=data.get("description"),
                        images=data.get("images"),
                        categories=data.get("categories"),
                        url=attempt_url,
                        source_website=attempt_url,
                        confidence=1.0 if res.get("method") == "json_css" else 0.8,
                        cost_usd=0.05,
                        selection_method=str(product.get("url_source") or "known_url"),
                    )
            last_error = res.get("error") or "Extraction failed"

        return AISearchResult(
            success=False,
            sku=sku,
            error=last_error,
            url=primary_url or (fallback_urls[0] if fallback_urls else None),
            source_website=primary_url or (fallback_urls[0] if fallback_urls else None),
        )
```

- **Decision to confirm:** Fallback loop tries up to `max_fallbacks` URLs total (primary + fallbacks sliced to limit). If all fail, the error message from the last attempt is returned.

---

## Phase 5 — Runner Integration

### 5.1 Update item construction in `_run_official_brand_job`
**File:** `apps/scraper/runner/__init__.py`

In the item-building loop (~line 1090), replace the current `items.append({...})` block with:

```python
items = []
for sku in skus:
    item_context = item_context_by_sku.get(sku, {})
    brand = item_context.get("brand")
    preferred_domains = item_context.get("preferred_domains")
    official_domains = item_context.get("official_domains")
    register_name = item_context.get("register_name") or item_context.get("product_name")

    base_item = {
        "sku": sku,
        "register_name": register_name,
        "brand": brand if brand is not None else (cohort_brand if cohort_brand is not None else search_cfg.get("brand")),
        "official_domains": official_domains
        if official_domains is not None
        else (cohort_official_domains if cohort_official_domains is not None else search_cfg.get("official_domains")),
        "preferred_domains": preferred_domains
        if preferred_domains is not None
        else (cohort_preferred_domains if cohort_preferred_domains is not None else search_cfg.get("preferred_domains")),
    }

    if official_brand_phase == "extraction":
        base_item["source_url"] = item_context.get("source_url") if item_context.get("source_url") is not None else search_cfg.get("source_url")
        base_item["known_url"] = item_context.get("known_url") if item_context.get("known_url") is not None else search_cfg.get("known_url")
        base_item["url_source"] = item_context.get("url_source") if item_context.get("url_source") is not None else search_cfg.get("url_source")
        base_item["candidate_id"] = item_context.get("candidate_id") if item_context.get("candidate_id") is not None else search_cfg.get("candidate_id")
        fallback_urls = item_context.get("fallback_urls")
        if fallback_urls is not None:
            base_item["fallback_urls"] = fallback_urls
        max_fallbacks = item_context.get("max_fallbacks")
        if max_fallbacks is not None:
            base_item["max_fallbacks"] = max_fallbacks

    items.append(base_item)
```

- Discovery items are now minimal: `sku`, `register_name`, `brand`, `official_domains`, `preferred_domains`.
- Extraction items carry the additional URL/fallback fields.
- `product_name` key is removed from official-brand items; the scraper now reads `register_name`.

### 5.2 Update discovery result capture
**File:** `apps/scraper/runner/__init__.py`

In the `url_discovery` result processing branch (~line 1230), extend `result_payload`:

```python
result_payload = {
    "phase": "url_discovery",
    "status": search_result.get("status") or ("found" if selected_url else "not_found"),
    "selected_url": selected_url,
    "url": selected_url,
    "source_website": selected_url,
    "candidates": candidates,
    "confidence": search_result.get("confidence") or 0.0,
    "selection_method": search_result.get("selection_method"),
    "predicted_name": search_result.get("predicted_name"),
    "fallback_urls": search_result.get("fallback_urls"),
    "phase1_result_count": search_result.get("phase1_result_count"),
    "phase2_result_count": search_result.get("phase2_result_count"),
    "error": search_result.get("error"),
    "scraped_at": datetime.now().isoformat(),
}
```

---

## Phase 6 — Coordinator Types

### 6.1 Extend `ScrapeOptions`
**File:** `apps/web/lib/pipeline-scraping-types.ts`

Add inside `ScrapeOptions`:

```ts
/** Maximum fallback URLs to attempt during Official Brand extraction (default: 3) */
officialBrandMaxFallbacks?: number;
```

---

## Phase 7 — Coordinator Pipeline Builder

### 7.1 Extend `ScrapeContextItem` and `loadScrapeContextItems`
**File:** `apps/web/lib/pipeline-scraping.ts`

1. Add `register_name?: string` to `ScrapeContextItem` interface.
2. In `loadScrapeContextItems`, inside the final `return compactScrapeContextItem({...})` block, add:
   ```typescript
   register_name: ingestionName,
   ```
   (`ingestionName` is already computed as `toOptionalString(input?.name)`.)
3. Update `compactScrapeContextItem` to carry through `register_name` if defined.

### 7.2 Simplify `officialBrandConfigItems`
**File:** `apps/web/lib/pipeline-scraping.ts`

Replace the current `officialBrandConfigItems` map with explicit minimal items:

```typescript
const isOfficialBrandExtraction = officialBrandPhase === 'extraction';

const officialBrandConfigItems = isOfficialBrand
    ? scrapeContextItems.map((item) => {
        const sourceUrl = officialBrandUrlsBySku
            ? toOptionalString(officialBrandUrlsBySku[item.sku])
            : undefined;
        const base: Record<string, unknown> = {
            sku: item.sku,
            register_name: item.register_name,
            brand: item.brand,
            official_domains: item.official_domains,
            preferred_domains: item.preferred_domains,
        };
        if (sourceUrl) {
            base.source_url = sourceUrl;
            base.url_source = 'manual';
        }
        if (isOfficialBrandExtraction && options?.officialBrandMaxFallbacks !== undefined) {
            base.max_fallbacks = options.officialBrandMaxFallbacks;
        }
        return base;
    })
    : undefined;
```

- **Acceptance:** `pipeline-scraping.test.ts` assertions for `config.items` must be updated to expect `register_name` instead of `product_name`, `price`, `category`, and to not include those fields for official brand jobs.

---

## Phase 8 — Coordinator Workflow & Callback

### 8.1 Extend candidate row builder
**File:** `apps/web/lib/official-brand-workflow.ts`

1. Extend `CandidateRowInput`:
   ```ts
   predictedName?: string | null;
   appearedInPhases?: number[] | null;
   selectionTier?: string | null;
   compositeScore?: number | null;
   ```

2. Extend `buildCandidateRow` return object:
   ```ts
   predicted_name: input.predictedName ?? null,
   appeared_in_phases: input.appearedInPhases ?? null,
   selection_tier: input.selectionTier ?? null,
   composite_score: input.compositeScore ?? null,
   ```

3. Update `buildDiscoveryOfficialBrandCandidateRows`:
   Inside the `candidateRows` map, read from `candidateRecord`:
   ```ts
   predictedName: toOptionalString(source.predicted_name) ?? null,
   appearedInPhases: Array.isArray(candidateRecord.appeared_in_phases)
       ? candidateRecord.appeared_in_phases
       : null,
   selectionTier: toOptionalString(candidateRecord.selection_tier) ?? null,
   compositeScore: toOptionalNumber(candidateRecord.composite_score) ?? null,
   ```
   Also pass `predictedName` to the `selectedRow` build if the selected URL was not in candidates.

### 8.2 Update callback discovery metadata
**File:** `apps/web/app/api/admin/scraping/callback/route.ts`

In the `official_brand_discovery` metadata block:

```ts
official_brand_discovery: {
    candidate_count: candidateCount,
    predicted_name_count: rows.filter((r) => r.predicted_name).length,
    sku_count: Object.keys(transformedResults).length,
    updated_at: persistenceTimestamp,
},
```

---

## Phase 9 — Tests

### 9.1 New scraper unit tests
**File:** `apps/scraper/tests/unit/test_name_consolidation.py`

- Mock `create_llm_provider` to return a mock provider with `generate_text`.
- Test `_consolidate_product_name` returns LLM-predicted name on success.
- Test fallback to `register_name` when LLM raises or returns invalid JSON.

**File:** `apps/scraper/tests/unit/test_url_ranking.py`

- Build a scraper instance with mocked search client.
- Test `_rank_url_candidates`:
  - Official domain in Phase 2 outranks preferred domain.
  - Cross-confirmation (both phases) adds +10.
  - Deduplication when same URL appears in Phase 1 and 2.
  - `fallback_urls` contains the next 3 URLs after the selected URL.
  - `selection_tier` values are one of the allowed strings.

### 9.2 Update existing scraper unit tests
**File:** `apps/scraper/tests/unit/test_official_brand_scraper.py`

- Update `discover_official_url_candidates` tests to assert new keys (`predicted_name`, `fallback_urls`, `phase1_result_count`, `phase2_result_count`) exist in the return dict.
- Add `test_extraction_fallback_tries_secondary_url`:
  - Mock `extract_data` to fail on primary URL, succeed on fallback URL.
  - Assert final `AISearchResult` has `success=True` and `url` equals the fallback.
- Add `test_extraction_fallback_exhausts_all_urls`:
  - Mock `extract_data` to always fail.
  - Assert final result `success=False` and error reflects last attempt.

### 9.3 Update web unit tests
**File:** `apps/web/__tests__/lib/official-brand-workflow.test.ts`

- In `buildDiscoveryOfficialBrandCandidateRows` tests, include `predicted_name`, `selection_tier`, `appeared_in_phases`, `composite_score` in the mock discovery source.
- Assert that generated rows contain the new columns mapped correctly.

**File:** `apps/web/__tests__/lib/pipeline-scraping.test.ts`

- Update all `config.items` assertions to expect `register_name` (not `product_name`) and the absence of `price`, `category` for official brand jobs.
- Add a test that `officialBrandMaxFallbacks` is forwarded as `max_fallbacks` in extraction job items.
- Ensure `preferCatalogContext: true` still produces `register_name` equal to raw ingestion name, not catalog name.

---

## Phase 10 — Validation

Run these commands in order. Fix any failures before moving to the next.

1. **Scraper lint & type check:**
   ```bash
   cd apps/scraper
   ruff check . --output-format=github
   mypy scraper_backend/ --ignore-missing-imports || true
   ```

2. **Scraper tests (excluding live/benchmark):**
   ```bash
   cd apps/scraper
   pytest -m "not benchmark and not live and not performance" --ignore=tests/benchmarks
   ```
   Or for focused tests:
   ```bash
   pytest tests/unit/test_official_brand_scraper.py tests/unit/test_name_consolidation.py tests/unit/test_url_ranking.py -v
   ```

3. **Web lint:**
   ```bash
   bun run web lint
   ```

4. **Web tests:**
   ```bash
   bun run web test -- --testPathPatterns="official-brand-workflow|pipeline-scraping"
   ```

5. **Type check (non-blocking in CI, but verify locally):**
   ```bash
   cd apps/web && npx tsc --noEmit
   ```

6. **Full root test (optional, can be slow):**
   ```bash
   bun run test
   ```

---

## Files to Modify

| File | Changes |
|------|---------|
| `apps/web/supabase/migrations/20260501120000_enrich_official_brand_candidates.sql` | New migration with 4 columns + comments |
| `apps/scraper/scrapers/ai_search/query_builder.py` | Add `build_sku_discovery_query` and `build_name_discovery_query` |
| `apps/scraper/scrapers/ai_search/official_brand_scraper.py` | Add dataclasses, Phase 1/1.5/2/3 methods, refactor `discover_official_url_candidates`, refactor `extract_products_from_urls_batch` fallback loop, optionally update `identify_official_url` |
| `apps/scraper/runner/__init__.py` | Read `register_name`, simplify discovery items, pass `fallback_urls`/`max_fallbacks`, capture new result fields in payload |
| `apps/web/lib/pipeline-scraping-types.ts` | Add `officialBrandMaxFallbacks?: number` to `ScrapeOptions` |
| `apps/web/lib/pipeline-scraping.ts` | Add `register_name` to `ScrapeContextItem`, return it from `loadScrapeContextItems`, simplify `officialBrandConfigItems` |
| `apps/web/lib/official-brand-workflow.ts` | Extend `CandidateRowInput`, `buildCandidateRow`, and `buildDiscoveryOfficialBrandCandidateRows` for new DB columns |
| `apps/web/app/api/admin/scraping/callback/route.ts` | Add `predicted_name_count` to discovery metadata |
| `apps/scraper/tests/unit/test_official_brand_scraper.py` | Extend existing tests; add fallback loop tests |
| `apps/web/__tests__/lib/official-brand-workflow.test.ts` | Assert new candidate row fields |
| `apps/web/__tests__/lib/pipeline-scraping.test.ts` | Update assertions for simplified items and `register_name` |

## New Files

| File | Purpose |
|------|---------|
| `apps/web/supabase/migrations/20260501120000_enrich_official_brand_candidates.sql` | Schema migration |
| `apps/scraper/tests/unit/test_name_consolidation.py` | Unit tests for Phase 1.5 LLM consolidation |
| `apps/scraper/tests/unit/test_url_ranking.py` | Unit tests for Phase 3 tiered ranking logic |

---

## Dependencies

```
Phase 1 (schema) can happen anytime.
Phase 2 (query builder) → Phase 3 (new methods) → Phase 4 (refactor public methods)
Phase 4 must complete before Phase 5 (runner integration).
Phase 6 (types) and Phase 7 (pipeline) are independent of scraper work until Phase 8.
Phase 8 (workflow/callback) depends on Phase 1 and Phase 7.
Phase 9 (tests) can be written in parallel with code, but must be finalized after Phases 4–8.
Phase 10 (validation) is last.
```

---

## Risks & Decisions

1. **`identify_official_url` scope:** The plan only explicitly refactors `discover_official_url_candidates`, but `identify_official_url` is still used by legacy combined mode (`scrape_products_batch`). **Decision:** Update `identify_official_url` to use the same two-phase pipeline internally (delegate to the new phase methods) so behavior does not diverge. If that creates too much churn, leave it as-is and add a `TODO` comment.

2. **LLM failure fallback:** If `_consolidate_product_name` fails, we fall back to `register_name`. If `register_name` is also empty, Phase 2 will search with an empty predicted name and likely return poor results. **Mitigation:** If `predicted_name` and `register_name` are both empty after Phase 1.5, skip Phase 2 and rely on Phase 1 results only.

3. **`SearchScorer.score_search_result` compatibility:** The tiered ranking calls `score_search_result` with `brand=None`. Verify that `classify_result_source` and `is_brand_domain` handle `None` safely (they do based on current code).

4. **Postgres array type:** `appeared_in_phases integer[]` must be passed as a JS array. Supabase client handles this natively, but verify in the workflow test that the array round-trips correctly.

5. **In-memory domain success rate:** `get_domain_success_rate` resets on runner restart. This is acceptable for a stateless runner; the bonus is small (+0..5) and acts as a mild tiebreaker.

6. **Snapshot test churn:** `pipeline-scraping.test.ts` uses exact object equality for `config.items`. Updating to the simplified shape will break those assertions. This is expected and called out in Phase 9.

7. **One large PR:** The high-level plan specifies a single PR. Because changes span DB + runner + coordinator, the worker must keep commits granular (e.g., `feat(scraper): ...`, `feat(web): ...`) but merge them into one branch.

---

## Worker-Ready Meta-Prompt

You are implementing the two-phase official brand URL discovery plan described in `docs/plans/two-phase-url-discovery-plan.md` and detailed in `docs/plans/two-phase-url-discovery-implementation-plan.md` (this file).

**What to do:**
1. Create branch `feature/two-phase-official-brand-discovery` from `main`.
2. Execute the phases in order: Schema → Query Builder → Scraper Core (new methods) → Scraper Core (refactor) → Runner → Coordinator Types → Coordinator Pipeline → Workflow/Callback → Tests → Validation.
3. For every changed file, keep the existing code style (no `any`, no default exports, named exports only).
4. Do NOT add direct DB access in runner code; the runner remains API-only.
5. Use `create_llm_provider` directly for the name consolidation LLM call, not the legacy `_llm_runtime` path.
6. Ensure backward-compatible keys remain in `discover_official_url_candidates` return dict (`selected_url`, `candidates`, `confidence`, `selection_method`).
7. Update existing tests and add the two new test files exactly as specified.
8. Run the validation commands in Phase 10 and fix all failures before finishing.
9. If any ambiguity blocks you (especially the `identify_official_url` refactor decision), stop and ask for clarification rather than guessing.
10. Do NOT implement the admin UI fallback URL query (out of scope).

**Success criteria:**
- `discover_official_url_candidates` returns `predicted_name`, `fallback_urls`, `phase1_result_count`, `phase2_result_count`.
- `extract_products_from_urls_batch` tries fallback URLs when the primary URL fails extraction.
- Coordinator `config.items` for official brand jobs contains `register_name` and omits `product_name`/`price`/`category`.
- New DB columns are created and populated through `buildDiscoveryOfficialBrandCandidateRows`.
- All scraper and web tests pass; lint is clean.
