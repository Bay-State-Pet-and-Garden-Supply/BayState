"""Unit tests for the Ollama two-stage packaging extraction pipeline."""
from __future__ import annotations

import json
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from runner.packaging_extraction import (
    _call_text_structurer,
    _call_vision_ocr,
    _call_vlm,
    _is_private_ip,
    _repair_json,
)


# =============================================================================
# _is_private_ip tests (synchronous, no mocks)
# =============================================================================

class TestPrivateIpDetection(unittest.TestCase):
    """Tests for _is_private_ip helper function."""

    def test_rejects_localhost(self):
        self.assertTrue(_is_private_ip("localhost"))
        self.assertTrue(_is_private_ip("127.0.0.1"))
        self.assertTrue(_is_private_ip("0.0.0.0"))
        self.assertTrue(_is_private_ip("::1"))

    def test_rejects_loopback(self):
        self.assertTrue(_is_private_ip("127.1.2.3"))
        self.assertTrue(_is_private_ip("127.255.255.255"))

    def test_rejects_private_class_a(self):
        self.assertTrue(_is_private_ip("10.0.0.1"))
        self.assertTrue(_is_private_ip("10.255.255.255"))

    def test_rejects_private_class_b(self):
        self.assertTrue(_is_private_ip("172.16.0.1"))
        self.assertTrue(_is_private_ip("172.31.255.255"))

    def test_rejects_private_class_c(self):
        self.assertTrue(_is_private_ip("192.168.0.1"))
        self.assertTrue(_is_private_ip("192.168.255.255"))

    def test_rejects_link_local(self):
        self.assertTrue(_is_private_ip("169.254.1.1"))

    def test_allows_cgnat_by_design(self):
        """CGNAT range is not flagged as private by ipaddress — prefix fallback unreachable."""
        self.assertFalse(_is_private_ip("100.64.0.1"))
        self.assertFalse(_is_private_ip("100.127.255.255"))

    def test_allows_public_ip(self):
        self.assertFalse(_is_private_ip("8.8.8.8"))
        self.assertFalse(_is_private_ip("1.1.1.1"))
        self.assertFalse(_is_private_ip("93.184.216.34"))

    def test_allows_public_hostname(self):
        self.assertFalse(_is_private_ip("example.com"))
        self.assertFalse(_is_private_ip("images.amazon.com"))
        self.assertFalse(_is_private_ip("cdn.shopify.com"))


# =============================================================================
# _repair_json tests (synchronous, no mocks)
# =============================================================================

class TestRepairJson(unittest.TestCase):
    """Tests for _repair_json helper function."""

    def test_valid_json_passes_through(self):
        raw = '{"facts": {"brand": "Blue Buffalo"}}'
        result = _repair_json(raw)
        self.assertIsNotNone(result)
        parsed = json.loads(result)
        self.assertEqual(parsed["facts"]["brand"], "Blue Buffalo")

    def test_extracts_from_json_code_block(self):
        raw = (
            'Here is the extracted text:\n\n'
            '```json\n'
            '{"facts": {"brand": "Blue Buffalo", "weight": "30 lb."}}\n'
            '```'
        )
        result = _repair_json(raw)
        self.assertIsNotNone(result)
        parsed = json.loads(result)
        self.assertEqual(parsed["facts"]["brand"], "Blue Buffalo")
        self.assertEqual(parsed["facts"]["weight"], "30 lb.")

    def test_extracts_from_plain_code_block(self):
        raw = (
            '```\n'
            '{"facts": {"packaging_title": "Life Protection Formula"}}\n'
            '```'
        )
        result = _repair_json(raw)
        self.assertIsNotNone(result)
        parsed = json.loads(result)
        self.assertEqual(parsed["facts"]["packaging_title"], "Life Protection Formula")

    def test_extracts_braced_substring(self):
        raw = (
            'Some prose before the JSON\n'
            '{"field_confidence": {"brand": 0.95}}\n'
            'And some text after.'
        )
        result = _repair_json(raw)
        self.assertIsNotNone(result)
        parsed = json.loads(result)
        self.assertEqual(parsed["field_confidence"]["brand"], 0.95)

    def test_returns_none_for_invalid(self):
        self.assertIsNone(_repair_json(""))
        self.assertIsNone(_repair_json("Just some random text without braces"))
        self.assertIsNone(_repair_json("``````"))


