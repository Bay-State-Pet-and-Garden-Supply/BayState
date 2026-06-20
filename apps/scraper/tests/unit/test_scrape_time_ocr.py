"""Unit tests for scrape-time OCR helper module."""

from __future__ import annotations

import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from runner.scrape_time_ocr import (
    is_scrape_time_ocr_enabled,
    get_scrape_time_ocr_config,
    collect_source_images,
    apply_scrape_time_ocr,
)


class TestIsScrapeTimeOcrEnabled(unittest.TestCase):
    """Tests for IMAGE_OCR_ENABLED env gating."""

    def test_disabled_by_default(self):
        os.environ.pop("IMAGE_OCR_ENABLED", None)
        self.assertFalse(is_scrape_time_ocr_enabled())

    def test_enabled_explicit(self):
        os.environ["IMAGE_OCR_ENABLED"] = "true"
        self.assertTrue(is_scrape_time_ocr_enabled())

    def test_disabled_explicit(self):
        os.environ["IMAGE_OCR_ENABLED"] = "false"
        self.assertFalse(is_scrape_time_ocr_enabled())

    def test_enabled_1(self):
        os.environ["IMAGE_OCR_ENABLED"] = "1"
        self.assertTrue(is_scrape_time_ocr_enabled())

    def test_enabled_yes(self):
        os.environ["IMAGE_OCR_ENABLED"] = "yes"
        self.assertTrue(is_scrape_time_ocr_enabled())


class TestGetScrapeTimeOcrConfig(unittest.TestCase):
    """Tests for config resolution and fallbacks."""

    def setUp(self):
        os.environ.pop("IMAGE_OCR_MODEL", None)
        os.environ.pop("IMAGE_OCR_API_KEY", None)
        os.environ.pop("IMAGE_OCR_BASE_URL", None)
        os.environ.pop("IMAGE_OCR_MAX_IMAGES", None)
        os.environ.pop("IMAGE_OCR_MAX_TOKENS", None)
        os.environ.pop("IMAGE_OCR_TIMEOUT_SECONDS", None)
        os.environ.pop("LLM_API_KEY", None)
        os.environ.pop("LLM_BASE_URL", None)

    def test_default_values(self):
        config = get_scrape_time_ocr_config()
        self.assertEqual(config["model"], "gpt-4o-mini")
        self.assertEqual(config["api_key"], "")
        self.assertIsNone(config["base_url"])
        self.assertEqual(config["max_images"], 1)
        self.assertEqual(config["max_tokens"], 500)
        self.assertEqual(config["timeout"], 120)

    def test_explicit_values(self):
        os.environ["IMAGE_OCR_MODEL"] = "custom-model"
        os.environ["IMAGE_OCR_API_KEY"] = "sk-my-key"
        os.environ["IMAGE_OCR_BASE_URL"] = "https://custom.api/v1"
        os.environ["IMAGE_OCR_MAX_IMAGES"] = "3"
        os.environ["IMAGE_OCR_MAX_TOKENS"] = "1000"
        os.environ["IMAGE_OCR_TIMEOUT_SECONDS"] = "60"

        config = get_scrape_time_ocr_config()
        self.assertEqual(config["model"], "custom-model")
        self.assertEqual(config["api_key"], "sk-my-key")
        self.assertEqual(config["base_url"], "https://custom.api/v1")
        self.assertEqual(config["max_images"], 3)
        self.assertEqual(config["max_tokens"], 1000)
        self.assertEqual(config["timeout"], 60)

    def test_fallback_to_llm_env(self):
        os.environ["LLM_API_KEY"] = "sk-llm-fallback"
        os.environ["LLM_BASE_URL"] = "https://llm.api/v1"
        config = get_scrape_time_ocr_config()
        self.assertEqual(config["api_key"], "sk-llm-fallback")
        self.assertEqual(config["base_url"], "https://llm.api/v1")


class TestCollectSourceImages(unittest.TestCase):
    """Tests for image collection and ranking."""

    def _make_product(self, evidence_images=None, media_urls=None, has_image_urls=False):
        """Helper to build a mock product."""
        evidence = MagicMock()
        evidence.selected_images = evidence_images or []
        evidence.source_urls = []

        media = []
        if media_urls:
            for url in media_urls:
                m = MagicMock()
                m.url = url
                media.append(m)

        image_urls_list = None
        if has_image_urls:
            image_urls_list = ["https://example.com/fallback.jpg"]

        product = MagicMock()
        product.evidence = evidence
        product.media = media
        product.image_urls = image_urls_list
        return product

    def test_empty_product_returns_empty(self):
        product = MagicMock()
        product.evidence = None
        product.media = []
        # Remove image_urls property
        del product.image_urls

        result = collect_source_images(product, max_images=1)
        self.assertEqual(result, [])

    def test_selects_from_evidence_images(self):
        product = self._make_product(
            evidence_images=["https://example.com/pkg-front.jpg"]
        )
        result = collect_source_images(product, max_images=1)
        self.assertIn("https://example.com/pkg-front.jpg", result)
        self.assertEqual(len(result), 1)

    def test_selects_from_media(self):
        product = self._make_product(
            media_urls=["https://example.com/product.jpg"]
        )
        result = collect_source_images(product, max_images=1)
        self.assertIn("https://example.com/product.jpg", result)
        self.assertEqual(len(result), 1)

    def test_empty_when_no_images(self):
        product = self._make_product()
        result = collect_source_images(product, max_images=1)
        self.assertEqual(result, [])

    def test_deduplicates_urls(self):
        product = self._make_product(
            evidence_images=["https://example.com/dup.jpg"],
        )
        # Also add same URL via media
        m = MagicMock()
        m.url = "https://example.com/dup.jpg"
        product.media = [m]

        result = collect_source_images(product, max_images=5)
        # Should only appear once
        self.assertEqual(len(result), 1)


