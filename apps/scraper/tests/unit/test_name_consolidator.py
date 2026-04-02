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
    
    # Mock OpenAI response
    mock_response = MagicMock()
    mock_response.choices = [
        MagicMock(message=MagicMock(content="Bayer Advantage II Large Cat"))
    ]
    mock_response.usage = MagicMock(prompt_tokens=100, completion_tokens=10)
    
    consolidator = NameConsolidator(api_key="test-key")
    assert consolidator.client is not None
    consolidator.client.chat.completions.create = AsyncMock(return_value=mock_response)

    consolidated_name, cost = await consolidator.consolidate_name(
        sku="84170364",
        abbreviated_name="ADVNTG II CAT LRG",
        search_snippets=results
    )
    
    assert consolidated_name == "Bayer Advantage II Large Cat"
    assert cost > 0

@pytest.mark.asyncio
async def test_name_consolidator_returns_original_if_llm_fails() -> None:
    consolidator = NameConsolidator(api_key="test-key")
    assert consolidator.client is not None
    consolidator.client.chat.completions.create = AsyncMock(side_effect=Exception("API Error"))

    consolidated_name, cost = await consolidator.consolidate_name(
        sku="123",
        abbreviated_name="ABBRV NAME",
        search_snippets=[{"title": "One", "description": "Two"}]
    )
    
    assert consolidated_name == "ABBRV NAME"
    assert cost == 0.0