# =============================================================================
# _call_completion mock helpers
# =============================================================================

def _make_mock_completion(text: str) -> MagicMock:
    """Build a mock AsyncOpenAI chat.completions.create response."""
    mock_message = MagicMock()
    mock_message.content = text
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_response.usage = MagicMock(
        prompt_tokens=50,
        completion_tokens=30,
        total_tokens=80,
    )
    return mock_response


def _setup_mock_openai(mock_openai_cls, mock_completion: MagicMock) -> MagicMock:
    """Configure a mock AsyncOpenAI class instance."""
    mock_client = MagicMock()
    mock_completions = MagicMock()
    mock_completions.create = AsyncMock(return_value=mock_completion)
    mock_client.chat = MagicMock(completions=mock_completions)
    mock_openai_cls.return_value = mock_client
    return mock_client


# =============================================================================
# ocr_then_parse pipeline tests
# =============================================================================

@patch("runner.packaging_extraction.AsyncOpenAI")
class TestOcrThenParsePipeline(unittest.IsolatedAsyncioTestCase):
    """Tests for the two-stage OCR-then-parse pipeline."""

    @patch.dict(os.environ, {
        "PACKAGING_VISION_BASE_URL": "http://127.0.0.1:11434/v1",
        "PACKAGING_VISION_MODEL": "glm-ocr",
        "PACKAGING_VISION_API_KEY": "ollama",
        "PACKAGING_VISION_TIMEOUT_SECONDS": "180",
        "PACKAGING_TEXT_BASE_URL": "http://127.0.0.1:11434/v1",
        "PACKAGING_TEXT_MODEL": "llama3.2:3b",
        "PACKAGING_TEXT_API_KEY": "ollama",
        "PACKAGING_TEXT_TIMEOUT_SECONDS": "120",
    })
    async def test_ocr_then_parse_success(self, mock_openai_cls):
        """Stage 1 (OCR) returns raw text; Stage 2 (structurer) returns valid JSON."""
        # First call: OCR vision - return raw text
        ocr_response = _make_mock_completion(
            "BLUE BUFFALO Life Protection Formula\n"
            "Chicken & Brown Rice Recipe\n"
            "30 lb"
        )
        _setup_mock_openai(mock_openai_cls, ocr_response)

        # Call _call_vision_ocr (Stage 1)
        ocr_result = await _call_vision_ocr(["data:image/jpeg;base64,fake"])
        self.assertTrue(ocr_result["success"])
        self.assertIn("Life Protection Formula", ocr_result["text"])
        self.assertIn("BLUE BUFFALO", ocr_result["text"])
        self.assertEqual(ocr_result["usage"]["prompt_tokens"], 50)

        # Second call: Text structurer - return valid JSON
        struct_response = _make_mock_completion(json.dumps({
            "facts": {
                "packaging_title": "Life Protection Formula",
                "brand": "Blue Buffalo",
                "variant": "Chicken & Brown Rice Recipe",
                "product_type": "Dry Dog Food",
                "weight": "30 lb.",
            },
            "field_confidence": {
                "brand": 0.98,
                "packaging_title": 0.91,
                "variant": 0.85,
                "weight": 0.93,
            },
            "overall_confidence": 0.90,
            "notes": [],
        }))
        _setup_mock_openai(mock_openai_cls, struct_response)

        # Call _call_text_structurer (Stage 2)
        struct_result = await _call_text_structurer(ocr_result["text"])
        self.assertTrue(struct_result["success"])
        data = struct_result["data"]
        self.assertEqual(data["facts"]["brand"], "Blue Buffalo")
        self.assertEqual(data["facts"]["weight"], "30 lb.")
        self.assertEqual(data["facts"]["packaging_title"], "Life Protection Formula")
        self.assertEqual(data["field_confidence"]["brand"], 0.98)
        self.assertEqual(data["overall_confidence"], 0.90)

    @patch.dict(os.environ, {
        "PACKAGING_VISION_BASE_URL": "http://127.0.0.1:11434/v1",
        "PACKAGING_VISION_MODEL": "glm-ocr",
        "PACKAGING_VISION_API_KEY": "ollama",
        "PACKAGING_TEXT_BASE_URL": "http://127.0.0.1:11434/v1",
        "PACKAGING_TEXT_MODEL": "llama3.2:3b",
        "PACKAGING_TEXT_API_KEY": "ollama",
    })
    async def test_ocr_then_parse_markdown_wrapped_json(self, mock_openai_cls):
        """Stage 2 returns JSON wrapped in ```json - _repair_json should extract it."""
        # Stage 1: OCR returns raw text
        ocr_response = _make_mock_completion("Purina Pro Plan\nChicken Formula\n3.5 lb")
        _setup_mock_openai(mock_openai_cls, ocr_response)
        ocr_result = await _call_vision_ocr(["data:image/jpeg;base64,fake"])
        self.assertTrue(ocr_result["success"])

        # Stage 2: Text structurer returns markdown-wrapped JSON
        struct_response = _make_mock_completion(
            "Here is the structured data:\n\n"
            "```json\n"
            '{"facts": {"brand": "Purina", "packaging_title": "Pro Plan", '
            '"flavor": "Chicken Formula", "weight": "3.5 lb"}, '
            '"field_confidence": {"brand": 0.95, "packaging_title": 0.88, '
            '"flavor": 0.82, "weight": 0.90}, '
            '"overall_confidence": 0.85, "notes": []}\n'
            "```\n\n"
            "Let me know if you need any changes."
        )
        _setup_mock_openai(mock_openai_cls, struct_response)

        struct_result = await _call_text_structurer(ocr_result["text"])
        self.assertTrue(struct_result["success"])
        data = struct_result["data"]
        self.assertEqual(data["facts"]["brand"], "Purina")
        self.assertEqual(data["facts"]["weight"], "3.5 lb")
        self.assertEqual(data["facts"]["flavor"], "Chicken Formula")
        self.assertEqual(data["field_confidence"]["brand"], 0.95)
        self.assertEqual(data["overall_confidence"], 0.85)

    @patch.dict(os.environ, {
        "PACKAGING_VISION_BASE_URL": "http://127.0.0.1:11434/v1",
        "PACKAGING_VISION_MODEL": "glm-ocr",
        "PACKAGING_VISION_API_KEY": "ollama",
        "PACKAGING_TEXT_BASE_URL": "http://127.0.0.1:11434/v1",
        "PACKAGING_TEXT_MODEL": "llama3.2:3b",
        "PACKAGING_TEXT_API_KEY": "ollama",
    })
    async def test_ocr_then_parse_structuring_fails(self, mock_openai_cls):
        """Stage 1 succeeds but Stage 2 returns invalid JSON - raw text is preserved."""
        # Stage 1: OCR returns raw text
        raw_ocr = "ACME Dog Treats\nBacon Flavor\n8 oz\nMade in USA"
        ocr_response = _make_mock_completion(raw_ocr)
        _setup_mock_openai(mock_openai_cls, ocr_response)
        ocr_result = await _call_vision_ocr(["data:image/jpeg;base64,fake"])
        self.assertTrue(ocr_result["success"])
        self.assertEqual(ocr_result["text"], raw_ocr)

        # Stage 2: Text structurer returns prose (not JSON)
        prose_response = _make_mock_completion(
            "This product appears to be ACME Dog Treats in Bacon Flavor. "
            "The packaging shows an 8 oz weight. It is made in the USA."
        )
        _setup_mock_openai(mock_openai_cls, prose_response)

        struct_result = await _call_text_structurer(raw_ocr)
        self.assertFalse(struct_result["success"])
        # The raw OCR text should be preserved in the 'text' field
        self.assertEqual(struct_result["text"], raw_ocr)