class TestApplyScrapeTimeOcr(unittest.IsolatedAsyncioTestCase):
    """Tests for the main OCR application function."""

    def setUp(self):
        """Ensure IMAGE_OCR_API_KEY is set so tests are independent."""
        os.environ["IMAGE_OCR_API_KEY"] = "test-key-fix"

    def tearDown(self):
        os.environ.pop("IMAGE_OCR_API_KEY", None)

    async def test_no_enrichment_result(self):
        summary = await apply_scrape_time_ocr(None, upc="TEST")
        self.assertIn("errors", summary)
        self.assertEqual(summary["sources_scanned"], 0)
        summary = await apply_scrape_time_ocr(None, upc="TEST")
        self.assertIn("errors", summary)
        self.assertEqual(summary["sources_scanned"], 0)

    @patch("runner.scrape_time_ocr.extract_text_from_image_urls")
    async def test_ocr_applied_to_source(self, mock_extract):
        mock_extract.return_value = "Brand Name\nProduct Description 24 oz"

        # Build a simple mock enrichment result with one source
        result = MagicMock()
        result.source_results = []

        product = MagicMock()
        product.evidence = MagicMock()
        product.evidence.selected_images = ["https://example.com/pkg.jpg"]
        product.evidence.source_urls = []
        product.evidence.image_text = None
        product.media = []

        sr = MagicMock()
        sr.product = product
        sr.sourceSlug = "amazon"
        result.source_results = [sr]

        summary = await apply_scrape_time_ocr(result, upc="TEST-UPC-001")

        self.assertEqual(summary["sources_scanned"], 1)
        self.assertEqual(summary["sources_ocr_succeeded"], 1)
        mock_extract.assert_called_once()

    @patch("runner.scrape_time_ocr.extract_text_from_image_urls")
    async def test_ocr_writes_image_text(self, mock_extract):
        expected_text = "Blue Buffalo\nChicken Recipe\n30 lb"
        mock_extract.return_value = expected_text

        result = MagicMock()
        result.source_results = []

        product = MagicMock()
        product.evidence = MagicMock()
        product.evidence.selected_images = ["https://example.com/bb.jpg"]
        product.evidence.source_urls = []
        product.evidence.image_text = None
        product.media = []

        sr = MagicMock()
        sr.product = product
        sr.sourceSlug = "chewy"
        result.source_results = [sr]

        summary = await apply_scrape_time_ocr(result, upc="UPC-123")

        self.assertEqual(summary["sources_ocr_succeeded"], 1)
        self.assertEqual(product.evidence.image_text, expected_text)

    @patch("runner.scrape_time_ocr.extract_text_from_image_urls")
    async def test_ocr_failure_does_not_raise(self, mock_extract):
        mock_extract.side_effect = Exception("API timeout")

        result = MagicMock()
        result.source_results = []

        product = MagicMock()
        product.evidence = MagicMock()
        product.evidence.selected_images = ["https://example.com/img.jpg"]
        product.evidence.source_urls = []
        product.evidence.image_text = None
        product.media = []

        sr = MagicMock()
        sr.product = product
        sr.sourceSlug = "test"
        result.source_results = [sr]

        # Should not raise
        summary = await apply_scrape_time_ocr(result, upc="UPC-456")

        self.assertEqual(summary["sources_ocr_failed"], 1)
        # Product evidence should remain unchanged (image_text stays None)
        self.assertIsNone(product.evidence.image_text)

    @patch("runner.scrape_time_ocr.extract_text_from_image_urls")
    async def test_empty_ocr_text_handled(self, mock_extract):
        mock_extract.return_value = ""

        result = MagicMock()
        result.source_results = []
        product = MagicMock()
        product.evidence = MagicMock()
        product.evidence.selected_images = ["https://example.com/img.jpg"]
        product.evidence.source_urls = []
        product.evidence.image_text = None
        product.media = []

        sr = MagicMock()
        sr.product = product
        sr.sourceSlug = "test"
        result.source_results = [sr]

        summary = await apply_scrape_time_ocr(result, upc="UPC-789")

        self.assertEqual(summary["sources_ocr_failed"], 1)
        self.assertIsNone(product.evidence.image_text)

    async def test_no_images_skipped(self):
        result = MagicMock()
        result.source_results = []
        product = MagicMock()
        product.evidence = MagicMock()
        product.evidence.selected_images = []
        product.evidence.source_urls = []
        product.evidence.image_text = None
        product.media = []

        sr = MagicMock()
        sr.product = product
        sr.sourceSlug = "test"
        result.source_results = [sr]

        summary = await apply_scrape_time_ocr(result, upc="UPC-NO-IMG")
        self.assertEqual(summary["sources_with_images"], 0)
        self.assertEqual(summary["sources_ocr_succeeded"], 0)
        self.assertEqual(summary["sources_ocr_failed"], 0)


if __name__ == "__main__":
    unittest.main()
