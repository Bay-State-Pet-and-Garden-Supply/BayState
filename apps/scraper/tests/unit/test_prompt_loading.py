"""Unit tests for prompt loading functionality in Crawl4AIExtractor."""

from __future__ import annotations

import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor


@pytest.fixture
def mock_scoring():
    """Create a mock SearchScorer."""
    return MagicMock()


@pytest.fixture
def mock_matching():
    """Create a mock MatchingUtils."""
    return MagicMock()


@pytest.fixture
def extractor(mock_scoring, mock_matching):
    """Create a Crawl4AIExtractor instance."""
    return Crawl4AIExtractor(
        headless=True,
        llm_model="gpt-4o-mini",
        scoring=mock_scoring,
        matching=mock_matching,
    )


class TestPromptLoading:
    """Tests for prompt loading from files."""

    def test_load_v1_prompt_from_file(self, extractor):
        """Test loading v1 prompt from file."""
        prompt = extractor._load_prompt_from_file("v1")

        assert prompt is not None
        assert "Extract structured product data for a single SKU-locked product page" in prompt
        assert "{sku}" in prompt
        assert "{brand" in prompt
        assert "{product_name" in prompt

    def test_load_v2_prompt_from_file(self, extractor):
        """Test loading v2 prompt from file."""
        prompt = extractor._load_prompt_from_file("v2")

        assert prompt is not None
        assert "Extract structured product data for a single SKU-locked product page" in prompt
        assert "PRICE NORMALIZATION" in prompt
        assert "AVAILABILITY NORMALIZATION" in prompt
        # v2 should have price and availability as required fields
        assert "price: required" in prompt
        assert "availability: required" in prompt

    def test_fallback_to_hardcoded_when_file_missing(self, extractor):
        """Test fallback to hardcoded prompt when file doesn't exist."""
        # Clear the cache to ensure we test the actual file loading
        from scrapers.ai_search.crawl4ai_extractor import _PROMPT_CACHE

        original_cache = _PROMPT_CACHE.copy()
        _PROMPT_CACHE.clear()

        try:
            with patch.object(Path, "exists", return_value=False):
                prompt = extractor._load_prompt_from_file("nonexistent")
                assert prompt is None

            # Now test that _build_instruction falls back to hardcoded
            instruction = extractor._build_instruction(sku="TEST123", brand="TestBrand", product_name="Test Product")

            # The hardcoded prompt should be used as fallback
            assert "Extract structured product data for a single SKU-locked product page" in instruction
            assert "TEST123" in instruction
            assert "TestBrand" in instruction
            assert "Test Product" in instruction
        finally:
            # Restore cache
            _PROMPT_CACHE.clear()
            _PROMPT_CACHE.update(original_cache)

    def test_caching_works(self, extractor):
        """Test that caching works - second load uses cache."""
        from scrapers.ai_search.crawl4ai_extractor import _PROMPT_CACHE

        # Clear cache first
        _PROMPT_CACHE.clear()

        # First load
        prompt1 = extractor._load_prompt_from_file("v1")
        assert prompt1 is not None

        # Verify it's in the cache
        assert "v1" in _PROMPT_CACHE

        # Modify the cache to verify it's being used
        _PROMPT_CACHE["v1"] = "CACHED PROMPT"

        # Second load should return cached version
        prompt2 = extractor._load_prompt_from_file("v1")
        assert prompt2 == "CACHED PROMPT"

        # Clean up
        _PROMPT_CACHE.clear()

    def test_variable_substitution_sku(self, extractor):
        """Test that {sku} variable is substituted correctly."""
        instruction = extractor._build_instruction(sku="SKU12345", brand=None, product_name=None)

        assert "SKU12345" in instruction
        # Should use default "Unknown" for None values
        assert "Unknown" in instruction

    def test_variable_substitution_brand(self, extractor):
        """Test that {brand} variable is substituted correctly."""
        instruction = extractor._build_instruction(sku="SKU12345", brand="Acme Brand", product_name=None)

        assert "Acme Brand" in instruction

    def test_variable_substitution_product_name(self, extractor):
        """Test that {product_name} variable is substituted correctly."""
        instruction = extractor._build_instruction(sku="SKU12345", brand=None, product_name="Amazing Product")

        assert "Amazing Product" in instruction

    def test_variable_substitution_all_fields(self, extractor):
        """Test substitution of all variables."""
        instruction = extractor._build_instruction(sku="ABC-123-XYZ", brand="Premium Brand", product_name="Super Widget Pro")

        assert "ABC-123-XYZ" in instruction
        assert "Premium Brand" in instruction
        assert "Super Widget Pro" in instruction

    def test_comment_lines_removed_from_prompt(self, extractor):
        """Test that comment lines (starting with #) are removed from prompt files."""
        prompt = extractor._load_prompt_from_file("v1")

        # Comment lines should be removed
        assert "# Prompt Version:" not in prompt
        assert "# Extracted from:" not in prompt
        assert "# Date:" not in prompt

    def test_v2_prompt_has_differences_from_v1(self, extractor):
        """Test that v2 prompt has expected differences from v1."""
        v1_prompt = extractor._load_prompt_from_file("v1")
        v2_prompt = extractor._load_prompt_from_file("v2")

        # v2 should have price and availability requirements that v1 doesn't
        assert "PRICE NORMALIZATION" in v2_prompt
        assert "price: required" in v2_prompt

        # v1 doesn't have these
        assert "PRICE NORMALIZATION" not in v1_prompt


class TestHardcodedPrompt:
    """Tests for hardcoded prompt fallback."""

    def test_hardcoded_prompt_returns_valid_content(self, extractor):
        """Test that hardcoded prompt returns valid content."""
        prompt = extractor._get_hardcoded_prompt()

        assert prompt is not None
        assert isinstance(prompt, str)
        assert len(prompt) > 0
        assert "Extract structured product data" in prompt

    def test_hardcoded_prompt_has_all_placeholders(self, extractor):
        """Test that hardcoded prompt has all required placeholders."""
        prompt = extractor._get_hardcoded_prompt()

        assert "{sku}" in prompt
        assert "{brand}" in prompt
        assert "{product_name}" in prompt


class TestPromptVersionHandling:
    """Tests for prompt version handling."""

    def test_default_prompt_version_is_v1(self, extractor):
        """Test that default prompt version is v1."""
        assert extractor.prompt_version == "v1"

    def test_custom_prompt_version(self, mock_scoring, mock_matching):
        """Test that custom prompt version can be set."""
        ext = Crawl4AIExtractor(headless=True, llm_model="gpt-4o-mini", scoring=mock_scoring, matching=mock_matching, prompt_version="v2")

        assert ext.prompt_version == "v2"

        # Verify it loads v2 prompt
        prompt = ext._load_prompt_from_file("v2")
        assert prompt is not None
        assert "PRICE NORMALIZATION" in prompt

    def test_fstring_syntax_conversion(self, extractor):
        """Test that f-string syntax in prompt files is converted for .format()."""
        # The v1 and v2 prompt files use f-string syntax like {brand or "Unknown"}
        # The _build_instruction should convert these to work with .format()
        instruction = extractor._build_instruction(sku="TEST-SKU", brand=None, product_name=None)

        # The converted syntax should work without errors
        # and produce output with "Unknown" as the default
        assert "TEST-SKU" in instruction
