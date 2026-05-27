"""Unit tests for the OCR image action handler."""

from __future__ import annotations

import base64
import io
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from scrapers.actions.handlers.ocr import (
    OcrImagesAction,
    _clean_ocr_output,
    _decode_image,
    _preprocess_for_ocr,
    _run_tesseract,
)


class TestCleanOcrOutput:
    def test_collapse_whitespace(self):
        assert _clean_ocr_output("hello   world\n\nfoo") == "hello world foo"

    def test_remove_non_printable(self):
        assert _clean_ocr_output("hello\x00world") == "helloworld"

    def test_empty_string(self):
        assert _clean_ocr_output("") == ""

    def test_none_input(self):
        assert _clean_ocr_output(None) == ""  # type: ignore[arg-type]


class TestDecodeImage:
    def test_decode_data_url_png(self):
        from PIL import Image

        img = Image.new("RGB", (10, 10), color="red")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        data_url = f"data:image/png;base64,{b64}"

        result = _decode_image(data_url)
        assert result is not None
        assert result.size == (10, 10)

    def test_decode_plain_url_returns_none(self):
        result = _decode_image("https://example.com/image.png")
        assert result is None

    def test_decode_invalid_data_url(self):
        result = _decode_image("data:image/png;base64,!!!")
        assert result is None

    def test_decode_empty_string(self):
        result = _decode_image("")
        assert result is None


class TestPreprocessForOcr:
    def test_preprocess_rgb_image(self):
        pytest.importorskip("PIL")
        from PIL import Image

        img = Image.new("RGB", (10, 10), color="blue")
        result = _preprocess_for_ocr(img)
        assert result is not None
        assert result.mode == "L"

    def test_preprocess_rgba_image(self):
        pytest.importorskip("PIL")
        from PIL import Image

        img = Image.new("RGBA", (10, 10), color=(255, 0, 0, 128))
        result = _preprocess_for_ocr(img)
        assert result is not None
        assert result.mode == "L"

    def test_preprocess_without_pil_returns_input(self):
        with patch("scrapers.actions.handlers.ocr.HAS_PIL", False):
            dummy = object()
            result = _preprocess_for_ocr(dummy)
            assert result is dummy


class TestRunTesseract:
    def test_run_tesseract_without_tesseract_returns_empty(self):
        with patch("scrapers.actions.handlers.ocr.HAS_TESSERACT", False):
            assert _run_tesseract(None) == ""

    def test_run_tesseract_mocked(self):
        pytest.importorskip("pytesseract")
        mock_img = MagicMock()
        with patch("scrapers.actions.handlers.ocr.pytesseract.image_to_string", return_value="  hello  "):
            result = _run_tesseract(mock_img)
            assert result == "hello"


class TestOcrImagesAction:
    @pytest.fixture
    def mock_context(self):
        ctx = MagicMock()
        ctx.results = {"Image URLs": []}
        ctx.config = None
        return ctx

    @pytest.mark.asyncio
    async def test_no_images_logs_debug(self, mock_context, caplog):
        pytest.importorskip("PIL")
        pytest.importorskip("pytesseract")

        action = OcrImagesAction(mock_context)
        with caplog.at_level("DEBUG"):
            await action.execute({"field": "Image URLs"})
        assert "No images found" in caplog.text

    @pytest.mark.asyncio
    async def test_ocr_success_with_data_url(self, mock_context):
        pytest.importorskip("PIL")
        pytest.importorskip("pytesseract")
        from PIL import Image

        img = Image.new("RGB", (100, 30), color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        data_url = f"data:image/png;base64,{b64}"

        mock_context.results["Image URLs"] = [data_url]

        action = OcrImagesAction(mock_context)
        with patch("scrapers.actions.handlers.ocr.pytesseract.image_to_string", return_value="DOG FOOD"):
            await action.execute({"field": "Image URLs", "max_images": 1})

        assert mock_context.results.get("Image Text") == "DOG FOOD"

    @pytest.mark.asyncio
    async def test_ocr_config_defaults_used_when_no_params(self, mock_context):
        pytest.importorskip("PIL")
        pytest.importorskip("pytesseract")
        from PIL import Image

        img = Image.new("RGB", (100, 30), color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        data_url = f"data:image/png;base64,{b64}"

        mock_context.results["Image URLs"] = [data_url]

        # Mock config with ocr_config
        ocr_cfg = MagicMock()
        ocr_cfg.max_images = 1
        ocr_cfg.language = "eng"
        ocr_cfg.preprocess = False
        mock_context.config = MagicMock()
        mock_context.config.ocr_config = ocr_cfg

        action = OcrImagesAction(mock_context)
        with patch("scrapers.actions.handlers.ocr.pytesseract.image_to_string", return_value="CONFIG TEST"):
            await action.execute({})

        assert mock_context.results.get("Image Text") == "CONFIG TEST"

    @pytest.mark.asyncio
    async def test_params_override_config_defaults(self, mock_context):
        pytest.importorskip("PIL")
        pytest.importorskip("pytesseract")
        from PIL import Image

        img = Image.new("RGB", (100, 30), color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        data_url = f"data:image/png;base64,{b64}"

        mock_context.results["My Images"] = [data_url]

        ocr_cfg = MagicMock()
        ocr_cfg.max_images = 5
        ocr_cfg.language = "fra"
        ocr_cfg.preprocess = True
        mock_context.config = MagicMock()
        mock_context.config.ocr_config = ocr_cfg

        action = OcrImagesAction(mock_context)
        with patch("scrapers.actions.handlers.ocr.pytesseract.image_to_string", return_value="OVERRIDE") as mock_ocr:
            await action.execute({"field": "My Images", "max_images": 1, "language": "eng"})

        # Verify language param was overridden to "eng" not "fra"
        call_kwargs = mock_ocr.call_args[1]
        assert call_kwargs["lang"] == "eng"
        assert mock_context.results.get("Image Text") == "OVERRIDE"

    @pytest.mark.asyncio
    async def test_missing_deps_graceful(self, mock_context):
        action = OcrImagesAction(mock_context)
        with patch("scrapers.actions.handlers.ocr.HAS_PIL", False):
            await action.execute({})
        # Should not raise

    @pytest.mark.asyncio
    async def test_http_url_fetch(self, mock_context):
        pytest.importorskip("PIL")
        pytest.importorskip("pytesseract")
        from PIL import Image

        mock_context.results["Image URLs"] = ["https://example.com/img.png"]

        # Create a tiny valid PNG
        img = Image.new("RGB", (10, 10))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        image_bytes = buf.getvalue()

        action = OcrImagesAction(mock_context)
        with patch("scrapers.actions.handlers.ocr._fetch_image_as_bytes", return_value=image_bytes) as mock_fetch:
            with patch("scrapers.actions.handlers.ocr.pytesseract.image_to_string", return_value="FETCHED"):
                await action.execute({"max_images": 1})

        mock_fetch.assert_called_once_with("https://example.com/img.png")
        assert mock_context.results.get("Image Text") == "FETCHED"
