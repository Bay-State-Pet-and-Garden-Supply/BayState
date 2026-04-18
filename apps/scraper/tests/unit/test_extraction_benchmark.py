from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from scrapers.ai_search.extraction_benchmark import load_extraction_benchmark_dataset
from scrapers.ai_search.models import AISearchResult
from scrapers.ai_search.scraper import AISearchScraper


def _build_scraper() -> AISearchScraper:
    scraper = object.__new__(AISearchScraper)
    scraper._extract_product_data = AsyncMock()
    scraper._build_discovery_result = MagicMock()
    scraper._cost_tracker = MagicMock()
    scraper._cost_tracker.get_cost_summary.return_value = {"total_cost_usd": 0.0123}
    return scraper


@pytest.mark.asyncio
async def test_extract_from_url_builds_discovery_result_on_success() -> None:
    scraper = _build_scraper()
    scraper._extract_product_data.return_value = {
        "success": True,
        "product_name": "Ultra Kibble",
        "brand": "Acme",
        "url": "https://brand.example/products/sku-123",
    }
    scraper._build_discovery_result.return_value = AISearchResult(
        success=True,
        sku="SKU-123",
        product_name="Ultra Kibble",
        brand="Acme",
        url="https://brand.example/products/sku-123",
    )

    result = await scraper.extract_from_url(
        url="https://brand.example/products/sku-123",
        sku="SKU-123",
        product_name="Ultra Kibble",
        brand="Acme",
    )

    assert result.success is True
    scraper._extract_product_data.assert_awaited_once_with(
        "https://brand.example/products/sku-123",
        "SKU-123",
        "Ultra Kibble",
        "Acme",
    )
    scraper._build_discovery_result.assert_called_once()


@pytest.mark.asyncio
async def test_extract_from_url_returns_failure_result_on_extraction_error() -> None:
    scraper = _build_scraper()
    scraper._extract_product_data.return_value = {
        "success": False,
        "error": "No product data found",
    }

    result = await scraper.extract_from_url(
        url="https://brand.example/products/sku-123",
        sku="SKU-123",
        product_name="Ultra Kibble",
        brand="Acme",
    )

    assert result.success is False
    assert result.error == "No product data found"
    assert result.cost_usd == 0.0123


def test_load_extraction_benchmark_dataset_parses_ground_truth(tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.json"
    dataset_path.write_text(
        json.dumps(
            {
                "version": "1.0",
                "generated_at": "2026-04-18T00:00:00+00:00",
                "source_dataset": "data/golden_dataset_v3.json",
                "entries": [
                    {
                        "sku": "SKU-123",
                        "query": "Acme Ultra Kibble",
                        "expected_source_url": "https://brand.example/products/sku-123",
                        "category": "Dog Food Dry",
                        "difficulty": "medium",
                        "source_type": "official",
                        "ground_truth": {
                            "brand": "Acme",
                            "name": "Acme Ultra Kibble",
                            "description": "Dry dog food",
                            "size_metrics": None,
                            "images": ["https://brand.example/image.jpg"],
                            "categories": ["Dog Food Dry"],
                        },
                    }
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    dataset = load_extraction_benchmark_dataset(dataset_path)

    assert dataset.version == "1.0"
    assert len(dataset.entries) == 1
    assert dataset.entries[0].ground_truth.name == "Acme Ultra Kibble"
    assert dataset.entries[0].source_type == "official"
