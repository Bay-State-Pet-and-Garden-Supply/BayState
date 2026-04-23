# AI Search Official-First Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI Search scraper prefer exact official manufacturer variants resolved from family pages before dropping to retailers, then prove the improvement with focused and whole-dataset benchmarks.

**Architecture:** Keep discovery as-is, but insert a resolved-candidate layer between raw search results and extraction. Official family pages become direct child-variant candidates through a shared resolver, then both single-item and batch paths use one shared ranking/selection pipeline before extraction and validation.

**Tech Stack:** Python 3.10, pytest, httpx, existing `SearchScorer`, existing `ExtractionUtils`, existing `BatchSearchOrchestrator`, existing `benchmark_ai_search.py`

---

All commands below assume the working directory is `apps/scraper`.

### Task 1: Lock The Regression Target

**Files:**
- Modify: `data/golden_dataset_official_family_regressions.json`
- Modify: `tests/unit/test_benchmark_ai_search.py`
- Modify: `tests/unit/test_benchmark_dataset_consistency.py`
- Test: `tests/unit/test_benchmark_ai_search.py::test_benchmark_runner_resolves_official_family_page_to_variant_url`

- [ ] **Step 1: Write the failing benchmark expectation**

```python
@pytest.mark.asyncio
async def test_benchmark_runner_resolves_official_family_page_to_variant_url(tmp_path: Path) -> None:
    entries = [
        {
            "query": "032247884594 Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
            "expected_source_url": "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
            "expected_source_tier": "official",
            "expected_family_url": "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
            "expected_variant_label": "Sierra Red 1.5 CF",
            "cohort_key": "scotts-naturescapes-1-5cf",
            "category": "Mulch",
            "difficulty": "medium",
            "rationale": "The benchmark should score the resolved official Scotts child variant, not the parent family page.",
            "brand": "Scotts",
            "sku": "032247884594",
            "product_name": "Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        }
    ]
    dataset_path = _write_dataset(tmp_path, entries, filename="golden_dataset_v1.json")
    fixture_manifest_path = tmp_path / "golden_dataset_v1.search_results.json"
    _ = fixture_manifest_path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "entries": [
                    {
                        "query": entries[0]["query"],
                        "results": [
                            _result(
                                "https://www.wiltonhardware.com/p/nature-scapes-color-enhanced-mulch-sierra-red-032247884594",
                                "Nature Scapes Color Enhanced Mulch Sierra Red 032247884594",
                                "Independent retailer PDP for Scotts Sierra Red mulch 1.5 cu ft.",
                            ),
                            _result(
                                "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
                                "Scotts Nature Scapes Color Enhanced Mulch 1.5 cu. ft.",
                                "Official Scotts family page with Sierra Red, Deep Forest Brown, and Classic Black color variants plus 1.5 CF and 2 CF sizes.",
                            ),
                        ],
                    }
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    runner = BenchmarkRunner(dataset_path=dataset_path)
    report = await runner.run()

    assert report["results"][0]["predicted_source_url"] == "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html"
```

- [ ] **Step 2: Update the official-family regression dataset to the resolved child URL target**

```json
{
  "version": "1.1",
  "created_at": "2026-04-22T00:00:00Z",
  "provenance": {
    "annotator": "OpenCode",
    "source": "fixture_regression",
    "mode": "heuristic",
    "product_count": 3,
    "workflow": "official-family-page-resolved-variant"
  },
  "entries": [
    {
      "query": "032247884594 Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
      "expected_source_url": "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
      "expected_source_tier": "official",
      "expected_family_url": "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
      "expected_variant_label": "Sierra Red 1.5 CF",
      "cohort_key": "scotts-naturescapes-1-5cf",
      "category": "Mulch",
      "difficulty": "medium",
      "rationale": "The clean official Scotts family page should resolve to the Sierra Red child variant and beat the small retailer PDP.",
      "sku": "032247884594",
      "product_name": "Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
      "brand": "Scotts"
    },
    {
      "query": "032247884594 Scotts Miracle-Gro NatureScapes Sierra Red 1.5 CF",
      "expected_source_url": "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
      "expected_source_tier": "official",
      "expected_family_url": "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
      "expected_variant_label": "Sierra Red 1.5 CF",
      "cohort_key": "scotts-naturescapes-1-5cf",
      "category": "Mulch",
      "difficulty": "medium",
      "rationale": "Brand alias normalization should still resolve to the official Scotts child variant URL.",
      "sku": "032247884594",
      "product_name": "Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 CF",
      "brand": "Scotts Miracle-Gro"
    },
    {
      "query": "032247884594 Scotts Nature Scapes Sierra Red 1.5 CF mulch",
      "expected_source_url": "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
      "expected_source_tier": "official",
      "expected_family_url": "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
      "expected_variant_label": "Sierra Red 1.5 CF",
      "cohort_key": "scotts-naturescapes-1-5cf",
      "category": "Mulch",
      "difficulty": "hard",
      "rationale": "Variant token normalization should still resolve to the official Sierra Red child variant when the query uses CF shorthand.",
      "sku": "032247884594",
      "product_name": "Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 CF",
      "brand": "Scotts"
    }
  ]
}
```

- [ ] **Step 3: Update the dataset consistency test so family-page fixtures stay valid**

