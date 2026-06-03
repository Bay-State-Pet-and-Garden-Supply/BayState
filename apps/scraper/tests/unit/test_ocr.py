"""Unit tests for OCR image selection and Vision LLM OCR Service."""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from src.ocr.image_selector import select_ocr_images
from src.ocr.vision_service import extract_text_from_image_urls, resize_image_bytes


class TestOcrImageSelector(unittest.TestCase):
    def test_select_ocr_images_empty(self):
        self.assertEqual(select_ocr_images([]), [])

    def test_select_ocr_images_priority(self):
        urls = [
            "https://example.com/images/logo.png",            # non-ocr (logo)
            "https://example.com/images/product_thumb.jpg",    # non-ocr (thumb)
            "https://example.com/images/product_lifestyle.jpg",# lifestyle (lower score)
            "https://example.com/images/product_front.jpg",    # front (high score)
            "https://example.com/images/123456789012_main.jpg",# upc match
            "https://example.com/images/other.jpg"             # standard
        ]

        # Standard selection with UPC matching
        best_images = select_ocr_images(urls, max_images=2, upc="123456789012")
        # Top choice should be the UPC matching image
        self.assertEqual(best_images[0], "https://example.com/images/123456789012_main.jpg")
        # Second choice should be the front packaging image
        self.assertEqual(best_images[1], "https://example.com/images/product_front.jpg")

    def test_select_ocr_images_data_url(self):
        urls = [
            "https://example.com/images/product_front.jpg",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA"
        ]
        # Data URL should be prioritized since it's already local/processed
        best_images = select_ocr_images(urls, max_images=1)
        self.assertEqual(best_images[0], "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA")


class TestOcrVisionService(unittest.IsolatedAsyncioTestCase):
    @patch("src.ocr.vision_service.HAS_PIL", False)
    def test_resize_image_no_pil(self):
        dummy_bytes = b"dummy"
        self.assertEqual(resize_image_bytes(dummy_bytes), dummy_bytes)

    @patch("src.ocr.vision_service.httpx.AsyncClient")
    async def test_fetch_image_as_data_url_mock(self, mock_client_cls):
        # Setup mock client
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.headers = {"content-type": "image/jpeg"}
        mock_response.content = b"fake_jpeg_content"
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__.return_value = mock_client

        # Mock PIL image resizing to avoid PIL dependency error in basic environment
        with patch("src.ocr.vision_service.resize_image_bytes", side_effect=lambda x: x):
            from src.ocr.vision_service import fetch_image_as_data_url
            data_url = await fetch_image_as_data_url("https://example.com/img.jpg")
            self.assertTrue(data_url.startswith("data:image/jpeg;base64,"))

    @patch("src.ocr.vision_service.fetch_image_as_data_url")
    @patch("src.ocr.vision_service.AsyncOpenAI")
    async def test_extract_text_from_image_urls(self, mock_openai_cls, mock_fetch):
        mock_fetch.return_value = "data:image/jpeg;base64,ZmFrZV9qcGVnX2NvbnRlbnQ="
        
        # Setup OpenAI client mock
        mock_client = MagicMock()
        mock_completions = MagicMock()
        mock_response = MagicMock()
        mock_choice = MagicMock()
        mock_message = MagicMock()
        
        mock_message.content = "Extracted OCR text"
        mock_choice.message = mock_message
        mock_response.choices = [mock_choice]
        mock_completions.create = AsyncMock(return_value=mock_response)
        mock_client.chat = MagicMock(completions=mock_completions)
        mock_openai_cls.return_value = mock_client

        # Call function
        result = await extract_text_from_image_urls(
            ["https://example.com/img.jpg"],
            api_key="mock_key",
            model="gpt-4o-mini"
        )
        self.assertEqual(result, "Extracted OCR text")
        
        # Verify calls
        mock_fetch.assert_called_once_with("https://example.com/img.jpg")
        mock_completions.create.assert_called_once()
