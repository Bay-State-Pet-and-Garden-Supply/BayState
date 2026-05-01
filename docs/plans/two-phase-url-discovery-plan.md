# Two-Phase Official Brand URL Discovery & Fallback Extraction

> Created: 2026-05-01  
> Branch: `feature/two-phase-official-brand-discovery` (from `main`)  
> PR scope: One large PR covering runner, coordinator, DB schema, and tests.  
> Status: **Planned — not yet implemented**

---

## Problem Summary

The current `discover_official_url_candidates` in `official_brand_scraper.py` does a single-pass search by brand+SKU + "official website", then matches against configured domains or falls back to LLM scoring. Weaknesses:

1. SKU-only searches are too narrow.
2. No product name refinement from the register name.
3. No ranked fallback when the primary URL fails.
4. Cohort domains are only used as filters, not priority-boosted targets.

---

## Architecture: Two-Phase Discovery + URL Ranking

```
Phase 1: SKU Discovery Search
  └─ Collect titles/snippets from SKU search
Phase 1.5: LLM Name Consolidation
  └─ Predict full product name from register name + search titles
Phase 2: Product Name Search
  └─ Search by predicted name + brand + site exclusions
Phase 3: URL Ranking
  └─ Merge all candidates, apply tiered scoring, return ranked list
```

Extraction then uses the ranked list: try rank #1, fall back to #2, #3, etc.

---

## File Changes

### 1. Database Migration

**File:** `apps/web/supabase/migrations/20260501120000_enrich_official_brand_candidates.sql`

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

---

### 2. Runner-side (`apps/scraper`)

#### `scrapers/ai_search/query_builder.py`

Add two new methods:

- **`build_sku_discovery_query(sku, brand=None) -> str`**  
  Returns `"<sku>"` or `"<brand> <sku>"` if SKU is ambiguous (short numeric — reuse `is_ambiguous_identifier`).

- **`build_name_discovery_query(predicted_name, brand, exclusions) -> str`**  
  Returns `"<predicted_name> <brand>"` with aggregator site exclusions.

#### `scrapers/ai_search/official_brand_scraper.py`

**New dataclasses (top of file):**

