"""Unit tests for prompt loading helpers used by Crawl4AI extraction."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor
from scrapers.utils.ai_utils import (
    _PROMPT_CACHE,
    build_extraction_instruction,
    get_hardcoded_prompt,
    load_prompt_from_file,
)


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


@pytest.fixture(autouse=True)
def clear_prompt_cache():
    """Keep prompt cache isolated between tests."""
    original_cache = _PROMPT_CACHE.copy()
    _PROMPT_CACHE.clear()
    try:
        yield
    finally:
        _PROMPT_CACHE.clear()
        _PROMPT_CACHE.update(original_cache)


class TestPromptLoading:
    """Tests for prompt loading from files."""

    def test_load_v1_prompt_from_file(self):
        prompt = load_prompt_from_file("v1")

        assert prompt is not None
        assert "Extract structured product data for a single SKU-locked product page" in prompt
        assert "{sku}" in prompt
        assert "{brand" in prompt
        assert "{product_name" in prompt

    def test_load_v2_prompt_from_file(self):
        prompt = load_prompt_from_file("v2")

        assert prompt is not None
        assert "Extract structured product data for a single SKU-locked product page" in prompt
        assert "PRICE NORMALIZATION" in prompt
        assert "AVAILABILITY NORMALIZATION" in prompt
        assert "price: required" in prompt
        assert "availability: required" in prompt

    def test_load_v4_prompt_from_file(self):
        prompt = load_prompt_from_file("v4")

        assert prompt is not None
        assert "Use only evidence from the current page." in prompt
        assert "soft hint" in prompt.lower()
        assert "price normalization" not in prompt.lower()
        assert "availability normalization" not in prompt.lower()

    def test_fallback_to_hardcoded_when_file_missing(self):
        with patch.object(Path, "exists", return_value=False):
            prompt = load_prompt_from_file("nonexistent")
            assert prompt is None

        instruction = build_extraction_instruction(
            sku="TEST123",
            brand="TestBrand",
            product_name="Test Product",
            prompt_version="nonexistent",
        )

        assert "Extract structured product data for a single product detail page" in instruction
        assert "TEST123" in instruction
        assert "TestBrand" in instruction
        assert "Test Product" in instruction

    def test_caching_works(self):
        prompt1 = load_prompt_from_file("v1")
        assert prompt1 is not None
        assert "v1" in _PROMPT_CACHE

        _PROMPT_CACHE["v1"] = "CACHED PROMPT"

        prompt2 = load_prompt_from_file("v1")
        assert prompt2 == "CACHED PROMPT"

    def test_variable_substitution_sku(self):
        instruction = build_extraction_instruction(sku="SKU12345", brand=None, product_name=None)

        assert "SKU12345" in instruction
        assert "Unknown" in instruction

    def test_variable_substitution_brand(self):
        instruction = build_extraction_instruction(sku="SKU12345", brand="Acme Brand", product_name=None)

        assert "Acme Brand" in instruction

    def test_variable_substitution_product_name(self):
        instruction = build_extraction_instruction(sku="SKU12345", brand=None, product_name="Amazing Product")

        assert "Amazing Product" in instruction

    def test_variable_substitution_all_fields(self):
        instruction = build_extraction_instruction(
            sku="ABC-123-XYZ",
            brand="Premium Brand",
            product_name="Super Widget Pro",
        )

        assert "ABC-123-XYZ" in instruction
        assert "Premium Brand" in instruction
        assert "Super Widget Pro" in instruction

    def test_comment_lines_removed_from_prompt(self):
        prompt = load_prompt_from_file("v1")

        assert prompt is not None
        assert "# Prompt Version:" not in prompt
        assert "# Extracted from:" not in prompt
        assert "# Date:" not in prompt

    def test_v2_prompt_has_differences_from_v1(self):
        v1_prompt = load_prompt_from_file("v1")
        v2_prompt = load_prompt_from_file("v2")

        assert v1_prompt is not None
        assert v2_prompt is not None
        assert "PRICE NORMALIZATION" in v2_prompt
        assert "price: required" in v2_prompt
        assert "PRICE NORMALIZATION" not in v1_prompt


class TestHardcodedPrompt:
    """Tests for hardcoded prompt fallback."""

    def test_hardcoded_prompt_returns_valid_content(self):
        prompt = get_hardcoded_prompt()

        assert isinstance(prompt, str)
        assert prompt
        assert "Extract structured product data" in prompt

    def test_hardcoded_prompt_has_all_placeholders(self):
        prompt = get_hardcoded_prompt()

        assert "{sku}" in prompt
        assert "{brand}" in prompt
        assert "{product_name}" in prompt

    def test_hardcoded_prompt_is_schema_aligned(self):
        prompt = get_hardcoded_prompt().lower()

        assert "product_name" in prompt
        assert "size_metrics" in prompt
        assert "categories" in prompt
        assert "price normalization" not in prompt
        assert "availability normalization" not in prompt


class TestPromptVersionHandling:
    """Tests for prompt version handling."""

    def test_default_prompt_version_is_v1(self, extractor):
        assert extractor.prompt_version == "v1"

    def test_custom_prompt_version(self, mock_scoring, mock_matching):
        ext = Crawl4AIExtractor(
            headless=True,
            llm_model="gpt-4o-mini",
            scoring=mock_scoring,
            matching=mock_matching,
            prompt_version="v2",
        )

        assert ext.prompt_version == "v2"
        prompt = load_prompt_from_file("v2")
        assert prompt is not None
        assert "PRICE NORMALIZATION" in prompt

    def test_fstring_syntax_conversion(self):
        instruction = build_extraction_instruction(sku="TEST-SKU", brand=None, product_name=None)

        assert "TEST-SKU" in instruction
        assert "Unknown" in instruction
        assert '{brand or "Unknown"}' not in instruction
        assert '{product_name or "Unknown"}' not in instruction
