# URL Extraction Hardening — Implementation Plan

Date: 2026-05-22
Status: Ready for Phase 1
Oracle: reviewed and approved (run c269d4b8)

## Summary

The hardening plan in `serp-discovery-extraction-hardening-plan.md` is directionally correct, but we must implement narrowly and measure before refactoring. This plan defines a pragmatic subset:

- **Phase 1 (now):** Extraction-only URL benchmark. Makes quality measurable.
- **Phase 2 (after baseline):** ProductMediaSelector. Fixes the biggest pollution vector (images).
- **Phase 3+ (deferred):** Strategy orchestration, full category/variant normalization, production QA gates. Build only after Phases 1-2 produce a baseline and regression tests.

## Key decisions

| Decision | Rationale |
|----------|-----------|
| **Phase 1 only now** | Oracle: "Implement Phase 1 first, narrowly." Measure before changing behavior. |
| **New benchmark directory** | `benchmarks/url_extraction/` — separate from `benchmarks/ai_search/` which is frozen (NotImplementedError). |
| **New dataset format** | Use the plan's proposed shape (`expected.name_contains`, `expected.forbidden_image_domains`, etc.). Do not reuse `official_extraction_dataset.json` format — it lacks media/category/dirty-HTML expectations. |
| **ProductMediaSelector as new module** | In Phase 2, create `scrapers/product_url_extraction/media_selector.py` as a NEW module. Do NOT extend `ExtractionUtils.merge_product_images` further — it's already scoring-focused and would bloat `ai_search/extraction.py`. Have the existing `_enrich_images` delegate to the new selector later for backward compat. |
| **Defer strategy orchestration** | The current monolithic `_extract_inner` works. Rewriting it into strategies now violates "measure first." Build behind a flag/shadow mode only after benchmarks and media selector produce a reliable baseline. |
| **QA checks in benchmark metrics, not production gates** | Include QA-like checks (protein-as-category hard fail, dirty HTML, forbidden domains) in benchmark scoring now. Do NOT wire production QA gates until Phase 2+ proves the checks are tuned correctly. |
| **Generated reports gitignored** | `reports/latest/` and `reports/latest/raw/` should be in `.gitignore`. Commit the dataset, README, and test files only. |
| **Protein-as-category is scoped, not global** | `Poultry` may be legitimate for livestock/feed. Treat it as an error only in pet-food/Open Farm context initially. |

## What we're NOT doing now

| Skip | Why |
|------|-----|
| Strategy orchestration (Phase 3) | Measure first. Monolithic `_extract_inner` works for 30-entry dataset. Refactor incrementally behind a flag after baseline exists. |
| Category/facet normalization (Phase 4) | Depends on strategy orchestration. Include simple checks in benchmark metrics only. |
| Production QA gates (Phase 5) | Premature without benchmark evidence. Benchmark metrics simulate the checks. |
| Extending `merge_product_images` for domain blocking | Would bloat `ai_search/extraction.py`. New module in Phase 2. |
| Platform parser for all Shopify fields | ShopifyVariantResolver already resolves variants. Full field extraction needs strategy orchestration. |
| Domain CSS schemas for openfarmpet.com | Needs benchmark baseline first. |

## Phase 1: Extraction-only URL benchmark

### Deliverables

```text
apps/scraper/benchmarks/url_extraction/
  __init__.py              # Empty init
  dataset.json             # 3 Open Farm entries (from the plan)
  runner.py                # CLI runner with --dataset, --output-dir, --fail-under, --max-concurrency
  metrics.py               # Pure scoring functions
  report.py                # JSON + Markdown report writer
  README.md                # Usage docs
apps/scraper/tests/unit/benchmarks/
  test_url_extraction_metrics.py   # Offline unit tests for metrics
```

.gitignore additions:
```gitignore
apps/scraper/benchmarks/url_extraction/reports/
```

### dataset.json

