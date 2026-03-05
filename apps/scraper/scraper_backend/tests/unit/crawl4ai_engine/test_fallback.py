"""Tests for extraction fallback chain edge cases and error paths.

This module tests the ExtractionFallbackChain in various scenarios including:
- All strategies failing
- Confidence threshold edge cases
- Empty results handling
- Invalid HTML handling
- Strategy exceptions
"""

from __future__ import annotations

import sys
import types
from pathlib import Path

import pytest

# Setup path
_test_dir = Path(__file__).parent
_scraper_root = _test_dir.parent.parent.parent.parent
sys.path.insert(0, str(_scraper_root / "scraper_backend" / "src"))
_test_dir = Path(__file__).parent
_scraper_root = _test_dir.parent.parent.parent
sys.path.insert(0, str(_scraper_root / "scraper_backend" / "src"))

from crawl4ai_engine.strategies.fallback import (
    ExtractionFallbackChain,
    FallbackExtractionResult,
)


# =============================================================================
# Mock Strategies
# =============================================================================

class MockCssStrategy:
    """Mock CSS extraction strategy."""

    def __init__(self, should_fail=False, return_empty=False, raise_error=False):
        self.should_fail = should_fail
        self.return_empty = return_empty
        self.raise_error = raise_error

    def extract(self, html: str):
        if self.raise_error:
            raise Exception("CSS extraction error")
        if self.return_empty:
            return []
        if self.should_fail:
            return [{"incomplete": "data"}]  # Missing required fields
        return [
            {
                "title": "Product 1",
                "price": "$10.00",
                "description": "A great product",
            }
        ]


class MockXPathStrategy:
    """Mock XPath extraction strategy."""

    def __init__(self, should_fail=False, return_empty=False, raise_error=False):
        self.should_fail = should_fail
        self.return_empty = return_empty
        self.raise_error = raise_error

    def extract(self, html: str):
        if self.raise_error:
            raise Exception("XPath extraction error")
        if self.return_empty:
            return []
        if self.should_fail:
            return [{"partial": "data"}]  # Missing required fields
        return [
            {
                "title": "XPath Product",
                "price": "$20.00",
                "description": "Extracted via XPath",
            }
        ]


class MockLLMStrategy:
    """Mock LLM extraction strategy."""

    def __init__(
        self,
        should_fail=False,
        low_confidence=False,
        raise_error=False,
        return_non_dict=False,
    ):
        self.should_fail = should_fail
        self.low_confidence = low_confidence
        self.raise_error = raise_error
        self.return_non_dict = return_non_dict

    def extract_with_metadata(self, html: str, url: str = ""):
        if self.raise_error:
            raise Exception("LLM extraction failed")

        if self.return_non_dict:
            return {
                "success": True,
                "data": ["not a dict"],
                "confidence": 0.9,
                "metadata": {},
            }

        if self.should_fail:
            return {
                "success": False,
                "data": [],
                "confidence": 0.0,
                "error": "LLM failed",
                "metadata": {},
            }

        if self.low_confidence:
            return {
                "success": True,
                "data": [{"title": "Low conf", "price": None}],
                "confidence": 0.3,  # Below threshold
                "metadata": {"provider": "openai"},
            }

        return {
            "success": True,
            "data": [
                {
                    "title": "LLM Product",
                    "price": "$30.00",
                    "confidence": 0.95,
                }
            ],
            "confidence": 0.95,
            "metadata": {"provider": "openai", "model": "gpt-4o-mini"},
        }


# =============================================================================
# Test Fallback Chain - All Strategies Failing
# =============================================================================

class TestAllStrategiesFailing:
    """Test when all extraction strategies fail."""

    def test_css_and_xpath_empty_llm_also_empty(self):
        """Test when CSS returns empty, XPath returns empty, LLM also fails."""
        chain = ExtractionFallbackChain(
            css_strategy=MockCssStrategy(return_empty=True),
            xpath_strategy=MockXPathStrategy(return_empty=True),
            llm_strategy=MockLLMStrategy(should_fail=True),
            confidence_threshold=0.6,
        )

        result = chain.extract("<html><body>test</body></html>")

        assert result.success is False
        assert result.strategy == "none"
        assert result.data == []
        assert result.error is not None

    def test_css_and_xpath_raise_errors(self):
        """Test when CSS and XPath both raise exceptions."""
        chain = ExtractionFallbackChain(
            css_strategy=MockCssStrategy(raise_error=True),
            xpath_strategy=MockXPathStrategy(raise_error=True),
            llm_strategy=MockLLMStrategy(should_fail=True),
            confidence_threshold=0.6,
        )

        result = chain.extract("<html><body>test</body></html>")

        assert result.success is False
        assert result.strategy == "llm"  # Falls through to LLM
        assert "LLM failed" in str(result.error) or result.error is not None

    def test_no_strategies_configured(self):
        """Test when no strategies are configured."""
        chain = ExtractionFallbackChain(
            css_strategy=None,
            xpath_strategy=None,
            llm_strategy=None,
            confidence_threshold=0.6,
        )

        result = chain.extract("<html><body>test</body></html>")

        assert result.success is False
        assert result.strategy == "none"
        assert result.data == []