```python
@dataclass
class RankedUrlCandidate:
    url: str
    domain: str
    rank: int
    score: float
    selection_tier: str       # "official_domain", "preferred_domain", "knowledge_graph", "llm_scored", "organic"
    appeared_in_phases: list[int]  # [1], [2], or [1,2]
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

**New methods:**

- `async _search_sku_for_names(sku, brand, register_name) -> list[dict]` — Phase 1
- `async _consolidate_product_name(register_name, brand, search_titles) -> str` — Phase 1.5
- `async _search_by_predicted_name(predicted_name, brand, official_domains, preferred_domains) -> list[dict]` — Phase 2
- `_rank_url_candidates(...) -> DiscoveryResult` — Phase 3

**Refactored methods:**

- `discover_official_url_candidates(...)` — Replace single-pass with 3-phase pipeline. Keep backward-compatible keys (`selected_url`, `candidates`, `confidence`, `selection_method`). Add `predicted_name`, `fallback_urls`, `phase1_result_count`, `phase2_result_count`.
- `extract_products_from_urls_batch(...)` — Accept `fallback_urls` per item. Loop up to `max_fallbacks` on extraction failure.

#### `runner/__init__.py`

- Read `register_name` from item context (new field), pass to scraper.
- Read `fallback_urls` and `max_fallbacks` from item context for extraction.
- Simplify item payload to only: `sku`, `register_name`, `brand`, `official_domains`, `preferred_domains` (and `source_url`/`url_source`/`fallback_urls`/`max_fallbacks` for extraction).
- Capture new result fields in the discovery result payload.

---

### 3. Coordinator-side (`apps/web`)

#### `lib/pipeline-scraping-types.ts`

- Add to `ScrapeOptions`:
  ```ts
  officialBrandMaxFallbacks?: number;
  ```

#### `lib/pipeline-scraping.ts`

- In `officialBrandConfigItems`, construct explicit minimal items:
  ```ts
  return {
    sku: item.sku,
    register_name: ingestionName,  // raw input.name
    brand: item.brand,
    official_domains: item.official_domains,
    preferred_domains: item.preferred_domains,
    ...(sourceUrl ? { source_url: sourceUrl, url_source: 'manual' } : {}),
    ...(isOfficialBrandExtraction && options?.officialBrandMaxFallbacks !== undefined
        ? { max_fallbacks: options.officialBrandMaxFallbacks }
        : {}),
  };
  ```

#### `lib/official-brand-workflow.ts`

- Update `CandidateRowInput` and `buildCandidateRow` for new fields: `predicted_name`, `appeared_in_phases`, `selection_tier`, `composite_score`.
- Update `buildDiscoveryOfficialBrandCandidateRows` to extract these from the enriched discovery result.

#### `app/api/admin/scraping/callback/route.ts`

- Discovery branch: the updated `buildDiscoveryOfficialBrandCandidateRows` will persist the new fields automatically once `official-brand-workflow.ts` is updated.
- Update discovery metadata to include `predicted_name_count`.

---

### 4. Tests

| Test file | What to test |
|-----------|-------------|
| `apps/scraper/tests/unit/test_name_consolidation.py` | New: LLM name consolidation with success + fallback |
| `apps/scraper/tests/unit/test_url_ranking.py` | New: tiered scoring, dedup, cross-confirmation, fallback list |
| `apps/scraper/tests/unit/test_official_brand_scraper.py` | Update/extend: discovery returns predicted_name/fallback_urls; extraction fallback loop |
| `apps/web/__tests__/lib/official-brand-workflow.test.ts` | Update: new candidate row fields |
| `apps/web/__tests__/lib/pipeline-scraping.test.ts` | Update: simplified config items, register_name, max_fallbacks |

---

## Ranking Algorithm — Tiered Priority Scores

| Priority | Condition | Score Boost |
|----------|-----------|-------------|
| 1 | URL in `official_domains` AND appeared in Phase 2 | +100 |
| 2 | URL in `official_domains` AND Phase 1 only | +80 |
| 3 | URL in `preferred_domains` AND Phase 2 | +60 |
| 4 | URL in `preferred_domains` AND Phase 1 only | +50 |
| 5 | Knowledge Graph result | +40 |
| 6 | LLM-scored official from Phase 2 | +30 |
| 7 | LLM-scored official from Phase 1 | +20 |
| 8 | Organic — base `SearchScorer.score_search_result` score | Base |

**Additive bonuses:**
- SKU in URL/title/snippet: +5
- Predicted name tokens overlap with title: +3
- Appeared in BOTH phases (cross-confirmation): +10
- Domain success rate (`get_domain_success_rate()`): 0 to +5

---

## Clarifications (from discussion)

1. **Register name = raw import name** (`products_ingestion.input.name`). Passed as `register_name` in job config items. Coordinator sets this from `ingestionName` even when `preferCatalogContext: true`.
2. **`officialBrandMaxFallbacks`** is a new field in `ScrapeOptions`. Default in runner: 3.
3. **LLM call** uses lightweight `create_llm_provider("openai", "gpt-4o-mini")` directly, not the legacy `_llm_runtime` path.
4. **Admin UI fallback URL query** is a separate ticket — not in scope here.
5. **Existing pipeline test snapshots** will be updated to match the simplified `config.items` shape.

---

## Execution Checklist (when ready to implement)

1. [ ] Create branch `feature/two-phase-official-brand-discovery` from `main`
2. [ ] Write & apply DB migration
3. [ ] Add query builder methods
4. [ ] Add dataclasses, Phase 1/1.5/2/3 methods to `official_brand_scraper.py`
5. [ ] Refactor `discover_official_url_candidates`
6. [ ] Refactor `extract_products_from_urls_batch` for fallback
7. [ ] Update runner (`runner/__init__.py`) — register_name, fallback support, enriched payload
8. [ ] Update coordinator types & simplify `config.items`
9. [ ] Update `official-brand-workflow.ts` & `callback/route.ts` for new fields
10. [ ] Write new tests, update existing tests
11. [ ] Run `bun run web test`, `python -m pytest`, `ruff check`, `bun run lint`
12. [ ] Commit & open PR
