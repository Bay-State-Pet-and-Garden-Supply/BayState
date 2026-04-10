"""Unit tests for batch search SKU-first strategy."""

from __future__ import annotations

import asyncio
from typing import Any

from scrapers.ai_search.batch_search import (
    BatchSearchOrchestrator,
    ProductInput,
    SearchResult,
)


class MockSearchClient:
    """Mock search client for testing."""

    def __init__(self, results_map: dict[str, list[dict]] | None = None):
        self.results_map = results_map or {}
        self.search_calls: list[str] = []

    async def search(self, query: str) -> tuple[list[dict], str | None]:
        self.search_calls.append(query)
        # Return mock results based on query
        if query in self.results_map:
            return self.results_map[query], None
        # Default: return empty
        return [], None


class MockNameConsolidator:
    """Mock name consolidator for testing."""

    def __init__(self, consolidation_map: dict[str, str] | None = None):
        self.consolidation_map = consolidation_map or {}
        self.consolidate_calls: list[tuple[str, str]] = []

    async def consolidate_name(
        self,
        sku: str,
        abbreviated_name: str,
        search_snippets: list[dict[str, Any]],
    ) -> tuple[str, float]:
        self.consolidate_calls.append((sku, abbreviated_name))
        # Return consolidated name or original if not in map
        consolidated = self.consolidation_map.get(sku, abbreviated_name)
        return consolidated, 0.001  # Mock cost


class MockExtractor:
    """Mock extractor for testing."""

    pass


class MockScorer:
    """Mock scorer for testing."""

    def score_search_result(self, **kwargs) -> float:
        return 5.0


def test_search_sku_first_executes_three_phases() -> None:
    """Test that search_sku_first executes all three phases."""
    # Setup
    sku_results = {
        "12345": [{"url": "https://distributor.com/product", "title": "Product ABC"}],
    }
    name_results = {
        "Brand Product ABC": [{"url": "https://manufacturer.com/product", "title": "Product ABC"}],
    }

    search_client = MockSearchClient(
        {
            "12345": sku_results["12345"],
            "Brand Product ABC": name_results["Brand Product ABC"],
        }
    )

    consolidator = MockNameConsolidator(
        {
            "12345": "Brand Product ABC",
        }
    )

    orchestrator = BatchSearchOrchestrator(
        search_client=search_client,
        extractor=MockExtractor(),
        scorer=MockScorer(),
        name_consolidator=consolidator,
    )

    products = [ProductInput(sku="12345", name="Prod ABC", brand="Brand")]

    # Execute
    results = asyncio.run(orchestrator.search_sku_first(products))

    # Verify
    assert "12345" in results
    assert len(search_client.search_calls) == 2  # Phase 1 + Phase 3
    assert "12345" in search_client.search_calls  # Phase 1: SKU search
    assert any("Brand Product ABC" in call for call in search_client.search_calls)  # Phase 3: Name search
    assert len(consolidator.consolidate_calls) == 1  # Phase 2: Consolidation


def test_merge_search_results_deduplicates_by_url() -> None:
    """Test that merge deduplicates results by URL."""
    orchestrator = BatchSearchOrchestrator(
        search_client=MockSearchClient(),
        extractor=MockExtractor(),
        scorer=MockScorer(),
    )

    sku_results = {
        "12345": [
            SearchResult(url="https://example.com/product", title="Product"),
            SearchResult(url="https://duplicate.com/item", title="Duplicate"),
        ],
    }

    name_results = {
        "12345": [
            SearchResult(url="https://duplicate.com/item", title="Duplicate"),  # Duplicate
            SearchResult(url="https://new.com/item", title="New"),
        ],
    }

    merged = orchestrator._merge_search_results(sku_results, name_results)

    assert "12345" in merged
    urls = [r.url for r in merged["12345"]]
    assert urls.count("https://duplicate.com/item") == 1  # Deduplicated
    assert len(merged["12345"]) == 3  # All unique results


def test_merge_search_results_prioritizes_name_results() -> None:
    """Test that name search results are prioritized (added first)."""
    orchestrator = BatchSearchOrchestrator(
        search_client=MockSearchClient(),
        extractor=MockExtractor(),
        scorer=MockScorer(),
    )

    sku_results = {
        "12345": [SearchResult(url="https://sku-result.com", title="SKU Result")],
    }

    name_results = {
        "12345": [SearchResult(url="https://name-result.com", title="Name Result")],
    }

    merged = orchestrator._merge_search_results(sku_results, name_results)

    # Name results should come first (higher priority)
    assert merged["12345"][0].url == "https://name-result.com"


def test_search_sku_first_handles_empty_sku_results() -> None:
    """Test that empty SKU results don't break the flow."""
    search_client = MockSearchClient({})  # No results
    consolidator = MockNameConsolidator({})

    orchestrator = BatchSearchOrchestrator(
        search_client=search_client,
        extractor=MockExtractor(),
        scorer=MockScorer(),
        name_consolidator=consolidator,
    )

    products = [ProductInput(sku="12345", name="Product")]

    # Should not raise exception
    results = asyncio.run(orchestrator.search_sku_first(products))

    assert "12345" in results
    # Should have empty results but not crash


def test_search_sku_first_without_consolidator() -> None:
    """Test graceful handling when name_consolidator is None."""
    search_client = MockSearchClient(
        {
            "12345": [{"url": "https://example.com", "title": "Product"}],
        }
    )

    orchestrator = BatchSearchOrchestrator(
        search_client=search_client,
        extractor=MockExtractor(),
        scorer=MockScorer(),
        name_consolidator=None,  # No consolidator
    )

    products = [ProductInput(sku="12345", name="Product")]

    # Should not raise exception, fall back to using original name
    results = asyncio.run(orchestrator.search_sku_first(products))

    assert "12345" in results


def test_search_by_sku_only_uses_identifier_query() -> None:
    """Test that Phase 1 uses SKU-only identifier query."""
    search_client = MockSearchClient({})

    orchestrator = BatchSearchOrchestrator(
        search_client=search_client,
        extractor=MockExtractor(),
        scorer=MockScorer(),
    )

    products = [ProductInput(sku="051178002327", name="Test Product")]

    asyncio.run(orchestrator._search_by_sku_only(products, max_concurrent=5))

    # Should search with just the SKU
    assert any("051178002327" in call for call in search_client.search_calls)
    # Should NOT include product name in query
    assert not any("Test Product" in call for call in search_client.search_calls)
