import pytest
from unittest.mock import AsyncMock, MagicMock
from scrapers.ai_search.name_consolidator import NameConsolidator


@pytest.mark.asyncio
async def test_name_consolidator_infers_canonical_name() -> None:
    # Mock initial search results
    results = [
        {
            "url": "https://www.chewy.com/advantage-ii-large-cat",
            "title": "Advantage II Large Cat Flea Treatment",
            "description": "Bayer Advantage II for Cats over 9 lbs."
        },
        {
            "url": "https://www.amazon.com/Advantage-II-Flea-Prevention-Large/dp/B004QNKV60",
            "title": "Amazon.com: Advantage II Flea Prevention for Large Cats",
            "description": "Advantage II by Elanco (Bayer)."
        }
    ]

    mock_response = MagicMock()
    mock_response.text = "Bayer Advantage II Large Cat"
    mock_response.usage = MagicMock(prompt_tokens=100, completion_tokens=10)

    consolidator = NameConsolidator(api_key="test-key")
    assert consolidator.provider is not None
    consolidator.provider.generate_text = AsyncMock(return_value=mock_response)

    consolidated_name, cost = await consolidator.consolidate_name(
        sku="84170364",
        abbreviated_name="ADVNTG II CAT LRG",
        search_snippets=results
    )

    assert consolidated_name == "Bayer Advantage II Large Cat"
    assert cost > 0


@pytest.mark.asyncio
async def test_name_consolidator_uses_specific_snippet_candidate_when_llm_is_too_generic() -> None:
    results = [
        {
            "url": "https://arett.com/item/B104+HTG001/Bentley-Seed-Tomato-Jubilee-1943",
            "title": "Bentley Seed Tomato Jubilee 1943 - B104 HTG001 - Arett Sales",
            "description": "Fresh crop non-gmo seed packets.",
        },
        {
            "url": "https://arett.com/products/seed-starting",
            "title": "Seed Starting - Page 1 of 43 - Arett",
            "description": "Seed starting catalog page.",
        },
    ]

    mock_response = MagicMock()
    mock_response.text = "Bentley Seed"
    mock_response.usage = MagicMock(prompt_tokens=120, completion_tokens=4)

    consolidator = NameConsolidator(api_key="test-key")
    assert consolidator.provider is not None
    consolidator.provider.generate_text = AsyncMock(return_value=mock_response)

    consolidated_name, cost = await consolidator.consolidate_name(
        sku="051588178896",
        abbreviated_name="BENTLEY SEED TOMATO JUBILEE",
        search_snippets=results,
    )

    assert consolidated_name == "Bentley Seed Tomato Jubilee 1943"
    assert cost > 0


@pytest.mark.asyncio
async def test_name_consolidator_returns_original_if_llm_fails() -> None:
    consolidator = NameConsolidator(api_key="test-key")
    assert consolidator.provider is not None
    consolidator.provider.generate_text = AsyncMock(side_effect=Exception("API Error"))

    consolidated_name, cost = await consolidator.consolidate_name(
        sku="123",
        abbreviated_name="ABBRV NAME",
        search_snippets=[{"title": "One", "description": "Two"}]
    )

    assert consolidated_name == "ABBRV NAME"
    assert cost == 0.0


@pytest.mark.asyncio
async def test_name_consolidator_disables_llm_after_auth_failure() -> None:
    results = [
        {
            "url": "https://www.chewy.com/advantage-ii-large-cat",
            "title": "Advantage II Large Cat Flea Treatment",
            "description": "Bayer Advantage II for Cats over 9 lbs.",
        }
    ]

    consolidator = NameConsolidator(api_key="test-key")
    assert consolidator.provider is not None
    consolidator.provider.generate_text = AsyncMock(
        side_effect=Exception("Error code: 401 - {'error': {'code': 'invalid_api_key'}}")
    )

    first_name, first_cost = await consolidator.consolidate_name(
        sku="84170364",
        abbreviated_name="ADVNTG II CAT LRG",
        search_snippets=results,
    )
    second_name, second_cost = await consolidator.consolidate_name(
        sku="84170364",
        abbreviated_name="ADVNTG II CAT LRG",
        search_snippets=results,
    )

    assert consolidator.provider.generate_text.await_count == 1
    assert consolidator._auth_failed is True
    assert first_name == "Advantage II Large Cat Flea Treatment"
    assert second_name == "Advantage II Large Cat Flea Treatment"
    assert first_cost == 0.0
    assert second_cost == 0.0