Exact shape from the plan — 3 Open Farm entries with `expected` dicts containing:
- `brand`, `name_contains`, `description_contains`, `weight`
- `species`, `food_form`, `flavor_contains`, `texture` (for pâté)
- `min_approved_images`, `max_approved_images`
- `forbidden_image_domains`, `forbidden_image_path_hints`
- `tags`

### metrics.py

Pure functions, no I/O, fully unit-testable offline:

```python
# Per-field checks
def score_brand(extracted: str | None, expected: str) -> float        # exact or fuzzy match
def score_name_contains(extracted: str | None, tokens: list[str]) -> float
def score_description_contains(extracted: str | None, phrases: list[str]) -> float
def score_weight(extracted: str | None, expected: str) -> bool         # containment or alias
def score_species(extracted: str | None, expected: str) -> bool
def score_food_form(extracted: str | None, expected: str) -> bool
def score_flavor_contains(extracted: str | None, tokens: list[str]) -> float

# Hard-fail checks (return pass/fail + reason)
def check_category_not_protein_only(categories: list[str] | None, tags: list[str]) -> tuple[bool, str | None]
def check_approved_image_bounds(images: list[str] | None, min_: int, max_: int) -> tuple[bool, int, str | None]
def check_forbidden_image_domains(images: list[str] | None, domains: set[str]) -> tuple[bool, list[str]]
def check_forbidden_image_path_hints(images: list[str] | None, hints: list[str]) -> tuple[bool, list[str]]
def check_dirty_html_markers(description: str | None) -> tuple[bool, list[str]]

# Image quality
def compute_canonical_duplicate_ratio(images: list[str]) -> float      # 0.0-1.0

# Aggregate
class ExtractionScore:
    success: bool
    brand_score: float
    name_score: float
    description_score: float
    weight_match: bool
    species_match: bool
    food_form_match: bool
    flavor_score: float
    category_sane: bool
    category_sane_reason: str | None
    approved_image_count: int
    image_count_in_bounds: bool
    image_count_reason: str | None
    forbidden_domain_hits: list[str]
    forbidden_path_hint_hits: list[str]
    dirty_html_hits: list[str]
    duplicate_ratio: float
    hard_fails: list[str]
    warnings: list[str]
    overall_score: float  # 0.0-1.0

def score_extraction(result: dict, expected: dict, tags: list[str]) -> ExtractionScore

# Summary
def summarize_scores(scores: list[ExtractionScore]) -> dict
```

**Protein-only category values** (scoped to pet food context):
```python
PROTEIN_ONLY_VALUES = {"poultry", "chicken", "beef", "salmon", "turkey", "fish", "lamb", "duck"}
```
Only applied as hard-fail when tags include `"pet-food"`.

**Dirty HTML markers:**
```python
DIRTY_HTML_MARKERS = ["virtual_list", "bottomspacer", "data-qa=", "aria-setsize"]
```

**Forbidden image domains** (from plan):
```python
FORBIDDEN_IMAGE_DOMAINS = {"images.unsplash.com"}
```

**Forbidden image path hints:**
```python
FORBIDDEN_PATH_HINTS = ["recycle", "transparency-map", "logo", "footer"]
```

### runner.py

```bash
python -m benchmarks.url_extraction.runner \
  --dataset apps/scraper/benchmarks/url_extraction/dataset.json \
  --output-dir apps/scraper/benchmarks/url_extraction/reports/latest \
  --max-concurrency 2 \
  --fail-under 0.80
```

Behavior:
- Reads dataset.json entries
- For each entry, calls `ProductPageExtractor.extract(url=source_url, upc=upc, product_name=product_name, brand=brand)`
- Runs `score_extraction()` on each result against expected
- Writes raw result to `reports/latest/raw/{entry_id}.json`
- Writes `reports/latest/extraction-report.json`
- Writes `reports/latest/extraction-report.md`
- Returns exit code 1 if `overall_score < fail_under`
- Errors gracefully when telemetry (token_usage, raw media stats) is unavailable — warns, doesn't fail

**No live URL runs in pytest.** Default `pytest -m "not live"` must pass. Live mode is CLI-only:
```bash
python -m benchmarks.url_extraction.runner --dataset ... --output-dir ... --live
```