```python
def test_official_family_regression_expected_source_or_family_url_exists_in_fixture_manifest() -> None:
    dataset_path = Path("data/golden_dataset_official_family_regressions.json")
    fixtures_path = Path("data/golden_dataset_official_family_regressions.search_results.json")

    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    fixtures = json.loads(fixtures_path.read_text(encoding="utf-8"))

    fixture_urls_by_query = {
        str(entry["query"]): {str(result.get("url") or "") for result in entry.get("results", [])}
        for entry in fixtures.get("entries", [])
    }

    missing: list[str] = []
    for entry in dataset.get("entries", []):
        query = str(entry["query"])
        expected_url = str(entry["expected_source_url"])
        expected_family_url = str(entry.get("expected_family_url") or "")
        candidate_urls = fixture_urls_by_query.get(query, set())
        if expected_url not in candidate_urls and expected_family_url not in candidate_urls:
            missing.append(f"{query} -> {expected_url} ({expected_family_url})")

    assert missing == []
```

- [ ] **Step 4: Run the targeted tests to confirm the current behavior is still wrong**

Run: `python -m pytest tests/unit/test_benchmark_dataset_consistency.py::test_official_family_regression_expected_source_or_family_url_exists_in_fixture_manifest tests/unit/test_benchmark_ai_search.py::test_benchmark_runner_resolves_official_family_page_to_variant_url -q`

Expected: the consistency test passes, and the benchmark test fails because the current runner can only choose the parent family page or the retailer URL.

- [ ] **Step 5: Commit**

```bash
git add data/golden_dataset_official_family_regressions.json tests/unit/test_benchmark_ai_search.py tests/unit/test_benchmark_dataset_consistency.py
git commit -m "test(ai-search): add resolved official-family regression"
```

### Task 2: Add A Resolved Candidate Model And Official-Family Resolver

**Files:**
- Create: `scrapers/ai_search/candidate_resolver.py`
- Modify: `scrapers/ai_search/models.py`
- Create: `tests/unit/test_candidate_resolver.py`
- Test: `tests/unit/test_candidate_resolver.py`

- [ ] **Step 1: Write the failing resolver tests**

```python
from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest

from scrapers.ai_search.candidate_resolver import CandidateResolver
from scrapers.ai_search.extraction import ExtractionUtils
from scrapers.ai_search.scoring import SearchScorer

SCOTTS_FAMILY_HTML = """
<button class="btn-size"
  value="https://scottsmiraclegro.com/on/demandware.store/Sites-SMG-Site/en_US/Product-Variation?dwvar_scotts-nature-scapes-color-enhanced-mulch_color=0039&dwvar_scotts-nature-scapes-color-enhanced-mulch_size=1.5cf&pid=scotts-nature-scapes-color-enhanced-mulch&quantity=1"
  data-attr-value="1.5cf"
  data-attr-id="size">1.5 CF</button>
<button aria-label="Select Color Sierra Red"
  data-url="https://scottsmiraclegro.com/on/demandware.store/Sites-SMG-Site/en_US/Product-Variation?dwvar_scotts-nature-scapes-color-enhanced-mulch_color=0039&dwvar_scotts-nature-scapes-color-enhanced-mulch_size=1.5cf&pid=scotts-nature-scapes-color-enhanced-mulch&quantity=1">
  <span data-attr-value="0039"></span>
</button>
<button aria-label="Select Color Deep Forest Brown"
  data-url="https://scottsmiraclegro.com/on/demandware.store/Sites-SMG-Site/en_US/Product-Variation?dwvar_scotts-nature-scapes-color-enhanced-mulch_color=0041&dwvar_scotts-nature-scapes-color-enhanced-mulch_size=1.5cf&pid=scotts-nature-scapes-color-enhanced-mulch&quantity=1">
  <span data-attr-value="0041"></span>
</button>
"""

SCOTTS_RED_VARIATION = json.dumps(
    {
        "product": {
            "id": "032247884594",
            "productName": "Scotts Nature Scapes Color Enhanced Mulch 1.5 cu. ft.",
            "selectedProductUrl": "/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
            "shortDescription": "Rich, red color mulch for trees, shrubs, flowers or vegetables.",
            "brand": "Scotts",
            "images": {"large": [{"url": "https://smg.widen.net/content/q6rayjk4jt/webp/88459440_0_F.webp?&w=800&h=800"}]},
        }
    }
)


@pytest.mark.asyncio
async def test_candidate_resolver_resolves_scotts_family_to_variant_url() -> None:
    scorer = SearchScorer()
    fetch_text = AsyncMock(side_effect=[SCOTTS_FAMILY_HTML, SCOTTS_RED_VARIATION])
    resolver = CandidateResolver(
        scorer=scorer,
        extraction=ExtractionUtils(scorer),
        fetch_text=fetch_text,
    )

    candidates = await resolver.resolve_search_results(
        search_results=[
            {
                "url": "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
                "title": "Scotts Nature Scapes Color Enhanced Mulch 1.5 cu. ft.",
                "description": "Official Scotts family page with Sierra Red, Deep Forest Brown, and Classic Black variants.",
            }
        ],
        sku="032247884594",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        brand="Scotts",
        preferred_domains=["scottsmiraclegro.com"],
    )

    assert candidates[0].resolved_url == "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html"
    assert candidates[0].family_url == "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html"
    assert candidates[0].resolver == "demandware_family_child"
    assert candidates[0].variant_text == "Sierra Red 1.5 CF"


@pytest.mark.asyncio
async def test_candidate_resolver_keeps_direct_retailer_candidate_when_no_official_resolution_exists() -> None:
    scorer = SearchScorer()
    resolver = CandidateResolver(scorer=scorer, extraction=ExtractionUtils(scorer), fetch_text=AsyncMock(return_value=""))

    candidates = await resolver.resolve_search_results(
        search_results=[
            {
                "url": "https://www.wiltonhardware.com/p/nature-scapes-color-enhanced-mulch-sierra-red-032247884594",
                "title": "Nature Scapes Color Enhanced Mulch Sierra Red 032247884594",
                "description": "Independent retailer PDP for Scotts Sierra Red mulch 1.5 cu ft.",
            }
        ],
        sku="032247884594",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        brand="Scotts",
    )

    assert len(candidates) == 1
    assert candidates[0].resolved_url == "https://www.wiltonhardware.com/p/nature-scapes-color-enhanced-mulch-sierra-red-032247884594"
    assert candidates[0].resolver == "direct_result"
```