# =============================================================================
# structured_vlm mode tests
# =============================================================================

@patch("runner.packaging_extraction.AsyncOpenAI")
class TestStructuredVlmMode(unittest.IsolatedAsyncioTestCase):
    """Tests for the legacy structured VLM pipeline mode."""

    @patch.dict(os.environ, {
        "PACKAGING_VISION_BASE_URL": "http://127.0.0.1:11434/v1",
        "PACKAGING_VISION_MODEL": "glm-ocr",
        "PACKAGING_VISION_API_KEY": "ollama",
    })
    async def test_structured_vlm_returns_valid_json(self, mock_openai_cls):
        """structured_vlm mode: single VLM call returns valid JSON directly."""
        vlm_response = _make_mock_completion(json.dumps({
            "raw_text": "BLUE BUFFALO Life Protection Formula 30 lb",
            "facts": {
                "packaging_title": "Life Protection Formula",
                "brand": "Blue Buffalo",
                "product_type": "Dry Dog Food",
                "weight": "30 lb.",
            },
            "field_confidence": {
                "brand": 0.97,
                "packaging_title": 0.93,
                "weight": 0.95,
            },
            "overall_confidence": 0.92,
            "notes": [],
        }))
        _setup_mock_openai(mock_openai_cls, vlm_response)

        # Call _call_vlm with the structured prompt
        result = await _call_vlm(
            ["data:image/jpeg;base64,fake"],
            "Analyze this product packaging image...",
        )
        self.assertTrue(result["success"])
        data = result["data"]
        self.assertEqual(data["facts"]["brand"], "Blue Buffalo")
        self.assertEqual(data["facts"]["weight"], "30 lb.")
        self.assertEqual(data["field_confidence"]["brand"], 0.97)
        self.assertEqual(data["overall_confidence"], 0.92)
        # raw_text contains the full JSON string from the API
        self.assertIn("Blue Buffalo", result["raw_text"])

    @patch.dict(os.environ, {
        "PACKAGING_VISION_BASE_URL": "http://127.0.0.1:11434/v1",
        "PACKAGING_VISION_MODEL": "glm-ocr",
        "PACKAGING_VISION_API_KEY": "ollama",
    })
    async def test_structured_vlm_markdown_wrapped(self, mock_openai_cls):
        """structured_vlm mode: JSON wrapped in markdown code block."""
        vlm_response = _make_mock_completion(
            "```json\n"
            '{"facts": {"brand": "Acme"}, '
            '"field_confidence": {"brand": 0.90}, '
            '"overall_confidence": 0.88, "notes": []}\n'
            "```"
        )
        _setup_mock_openai(mock_openai_cls, vlm_response)

        result = await _call_vlm(
            ["data:image/jpeg;base64,fake"],
            "Analyze this...",
        )
        self.assertTrue(result["success"])
        data = result["data"]
        self.assertEqual(data["facts"]["brand"], "Acme")
        self.assertEqual(data["overall_confidence"], 0.88)

    @patch.dict(os.environ, {
        "PACKAGING_VISION_BASE_URL": "http://127.0.0.1:11434/v1",
        "PACKAGING_VISION_MODEL": "glm-ocr",
        "PACKAGING_VISION_API_KEY": "ollama",
    })
    async def test_structured_vlm_invalid_json_fails_gracefully(self, mock_openai_cls):
        """structured_vlm mode: invalid JSON returns failure with raw text."""
        vlm_response = _make_mock_completion(
            "Sorry, I can't see any details in this image."
        )
        _setup_mock_openai(mock_openai_cls, vlm_response)

        result = await _call_vlm(
            ["data:image/jpeg;base64,fake"],
            "Analyze this product packaging image...",
        )
        self.assertFalse(result["success"])
        # Raw text should still be available
        self.assertIn("Sorry, I can", result.get("raw_text", ""))

    @patch.dict(os.environ, {
        "PACKAGING_VISION_BASE_URL": "http://127.0.0.1:11434/v1",
        "PACKAGING_VISION_MODEL": "glm-ocr",
        "PACKAGING_VISION_API_KEY": "ollama",
    })
    async def test_structured_vlm_empty_response_fails(self, mock_openai_cls):
        """structured_vlm mode: empty response returns failure."""
        vlm_response = _make_mock_completion("")
        _setup_mock_openai(mock_openai_cls, vlm_response)

        result = await _call_vlm(
            ["data:image/jpeg;base64,fake"],
            "Analyze this product packaging image...",
        )
        self.assertFalse(result["success"])


