"""Unit tests for OfficialBrandScraper._consolidate_product_name (Phase 1.5).

These tests mock create_llm_provider to avoid real API calls and verify
both the success path and fallback behavior.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper
from scrapers.providers.base import ProviderResponse


@pytest.fixture
def scraper() -> OfficialBrandScraper:
    """Create a scraper with mocked search client."""
    with patch("scrapers.ai_search.official_brand_scraper.SearchClient"):
        with patch("scrapers.ai_search.official_brand_scraper.BrandSourceSelector"):
            return OfficialBrandScraper(
                llm_provider="openai",
                llm_model="gpt-4o-mini",
                llm_api_key="test-key",
            )


def _make_mock_provider(json_response: str | None = None, should_raise: bool = False) -> MagicMock:
    """Build a mock LLM provider for testing.

    Args:
        json_response: The JSON string to return from generate_text, or None for a default.
        should_raise: If True, generate_text raises an exception.

    Returns:
        A configured MagicMock that satisfies the BaseLLMProvider interface.
    """
    provider = MagicMock()
    if should_raise:
        provider.generate_text = AsyncMock(side_effect=RuntimeError("LLM API error"))
    else:
        payload = json_response or '{"predicted_name": "LLM Consolidated Product Name"}'
        provider.generate_text = AsyncMock(
            return_value=ProviderResponse(text=payload)
        )
    return provider


class TestConsolidateProductNameSuccess:
    """Tests for the happy path: LLM returns valid JSON."""

    @pytest.mark.asyncio
    async def test_returns_llm_predicted_name(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When LLM returns valid JSON with predicted_name, that value should be returned."""
        mock_provider = _make_mock_provider()
        with patch(
            "scrapers.providers.factory.create_llm_provider",
            return_value=mock_provider,
        ):
            result = await scraper._consolidate_product_name(
                register_name="RAW PRODUCT NAME",
                brand="TestBrand",
                search_titles=["TestBrand Product 123", "Official TestBrand Product"],
            )

        assert result == "LLM Consolidated Product Name"
        mock_provider.generate_text.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_passes_correct_prompt(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """The prompt should include the raw name, brand, and search result titles."""
        mock_provider = _make_mock_provider()
        with patch(
            "scrapers.providers.factory.create_llm_provider",
            return_value=mock_provider,
        ):
            await scraper._consolidate_product_name(
                register_name="Miracle-Gro Potting Mix",
                brand="Miracle-Gro",
                search_titles=[
                    "Miracle-Gro Potting Mix 25 qt.",
                    "Miracle-Gro 25 qt. Potting Mix at Home Depot",
                    "Buy Miracle-Gro Potting Mix",
                ],
            )

        mock_provider.generate_text.assert_awaited_once()
        call_kwargs = mock_provider.generate_text.call_args[1]
        prompt = call_kwargs["user_prompt"]
        assert "Miracle-Gro Potting Mix" in prompt
        assert "Miracle-Gro" in prompt
        assert "Miracle-Gro Potting Mix 25 qt." in prompt

    @pytest.mark.asyncio
    async def test_limits_titles_to_eight(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """Only the first 8 search titles should be included in the LLM prompt."""
        mock_provider = _make_mock_provider()
        many_titles = [f"Title {i}" for i in range(20)]
        with patch(
            "scrapers.providers.factory.create_llm_provider",
            return_value=mock_provider,
        ):
            await scraper._consolidate_product_name(
                register_name="Test",
                brand="Brand",
                search_titles=many_titles,
            )

        call_kwargs = mock_provider.generate_text.call_args[1]
        prompt = call_kwargs["user_prompt"]
        # Only 8 titles should be present
        for i in range(8):
            assert f"Title {i}" in prompt
        assert "Title 8" not in prompt
        assert "Title 19" not in prompt


class TestConsolidateProductNameFallback:
    """Tests for the fallback path: LLM fails or returns invalid JSON."""

    @pytest.mark.asyncio
    async def test_falls_back_when_llm_raises(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When LLM raises an exception, should fall back to register_name."""
        mock_provider = _make_mock_provider(should_raise=True)
        with patch(
            "scrapers.providers.factory.create_llm_provider",
            return_value=mock_provider,
        ):
            result = await scraper._consolidate_product_name(
                register_name="RAW PRODUCT NAME",
                brand="TestBrand",
                search_titles=["Title 1", "Title 2"],
            )

        assert result == "RAW PRODUCT NAME"

    @pytest.mark.asyncio
    async def test_falls_back_when_llm_returns_invalid_json(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When LLM returns non-JSON text, should fall back to register_name."""
        mock_provider = _make_mock_provider(json_response="This is not JSON")
        with patch(
            "scrapers.providers.factory.create_llm_provider",
            return_value=mock_provider,
        ):
            result = await scraper._consolidate_product_name(
                register_name="RAW PRODUCT NAME",
                brand="TestBrand",
                search_titles=["Title 1"],
            )

        assert result == "RAW PRODUCT NAME"

    @pytest.mark.asyncio
    async def test_falls_back_when_llm_returns_json_missing_predicted_name(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When LLM returns valid JSON but missing predicted_name key, fall back."""
        mock_provider = _make_mock_provider(json_response='{"other_key": "value"}')
        with patch(
            "scrapers.providers.factory.create_llm_provider",
            return_value=mock_provider,
        ):
            result = await scraper._consolidate_product_name(
                register_name="RAW PRODUCT NAME",
                brand="TestBrand",
                search_titles=["Title 1"],
            )

        assert result == "RAW PRODUCT NAME"

    @pytest.mark.asyncio
    async def test_falls_back_when_predicted_name_is_empty_string(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When LLM returns predicted_name as empty string, fall back."""
        mock_provider = _make_mock_provider(json_response='{"predicted_name": ""}')
        with patch(
            "scrapers.providers.factory.create_llm_provider",
            return_value=mock_provider,
        ):
            result = await scraper._consolidate_product_name(
                register_name="RAW PRODUCT NAME",
                brand="TestBrand",
                search_titles=["Title 1"],
            )

        assert result == "RAW PRODUCT NAME"

    @pytest.mark.asyncio
    async def test_falls_back_from_llm_to_register_name_when_brand_empty(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When register_name is provided and LLM fails, register_name is the fallback."""
        mock_provider = _make_mock_provider(should_raise=True)
        with patch(
            "scrapers.providers.factory.create_llm_provider",
            return_value=mock_provider,
        ):
            result = await scraper._consolidate_product_name(
                register_name="Register Name Only",
                brand="",
                search_titles=["Title 1"],
            )

        assert result == "Register Name Only"

    @pytest.mark.asyncio
    async def test_returns_empty_when_both_register_name_and_brand_empty(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When both register_name and brand are empty, should return empty string."""
        mock_provider = _make_mock_provider()
        with patch(
            "scrapers.providers.factory.create_llm_provider",
            return_value=mock_provider,
        ):
            result = await scraper._consolidate_product_name(
                register_name="",
                brand="",
                search_titles=["Title 1"],
            )

        assert result == ""


class TestConsolidateProductNameNoProvider:
    """Tests for when create_llm_provider returns None."""

    @pytest.mark.asyncio
    async def test_falls_back_when_no_provider_returned(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When create_llm_provider returns None, fall back to register_name."""
        with patch(
            "scrapers.providers.factory.create_llm_provider",
            return_value=None,
        ):
            result = await scraper._consolidate_product_name(
                register_name="RAW PRODUCT NAME",
                brand="TestBrand",
                search_titles=["Title 1"],
            )

        assert result == "RAW PRODUCT NAME"

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_provider_and_no_register_name(
        self, scraper: OfficialBrandScraper
    ) -> None:
        """When LLM provider is None and register_name is empty, return empty string."""
        with patch(
            "scrapers.providers.factory.create_llm_provider",
            return_value=None,
        ):
            result = await scraper._consolidate_product_name(
                register_name="",
                brand="TestBrand",
                search_titles=["Title 1"],
            )

        assert result == ""