- [ ] **Step 2: Run the new resolver test and confirm it fails before implementation**

Run: `python -m pytest tests/unit/test_candidate_resolver.py -q`

Expected: FAIL with `ModuleNotFoundError: No module named 'scrapers.ai_search.candidate_resolver'`.

- [ ] **Step 3: Implement the resolved candidate model and resolver**

```python
@dataclass(slots=True)
class ResolvedSourceCandidate:
    raw_result_url: str
    resolved_url: str
    canonical_url: str
    family_url: str | None = None
    title: str = ""
    description: str = ""
    brand: str | None = None
    source_tier: str = "unknown"
    resolver: str = "direct_result"
    variant_text: str = ""
    exact_identifier_match: bool = False
    brand_match: bool = False
    name_match: bool = False
    conflicting_variant_match: bool = False
    preferred_domain_match: bool = False
    resolution_score: float = 0.0
    ranking_score: float = 0.0
```

```python
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from .extraction import ExtractionUtils
from .models import ResolvedSourceCandidate
from .scoring import SearchScorer
from .search import canonicalize_result_url

FetchText = Callable[[str], Awaitable[str]]


class CandidateResolver:
    def __init__(
        self,
        *,
        scorer: SearchScorer,
        extraction: ExtractionUtils,
        fetch_text: FetchText | None = None,
    ) -> None:
        self._scorer = scorer
        self._extraction = extraction
        self._fetch_text = fetch_text or self._default_fetch_text

    async def resolve_search_results(
        self,
        *,
        search_results: list[dict[str, Any]],
        sku: str,
        product_name: str | None,
        brand: str | None,
        preferred_domains: list[str] | None = None,
    ) -> list[ResolvedSourceCandidate]:
        resolved: list[ResolvedSourceCandidate] = []
        for result in search_results:
            direct = self._build_direct_candidate(result, sku=sku, product_name=product_name, brand=brand, preferred_domains=preferred_domains)
            if direct is None:
                continue
            expanded = await self._resolve_official_family_candidate(direct, sku=sku, product_name=product_name, brand=brand)
            if expanded:
                resolved.extend(expanded)
                resolved.append(direct)
                continue
            resolved.append(direct)
        return self._dedupe(resolved)

    def _build_direct_candidate(
        self,
        result: dict[str, Any],
        *,
        sku: str,
        product_name: str | None,
        brand: str | None,
        preferred_domains: list[str] | None,
    ) -> ResolvedSourceCandidate | None:
        url = str(result.get("url") or "").strip()
        if not url:
            return None
        canonical_url = canonicalize_result_url(url)
        domain = self._scorer.domain_from_url(url)
        combined = " ".join([str(result.get("title") or ""), str(result.get("description") or ""), url])
        return ResolvedSourceCandidate(
            raw_result_url=url,
            resolved_url=url,
            canonical_url=canonical_url,
            title=str(result.get("title") or ""),
            description=str(result.get("description") or ""),
            brand=brand,
            source_tier=self._scorer.classify_source_domain(domain, brand),
            resolver="direct_result",
            variant_text=" ".join(sorted(self._scorer._matching.extract_variant_tokens(combined))),
            exact_identifier_match=bool(sku and sku.lower() in combined.lower()),
            brand_match=bool(brand and self._scorer._matching.is_brand_match(brand, brand, url)),
            name_match=bool(product_name and self._scorer._matching.is_name_match(product_name, str(result.get("title") or ""))),
            conflicting_variant_match=bool(product_name and self._scorer._matching.has_conflicting_variant_tokens(product_name, combined)),
            preferred_domain_match=bool(preferred_domains and domain in preferred_domains),
            resolution_score=1.0,
        )

    async def _resolve_official_family_candidate(
        self,
        candidate: ResolvedSourceCandidate,
        *,
        sku: str,
        product_name: str | None,
        brand: str | None,
    ) -> list[ResolvedSourceCandidate]:
        if candidate.source_tier != "official":
            return []
        html_text = await self._fetch_text(candidate.resolved_url)
        if not html_text:
            return []
        variants = self._extraction.extract_demandware_variant_candidates(
            html_text=html_text,
            source_url=candidate.resolved_url,
            expected_name=product_name,
        )
        resolved: list[ResolvedSourceCandidate] = []
        for variant in variants:
            variant_url = str(variant.get("url") or "").strip()
            if not variant_url:
                continue
            payload = await self._fetch_text(variant_url)
            extracted = self._extraction.extract_product_from_html_jsonld(
                html_text=payload,
                source_url=variant_url,
                sku=sku,
                product_name=product_name,
                brand=brand,
                matching_utils=self._scorer._matching,
            )
            if not extracted:
                continue
            resolved_url = str(extracted.get("url") or variant_url)
            resolved.append(
                ResolvedSourceCandidate(
                    raw_result_url=candidate.raw_result_url,
                    resolved_url=resolved_url,
                    canonical_url=canonicalize_result_url(resolved_url),
                    family_url=candidate.resolved_url,
                    title=str(extracted.get("product_name") or candidate.title),
                    description=str(extracted.get("description") or candidate.description),
                    brand=str(extracted.get("brand") or brand or "").strip() or None,
                    source_tier="official",
                    resolver="demandware_family_child",
                    variant_text=str(variant.get("variant_text") or "").strip(),
                    exact_identifier_match=bool(sku and sku == str(extracted.get("resolved_variant", {}).get("variant_id") or "")),
                    brand_match=True,
                    name_match=bool(product_name and self._scorer._matching.is_name_match(product_name, str(extracted.get("product_name") or ""))),
                    conflicting_variant_match=bool(product_name and self._scorer._matching.has_conflicting_variant_tokens(product_name, f"{extracted.get('product_name', '')} {variant.get('variant_text', '')}")),
                    preferred_domain_match=True,
                    resolution_score=float(extracted.get("confidence") or 0.0),
                )
            )
        return resolved

    async def _default_fetch_text(self, url: str) -> str:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.text

    def _dedupe(self, candidates: list[ResolvedSourceCandidate]) -> list[ResolvedSourceCandidate]:
        seen: set[str] = set()
        output: list[ResolvedSourceCandidate] = []
        for candidate in candidates:
            if candidate.canonical_url in seen:
                continue
            seen.add(candidate.canonical_url)
            output.append(candidate)
        return output
```

