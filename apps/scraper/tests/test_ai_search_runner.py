from __future__ import annotations

import os

from core.api_client import JobConfig
from runner import _run_ai_search_job, settings
from scrapers.ai_search.models import AISearchResult


def test_run_ai_search_job_wires_serpapi_credentials_and_restores_env(monkeypatch) -> None:
    init_args: dict[str, object] = {}

    class StubAISearchScraper:
        def __init__(self, **kwargs):
            init_args.update(kwargs)
            assert os.environ["OPENAI_API_KEY"] == "sk-" + ("n" * 48)
            assert os.environ["SERPAPI_API_KEY"] == "serpapi-runtime-key-1234567890"
            assert os.environ["BRAVE_API_KEY"] == "brave-runtime-key-1234567890"

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
    monkeypatch.setenv("OPENAI_API_KEY", "sk-" + ("p" * 48))
    monkeypatch.setenv("BRAVE_API_KEY", "brave-existing-key-1234567890")
    monkeypatch.delenv("SERPAPI_API_KEY", raising=False)

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
                "search_provider": "serpapi",
            },
            ai_credentials={
                "openai_api_key": "sk-" + ("n" * 48),
                "serpapi_api_key": "serpapi-runtime-key-1234567890",
                "brave_api_key": "brave-runtime-key-1234567890",
            },
        ),
        skus=["SKU-1"],
        results=results,
        log_buffer=[],
    )

    assert init_args["search_provider"] == "serpapi"
    assert updated["data"]["SKU-1"]["ai_search"]["title"] == "Acme Squeaky Ball"
    assert os.environ["OPENAI_API_KEY"] == "sk-" + ("p" * 48)
    assert os.environ["BRAVE_API_KEY"] == "brave-existing-key-1234567890"
    assert "SERPAPI_API_KEY" not in os.environ