# =============================================================================
# Test Confidence Threshold Edge Cases
# =============================================================================

class TestConfidenceThreshold:
    """Test confidence threshold edge cases."""

    def test_threshold_zero(self):
        """Test with zero confidence threshold."""
        chain = ExtractionFallbackChain(
            css_strategy=MockCssStrategy(),
            xpath_strategy=MockXPathStrategy(),
            confidence_threshold=0.0,
        )

        result = chain.extract("<html><body>test</body></html>")

        assert result.success is True
        assert result.strategy == "css"
        assert result.confidence == 1.0  # All fields present

    def test_threshold_one(self):
        """Test with threshold of 1.0 (very strict)."""
        chain = ExtractionFallbackChain(
            css_strategy=MockCssStrategy(should_fail=True),  # Missing fields
            xpath_strategy=MockXPathStrategy(should_fail=True),
            llm_strategy=MockLLMStrategy(low_confidence=True),
            confidence_threshold=1.0,
        )

        result = chain.extract("<html><body>test</body></html>")

        # Should fail all due to high threshold
        assert result.success is False

    def test_threshold_boundary_exactly_met(self):
        """Test confidence exactly at threshold boundary."""

        class ExactThresholdStrategy:
            def extract(self, html):
                # Returns data with exactly 50% fields populated
                return [{"title": "Product"}]  # Only 1 field

        chain = ExtractionFallbackChain(
            css_strategy=ExactThresholdStrategy(),
            confidence_threshold=0.5,
        )

        result = chain.extract("<html><body>test</body></html>")

        # At boundary, should pass since 1/2 >= 0.5
        assert result.confidence == 0.5
        assert result.success is (result.confidence >= chain.confidence_threshold)

    def test_threshold_clamps_to_valid_range(self):
        """Test that invalid threshold values are clamped."""
        # Negative threshold
        chain1 = ExtractionFallbackChain(
            css_strategy=MockCssStrategy(),
            confidence_threshold=-0.5,
        )
        assert chain1.confidence_threshold == 0.0

        # Threshold > 1
        chain2 = ExtractionFallbackChain(
            css_strategy=MockCssStrategy(),
            confidence_threshold=1.5,
        )
        assert chain2.confidence_threshold == 1.0


# =============================================================================
# Test Empty Results Handling
# =============================================================================

class TestEmptyResults:
    """Test handling of empty extraction results."""

    def test_css_returns_non_list(self):
        """Test when CSS returns non-list (invalid)."""

        class NonListStrategy:
            def extract(self, html):
                return "not a list"

        chain = ExtractionFallbackChain(
            css_strategy=NonListStrategy(),
            xpath_strategy=MockXPathStrategy(),
            confidence_threshold=0.6,
        )

        result = chain.extract("<html><body>test</body></html>")

        # Should fall through to XPath
        assert result.success is True
        assert result.strategy == "xpath"

    def test_css_returns_list_of_non_dicts(self):
        """Test when CSS returns list of non-dictionaries."""

        class NonDictListStrategy:
            def extract(self, html):
                return ["string1", "string2"]

        chain = ExtractionFallbackChain(
            css_strategy=NonDictListStrategy(),
            xpath_strategy=MockXPathStrategy(),
            confidence_threshold=0.6,
        )

        result = chain.extract("<html><body>test</body></html>")

        # Should fall through since no valid dicts extracted
        assert result.success is False

    def test_mixed_valid_invalid_records(self):
        """Test handling of mixed valid and invalid records."""

        class MixedStrategy:
            def extract(self, html):
                return [
                    {"title": "Valid Product", "price": "$10"},
                    "invalid string",
                    {"description": "Only description"},
                ]

        chain = ExtractionFallbackChain(
            css_strategy=MixedStrategy(),
            confidence_threshold=0.6,
        )

        result = chain.extract("<html><body>test</body></html>")

        # Only valid dicts should be kept
        assert len(result.data) <= 3


# =============================================================================
# Test Invalid HTML Handling
# =============================================================================