- [ ] **Step 4: Run the resolver tests and make sure they pass**

Run: `python -m pytest tests/unit/test_candidate_resolver.py -q`

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add scrapers/ai_search/models.py scrapers/ai_search/candidate_resolver.py tests/unit/test_candidate_resolver.py
git commit -m "feat(ai-search): add resolved source candidate resolver"
```

### Task 3: Rank Resolved Candidates And Share One Selection Pipeline

**Files:**
- Modify: `scrapers/ai_search/scoring.py`
- Create: `scrapers/ai_search/selection_pipeline.py`
- Create: `tests/unit/test_selection_pipeline.py`
- Test: `tests/unit/test_selection_pipeline.py`

- [ ] **Step 1: Write the failing ranking and pipeline tests**

```python
from __future__ import annotations

from types import SimpleNamespace

import pytest

from scrapers.ai_search.models import ResolvedSourceCandidate
from scrapers.ai_search.scoring import SearchScorer
from scrapers.ai_search.selection_pipeline import CandidateSelectionPipeline


class _StubResolver:
    async def resolve_search_results(self, **kwargs):
        _ = kwargs
        return [
            ResolvedSourceCandidate(
                raw_result_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
                resolved_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
                canonical_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
                family_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
                title="Scotts Nature Scapes Color Enhanced Mulch 1.5 cu. ft.",
                description="Rich, red color mulch for trees, shrubs, flowers or vegetables.",
                brand="Scotts",
                source_tier="official",
                resolver="demandware_family_child",
                variant_text="Sierra Red 1.5 CF",
                exact_identifier_match=True,
                brand_match=True,
                name_match=True,
                preferred_domain_match=True,
                resolution_score=0.95,
            ),
            ResolvedSourceCandidate(
                raw_result_url="https://www.wiltonhardware.com/p/nature-scapes-color-enhanced-mulch-sierra-red-032247884594",
                resolved_url="https://www.wiltonhardware.com/p/nature-scapes-color-enhanced-mulch-sierra-red-032247884594",
                canonical_url="https://www.wiltonhardware.com/p/nature-scapes-color-enhanced-mulch-sierra-red-032247884594",
                title="Nature Scapes Color Enhanced Mulch Sierra Red 032247884594",
                description="Independent retailer PDP for Scotts Sierra Red mulch 1.5 cu ft.",
                brand="Scotts",
                source_tier="secondary_retailer",
                resolver="direct_result",
                variant_text="Sierra Red 1.5 CF",
                exact_identifier_match=True,
                brand_match=True,
                name_match=True,
                resolution_score=0.80,
            ),
        ]


class _StubSelector:
    async def select_best_url(self, *, results, sku, product_name, brand=None, preferred_domains=None):
        _ = sku, product_name, brand, preferred_domains
        assert results[0]["resolver"] == "demandware_family_child"
        assert results[0]["source_tier"] == "official"
        return results[0]["url"], 0.001


@pytest.mark.asyncio
async def test_selection_pipeline_ranks_resolved_official_child_before_retailer() -> None:
    pipeline = CandidateSelectionPipeline(scorer=SearchScorer(), resolver=_StubResolver())

    ranked_candidates, prioritized_url, selection_cost = await pipeline.rank_candidates(
        search_results=[],
        sku="032247884594",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        brand="Scotts",
        category="Mulch",
        preferred_domains=["scottsmiraclegro.com"],
        use_llm=False,
    )

    assert ranked_candidates[0].resolver == "demandware_family_child"
    assert ranked_candidates[0].resolved_url.endswith("/88459442.html")
    assert prioritized_url is None
    assert selection_cost == 0.0


