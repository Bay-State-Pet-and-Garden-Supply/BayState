import pytest
from unittest.mock import AsyncMock, MagicMock
from scrapers.ai_search.source_selector import LLMSourceSelector


def test_build_prompt_includes_resolved_candidate_metadata_when_present() -> None:
    selector = LLMSourceSelector.__new__(LLMSourceSelector)

    prompt = selector._build_prompt(
        sku="032247884594",
        product_name="Scotts Nature Scapes Sierra Red 1.5 cu ft",
        brand="Scotts",
        preferred_domains=["scottsmiraclegro.com"],
        candidates=[
            {
                "url": "https://scottsmiraclegro.com/en-us/products/88459442.html",
                "title": "Scotts Nature Scapes Color Enhanced Mulch | Scotts",
                "description": "Official Scotts family page for Nature Scapes mulch.",
                "source_url": "https://scottsmiraclegro.com/en-us/products/nature-scapes-color-enhanced-mulch.html",
                "source_type": "official_family",
                "source_domain": "scottsmiraclegro.com",
                "family_url": "https://scottsmiraclegro.com/en-us/products/nature-scapes-color-enhanced-mulch.html",
                "resolved_variant": {"resolver": "demandware_product_variation", "variant_id": "032247884594"},
            }
        ],
    )

    assert "URL: https://scottsmiraclegro.com/en-us/products/88459442.html" in prompt
    assert "Title: Scotts Nature Scapes Color Enhanced Mulch | Scotts" in prompt
    assert "Description: Official Scotts family page for Nature Scapes mulch." in prompt
    assert "Source URL: https://scottsmiraclegro.com/en-us/products/nature-scapes-color-enhanced-mulch.html" in prompt
    assert "Source Type: official_family" in prompt
    assert "Source Tier/Domain: scottsmiraclegro.com" in prompt
    assert "Family URL: https://scottsmiraclegro.com/en-us/products/nature-scapes-color-enhanced-mulch.html" in prompt
    assert "Resolved Variant: {'resolver': 'demandware_product_variation', 'variant_id': '032247884594'}" in prompt


@pytest.mark.asyncio
async def test_llm_source_selector_picks_official_site() -> None:
    # Mock search results
    results = [
        {"url": "https://www.amazon.com/dp/B00001", "title": "Advantage II Large Cat - Amazon.com", "description": "Buy Advantage II for cats on Amazon."},
        {
            "url": "https://www.elanco.com/en-us/products/advantage-ii-cats",
            "title": "Advantage II | Elanco Product Page",
            "description": "Official product page for Advantage II flea treatment.",
        },
        {"url": "https://www.chewy.com/advantage-ii", "title": "Advantage II for Cats - Chewy.com", "description": "Chewy has Advantage II in stock."},
    ]

    # Mock OpenAI response
    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content="https://www.elanco.com/en-us/products/advantage-ii-cats"))]
    mock_response.usage = MagicMock(prompt_tokens=100, completion_tokens=20)

    selector = LLMSourceSelector(api_key="test-key")
    assert selector.client is not None
    selector.client.chat.completions.create = AsyncMock(return_value=mock_response)

    best_url, cost = await selector.select_best_url(results=results, sku="84170364", product_name="ADVNTG II CAT LRG")

    assert best_url == "https://www.elanco.com/en-us/products/advantage-ii-cats"
    assert cost > 0


@pytest.mark.asyncio
async def test_llm_source_selector_returns_none_if_no_clear_winner() -> None:
    results = [
        {"url": "https://example1.com", "title": "Random 1", "description": "Desc 1"},
        {"url": "https://example2.com", "title": "Random 2", "description": "Desc 2"},
    ]

    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content="NONE"))]
    mock_response.usage = MagicMock(prompt_tokens=50, completion_tokens=5)

    selector = LLMSourceSelector(api_key="test-key")
    assert selector.client is not None
    selector.client.chat.completions.create = AsyncMock(return_value=mock_response)

    best_url, cost = await selector.select_best_url(results=results, sku="123", product_name="Unknown Product")

    assert best_url is None


@pytest.mark.asyncio
async def test_llm_source_selector_handles_openai_error() -> None:
    results = [{"url": "https://example.com", "title": "Title", "description": "Desc"}]

    selector = LLMSourceSelector(api_key="test-key")
    assert selector.client is not None
    selector.client.chat.completions.create = AsyncMock(side_effect=Exception("API Error"))

    best_url, cost = await selector.select_best_url(results=results, sku="123", product_name="Name")

    assert best_url is None
    assert cost == 0.0