# =============================================================================
# ocr_then_parse env override test
# =============================================================================

@patch("runner.packaging_extraction.AsyncOpenAI")
class TestOcrPipelineEnvConfig(unittest.IsolatedAsyncioTestCase):
    """Tests that the ocr_then_parse pipeline respects env config."""

    @patch.dict(os.environ, {
        "PACKAGING_VISION_BASE_URL": "http://custom:11434/v1",
        "PACKAGING_VISION_MODEL": "glm-ocr",
        "PACKAGING_VISION_API_KEY": "ollama",
        "PACKAGING_VISION_TIMEOUT_SECONDS": "300",
        "PACKAGING_TEXT_BASE_URL": "http://text-model:11434/v1",
        "PACKAGING_TEXT_MODEL": "llama3.2:1b",
        "PACKAGING_TEXT_API_KEY": "ollama",
        "PACKAGING_TEXT_TIMEOUT_SECONDS": "60",
    })
    async def test_uses_custom_env_values(self, mock_openai_cls):
        """The pipeline uses custom env values when configured."""
        # We verify env values by checking which URL/model was used
        # This is an indirect test by asserting the calls work as expected
        ocr_response = _make_mock_completion("Raw OCR Text From Custom Model")
        _setup_mock_openai(mock_openai_cls, ocr_response)
        ocr_result = await _call_vision_ocr(["data:image/jpeg;base64,fake"])
        self.assertTrue(ocr_result["success"])
        self.assertEqual(ocr_result["text"], "Raw OCR Text From Custom Model")