@pytest.mark.asyncio
async def test_selection_pipeline_passes_resolved_candidates_to_llm_tiebreak() -> None:
    pipeline = CandidateSelectionPipeline(
        scorer=SearchScorer(),
        resolver=_StubResolver(),
        source_selector=_StubSelector(),
    )

    ranked_candidates, prioritized_url, selection_cost = await pipeline.rank_candidates(
        search_results=[],
        sku="032247884594",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        brand="Scotts",
        category="Mulch",
        preferred_domains=["scottsmiraclegro.com"],
        use_llm=True,
    )

    assert prioritized_url == ranked_candidates[0].resolved_url
    assert selection_cost == 0.001
```

- [ ] **Step 2: Run the new tests and confirm the scorer/pipeline do not exist yet**

Run: `python -m pytest tests/unit/test_selection_pipeline.py -q`

Expected: FAIL because `CandidateSelectionPipeline` and resolved-candidate ranking do not exist yet.

- [ ] **Step 3: Implement resolved-candidate scoring and the shared pipeline**

```python
def score_resolved_candidate(
    self,
    candidate: ResolvedSourceCandidate,
    *,
    sku: str,
    brand: str | None,
    product_name: str | None,
    category: str | None,
    prefer_manufacturer: bool = False,
    preferred_domains: list[str] | None = None,
) -> float:
    base_result = {
        "url": candidate.resolved_url,
        "title": candidate.title,
        "description": " ".join(part for part in [candidate.description, candidate.variant_text] if part),
    }
    score = self.score_search_result(
        result=base_result,
        sku=sku,
        brand=brand,
        product_name=product_name,
        category=category,
        prefer_manufacturer=prefer_manufacturer,
        preferred_domains=preferred_domains,
    )
    if candidate.resolver == "demandware_family_child":
        score += 3.0
    if candidate.family_url and candidate.family_url != candidate.resolved_url:
        score += 1.0
    if candidate.exact_identifier_match:
        score += 2.5
    if candidate.preferred_domain_match:
        score += 1.5
    if candidate.conflicting_variant_match:
        score -= 6.0
    return score


def prepare_resolved_candidates(
    self,
    *,
    candidates: list[ResolvedSourceCandidate],
    sku: str,
    brand: str | None,
    product_name: str | None,
    category: str | None,
    prefer_manufacturer: bool = False,
    preferred_domains: list[str] | None = None,
) -> list[ResolvedSourceCandidate]:
    scored = [
        replace(
            candidate,
            ranking_score=self.score_resolved_candidate(
                candidate,
                sku=sku,
                brand=brand,
                product_name=product_name,
                category=category,
                prefer_manufacturer=prefer_manufacturer,
                preferred_domains=preferred_domains,
            ),
        )
        for candidate in candidates
    ]
    return sorted(scored, key=lambda candidate: candidate.ranking_score, reverse=True)
```

```python
from __future__ import annotations

from typing import Any

from .models import ResolvedSourceCandidate
from .scoring import SearchScorer


class CandidateSelectionPipeline:
    def __init__(self, *, scorer: SearchScorer, resolver, source_selector=None) -> None:
        self._scorer = scorer
        self._resolver = resolver
        self._source_selector = source_selector

    async def rank_candidates(
        self,
        *,
        search_results: list[dict[str, Any]],
        sku: str,
        product_name: str | None,
        brand: str | None,
        category: str | None,
        preferred_domains: list[str] | None,
        use_llm: bool,
        prefer_manufacturer: bool = True,
    ) -> tuple[list[ResolvedSourceCandidate], str | None, float]:
        candidates = await self._resolver.resolve_search_results(
            search_results=search_results,
            sku=sku,
            product_name=product_name,
            brand=brand,
            preferred_domains=preferred_domains,
        )
        ranked = self._scorer.prepare_resolved_candidates(
            candidates=candidates,
            sku=sku,
            brand=brand,
            product_name=product_name,
            category=category,
            prefer_manufacturer=prefer_manufacturer,
            preferred_domains=preferred_domains,
        )
        if not ranked or not use_llm or self._source_selector is None:
            return ranked, None, 0.0

        llm_results = [
            {
                "url": candidate.resolved_url,
                "title": candidate.title,
                "description": candidate.description,
                "resolver": candidate.resolver,
                "source_tier": candidate.source_tier,
                "variant_text": candidate.variant_text,
                "family_url": candidate.family_url,
                "ranking_score": candidate.ranking_score,
            }
            for candidate in ranked[:8]
        ]
        prioritized_url, selection_cost = await self._source_selector.select_best_url(
            results=llm_results,
            sku=sku,
            product_name=product_name or "",
            brand=brand,
            preferred_domains=preferred_domains,
        )
        if prioritized_url:
            ranked = sorted(ranked, key=lambda candidate: 0 if candidate.resolved_url == prioritized_url else 1)
        return ranked, prioritized_url, float(selection_cost or 0.0)
```

- [ ] **Step 4: Run the focused tests and make sure they pass**

Run: `python -m pytest tests/unit/test_selection_pipeline.py -q`

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add scrapers/ai_search/scoring.py scrapers/ai_search/selection_pipeline.py tests/unit/test_selection_pipeline.py
git commit -m "feat(ai-search): rank resolved official variants"
```

### Task 4: Route Single-Product Scraping Through The Shared Pipeline

**Files:**
- Modify: `scrapers/ai_search/scraper.py`
- Modify: `scrapers/ai_search/source_selector.py`
- Modify: `tests/unit/test_source_selector.py`
- Modify: `tests/test_ai_search_two_pass.py`
- Test: `tests/unit/test_source_selector.py` and `tests/test_ai_search_two_pass.py`

- [ ] **Step 1: Write the failing single-product and prompt-shape tests**