### report.py

Produces:
- `extraction-report.json`: Machine-readable, includes per-entry scores, summary, hard-fail breakdown, warning breakdown
- `extraction-report.md`: Human-readable, includes summary table, per-entry detail with pass/fail/warn icons, hard-fail list

### Unit tests (`test_url_extraction_metrics.py`)

Test all `metrics.py` pure functions with synthetic extraction results. Test cases:
- Perfect match → score 1.0
- Partial token match → score 0.5-0.9
- Missing field → score 0.0
- Protein-only category with pet-food tag → hard fail
- Protein-only category without pet-food tag → pass (scope)
- Forbidden domain in images → hard fail
- Forbidden path hint in images → hard fail
- Dirty HTML in description → hard fail
- Image count within bounds → pass
- Image count outside bounds → warning
- Duplicate ratio calculation (canonical URL dedup)
- Missing telemetry → warning, not fail

Must NOT require network, browser, or API keys.

### Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Current extractor doesn't return raw media stats | Benchmark metrics tolerate missing telemetry as warnings |
| Live benchmark needs network/LLM credentials | Keep manual; not CI default. `pytest -m "not live"` only |
| `_extract_inner` output shape may miss fields the benchmark expects | `score_extraction` handles missing keys gracefully; returns 0.0 for missing fields |
| Live extraction may be slow (30s+ per URL) | `--max-concurrency` flag, default 2 |
| Open Farm URLs may change or go down | Dataset entries are curated snapshots; re-run requires manual review |

## Phase 2: ProductMediaSelector (after Phase 1 baseline)

### When to start

After Phase 1 produces a reliable benchmark baseline showing:
- What the current image quality actually is for Open Farm
- How many raw vs approved images we get
- Which domains/path hints actually appear

### Deliverables

```text
apps/scraper/scrapers/product_url_extraction/media_selector.py
apps/scraper/tests/unit/test_media_selector.py
```

### Key behaviors (from the plan)

1. Receive Crawl4AI `result.media["images"]` structured candidates
2. Canonicalize URLs (strip width/crop/fit/q params)
3. Score by product relevance
4. Block forbidden domains
5. Reject non-product path hints
6. Assign primary/gallery/rejected roles
7. Return media stats (raw_count, canonical_count, approved_count, duplicate_ratio)

### Integration path

- New module, NOT extending `ExtractionUtils.merge_product_images`
- Once proven, have `Crawl4AIExtractor._enrich_images` delegate to `ProductMediaSelector` instead of `merge_product_images`
- Existing `merge_product_images` remains for backward compat until full migration

## Phase 3+: Deferred

Strategy orchestration, full category/variant normalization, and production QA gates are deferred until:
- Phase 1 benchmark produces a reliable baseline
- Phase 2 media selector is integrated and benchmarked
- We have regression tests proving the current monolithic flow's behavior

When ready, build strategy chain incrementally:
1. Add field evidence model (`FieldEvidence` TypedDict)
2. Extract one strategy at a time (JSON-LD/meta first), running in parallel with existing flow
3. Gate behind a config flag
4. Compare benchmark scores before flipping the flag

## Acceptance criteria (Phase 1)

- [ ] `benchmarks/url_extraction/dataset.json` exists with 3 Open Farm entries
- [ ] `benchmarks/url_extraction/metrics.py` exists with all scoring functions
- [ ] `benchmarks/url_extraction/runner.py` exists with `--dataset`, `--output-dir`, `--fail-under`, `--max-concurrency`
- [ ] `benchmarks/url_extraction/report.py` writes JSON + Markdown reports
- [ ] `tests/unit/benchmarks/test_url_extraction_metrics.py` has comprehensive offline tests
- [ ] `pytest -m "not live"` passes (no live network calls in default tests)
- [ ] CLI live run produces valid reports for the 3 Open Farm URLs
- [ ] `reports/` is gitignored
- [ ] `README.md` documents usage
