"""Tests for Crawl4AIExtractor and fallback extraction behavior."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor, FallbackExtractor


class TestCrawl4AIExtractorOptimization:
    """Test suite for Crawl4AIExtractor LLM optimization."""

    @pytest.fixture
    def extractor(self):
        """Initialize extractor with default settings."""
        ext = Crawl4AIExtractor(
            headless=True,
            llm_model="gpt-4o-mini",
            scoring=MagicMock(),
            matching=MagicMock(),
            extraction_strategy="llm",
            llm_api_key="test-key",
        )
        # Mock _enrich_images as a passthrough — these tests exercise the LLM
        # pipeline, not image enrichment. Without this, merge_product_images
        # raises TypeError on MagicMock-backed scoring/matching internals.
        async def _passthrough_enrich(result_data, **_kwargs):
            return dict(result_data), {}
        ext._enrich_images = _passthrough_enrich
        return ext

    @pytest.mark.asyncio
    async def test_extract_uses_optimized_params(self, extractor):
        """Test that LLMExtractionStrategy is initialized with optimized parameters."""
        url = "https://example.com/p/123"
        upc= "SKU123"
        
        # Mock dependencies
        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": "",
            "fit_markdown": "",
            "raw_markdown": "",
            "markdown": "product markdown content",
            "media": {},
        }
        
        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True) as mock_strategy_cls,
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("scrapers.ai_search.crawl4ai_extractor.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread,
        ):
            mock_to_thread.return_value = '[{"name": "Test Product", "product_name": "Test Product", "brand": "Test Brand", "description": "Desc", "size_metrics": "12 oz", "images": [], "categories": ["Cat1"]}]'
            
            # We need to simulate the engine's context manager
            mock_engine.__aenter__.return_value = mock_engine
            
            await extractor.extract(url, upc, "Test Product", "Test Brand")
            
            # Check LLMExtractionStrategy initialization
            assert mock_strategy_cls.called
            _, kwargs = mock_strategy_cls.call_args
            
            # Verify optimized parameters
            assert kwargs.get("input_format") == "fit_markdown"
            assert kwargs.get("chunk_token_threshold") == 12000
            assert kwargs.get("overlap_rate") == 0.15
            
            # Verify extra_args
            extra_args = kwargs.get("extra_args", {})
            assert extra_args.get("max_tokens") == 4000
            assert extra_args.get("temperature") == 0.01

    @pytest.mark.asyncio
    async def test_extract_relaxes_wait_strategy_after_timeout(self, extractor):
        """Live storefronts should retry with domcontentloaded when network idle fails."""
        mock_engine = AsyncMock()
        mock_engine.crawl.side_effect = [
            {
                "success": False,
                "error": 'Page.goto: Timeout 30000ms exceeded while waiting until "networkidle"',
                "html": "",
                "markdown": "",
            },
            {
                "success": False,
                "error": "navigation timeout",
                "html": "",
                "markdown": "",
            },
        ]

        def build_engine(config):
            mock_engine.config = config
            return mock_engine

        with patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", side_effect=build_engine):
            mock_engine.__aenter__.return_value = mock_engine

            await extractor.extract("https://example.com/p/123", "SKU123", "Test Product", "Test Brand")

        assert mock_engine.crawl.await_count == 2
        assert mock_engine.config["crawler"]["wait_until"] == "domcontentloaded"

    @pytest.mark.asyncio
    async def test_extract_reuses_fit_markdown_for_fallback_when_html_missing(self, extractor):
        """Test that fit markdown is reused for fallback parsing when HTML is unavailable."""
        url = "https://example.com/p/123"
        upc= "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": False,
            "error": "auth error",
            "html": None,
            "fit_markdown": "fit markdown content",
            "raw_markdown": "raw markdown content",
            "markdown": "fit markdown content",
        }

        with patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine):
            mock_engine.__aenter__.return_value = mock_engine
            extractor._extract_with_fallback = AsyncMock(return_value={"success": False, "error": "fallback"})

            result = await extractor.extract(url, upc, "Test Product", "Test Brand")

            extractor._extract_with_fallback.assert_awaited_once_with(
                url,
                upc,
                "Test Product",
                "Test Brand",
                "",
                "fit markdown content",
            )
            assert result == {"success": False, "error": "fallback"}

    @pytest.mark.asyncio
    async def test_extract_runs_llm_directly_on_markdown_no_second_navigation(self, extractor):
        """Second-pass LLM extraction should run on already-fetched markdown, not re-navigate."""
        url = "https://example.com/p/123"
        upc= "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}

        async def fake_crawl(_url):
            return {
                "success": True,
                "html": "<html><body>product</body></html>",
                "fit_markdown": "product markdown",
                "raw_markdown": "product markdown",
                "markdown": "product markdown",
                "media": {"images": [{"src": "https://example.com/img.jpg", "width": 800}]},
            }

        mock_engine.crawl.side_effect = fake_crawl

        def build_engine(config):
            mock_engine.config = config
            return mock_engine

        observed_markdown = None
        observed_fn = None
        observed_args = None

        async def fake_to_thread(fn, *args):
            nonlocal observed_fn, observed_args
            observed_fn = fn
            observed_args = args
            return '[{"product_name": "Test", "brand": "Test", "description": "Desc", "size_metrics": "12 oz", "images": [], "categories": ["Cat"]}]'

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", side_effect=build_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("scrapers.ai_search.crawl4ai_extractor.asyncio.to_thread", side_effect=fake_to_thread),
            patch.object(extractor._extraction, "extract_product_from_html_jsonld", return_value=None),
            patch("scrapers.ai_search.crawl4ai_extractor.extract_product_from_meta_tags", return_value=None),
        ):
            mock_engine.__aenter__.return_value = mock_engine

            result = await extractor.extract(url, upc, "Test Product", "Test Brand")

            assert result is not None
            assert result["success"] is True
            # Only ONE browser navigation should occur
            assert mock_engine.crawl.await_count == 1
            # The LLM extraction function (strategy.extract) should be passed to
            # asyncio.to_thread with url and markdown as arguments
            assert observed_fn is not None
            assert observed_args == (url, 0, "product markdown")

    @pytest.mark.asyncio
    async def test_extract_falls_back_when_no_markdown_for_llm(self, extractor):
        """When first crawl returns no markdown, LLM should use fallback extractor."""
        url = "https://example.com/p/123"
        upc= "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": "",
            "fit_markdown": "",
            "raw_markdown": "",
            "markdown": "",
            "media": {},
        }

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch.object(extractor._extraction, "extract_product_from_html_jsonld", return_value=None),
            patch("scrapers.ai_search.crawl4ai_extractor.extract_product_from_meta_tags", return_value=None),
        ):
            mock_engine.__aenter__.return_value = mock_engine
            extractor._extract_with_fallback = AsyncMock(return_value={"success": True, "product_name": "Fallback Product"})

            result = await extractor.extract(url, upc, "Test Product", "Test Brand")

            assert result == {"success": True, "product_name": "Fallback Product"}

    @pytest.mark.asyncio
    async def test_extract_preserves_media_from_first_crawl(self, extractor):
        """LLM extraction should use first crawl's media for image enrichment."""
        url = "https://example.com/p/123"
        upc= "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": "<html><body>product</body></html>",
            "fit_markdown": "product markdown",
            "raw_markdown": "product markdown",
            "markdown": "product markdown",
            "media": {"images": [{"src": "https://example.com/img.jpg", "score": 5}]},
        }

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("scrapers.ai_search.crawl4ai_extractor.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread,
            patch.object(extractor._extraction, "extract_product_from_html_jsonld", return_value=None),
            patch("scrapers.ai_search.crawl4ai_extractor.extract_product_from_meta_tags", return_value=None),
        ):
            mock_to_thread.return_value = '[{"product_name": "Test", "brand": "Test", "description": "Desc", "size_metrics": "12 oz", "images": [], "categories": ["Cat"]}]'
            mock_engine.__aenter__.return_value = mock_engine

            # Patch enrich_images to capture crawl_media
            captured_media = {}
            async def capture_media(result_data, *, url, html, markdown, crawl_media, expected_name, expected_brand):
                nonlocal captured_media
                captured_media = crawl_media
                return dict(result_data), {}
            extractor._enrich_images = capture_media

            await extractor.extract(url, upc, "Test Product", "Test Brand")

            assert captured_media == {"images": [{"src": "https://example.com/img.jpg", "score": 5}]}

    @pytest.mark.asyncio
    async def test_extract_accepts_structured_extracted_content_payload(self, extractor):
        """Test that structured extracted_content payloads are accepted without JSON parsing."""
        url = "https://example.com/p/123"
        upc= "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": """
            <html>
              <head>
                <meta property=\"og:image\" content=\"https://example.com/image.jpg\" />
              </head>
            </html>
            """,
            "fit_markdown": "product markdown",
            "raw_markdown": "product markdown",
            "markdown": "product markdown",
            "media": {},
        }

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("scrapers.ai_search.crawl4ai_extractor.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread,
        ):
            mock_to_thread.return_value = [
                {
                    "product_name": "Test Product",
                    "brand": "Test Brand",
                    "description": "Structured payload",
                    "size_metrics": "12 oz",
                    "images": ["https://example.com/image.jpg"],
                    "categories": ["Garden Supplies"],
                }
            ]
            mock_engine.__aenter__.return_value = mock_engine

            result = await extractor.extract(url, upc, "Test Product", "Test Brand")

            assert result is not None
            assert result["success"] is True
            assert result["product_name"] == "Test Product"
            assert result["brand"] == "Test Brand"
            assert result["confidence"] == 1.0

    @pytest.mark.asyncio
    async def test_extract_normalizes_llm_output_with_aliases_and_meta_images(self, extractor):
        """LLM payloads should be normalized before confidence and return."""
        url = "https://example.com/p/123"
        upc= "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": """
            <html>
              <head>
                <meta property=\"og:image\" content=\"/hero.jpg\" />
              </head>
            </html>
            """,
            "fit_markdown": "product markdown",
            "raw_markdown": "product markdown",
            "markdown": "product markdown",
            "media": {},
        }

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("scrapers.ai_search.crawl4ai_extractor.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread,
        ):
            mock_to_thread.return_value = [
                {
                    "product_name": "Organic Eggplant Black Beauty Heirloom",
                    "brand": "LV Seed",
                    "description": "A productive heirloom variety for home gardens.",
                    "size_metrics": "Not specified",
                    "images": [],
                    "categories": ["Garden Center", "Seeds"],
                }
            ]
            mock_engine.__aenter__.return_value = mock_engine

            result = await extractor.extract(url, upc, "LV SEED ORGANIC EGGP LANT BLACK HEIRLOOM", None)

            assert result is not None
            assert result["success"] is True
            assert result["brand"] == "Lake Valley Seed"
            assert result["size_metrics"] == ""
            assert result["images"] == ["https://example.com/hero.jpg"]
            assert "Garden Center" not in result["categories"]
            assert "Seeds" in result["categories"]

    @pytest.mark.asyncio
    async def test_extract_replaces_page_relative_files_image_with_meta_image(self, extractor):
        """Malformed `files/...` image paths should fall back to valid OG images."""
        url = "https://bentleyseeds.com/products/turnip-purple-white-globe"
        upc= "HTG-017"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": """
            <html>
              <head>
                <meta property=\"og:image\" content=\"//bentleyseeds.com/cdn/shop/files/HTG-017_front.jpg?v=1739186744\" />
              </head>
            </html>
            """,
            "fit_markdown": "product markdown",
            "raw_markdown": "product markdown",
            "markdown": "product markdown",
            "media": {},
        }

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("scrapers.ai_search.crawl4ai_extractor.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread,
        ):
            mock_to_thread.return_value = [
                {
                    "product_name": "Turnip Purple White Globe Seed Packets",
                    "brand": "Bentley Seeds",
                    "description": "Classic heirloom turnip packet.",
                    "size_metrics": "Not specified",
                    "images": ["files/HTG-017_front.jpg"],
                    "categories": ["Seeds"],
                }
            ]
            mock_engine.__aenter__.return_value = mock_engine

            result = await extractor.extract(url, upc, "Turnip Purple White Globe", "Bentley Seeds")

            assert result is not None
            assert result["success"] is True
            assert result["images"] == [
                "https://bentleyseeds.com/cdn/shop/files/HTG-017_front.jpg?v=1739186744"
            ]

    @pytest.mark.asyncio
    async def test_extract_returns_first_pass_jsonld_result(self, extractor):
        """Test that first-pass JSON-LD extraction short-circuits LLM fallback."""
        url = "https://example.com/p/123"
        upc= "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": "<html><body>product</body></html>",
            "markdown": "product markdown",
        }
        extractor._extraction.extract_product_from_html_jsonld = MagicMock(
            return_value={
                "product_name": "Structured Product",
                "confidence": 0.2,
                "description": "Structured Description",
                "size_metrics": "Structured Size",
                "categories": ["Pet Supply"],
            }
        )

        with patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine):
            mock_engine.__aenter__.return_value = mock_engine

            result = await extractor.extract(url, upc, "Structured Product", "Structured Brand")

            assert result["product_name"] == "Structured Product"
            assert result["url"] == url
            assert result["confidence"] == 0.8
            mock_engine.crawl.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_extract_uses_fallback_when_llm_key_missing(self, monkeypatch):
        """Test that missing LLM credentials defer to the zero-cost fallback path."""
        monkeypatch.delenv("LLM_API_KEY", raising=False)
        monkeypatch.delenv("LLM_BASE_URL", raising=False)
        url = "https://example.com/p/123"
        upc= "SKU123"

        extractor = Crawl4AIExtractor(
            headless=True,
            llm_model="gpt-4o-mini",
            scoring=MagicMock(),
            matching=MagicMock(),
            extraction_strategy="llm",
            llm_api_key=None,
        )

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": "",
            "fit_markdown": "",
            "raw_markdown": "",
            "markdown": "",
        }

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
        ):
            mock_engine.__aenter__.return_value = mock_engine
            extractor._extract_with_fallback = AsyncMock(return_value={"success": True, "product_name": "Fallback Product"})

            result = await extractor.extract(url, upc, "Test Product", "Test Brand")

            extractor._extract_with_fallback.assert_awaited_once_with(
                url,
                upc,
                "Test Product",
                "Test Brand",
                "",
                "",
            )
            assert result == {"success": True, "product_name": "Fallback Product"}

    @pytest.mark.asyncio
    async def test_extract_falls_back_on_auth_error_payload(self, extractor):
        """Test that auth-shaped LLM responses trigger fallback extraction."""
        url = "https://example.com/p/123"
        upc= "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": "",
            "fit_markdown": "",
            "raw_markdown": "",
            "markdown": "product markdown",
            "media": {},
        }

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("scrapers.ai_search.crawl4ai_extractor.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread,
        ):
            # Simulate auth error payload
            mock_to_thread.return_value = '[{"error":"authentication failed"}]'
            mock_engine.__aenter__.return_value = mock_engine
            extractor._extract_with_fallback = AsyncMock(return_value={"success": False, "error": "fallback"})

            result = await extractor.extract(url, upc, "Test Product", "Test Brand")

            extractor._extract_with_fallback.assert_awaited_once_with(
                url,
                upc,
                "Test Product",
                "Test Brand",
                "",
                "product markdown",
            )
            assert result == {"success": False, "error": "fallback"}

    @pytest.mark.asyncio
    async def test_extract_falls_back_on_error_tagged_llm_payload(self, extractor):
        """Provider/Crawl4AI error payloads should not be normalized into fake product data."""
        url = "https://example.com/p/123"
        upc= "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": "",
            "fit_markdown": "",
            "raw_markdown": "",
            "markdown": "product markdown",
            "media": {},
        }

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("scrapers.ai_search.crawl4ai_extractor.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread,
        ):
            mock_to_thread.return_value = [
                {
                    "index": 0,
                    "error": True,
                    "tags": ["error"],
                    "content": "openai.APIConnectionError: provider mismatch",
                    "product_name": "",
                    "images": [],
                }
            ]
            mock_engine.__aenter__.return_value = mock_engine
            extractor._extract_with_fallback = AsyncMock(return_value={"success": False, "error": "fallback"})

            result = await extractor.extract(url, upc, "Test Product", "Test Brand")

            extractor._extract_with_fallback.assert_awaited_once_with(
                url,
                upc,
                "Test Product",
                "Test Brand",
                "",
                "product markdown",
            )
            assert result == {"success": False, "error": "fallback"}

    @pytest.mark.asyncio
    async def test_extract_uses_fallback_for_soft_404_first_pass(self, extractor):
        """Soft-404 pages should skip LLM extraction and go straight to fallback recovery."""
        url = "https://example.com/missing-product"
        upc= "SKU123"
        not_found_html = """
        <html>
          <head>
            <title>Page not found - Example</title>
            <meta property="og:title" content="Page not found - Example" />
          </head>
        </html>
        """
        markdown = "WHOOPS! 404 It looks like you are lost!"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": not_found_html,
            "fit_markdown": markdown,
            "raw_markdown": markdown,
            "markdown": markdown,
        }

        with patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine):
            mock_engine.__aenter__.return_value = mock_engine
            extractor._extract_with_fallback = AsyncMock(return_value={"success": False, "error": "Fallback extraction landed on a not-found page"})

            result = await extractor.extract(url, upc, "Test Product", "Test Brand")

            extractor._extract_with_fallback.assert_awaited_once_with(
                url,
                upc,
                "Test Product",
                "Test Brand",
                not_found_html,
                markdown,
            )
            mock_engine.crawl.assert_awaited_once()
            assert result == {"success": False, "error": "Fallback extraction landed on a not-found page"}

    @pytest.mark.asyncio
    async def test_extract_falls_back_on_invalid_extracted_content_type(self, extractor):
        """Test that unsupported extracted_content payloads trigger fallback parsing."""
        url = "https://example.com/p/123"
        upc= "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": "",
            "fit_markdown": "",
            "raw_markdown": "",
            "markdown": "product markdown",
            "media": {},
        }

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
            patch("scrapers.ai_search.crawl4ai_extractor.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread,
        ):
            mock_to_thread.return_value = 123  # Invalid type
            mock_engine.__aenter__.return_value = mock_engine
            extractor._extract_with_fallback = AsyncMock(return_value={"success": True, "product_name": "Fallback"})

            result = await extractor.extract(url, upc, "Test Product", "Test Brand")

            extractor._extract_with_fallback.assert_awaited_once_with(
                url,
                upc,
                "Test Product",
                "Test Brand",
                "",
                "product markdown",
            )
            assert result == {"success": True, "product_name": "Fallback"}

    @pytest.mark.asyncio
    async def test_extract_uses_fallback_after_content_type_exception_with_existing_content(self, extractor):
        """Test that content-type exceptions reuse first-pass content with fallback extraction."""
        url = "https://example.com/p/123"
        upc= "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.return_value = {
            "success": True,
            "html": "<html>cached</html>",
            "fit_markdown": "",
            "raw_markdown": "",
            "markdown": "cached markdown",
        }
        extractor._extraction.extract_product_from_html_jsonld = MagicMock(return_value=None)

        with (
            patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine),
            patch("scrapers.ai_search.crawl4ai_extractor.extract_product_from_meta_tags", return_value=None),
            patch("crawl4ai.extraction_strategy.LLMExtractionStrategy", create=True),
            patch("crawl4ai.LLMConfig", create=True),
            patch("scrapers.ai_search.crawl4ai_extractor.build_extraction_instruction", return_value="instruction"),
        ):
            mock_engine.__aenter__.return_value = mock_engine
            extractor._extract_with_fallback = AsyncMock(return_value={"success": True, "product_name": "Fallback"})

            result = await extractor.extract(url, upc, "Test Product", "Test Brand")

            extractor._extract_with_fallback.assert_awaited_once_with(
                url,
                upc,
                "Test Product",
                "Test Brand",
                "<html>cached</html>",
                "cached markdown",
            )
            assert result == {"success": True, "product_name": "Fallback"}

    @pytest.mark.asyncio
    async def test_extract_returns_content_type_error_without_existing_content(self, extractor):
        """Test that content-type exceptions without cached content return a clear error."""
        url = "https://example.com/p/123"
        upc= "SKU123"

        mock_engine = AsyncMock()
        mock_engine.config = {}
        mock_engine.crawl.side_effect = TypeError("expected string or bytes-like object, got 'NoneType'")

        with patch("scrapers.ai_search.crawl4ai_extractor.Crawl4AIEngine", return_value=mock_engine):
            mock_engine.__aenter__.return_value = mock_engine

            result = await extractor.extract(url, upc, "Test Product", "Test Brand")

            assert result == {"success": False, "error": "Crawl4AI returned invalid content type"}


class TestFallbackExtractor:
    """Test suite for HTTP/meta fallback extraction behavior."""

    @pytest.fixture
    def fallback_extractor(self):
        matching = MagicMock()
        matching.is_name_match.return_value = True
        matching.is_contextual_product_name_match.return_value = True
        matching.is_brand_match.return_value = True
        return FallbackExtractor(scoring=MagicMock(), matching=matching)

    @pytest.mark.asyncio
    async def test_extract_uses_prefetched_html_meta_success(self, fallback_extractor):
        """Test successful meta extraction using pre-fetched HTML."""
        html = """
        <html>
          <head>
            <title>Acme Test Product</title>
            <meta property="og:title" content="Acme Test Product" />
            <meta property="og:description" content="A great product in 12 oz size" />
            <meta property="og:image" content="https://example.com/images/product.jpg" />
          </head>
        </html>
        """

        result = await fallback_extractor.extract(
            "https://example.com/products/test-product",
            "SKU123",
            "Acme Test Product",
            "Acme",
            html=html,
        )

        assert result["success"] is True
        assert result["product_name"] == "Acme Test Product"
        assert result["brand"] == "Acme"
        assert result["images"] == ["https://example.com/images/product.jpg"]
        assert result["categories"] == ["Product"]

    @pytest.mark.asyncio
    async def test_extract_rejects_title_mismatch(self, fallback_extractor):
        """Test fallback extraction rejects mismatched product titles."""
        fallback_extractor._matching.is_name_match.return_value = False
        fallback_extractor._matching.is_contextual_product_name_match.return_value = False
        html = """
        <html>
          <head>
            <title>Different Product</title>
            <meta property="og:title" content="Different Product" />
            <meta property="og:description" content="Not the requested product" />
            <meta property="og:image" content="https://example.com/images/product.jpg" />
          </head>
        </html>
        """

        result = await fallback_extractor.extract(
            "https://example.com/products/different-product",
            "SKU123",
            "Expected Product",
            "Acme",
            html=html,
        )

        assert result == {
            "success": False,
            "error": "Fallback extraction title does not match expected product",
        }


class TestCanonicalFacets:
    """Tests for canonical facet fields passing through the pipeline.

    Note: _normalize_llm_product_data passes product_data through as-is
    (canonical fields are preserved in the raw product_data dict).
    """

    @pytest.fixture
    def extractor(self):
        ext = Crawl4AIExtractor(
            headless=True,
            llm_model="gpt-4o-mini",
            scoring=MagicMock(),
            matching=MagicMock(),
            extraction_strategy="llm",
            llm_api_key="test-key",
        )
        return ext

    def test_canonical_facets_preserved_in_normalized_output(self, extractor):
        """Canonical facet fields from LLM output should be preserved after normalization.

        Since _normalize_llm_product_data copies the raw product_data dict,
        canonical fields pass through in their original form.
        """
        llm_payload = {
            "product_name": "Premium Dog Food Chicken Recipe 30 lb",
            "brand": "Premium Brand",
            "description": "A high-quality grain-free dog food.",
            "size_metrics": "30 lb",
            "images": [],
            "categories": ["Dog Food"],
            "animal_type": "Dog",
            "life_stage": "Adult",
            "breed_size": "Large Breed",
            "food_form": "Dry Food",
            "flavor": "Chicken",
            "primary_protein": "Chicken",
            "diet_type": "Grain-Free",
            "package_count": "12",
            "package_weight": "30 lb",
            "dimensions": "24x18x6 in",
            "packaging_type": "Bag",
            "material": "Plastic",
            "color": "Red",
        }
        with (
            patch.object(extractor, "_extraction") as mock_extraction,
        ):
            mock_extraction.normalize_product_title.return_value = "Premium Dog Food Chicken Recipe 30 lb"
            mock_extraction.clean_text.side_effect = lambda x: x or ""
            mock_extraction.infer_brand.return_value = "Premium Brand"
            mock_extraction.extract_size_metrics.return_value = "30 lb"
            mock_extraction.normalize_images.return_value = []
            mock_extraction.coerce_string_list.return_value = []
            mock_extraction.infer_categories.return_value = ["Dog Food"]

            normalized = extractor._normalize_llm_product_data(
                llm_payload,
                url="https://example.com/product",
                html="<html></html>",
                expected_name="Premium Dog Food",
                expected_brand="Premium Brand",
            )

        # Canonical fields should be preserved in normalized output
        assert normalized["animal_type"] == "Dog"
        assert normalized["life_stage"] == "Adult"
        assert normalized["breed_size"] == "Large Breed"
        assert normalized["food_form"] == "Dry Food"
        assert normalized["flavor"] == "Chicken"
        assert normalized["primary_protein"] == "Chicken"
        assert normalized["diet_type"] == "Grain-Free"
        assert normalized["package_count"] == "12"  # passed through as string
        assert normalized["package_weight"] == "30 lb"
        assert normalized["dimensions"] == "24x18x6 in"
        assert normalized["packaging_type"] == "Bag"
        assert normalized["material"] == "Plastic"
        assert normalized["color"] == "Red"

    def test_canonical_facets_without_llm_fields_not_in_output(self, extractor):
        """When LLM does not emit canonical facet fields, they should not be in output."""
        llm_payload = {
            "product_name": "Test Product",
            "brand": "Brand",
            "description": "Test",
            "size_metrics": "12 oz",
            "images": [],
            "categories": ["Cat1"],
        }
        with (
            patch.object(extractor, "_extraction") as mock_extraction,
        ):
            mock_extraction.normalize_product_title.return_value = "Test Product"
            mock_extraction.clean_text.side_effect = lambda x: x or ""
            mock_extraction.infer_brand.return_value = "Brand"
            mock_extraction.extract_size_metrics.return_value = "12 oz"
            mock_extraction.normalize_images.return_value = []
            mock_extraction.coerce_string_list.return_value = []
            mock_extraction.infer_categories.return_value = ["Cat1"]

            normalized = extractor._normalize_llm_product_data(
                llm_payload,
                url="https://example.com/product",
                html="<html></html>",
                expected_name="Test Product",
                expected_brand="Brand",
            )

        # Canonical fields should not appear in output
        for field in ("animal_type", "breed_size", "diet_type", "primary_protein",
                      "package_count", "dimensions", "packaging_type"):
            assert field not in normalized, f"Field '{field}' should not be present when LLM didn't emit it"


class TestExtractionQualityGates:
    """Tests for extraction completeness and evidence quality gates."""

    @pytest.fixture
    def extractor(self):
        return Crawl4AIExtractor(
            headless=True,
            llm_model="gpt-4o-mini",
            scoring=MagicMock(),
            matching=MagicMock(),
            extraction_strategy="llm",
            llm_api_key="test-key",
        )

    def test_completeness_check_passes_good_product(self, extractor):
        """Product with name, description, size, and categories should be complete."""
        data = {
            "product_name": "Premium Dog Food",
            "description": "High quality grain-free dog food for all breeds",
            "size_metrics": "30 lb",
            "categories": ["Dog Food", "Dry Food"],
            "animal_type": "Dog",
            "flavor": "Chicken",
        }
        result = extractor._check_extraction_completeness(data, "Premium Brand")
        assert result["is_complete"] is True
        assert result["missing_critical"] is False

    def test_completeness_check_fails_brand_only_name(self, extractor):
        """Name that is just the brand name should fail completeness."""
        data = {
            "product_name": "NUTRO",
            "description": "",
            "size_metrics": "",
            "categories": [],
        }
        result = extractor._check_extraction_completeness(data, "NUTRO")
        assert result["is_complete"] is False
        assert result["is_brand_only_name"] is True

    def test_completeness_check_fails_generic_description(self, extractor):
        """Category-collection descriptions should fail completeness."""
        data = {
            "product_name": "Some Product",
            "description": "Shop our wide selection of premium products",
            "size_metrics": "",
            "categories": ["Catalog"],
        }
        result = extractor._check_extraction_completeness(data, "Brand")
        assert result["is_complete"] is False
        assert result["is_generic_description"] is True

    def test_completeness_check_fails_missing_critical(self, extractor):
        """Missing both description and size should fail completeness."""
        data = {
            "product_name": "Product",
            "description": "",
            "size_metrics": "",
            "categories": ["Weak Cat"],
        }
        result = extractor._check_extraction_completeness(data, "Brand")
        assert result["is_complete"] is False
        assert result["missing_critical"] is True


class TestLogoImageRejection:
    """Tests for logo/icon/placeholder image rejection in extraction pipeline."""

    def test_image_filter_rejects_logo_urls(self):
        """Logo URLs should be rejected by the image validation logic."""
        from scrapers.ai_search.platform_extraction import _is_valid_product_image
        logo_urls = [
            "https://cdn.example.com/stencil/bci-logo_12345.png",
            "https://example.com/images/company-logo.svg",
            "https://example.com/icon-50x50.png",
            "https://example.com/placeholder-300x300.jpg",
            "https://example.com/no-image-available.png",
        ]
        for url in logo_urls:
            assert not _is_valid_product_image(url), f"'{url}' should be rejected as logo/placeholder"

    def test_image_filter_allows_product_images(self):
        """Actual product images should pass validation."""
        from scrapers.ai_search.platform_extraction import _is_valid_product_image
        product_urls = [
            "https://cdn.example.com/products/12345_main.jpg",
            "https://example.com/images/product-name-large.jpg",
            "https://cdn.shopify.com/s/files/1/2345/product_image.jpeg",
        ]
        for url in product_urls:
            assert _is_valid_product_image(url), f"'{url}' should be accepted as product image"