```python
@pytest.mark.asyncio
async def test_llm_source_selector_includes_resolved_candidate_metadata() -> None:
    selector = LLMSourceSelector(api_key="test-key")
    selector.provider = SimpleNamespace(
        generate_text=AsyncMock(return_value=SimpleNamespace(text="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html", usage=None))
    )

    best_url, cost = await selector.select_best_url(
        results=[
            {
                "url": "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
                "title": "Scotts Nature Scapes Color Enhanced Mulch 1.5 cu. ft.",
                "description": "Rich, red color mulch for trees, shrubs, flowers or vegetables.",
                "resolver": "demandware_family_child",
                "source_tier": "official",
                "variant_text": "Sierra Red 1.5 CF",
                "ranking_score": 12.5,
            }
        ],
        sku="032247884594",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        brand="Scotts",
        preferred_domains=["scottsmiraclegro.com"],
    )

    prompt = selector.provider.generate_text.call_args.kwargs["user_prompt"]
    assert "Resolver: demandware_family_child" in prompt
    assert "Source Tier: official" in prompt
    assert best_url.endswith("/88459442.html")
    assert cost == 0.0
```

```python
@pytest.mark.asyncio
async def test_scrape_product_prefers_resolved_official_candidate_before_retailer(monkeypatch) -> None:
    scraper = AISearchScraper(use_ai_source_selection=False)
    scraper._selection_pipeline = SimpleNamespace(
        rank_candidates=AsyncMock(
            return_value=(
                [
                    ResolvedSourceCandidate(
                        raw_result_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
                        resolved_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
                        canonical_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
                        family_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
                        title="Scotts Nature Scapes Color Enhanced Mulch 1.5 cu. ft.",
                        description="Rich, red color mulch for trees, shrubs, flowers or vegetables.",
                        brand="Scotts",
                        source_tier="official",
                        resolver="demandware_family_child",
                        variant_text="Sierra Red 1.5 CF",
                        exact_identifier_match=True,
                        brand_match=True,
                        name_match=True,
                        preferred_domain_match=True,
                        ranking_score=12.5,
                    )
                ],
                None,
                0.0,
            )
        )
    )
```

- [ ] **Step 2: Run the targeted tests to confirm the raw-result path is still in use**

Run: `python -m pytest tests/unit/test_source_selector.py tests/test_ai_search_two_pass.py -q`

Expected: FAIL because the selector prompt still knows only about raw search results and `scrape_product()` still orders raw URLs instead of resolved candidates.

- [ ] **Step 3: Wire `AISearchScraper` and `LLMSourceSelector` to the shared pipeline**

```python
self._candidate_resolver = CandidateResolver(
    scorer=self._scoring,
    extraction=self._extraction,
)
self._selection_pipeline = CandidateSelectionPipeline(
    scorer=self._scoring,
    resolver=self._candidate_resolver,
    source_selector=self._source_selector,
)
```

```python
ranked_candidates, prioritized_url, selection_cost = await self._selection_pipeline.rank_candidates(
    search_results=search_results,
    sku=sku,
    product_name=product_name,
    brand=effective_brand,
    category=category,
    preferred_domains=preferred_domains,
    use_llm=self.use_ai_source_selection,
    prefer_manufacturer=self.prefer_manufacturer,
)
if cost_context is not None:
    cost_context.llm_cost_usd += selection_cost

for attempt, candidate in enumerate(ranked_candidates[:max_attempts], start=1):
    target_url = candidate.resolved_url
    self._log_telemetry(
        sku,
        target_url,
        "source_selected",
        True,
        f"resolver={candidate.resolver} variant={candidate.variant_text}",
    )
```

```python
candidate_lines = []
for index, result in enumerate(results[:8], start=1):
    candidate_lines.append(
        "\n".join(
            [
                f"{index}. URL: {result.get('url')}",
                f"   Title: {result.get('title')}",
                f"   Description: {result.get('description')}",
                f"   Resolver: {result.get('resolver') or 'direct_result'}",
                f"   Source Tier: {result.get('source_tier') or 'unknown'}",
                f"   Variant Text: {result.get('variant_text') or 'n/a'}",
                f"   Ranking Score: {result.get('ranking_score') or 0.0}",
            ]
        )
    )
user_prompt = "\n\n".join(candidate_lines)
```

- [ ] **Step 4: Run the focused tests and make sure the single-product path is now resolved-candidate aware**

Run: `python -m pytest tests/unit/test_source_selector.py tests/test_ai_search_two_pass.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scrapers/ai_search/scraper.py scrapers/ai_search/source_selector.py tests/unit/test_source_selector.py tests/test_ai_search_two_pass.py
git commit -m "refactor(ai-search): share resolved selection in scrape_product"
```

### Task 5: Route The Batch Orchestrator Through The Same Resolver Pipeline

**Files:**
- Modify: `scrapers/ai_search/batch_search.py`
- Modify: `scrapers/ai_search/scraper.py`
- Create: `tests/unit/test_batch_search_official_resolution.py`
- Test: `tests/unit/test_batch_search_official_resolution.py` and `tests/test_ai_search.py::test_scrape_products_batch_normalizes_orchestrated_scotts_cohort_to_official_domain`

- [ ] **Step 1: Write the failing orchestrator test**

