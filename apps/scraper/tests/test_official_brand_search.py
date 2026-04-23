import pytest
import json
from unittest.mock import AsyncMock, patch
from scrapers.ai_search.query_builder import QueryBuilder
from scrapers.ai_search.scoring import BrandSourceSelector

def test_build_brand_focused_query():
    builder = QueryBuilder()
    base_query = "Scotts Turf Builder"
    exclusions = ["amazon.com", "ebay.com"]
    
    query = builder.build_brand_focused_query(base_query, exclusions)
    
    assert "Scotts Turf Builder" in query
    assert "-site:amazon.com" in query
    assert "-site:ebay.com" in query

@pytest.mark.asyncio
async def test_brand_source_selector_score_snippet():
    selector = BrandSourceSelector(api_key="test_key")
    
    # Mock litellm.acompletion
    mock_response = AsyncMock()
    mock_response.choices = [
        AsyncMock(message=AsyncMock(content=json.dumps({
            "is_official": True,
            "confidence_score": 0.95,
            "reason": "Official domain match and corporate signals found."
        })))
    ]
    
    with patch("litellm.acompletion", return_value=mock_response) as mock_completion:
        result = await selector.score_snippet(
            url="https://www.scotts.com/en-us/products",
            snippet="Scotts Official Store - Buy Lawn Care Products",
            brand="Scotts"
        )
        
        assert result["is_official"] is True
        assert result["confidence_score"] == 0.95
        assert result["reason"] == "Official domain match and corporate signals found."
        
        mock_completion.assert_called_once()
        args, kwargs = mock_completion.call_args
        assert kwargs["model"] == "gpt-4o-mini"
        assert kwargs["response_format"] == {"type": "json_object"}
        assert "Scotts" in kwargs["messages"][0]["content"]
