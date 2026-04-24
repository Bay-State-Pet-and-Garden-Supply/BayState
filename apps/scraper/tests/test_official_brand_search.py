import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch

from scrapers.ai_search.query_builder import QueryBuilder
from scrapers.ai_search.scoring import BrandSourceSelector
from scrapers.providers.base import ProviderResponse, ProviderUsage


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
    """Test that score_snippet uses the provider/factory pattern and parses JSON response."""
    mock_provider = AsyncMock()
    mock_provider.generate_text.return_value = ProviderResponse(
        text=json.dumps({
            "is_official": True,
            "confidence_score": 0.95,
            "reason": "Official domain match and corporate signals found.",
        }),
        usage=ProviderUsage(prompt_tokens=100, completion_tokens=50, total_tokens=150),
    )

    mock_factory = MagicMock(return_value=mock_provider)

    with patch("scrapers.ai_search.scoring.create_llm_provider", mock_factory, create=True):
        selector = BrandSourceSelector(api_key="test_key")

        result = await selector.score_snippet(
            url="https://www.scotts.com/en-us/products",
            snippet="Scotts Official Store - Buy Lawn Care Products",
            brand="Scotts",
        )

        assert result["is_official"] is True
        assert result["confidence_score"] == 0.95
        assert result["reason"] == "Official domain match and corporate signals found."

        mock_provider.generate_text.assert_called_once()
        call_kwargs = mock_provider.generate_text.call_args.kwargs
        assert "Scotts" in call_kwargs["user_prompt"]


@pytest.mark.asyncio
async def test_brand_source_selector_error_fallback():
    """Test that score_snippet returns fallback dict on provider exception.

    When the provider raises an exception, score_snippet must return
    {"is_official": False, "confidence_score": 0.0, "reason": <error message>}.
    """
    mock_provider = AsyncMock()
    mock_provider.generate_text.side_effect = Exception("API connection failed")

    mock_factory = MagicMock(return_value=mock_provider)

    with patch("scrapers.ai_search.scoring.create_llm_provider", mock_factory, create=True):
        selector = BrandSourceSelector(api_key="test_key")

        result = await selector.score_snippet(
            url="https://www.scotts.com/en-us/products",
            snippet="Scotts Official Store - Buy Lawn Care Products",
            brand="Scotts",
        )

        assert result["is_official"] is False
        assert result["confidence_score"] == 0.0
        assert "API connection failed" in result["reason"]


@pytest.mark.asyncio
async def test_brand_source_selector_response_format_json():
    """Test that score_snippet preserves JSON response format behavior via provider.

    The response_format={"type": "json_object"} behavior is handled by the provider
    layer. This test verifies that JSON parsing produces the expected keys and types.
    """
    mock_provider = AsyncMock()
    mock_provider.generate_text.return_value = ProviderResponse(
        text=json.dumps({
            "is_official": False,
            "confidence_score": 0.3,
            "reason": "Third-party retailer with no corporate signals.",
        }),
        usage=ProviderUsage(prompt_tokens=80, completion_tokens=40, total_tokens=120),
    )

    mock_factory = MagicMock(return_value=mock_provider)

    with patch("scrapers.ai_search.scoring.create_llm_provider", mock_factory, create=True):
        selector = BrandSourceSelector(api_key="test_key")

        result = await selector.score_snippet(
            url="https://www.amazon.com/scotts-turf-builder",
            snippet="Scotts Turf Builder - Buy at Amazon",
            brand="Scotts",
        )

        assert "is_official" in result
        assert "confidence_score" in result
        assert "reason" in result
        assert isinstance(result["is_official"], bool)
        assert isinstance(result["confidence_score"], (int, float))
        assert isinstance(result["reason"], str)
        assert result["is_official"] is False
        assert result["confidence_score"] == 0.3

        mock_provider.generate_text.assert_called_once()