```python
@pytest.mark.asyncio
async def test_batch_search_orchestrator_extracts_resolved_official_candidate_before_retailer() -> None:
    search_results = [
        SearchResult(
            sku="032247884594",
            query="032247884594 Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
            position=1,
            url="https://www.wiltonhardware.com/p/nature-scapes-color-enhanced-mulch-sierra-red-032247884594",
            title="Nature Scapes Color Enhanced Mulch Sierra Red 032247884594",
            description="Independent retailer PDP for Scotts Sierra Red mulch 1.5 cu ft.",
        )
    ]

    class _StubSelectionPipeline:
        async def rank_candidates(self, **kwargs):
            _ = kwargs
            return (
                [
                    ResolvedSourceCandidate(
                        raw_result_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
                        resolved_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
                        canonical_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
                        family_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
                        title="Scotts Nature Scapes Color Enhanced Mulch 1.5 cu. ft.",
                        description="Rich, red color mulch for trees, shrubs, flowers or vegetables.",
                        brand="Scotts",
                        source_tier="official",
                        resolver="demandware_family_child",
                        variant_text="Sierra Red 1.5 CF",
                        exact_identifier_match=True,
                        brand_match=True,
                        name_match=True,
                        preferred_domain_match=True,
                        ranking_score=12.0,
                    )
                ],
                None,
                0.0,
            )
```

- [ ] **Step 2: Run the batch-focused tests and confirm the orchestrator still extracts from raw ranked URLs**

Run: `python -m pytest tests/unit/test_batch_search_official_resolution.py tests/test_ai_search.py::test_scrape_products_batch_normalizes_orchestrated_scotts_cohort_to_official_domain -q`

Expected: FAIL because `BatchSearchOrchestrator` still ranks and extracts raw `SearchResult` URLs instead of resolved candidates.

- [ ] **Step 3: Pass the shared pipeline into the orchestrated batch path and extract from resolved candidates**

```python
orchestrator = BatchSearchOrchestrator(
    search_client=self._search_client,
    extractor=_BatchExtractorAdapter(self),
    scorer=self._scoring,
    name_consolidator=self._name_consolidator,
    cohort_state=cohort_state,
    validator=self._validator,
    selection_pipeline=self._selection_pipeline,
    use_ai_source_selection=self.use_ai_source_selection,
)
```

```python
class BatchSearchOrchestrator:
    def __init__(self, *, selection_pipeline=None, use_ai_source_selection: bool = False, **kwargs) -> None:
        self._selection_pipeline = selection_pipeline
        self._use_ai_source_selection = use_ai_source_selection

    async def _rank_candidates_for_sku(self, *, product: ProductInput, search_results: list[SearchResult]) -> list[ResolvedSourceCandidate]:
        raw_results = [
            {
                "url": result.url,
                "title": result.title,
                "description": result.description,
            }
            for result in search_results
        ]
        ranked, _prioritized_url, _selection_cost = await self._selection_pipeline.rank_candidates(
            search_results=raw_results,
            sku=product.sku,
            product_name=product.name,
            brand=product.brand,
            category=product.category,
            preferred_domains=product.preferred_domains,
            use_llm=self._use_ai_source_selection,
        )
        return ranked
```

```python
for candidate in ranked_candidates[:3]:
    target_url = candidate.resolved_url
    extraction_result = await self.extractor.extract(
        url=target_url,
        sku=product.sku,
        product_name=product.name,
        brand=product.brand,
    )
```

- [ ] **Step 4: Run the batch tests and make sure batch and single-item paths now use the same candidate ordering**

Run: `python -m pytest tests/unit/test_batch_search_official_resolution.py tests/test_ai_search.py::test_scrape_products_batch_normalizes_orchestrated_scotts_cohort_to_official_domain -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scrapers/ai_search/batch_search.py scrapers/ai_search/scraper.py tests/unit/test_batch_search_official_resolution.py tests/test_ai_search.py
git commit -m "feat(ai-search): use resolved candidates in batch orchestration"
```

### Task 6: Extend The Benchmark Runner, Summary Metrics, And Verification Commands

**Files:**
- Modify: `data/golden_dataset_schema.json`
- Modify: `scripts/benchmark_ai_search.py`
- Modify: `tests/unit/test_benchmark_ai_search.py`
- Test: `tests/unit/test_benchmark_ai_search.py`

- [ ] **Step 1: Write the failing benchmark-report test for the new resolution metrics**

```python
@pytest.mark.asyncio
async def test_benchmark_runner_reports_resolution_quality_for_official_family_dataset(tmp_path: Path) -> None:
    entries = [
        {
            "query": "032247884594 Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
            "expected_source_url": "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
            "expected_source_tier": "official",
            "expected_family_url": "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
            "expected_variant_label": "Sierra Red 1.5 CF",
            "cohort_key": "scotts-naturescapes-1-5cf",
            "category": "Mulch",
            "difficulty": "medium",
            "rationale": "Resolved official-family child URLs should surface in benchmark output.",
        }
    ]
    dataset_path = _write_dataset(tmp_path, entries)

    runner = BenchmarkRunner(dataset_path=dataset_path, selection_pipeline=SimpleNamespace(rank_candidates=AsyncMock(return_value=([ResolvedSourceCandidate(
        raw_result_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
        resolved_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
        canonical_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
        family_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
        title="Scotts Nature Scapes Color Enhanced Mulch 1.5 cu. ft.",
        description="Rich, red color mulch for trees, shrubs, flowers or vegetables.",
        brand="Scotts",
        source_tier="official",
        resolver="demandware_family_child",
        variant_text="Sierra Red 1.5 CF",
        exact_identifier_match=True,
        brand_match=True,
        name_match=True,
        preferred_domain_match=True,
        ranking_score=12.5,
    )], None, 0.0))))
    report = await runner.run()

    assert report["summary"]["resolution_quality"]["official_source_selection_rate"] == 100.0
    assert report["summary"]["resolution_quality"]["resolved_variant_selection_rate"] == 100.0
    assert report["results"][0]["predicted_source_tier"] == "official"
    assert report["results"][0]["selected_resolver"] == "demandware_family_child"
```