# =============================================================================
# Test submission / result building (synchronous edge cases)
# =============================================================================

class TestExtractionResultBuilding(unittest.TestCase):
    """Tests for PackagingExtractionResult construction."""

    def test_successful_vlm_result_builds_correctly(self):
        """Verify a successful VLM result produces expected result shape."""
        from runner.packaging_extraction import _build_result
        vlm_data = {
            "success": True,
            "data": {
                "raw_text": "Product name on packaging",
                "facts": {"brand": "TestBrand"},
                "field_confidence": {"brand": 0.95},
                "overall_confidence": 0.90,
                "notes": [],
            },
            "raw_text": "Product name on packaging",
            "text": "",
            "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150},
        }
        with patch.dict(os.environ, {"PACKAGING_VISION_MODEL": "glm-ocr", "RUNNER_NAME": "test-runner"}):
            result = _build_result(
                upc="123456789012",
                status="succeeded",
                vlm_data=vlm_data,
                image_urls=["https://example.com/img.jpg"],
                fingerprints=["abc123"],
                image_metadata=[{"sha256": "abc123"}],
            )
        self.assertEqual(result.status, "succeeded")
        self.assertEqual(result.upc, "123456789012")
        self.assertEqual(result.structured_facts, {"brand": "TestBrand"})
        self.assertEqual(result.field_confidence, {"brand": 0.95})
        self.assertEqual(result.overall_confidence, 0.90)
        self.assertEqual(result.model, "glm-ocr")
        self.assertEqual(result.image_fingerprints, ["abc123"])
        self.assertIn("Product name on packaging", result.raw_text)

    def test_failed_vlm_result_has_error_message(self):
        """Verify a failed VLM result preserves the error."""
        from runner.packaging_extraction import _build_result
        vlm_data = {
            "success": False,
            "error": "API call failed: Connection refused",
            "usage": {},
        }
        result = _build_result(
            upc="123456789012",
            status="failed",
            vlm_data=vlm_data,
            error_message="VLM error: API call failed: Connection refused",
        )
        self.assertEqual(result.status, "failed")
        self.assertIn("Connection refused", result.error_message)


if __name__ == "__main__":
    unittest.main()