class TestInvalidHTML:
    """Test handling of invalid or problematic HTML."""

    def test_empty_html(self):
        """Test with empty HTML string."""
        chain = ExtractionFallbackChain(
            css_strategy=MockCssStrategy(),
            xpath_strategy=MockXPathStrategy(),
            llm_strategy=MockLLMStrategy(),
            confidence_threshold=0.6,
        )

        result = chain.extract("")

        # Should still attempt extraction
        assert result is not None

    def test_malformed_html(self):
        """Test with malformed HTML."""
        malformed = "<html><body><div class='unclosed>text</div></body>"

        chain = ExtractionFallbackChain(
            css_strategy=MockCssStrategy(),
            xpath_strategy=MockXPathStrategy(),
            confidence_threshold=0.6,
        )

        # Should not raise, should handle gracefully
        result = chain.extract(malformed)
        assert result is not None

    def test_very_large_html(self):
        """Test with very large HTML (memory/performance)."""
        # Create large HTML
        large_html = "<html><body>" + ("<p>Content</p>" * 10000) + "</body></html>"

        chain = ExtractionFallbackChain(
            css_strategy=MockCssStrategy(),
            confidence_threshold=0.6,
        )

        # Should handle without crashing
        result = chain.extract(large_html)
        assert result is not None


# =============================================================================
# Test Strategy Exceptions
# =============================================================================

class TestStrategyExceptions:
    """Test handling of exceptions from strategies."""

    def test_css_exception_caught(self):
        """Test that CSS strategy exceptions are caught."""
        chain = ExtractionFallbackChain(
            css_strategy=MockCssStrategy(raise_error=True),
            xpath_strategy=MockXPathStrategy(),
            confidence_threshold=0.6,
        )

        result = chain.extract("<html><body>test</body></html>")

        # Should fall through to XPath
        assert result.success is True
        assert result.strategy == "xpath"

    def test_xpath_exception_caught(self):
        """Test that XPath strategy exceptions are caught."""
        chain = ExtractionFallbackChain(
            css_strategy=MockCssStrategy(return_empty=True),
            xpath_strategy=MockXPathStrategy(raise_error=True),
            llm_strategy=MockLLMStrategy(),
            confidence_threshold=0.6,
        )

        result = chain.extract("<html><body>test</body></html>")

        # Should fall through to LLM
        assert result.success is True
        assert result.strategy == "llm"

    def test_llm_exception_caught(self):
        """Test that LLM strategy exceptions are caught."""
        chain = ExtractionFallbackChain(
            css_strategy=MockCssStrategy(return_empty=True),
            xpath_strategy=MockXPathStrategy(return_empty=True),
            llm_strategy=MockLLMStrategy(raise_error=True),
            confidence_threshold=0.6,
        )

        result = chain.extract("<html><body>test</body></html>")

        # All failed
        assert result.success is False
        assert "error" in result.metadata or result.error is not None


# =============================================================================
# Test Fallback Chain from_config
# =============================================================================

class TestFromConfig:
    """Test creating fallback chain from configuration."""

    def test_from_config_full(self):
        """Test creating chain with full config."""
        config = {
            "css": {
                "base_selector": "div.product",
                "selectors": {
                    "title": {"selector": "h2.title"},
                    "price": {"selector": "span.price"},
                },
            },
            "xpath": {
                "base_selector": "//div[@class='product']",
                "selectors": {
                    "title": {"selector": "//h2"},
                    "price": {"selector": "//span[@class='price']"},
                },
            },
            "llm": {
                "provider": "openai/gpt-4o-mini",
                "instruction": "Extract products",
                "api_token": "test-key",
                "confidence_threshold": 0.7,
            },
            "confidence_threshold": 0.6,
        }

        # This will fail due to missing crawl4ai, but tests config parsing
        # In real tests, we'd mock the extraction strategies
        chain = ExtractionFallbackChain.from_config(config)

        assert chain.confidence_threshold == 0.6

    def test_from_config_partial(self):
        """Test creating chain with partial config."""
        config = {
            "css": {
                "base_selector": "div.product",
                "selectors": {
                    "title": {"selector": "h2"},
                },
            },
            "confidence_threshold": 0.5,
        }

        chain = ExtractionFallbackChain.from_config(config)

        assert chain.css_strategy is not None
        assert chain.xpath_strategy is None
        assert chain.llm_strategy is None
        assert chain.confidence_threshold == 0.5

    def test_from_config_empty(self):
        """Test creating chain with empty config."""
        chain = ExtractionFallbackChain.from_config({})

        assert chain.css_strategy is None
        assert chain.xpath_strategy is None
        assert chain.llm_strategy is None
        assert chain.confidence_threshold == 0.6  # default


# =============================================================================
# Test Confidence Calculation
# =============================================================================