- [ ] **Step 2: Run the benchmark-report test and confirm the current report schema is missing the new fields**

Run: `python -m pytest tests/unit/test_benchmark_ai_search.py::test_benchmark_runner_reports_resolution_quality_for_official_family_dataset -q`

Expected: FAIL because `BenchmarkRunner` does not yet carry resolved-candidate metadata or resolution-quality summary fields.

- [ ] **Step 3: Extend the schema and runner to report official-family resolution quality**

```json
"expected_source_tier": { "type": "string" },
"expected_family_url": { "type": "string" },
"expected_variant_label": { "type": "string" },
"cohort_key": { "type": "string" }
```

```python
class ResolutionQualitySummary(TypedDict):
    official_source_selection_rate: float
    resolved_variant_selection_rate: float
    cohort_consistency_rate: float
    false_official_rate: float


def _calculate_resolution_quality(results: Sequence[BenchmarkResultRow]) -> ResolutionQualitySummary:
    official_rows = [row for row in results if row.get("expected_source_tier") == "official"]
    official_matches = sum(1 for row in official_rows if row.get("predicted_source_tier") == "official")

    variant_rows = [row for row in results if row.get("expected_variant_label")]
    variant_matches = sum(1 for row in variant_rows if row.get("selected_variant_label") == row.get("expected_variant_label"))

    grouped: dict[str, list[BenchmarkResultRow]] = defaultdict(list)
    for row in results:
        cohort_key = str(row.get("cohort_key") or "").strip()
        if cohort_key:
            grouped[cohort_key].append(row)
    coherent_groups = 0
    for rows in grouped.values():
        domains = {str(row.get("predicted_source_domain") or "") for row in rows if row.get("predicted_source_domain")}
        if len(domains) == 1:
            coherent_groups += 1

    false_official = sum(
        1
        for row in results
        if row.get("predicted_source_tier") == "official"
        and row.get("expected_source_tier") == "official"
        and row.get("predicted_source_url") != row.get("expected_source_url")
    )

    return {
        "official_source_selection_rate": round((official_matches / len(official_rows)) * 100, 3) if official_rows else 0.0,
        "resolved_variant_selection_rate": round((variant_matches / len(variant_rows)) * 100, 3) if variant_rows else 0.0,
        "cohort_consistency_rate": round((coherent_groups / len(grouped)) * 100, 3) if grouped else 0.0,
        "false_official_rate": round((false_official / len(official_rows)) * 100, 3) if official_rows else 0.0,
    }
```

```python
lines.extend(
    [
        "## Resolution Quality",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| Official Source Selection Rate | {summary['resolution_quality']['official_source_selection_rate']:.3f}% |",
        f"| Resolved Variant Selection Rate | {summary['resolution_quality']['resolved_variant_selection_rate']:.3f}% |",
        f"| Cohort Consistency Rate | {summary['resolution_quality']['cohort_consistency_rate']:.3f}% |",
        f"| False Official Rate | {summary['resolution_quality']['false_official_rate']:.3f}% |",
        "",
    ]
)
```

- [ ] **Step 4: Run the focused benchmark tests, then run the two benchmark commands that decide rollout**

Run: `python -m pytest tests/unit/test_benchmark_ai_search.py -q`

Expected: PASS.

Run: `python scripts/benchmark_ai_search.py --dataset data/golden_dataset_official_family_regressions.json --output reports/official_family_resolver.json`

Expected: `accuracy_exact_match_pct` improves to `100.000`, `official_source_selection_rate` is `100.000`, and `resolved_variant_selection_rate` is `100.000`.

Run: `python scripts/benchmark_ai_search.py --dataset data/golden_dataset_v3.json --output reports/overall_regression_check.json`

Expected: overall exact-match accuracy does not regress materially versus the saved baseline report.

Run: `python scripts/compare_benchmarks.py reports/benchmark_baseline_overall.json reports/overall_regression_check.json`

Expected: `no_significant_difference` or `significant_improvement`, never `significant_regression`.

- [ ] **Step 5: Commit**

```bash
git add data/golden_dataset_schema.json scripts/benchmark_ai_search.py tests/unit/test_benchmark_ai_search.py
git commit -m "feat(ai-search): report official-family resolution metrics"
```

## Verification Checklist

- Run: `python -m pytest tests/unit/test_candidate_resolver.py tests/unit/test_selection_pipeline.py tests/unit/test_batch_search_official_resolution.py tests/unit/test_source_selector.py tests/unit/test_benchmark_ai_search.py tests/test_ai_search.py::test_scrape_products_batch_normalizes_orchestrated_scotts_cohort_to_official_domain tests/test_ai_search_two_pass.py -q`
- Run: `python scripts/benchmark_ai_search.py --dataset data/golden_dataset_official_family_regressions.json --output reports/official_family_resolver.json`
- Run: `python scripts/benchmark_ai_search.py --dataset data/golden_dataset_v3.json --output reports/overall_regression_check.json`
- Run: `python scripts/compare_benchmarks.py reports/benchmark_baseline_overall.json reports/overall_regression_check.json`
- Do not ship until the official-family benchmark is green and the overall dataset comparison is not a significant regression.
