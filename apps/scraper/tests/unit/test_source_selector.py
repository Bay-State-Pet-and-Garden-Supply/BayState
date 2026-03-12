import pytest
from unittest.mock import MagicMock, patch
from scrapers.ai_search.source_selector import LLMSourceSelector

@pytest.mark.asyncio
async def test_llm_source_selector_picks_official_site() -> None:
    # Mock search results
    results = [
        {
            "url": "https://www.amazon.com/dp/B00001",
            "title": "Advantage II Large Cat - Amazon.com",
            "description": "Buy Advantage II for cats on Amazon."
        },
        {
            "url": "https://www.elanco.com/en-us/products/advantage-ii-cats",
            "title": "Advantage II | Elanco Product Page",
            "description": "Official product page for Advantage II flea treatment."
        },
        {
            "url": "https://www.chewy.com/advantage-ii",
            "title": "Advantage II for Cats - Chewy.com",
            "description": "Chewy has Advantage II in stock."
        }
    ]
    
    # Mock OpenAI response
    mock_response = MagicMock()
    mock_response.choices = [
        MagicMock(message=MagicMock(content="https://www.elanco.com/en-us/products/advantage-ii-cats"))
    ]
    mock_response.usage = MagicMock(prompt_tokens=100, completion_tokens=20)
    
    with patch("openai.resources.chat.Completions.create", return_value=mock_response):
        selector = LLMSourceSelector(api_key="test-key")
        best_url, cost = await selector.select_best_url(
            results=results,
            sku="84170364",
            product_name="ADVNTG II CAT LRG"
        )
        
        assert best_url == "https://www.elanco.com/en-us/products/advantage-ii-cats"
        assert cost > 0

@pytest.mark.asyncio
async def test_llm_source_selector_returns_none_if_no_clear_winner() -> None:
    results = [
        {"url": "https://example1.com", "title": "Random 1", "description": "Desc 1"},
        {"url": "https://example2.com", "title": "Random 2", "description": "Desc 2"}
    ]
    
    mock_response = MagicMock()
    mock_response.choices = [
        MagicMock(message=MagicMock(content="NONE"))
    ]
    mock_response.usage = MagicMock(prompt_tokens=50, completion_tokens=5)
    
    with patch("openai.resources.chat.Completions.create", return_value=mock_response):
        selector = LLMSourceSelector(api_key="test-key")
        best_url, cost = await selector.select_best_url(
            results=results,
            sku="123",
            product_name="Unknown Product"
        )
        
        assert best_url is None

@pytest.mark.asyncio
async def test_llm_source_selector_handles_openai_error() -> None:
    results = [{"url": "https://example.com", "title": "Title", "description": "Desc"}]
    
    with patch("openai.resources.chat.Completions.create", side_effect=Exception("API Error")):
        selector = LLMSourceSelector(api_key="test-key")
        best_url, cost = await selector.select_best_url(
            results=results,
            sku="123",
            product_name="Name"
        )
        
        assert best_url is None
        assert cost == 0.0