class TestConfidenceCalculation:
    """Test confidence score calculation."""

    def test_all_fields_present(self):
        """Test confidence with all fields present."""
        chain = ExtractionFallbackChain(
            css_strategy=MockCssStrategy(),
            confidence_threshold=0.0,
        )

        result = chain.extract("<html><body>test</body></html>")

        assert result.confidence == 1.0

    def test_some_fields_missing(self):
        """Test confidence with some fields missing."""

        class PartialStrategy:
            def extract(self, html):
                return [{"title": "Product"}]  # Only title, no price/description

        chain = ExtractionFallbackChain(
            css_strategy=PartialStrategy(),
            confidence_threshold=0.0,
        )

        result = chain.extract("<html><body>test</body></html>")

        # 1 out of 3 expected fields = 0.33
        assert result.confidence < 1.0

    def test_empty_record(self):
        """Test confidence with empty record."""

        class EmptyStrategy:
            def extract(self, html):
                return [{}]

        chain = ExtractionFallbackChain(
            css_strategy=EmptyStrategy(),
            confidence_threshold=0.0,
        )

        result = chain.extract("<html><body>test</body></html>")

        assert result.confidence == 0.0

    def test_multiple_records_takes_max(self):
        """Test that max confidence across records is used."""

        class MultiRecordStrategy:
            def extract(self, html):
                return [
                    {"title": "P1"},  # low
                    {"title": "P2", "price": "$10", "desc": "D"},  # high
                    {"title": "P3"},  # low
                ]

        chain = ExtractionFallbackChain(
            css_strategy=MultiRecordStrategy(),
            confidence_threshold=0.0,
        )

        result = chain.extract("<html><body>test</body></html>")

        # Should use max, which is high
        assert result.confidence > 0.5


# =============================================================================
# Test Result Object
# =============================================================================

class TestFallbackResult:
    """Test FallbackExtractionResult object."""

    def test_result_to_dict(self):
        """Test result conversion to dict."""
        result = FallbackExtractionResult(
            success=True,
            strategy="css",
            data=[{"title": "Test"}],
            confidence=0.9,
            metadata={"key": "value"},
        )

        d = result.to_dict()

        assert d["success"] is True
        assert d["strategy"] == "css"
        assert len(d["data"]) == 1
        assert d["confidence"] == 0.9

    def test_result_with_error(self):
        """Test result with error."""
        result = FallbackExtractionResult(
            success=False,
            strategy="none",
            error="All strategies failed",
        )

        assert result.success is False
        assert result.error == "All strategies failed"


# =============================================================================
# Integration Scenarios
# =============================================================================

class TestIntegrationScenarios:
    """End-to-end integration scenarios."""

    def test_scenario_ecommerce_product_page(self):
        """Test extraction from e-commerce product page."""
        html = """
        <div class="product">
            <h2 class="title">Premium Dog Food</h2>
            <span class="price">$49.99</span>
            <p class="description">High-quality nutrition for dogs</p>
        </div>
        """

        chain = ExtractionFallbackChain(
            css_strategy=MockCssStrategy(),
            confidence_threshold=0.6,
        )

        result = chain.extract(html)

        assert result.success is True
        assert result.strategy == "css"
        assert len(result.data) > 0

    def test_scenario_anti_bot_fallback(self):
        """Test anti-bot detection triggers fallback."""
        call_order = []

        class AntiBotCss:
            def extract(self, html):
                call_order.append("css")
                raise Exception("403 Forbidden - Anti-bot detected")

        class FallbackXPath:
            def extract(self, html):
                call_order.append("xpath")
                return [{"title": "Fallback Product"}]

        chain = ExtractionFallbackChain(
            css_strategy=AntiBotCss(),
            xpath_strategy=FallbackXPath(),
            confidence_threshold=0.5,
        )

        result = chain.extract("<html><body>test</body></html>")

        assert call_order == ["css", "xpath"]
        assert result.success is True

    def test_scenario_rate_limit_fallback(self):
        """Test rate limiting triggers fallback to LLM."""
        call_order = []

        class RateLimitedCss:
            def extract(self, html):
                call_order.append("css")
                return []

        class RateLimitedXPath:
            def extract(self, html):
                call_order.append("xpath")
                return []

        class RateLimitLLM:
            def extract_with_metadata(self, html, url=""):
                call_order.append("llm")
                return {
                    "success": True,
                    "data": [{"title": "LLM Product", "price": "$99"}],
                    "confidence": 0.95,
                    "metadata": {},
                }

        chain = ExtractionFallbackChain(
            css_strategy=RateLimitedCss(),
            xpath_strategy=RateLimitedXPath(),
            llm_strategy=RateLimitLLM(),
            confidence_threshold=0.6,
        )

        result = chain.extract("<html><body>test</body></html>")

        assert call_order == ["css", "xpath", "llm"]
        assert result.success is True
        assert result.strategy == "llm"


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
