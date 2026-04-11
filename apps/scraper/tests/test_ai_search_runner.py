from __future__ import annotations

import os

from core.api_client import JobConfig
from runner import _run_ai_search_job, settings
from scrapers.ai_search.models import AISearchResult


def test_run_ai_search_job_wires_serper_credentials_and_restores_env(monkeypatch) -> None:
    init_args: dict[str, object] = {}

    class StubAISearchScraper:
        def __init__(self, **kwargs):
            init_args.update(kwargs)
            assert os.environ["SERPER_API_KEY"] == "serper-runtime-key-1234567890"

        async def scrape_products_batch(self, items, max_concurrency):
            assert items == [
                {
                    "sku": "SKU-1",
                    "product_name": "Squeaky Ball",
                    "brand": "Acme",
                    "category": "Dog Toys",
                }
            ]
            assert max_concurrency == 2
            return [
                AISearchResult(
                    success=True,
                    sku="SKU-1",
                    product_name="Acme Squeaky Ball",
                    brand="Acme",
                    description="Official product page",
                    images=["https://acmepets.com/images/12345.jpg"],
                    categories=["Dog Toys"],
                    url="https://acmepets.com/products/12345",
                    source_website="acmepets.com",
                    confidence=0.92,
                )
            ]

    monkeypatch.setattr("runner.AISearchScraper", StubAISearchScraper)
    monkeypatch.setitem(settings.browser_settings, "headless", True)
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)
    monkeypatch.delenv("SERPER_API_KEY", raising=False)

    results = {
        "data": {},
        "scrapers_run": [],
        "skus_processed": 0,
    }

    updated = _run_ai_search_job(
        job_config=JobConfig(
            job_id="job-123",
            skus=["SKU-1"],
            scrapers=[],
            max_workers=2,
            job_config={
                "product_name": "Squeaky Ball",
                "brand": "Acme",
                "category": "Dog Toys",
                "max_concurrency": 2,
                "search_provider": "serper",
            },
            ai_credentials={
                "openai_api_key": "openai-runtime-key-1234567890",
                "serper_api_key": "serper-runtime-key-1234567890",
            },
        ),
        skus=["SKU-1"],
        results=results,
        log_buffer=[],
    )

    assert init_args["search_provider"] == "serper"
    assert init_args["llm_provider"] == "openai"
    assert init_args["llm_model"] == "gpt-4o-mini"
    assert init_args["llm_api_key"] == "openai-runtime-key-1234567890"
    assert init_args["search_api_key"] == "serper-runtime-key-1234567890"
    assert init_args["prefer_manufacturer"] is True
    assert updated["data"]["SKU-1"]["ai_search"]["title"] == "Acme Squeaky Ball"
    assert "SERPER_API_KEY" not in os.environ


def test_run_ai_search_job_maps_legacy_provider_payloads_to_serper(monkeypatch) -> None:
    init_args: dict[str, object] = {}

    class StubAISearchScraper:
        def __init__(self, **kwargs):
            init_args.update(kwargs)
            assert "BRAVE_API_KEY" not in os.environ
            assert "SERPER_API_KEY" not in os.environ

        async def scrape_products_batch(self, items, max_concurrency):
            assert max_concurrency == 1
            return [
                AISearchResult(
                    success=True,
                    sku="SKU-2",
                    product_name="Local Model Product",
                    brand="Acme",
                    description="Extracted with a self-hosted model",
                    images=["https://acmepets.com/images/local.jpg"],
                    categories=["Dog Toys"],
                    url="https://acmepets.com/products/local",
                    source_website="acmepets.com",
                    confidence=0.9,
                )
            ]

    monkeypatch.setattr("runner.AISearchScraper", StubAISearchScraper)
    monkeypatch.setitem(settings.browser_settings, "headless", True)
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)

    updated = _run_ai_search_job(
        job_config=JobConfig(
            job_id="job-456",
            skus=["SKU-2"],
            scrapers=[],
            max_workers=1,
            job_config={
                "product_name": "Local Model Product",
                "brand": "Acme",
                "search_provider": "brave",
                "llm_provider": "openai_compatible",
                "llm_model": "gpt-4o-mini",
                "llm_base_url": "http://localhost:8000/v1",
            },
            ai_credentials={
                "openai_api_key": "openai-runtime-key-2222222222",
            },
        ),
        skus=["SKU-2"],
        results={"data": {}, "scrapers_run": [], "skus_processed": 0},
        log_buffer=[],
    )

    assert init_args["llm_provider"] == "openai"
    assert init_args["llm_model"] == "gpt-4o-mini"
    assert init_args["llm_base_url"] is None
    assert init_args["llm_api_key"] == "openai-runtime-key-2222222222"
    assert init_args["search_provider"] == "serper"
    assert updated["data"]["SKU-2"]["ai_search"]["title"] == "Local Model Product"
    assert "BRAVE_API_KEY" not in os.environ


def test_run_ai_search_job_routes_legacy_gemini_payloads_to_openai(monkeypatch) -> None:
    init_args: dict[str, object] = {}

    class StubAISearchScraper:
        def __init__(self, **kwargs):
            init_args.update(kwargs)

        async def scrape_products_batch(self, items, max_concurrency):
            assert max_concurrency == 1
            return [
                AISearchResult(
                    success=True,
                    sku="SKU-3",
                    product_name="Gemini Product",
                    brand="Acme",
                    description="Grounded by Gemini",
                    images=["https://acmepets.com/images/gemini.jpg"],
                    categories=["Dog Toys"],
                    url="https://acmepets.com/products/gemini",
                    source_website="acmepets.com",
                    confidence=0.95,
                )
            ]

    monkeypatch.setattr("runner.AISearchScraper", StubAISearchScraper)
    monkeypatch.setitem(settings.browser_settings, "headless", True)

    updated = _run_ai_search_job(
        job_config=JobConfig(
            job_id="job-789",
            skus=["SKU-3"],
            scrapers=[],
            max_workers=1,
            job_config={
                "product_name": "Gemini Product",
                "brand": "Acme",
                "llm_provider": "gemini",
            },
            ai_credentials={
                "openai_api_key": "openai-runtime-key-1234567890",
            },
        ),
        skus=["SKU-3"],
        results={"data": {}, "scrapers_run": [], "skus_processed": 0},
        log_buffer=[],
    )

    assert init_args["llm_provider"] == "openai"
    assert init_args["llm_model"] == "gpt-4o-mini"
    assert init_args["llm_api_key"] == "openai-runtime-key-1234567890"
    assert init_args["search_provider"] == "serper"
    assert updated["data"]["SKU-3"]["ai_search"]["title"] == "Gemini Product"
