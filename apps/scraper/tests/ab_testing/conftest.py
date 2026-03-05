from __future__ import annotations

from pathlib import Path
from typing import TypedDict

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_JSON_PATH = PROJECT_ROOT / ".sisyphus" / "evidence" / "t17-ab-comparison.json"


class MockExtractionPayload(TypedDict):
    success: bool
    extraction_time_seconds: float
    input_tokens: int
    output_tokens: int
    model: str


class ProductRecord(TypedDict):
    sku: str
    name: str
    brand: str


class MockExtractor:
    def __init__(self, payloads: dict[str, MockExtractionPayload]) -> None:
        self._payloads: dict[str, MockExtractionPayload] = payloads
        self.call_count: int = 0

    def __call__(self, product: ProductRecord) -> MockExtractionPayload:
        self.call_count += 1
        payload = self._payloads.get(product["sku"])
        if payload is not None:
            return payload
        return {
            "success": False,
            "extraction_time_seconds": 0.0,
            "input_tokens": 0,
            "output_tokens": 0,
            "model": "gpt-4o-mini",
        }


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "ab_test: A/B comparison tests for crawl4ai vs browser-use extraction.",
    )


@pytest.fixture(scope="session")
def test_skus() -> list[ProductRecord]:
    return [
        {"sku": "TEST001", "name": "Purina Pro Plan Adult Dog Food", "brand": "Purina"},
        {"sku": "TEST002", "name": "KONG Classic Dog Toy", "brand": "KONG"},
        {"sku": "TEST003", "name": "Greenies Original Dental Treats", "brand": "Greenies"},
        {"sku": "TEST004", "name": "Frontline Plus Flea and Tick", "brand": "Frontline"},
        {"sku": "TEST005", "name": "Blue Buffalo Wilderness Cat Food", "brand": "Blue Buffalo"},
        {"sku": "TEST006", "name": "Feliway Classic Diffuser Refill", "brand": "Feliway"},
    ]


@pytest.fixture(scope="session")
def crawl4ai_mock_payloads() -> dict[str, MockExtractionPayload]:
    return {
        "TEST001": {"success": True, "extraction_time_seconds": 2.1, "input_tokens": 1700, "output_tokens": 520, "model": "gpt-4o-mini"},
        "TEST002": {"success": True, "extraction_time_seconds": 2.5, "input_tokens": 1820, "output_tokens": 500, "model": "gpt-4o-mini"},
        "TEST003": {"success": True, "extraction_time_seconds": 2.0, "input_tokens": 1680, "output_tokens": 490, "model": "gpt-4o-mini"},
        "TEST004": {"success": False, "extraction_time_seconds": 3.0, "input_tokens": 1750, "output_tokens": 460, "model": "gpt-4o-mini"},
        "TEST005": {"success": True, "extraction_time_seconds": 2.4, "input_tokens": 1800, "output_tokens": 540, "model": "gpt-4o-mini"},
        "TEST006": {"success": True, "extraction_time_seconds": 2.2, "input_tokens": 1720, "output_tokens": 510, "model": "gpt-4o-mini"},
    }


@pytest.fixture(scope="session")
def browser_use_mock_payloads() -> dict[str, MockExtractionPayload]:
    return {
        "TEST001": {"success": True, "extraction_time_seconds": 4.4, "input_tokens": 3500, "output_tokens": 950, "model": "gpt-4o"},
        "TEST002": {"success": True, "extraction_time_seconds": 4.9, "input_tokens": 3620, "output_tokens": 920, "model": "gpt-4o"},
        "TEST003": {"success": False, "extraction_time_seconds": 5.3, "input_tokens": 3480, "output_tokens": 880, "model": "gpt-4o"},
        "TEST004": {"success": False, "extraction_time_seconds": 5.0, "input_tokens": 3550, "output_tokens": 870, "model": "gpt-4o"},
        "TEST005": {"success": True, "extraction_time_seconds": 4.8, "input_tokens": 3600, "output_tokens": 960, "model": "gpt-4o"},
        "TEST006": {"success": True, "extraction_time_seconds": 4.6, "input_tokens": 3520, "output_tokens": 940, "model": "gpt-4o"},
    }


@pytest.fixture
def crawl4ai_extractor(crawl4ai_mock_payloads: dict[str, MockExtractionPayload]) -> MockExtractor:
    return MockExtractor(crawl4ai_mock_payloads)


@pytest.fixture
def browser_use_extractor(browser_use_mock_payloads: dict[str, MockExtractionPayload]) -> MockExtractor:
    return MockExtractor(browser_use_mock_payloads)


@pytest.fixture(scope="session")
def comparison_report_path() -> Path:
    return EVIDENCE_JSON_PATH
