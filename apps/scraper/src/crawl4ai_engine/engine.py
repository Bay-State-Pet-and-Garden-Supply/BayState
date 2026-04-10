"""Crawl4AI Engine - Main async crawler engine."""

import asyncio as _asyncio
import random as _random
import time as _time
from types import SimpleNamespace
from typing import Any, Optional
import logging
import re
from urllib.parse import urlparse

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from crawl4ai.content_filter_strategy import PruningContentFilter
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

from .metrics import ExtractionMode, ErrorType, get_metrics_collector
from .types import EngineConfig

logger = logging.getLogger(__name__)


class Crawl4AIEngine:
    """Async context manager for Crawl4AI web scraping.

    Matches existing executor interface patterns in the scraper framework.
    AI/Agentic features are deprecated for static scrapers.
    """

    def __init__(self, config: dict[str, Any] | EngineConfig) -> None:
        """Initialize the engine with configuration.

        Args:
            config: Configuration dictionary containing crawler settings.
        """
        self.config = self._normalize_config(config)
        self._crawler: Optional[AsyncWebCrawler] = None
        self._browser_config = self._build_browser_config()

    @staticmethod
    def _normalize_config(config: dict[str, Any] | EngineConfig) -> dict[str, Any]:
        """Normalize supported config inputs into the dict shape used internally."""
        if isinstance(config, dict):
            return config

        if isinstance(config, EngineConfig):
            browser: dict[str, Any] = {
                "headless": config.headless,
                "browser_type": config.browser_type,
                "user_agent": config.user_agent,
                "proxy": config.proxy,
                "extra_args": config.extra_browser_args or None,
                "verbose": config.verbose,
            }
            crawler: dict[str, Any] = {
                "timeout": int(config.timeout * 1000),
                "concurrency_limit": config.max_concurrent_crawls,
                "max_retries": config.max_retries if config.enable_retry else 0,
            }
            return {
                "browser": {key: value for key, value in browser.items() if value is not None},
                "crawler": {key: value for key, value in crawler.items() if value is not None},
            }

        raise TypeError("Crawl4AIEngine config must be a dict or EngineConfig")

    @property
    def crawler(self) -> AsyncWebCrawler:
        """Get the crawler instance."""
        if self._crawler is None:
            raise RuntimeError("Crawler not initialized. Use async context manager.")
        return self._crawler

    @staticmethod
    def _coerce_int(value: Any, default: int) -> int:
        """Convert a value to int when possible, otherwise return default."""
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str):
            try:
                return int(float(value))
            except ValueError:
                return default
        return default

    @staticmethod
    def _normalize_markdown_result(markdown_result: Any) -> dict[str, Optional[str]]:
        """Normalize Crawl4AI markdown output into plain strings."""
        if isinstance(markdown_result, str):
            return {
                "markdown": markdown_result,
                "raw_markdown": markdown_result,
                "fit_markdown": None,
                "fit_html": None,
                "markdown_with_citations": None,
                "references_markdown": None,
            }

        raw_markdown = getattr(markdown_result, "raw_markdown", None)
        fit_markdown = getattr(markdown_result, "fit_markdown", None)
        fit_html = getattr(markdown_result, "fit_html", None)
        markdown_with_citations = getattr(markdown_result, "markdown_with_citations", None)
        references_markdown = getattr(markdown_result, "references_markdown", None)

        normalized_raw = raw_markdown if isinstance(raw_markdown, str) else None
        normalized_fit = fit_markdown if isinstance(fit_markdown, str) else None
        normalized_fit_html = fit_html if isinstance(fit_html, str) else None
        normalized_citations = markdown_with_citations if isinstance(markdown_with_citations, str) else None
        normalized_references = references_markdown if isinstance(references_markdown, str) else None
        best_markdown = normalized_fit or normalized_raw or normalized_citations

        return {
            "markdown": best_markdown,
            "raw_markdown": normalized_raw,
            "fit_markdown": normalized_fit,
            "fit_html": normalized_fit_html,
            "markdown_with_citations": normalized_citations,
            "references_markdown": normalized_references,
        }

    @staticmethod
    def _extract_error_text(result: Any) -> Optional[str]:
        """Extract the most useful error text from a Crawl4AI result."""
        for attribute in ("error", "error_message"):
            value = getattr(result, attribute, None)
            if value is not None:
                return str(value)
        return None

    def _build_result_payload(self, fallback_triggered: bool, result: Any, source_url: str) -> dict[str, Any]:
        """Normalize Crawl4AI results into the engine payload shape."""
        success = bool(getattr(result, "success", False))
        final_url = str(getattr(result, "url", source_url) or source_url)
        markdown_payload = self._normalize_markdown_result(getattr(result, "markdown", None))
        metadata = getattr(result, "metadata", None)
        links = getattr(result, "links", None)
        media = getattr(result, "media", None)

        return {
            "url": final_url,
            "success": success,
            "html": getattr(result, "html", None) if success else None,
            "cleaned_html": getattr(result, "cleaned_html", None) if success else None,
            "markdown": markdown_payload["markdown"] if success else None,
            "raw_markdown": markdown_payload["raw_markdown"] if success else None,
            "fit_markdown": markdown_payload["fit_markdown"] if success else None,
            "fit_html": markdown_payload["fit_html"] if success else None,
            "markdown_with_citations": markdown_payload["markdown_with_citations"] if success else None,
            "references_markdown": markdown_payload["references_markdown"] if success else None,
            "extracted_content": getattr(result, "extracted_content", None) if success else None,
            "error": None if success else self._extract_error_text(result),
            "metadata": metadata if isinstance(metadata, dict) else {},
            "links": links if isinstance(links, dict) else {},
            "media": media if isinstance(media, dict) else {},
            "fallback_triggered": fallback_triggered,
        }

    def _build_markdown_generator(self, run_settings: dict[str, Any]) -> Optional[DefaultMarkdownGenerator]:
        """Build the markdown generator used for Crawl4AI runs."""
        if not run_settings.get("pruning_enabled", False):
            return None

        content_filter = PruningContentFilter(
            user_query=run_settings.get("pruning_user_query"),
            min_word_threshold=run_settings.get("pruning_min_word_threshold"),
            threshold_type=run_settings.get("pruning_threshold_type", "fixed"),
            threshold=float(run_settings.get("pruning_threshold", 0.48)),
        )
        return DefaultMarkdownGenerator(
            content_filter=content_filter,
            options=run_settings.get("markdown_options"),
            content_source=str(run_settings.get("markdown_content_source", "cleaned_html")),
        )

    def _build_browser_config(self) -> BrowserConfig:
        """Build browser configuration from config dict."""
        browser_settings = self.config.get("browser", {})
        viewport = browser_settings.get("viewport")
        viewport_width = self._coerce_int(browser_settings.get("viewport_width"), 1080)
        viewport_height = self._coerce_int(browser_settings.get("viewport_height"), 600)
        if isinstance(viewport, dict):
            viewport_width = self._coerce_int(viewport.get("width"), viewport_width)
            viewport_height = self._coerce_int(viewport.get("height"), viewport_height)

        browser_config_kwargs: dict[str, Any] = {
            "browser_type": browser_settings.get("browser_type", "chromium"),
            "headless": browser_settings.get("headless", True),
            "viewport_width": viewport_width,
            "viewport_height": viewport_height,
            "ignore_https_errors": browser_settings.get("ignore_https_errors", False),
            "java_script_enabled": browser_settings.get(
                "java_script_enabled",
                browser_settings.get("js_enabled", self.config.get("crawler", {}).get("js_enabled", True)),
            ),
            "enable_stealth": browser_settings.get("enable_stealth", False),
            "use_persistent_context": browser_settings.get("use_persistent_context", False),
            "user_data_dir": browser_settings.get("user_data_dir"),
            "proxy": browser_settings.get("proxy"),
            "proxy_config": browser_settings.get("proxy_config"),
            "cookies": browser_settings.get("cookies"),
            "headers": browser_settings.get("headers"),
            "verbose": browser_settings.get("verbose", False),
            "text_mode": browser_settings.get("text_mode", False),
            "light_mode": browser_settings.get("light_mode", False),
            "extra_args": browser_settings.get("extra_args"),
        }
        user_agent = browser_settings.get("user_agent")
        if isinstance(user_agent, str) and user_agent.strip():
            browser_config_kwargs["user_agent"] = user_agent
        if "user_agent_mode" in browser_settings:
            browser_config_kwargs["user_agent_mode"] = browser_settings.get("user_agent_mode", "")
        if "user_agent_generator_config" in browser_settings:
            browser_config_kwargs["user_agent_generator_config"] = browser_settings.get("user_agent_generator_config", {})
        return BrowserConfig(**browser_config_kwargs)

    def _build_run_config(self, session_id: Optional[str] = None, url_matcher: Optional[str] = None) -> CrawlerRunConfig:
        """Build crawler run configuration from config dict.
        
        Args:
            session_id: Optional override for session ID.
            url_matcher: Optional URL matcher for per-URL batch configs.
        """
        run_settings = self.config.get("crawler", {})
        
        # Map string cache mode to Enum
        cache_mode_str = run_settings.get("cache_mode", "ENABLED").upper()
        try:
            cache_mode = CacheMode[cache_mode_str]
        except KeyError:
            logger.warning(f"Invalid cache mode '{cache_mode_str}', defaulting to ENABLED")
            cache_mode = CacheMode.ENABLED

        # Extraction strategy handling - exclusively static for the engine
        extraction_strategy = run_settings.get("extraction_strategy")

        # Content filtering
        markdown_generator = self._build_markdown_generator(run_settings)
        semaphore_count = self._coerce_int(run_settings.get("semaphore_count", run_settings.get("concurrency_limit")), 3)
        page_timeout = self._coerce_int(run_settings.get("page_timeout", run_settings.get("timeout")), 30000)

        return CrawlerRunConfig(
            # v0.4+ advanced features
            magic=run_settings.get("magic", True),
            simulate_user=run_settings.get("simulate_user", True),
            remove_overlay_elements=run_settings.get("remove_overlay_elements", True),
            session_id=session_id or run_settings.get("session_id"),
            cache_mode=cache_mode,
            
            # Content filtering
            css_selector=run_settings.get("css_selector"),
            excluded_tags=run_settings.get("excluded_tags", ["nav", "footer", "header", "aside"]),
            markdown_generator=markdown_generator,
            
            # Standard settings
            js_code=run_settings.get("js_code"),
            wait_for=run_settings.get("wait_for"),
            wait_until=run_settings.get("wait_until", "domcontentloaded"),
            wait_for_images=run_settings.get("wait_for_images", False),
            page_timeout=page_timeout,
            mean_delay=run_settings.get("mean_delay", 0.1),
            max_range=run_settings.get("max_range", 0.3),
            semaphore_count=semaphore_count,
            capture_network_requests=run_settings.get("capture_network_requests", False),
            capture_console_messages=run_settings.get("capture_console_messages", False),
            log_console=run_settings.get("log_console", False),
            check_robots_txt=run_settings.get("check_robots_txt", False),
            link_preview_config=run_settings.get("link_preview_config"),
            virtual_scroll_config=run_settings.get("virtual_scroll_config"),
            stream=run_settings.get("stream", False),
            user_agent=run_settings.get("user_agent"),
            url_matcher=url_matcher,
            extraction_strategy=extraction_strategy,
        )

    def _get_domain_session_id(self, url: str) -> str:
        """Extract domain from URL to use as session ID."""
        parsed = urlparse(url)
        domain = parsed.netloc or "default"
        safe_domain = re.sub(r"[^a-zA-Z0-9]+", "_", domain).strip("_") or "default"
        return f"session_{safe_domain}"

    async def __aenter__(self) -> "Crawl4AIEngine":
        """Enter async context manager."""
        await self.initialize()
        return self

    async def __aexit__(self, exc_type: Optional[type], exc_val: Optional[BaseException], exc_tb: Any) -> None:
        """Exit async context manager."""
        await self.cleanup()

    def _create_crawler(self) -> AsyncWebCrawler:
        """Build the AsyncWebCrawler instance for the current browser config."""
        return AsyncWebCrawler(config=self._browser_config)

    async def initialize(self) -> None:
        """Initialize the underlying crawler.

        Older benchmark helpers call this method directly instead of using the
        async context manager, so keep the explicit lifecycle API available.
        """
        if self._crawler is not None:
            return

        self._crawler = self._create_crawler()
        await self._crawler.__aenter__()

    async def cleanup(self) -> None:
        """Dispose of the underlying crawler if it was initialized."""
        if self._crawler is None:
            return

        await self._crawler.__aexit__(None, None, None)
        self._crawler = None

    async def crawl(self, url: str) -> dict[str, Any]:
        """Crawl a single URL.

        Args:
            url: The URL to crawl.

        Returns:
            Dictionary containing crawl results.
        """
        if not self._crawler:
            raise RuntimeError("Crawler not initialized. Use async context manager.")

        # Use domain-persistent session ID if not explicitly provided
        session_id = self.config.get("crawler", {}).get("session_id")
        if not session_id:
            session_id = self._get_domain_session_id(url)
            
        run_config = self._build_run_config(session_id=session_id)

        has_extraction_strategy = run_config.extraction_strategy is not None
        extraction_mode = ExtractionMode.LLM if has_extraction_strategy else ExtractionMode.LLM_FREE
        crawl_start = _time.perf_counter()

        # Retry transient exceptions (timeouts, connection errors).
        # Non-success results (403/429) are not exceptions — handled by fallback below.
        max_retries = self.config.get("crawler", {}).get("max_retries", 2)
        last_exc: Exception | None = None
        result = None
        for attempt in range(max_retries + 1):
            try:
                result = await self._crawler.arun(url=url, config=run_config)
                last_exc = None
                break
            except Exception as exc:
                last_exc = exc
                error_str = str(exc).lower()
                is_transient = any(kw in error_str for kw in ("timeout", "timed out", "connection", "network", "dns"))
                if not is_transient or attempt >= max_retries:
                    raise
                delay = min(1.0 * (2 ** attempt), 10.0) + _random.uniform(0, 0.5)
                logger.warning(
                    "Transient error on attempt %d/%d for %s: %s — retrying in %.1fs",
                    attempt + 1, max_retries + 1, url, exc, delay,
                )
                await _asyncio.sleep(delay)
        
        duration_ms = (_time.perf_counter() - crawl_start) * 1000
        fallback_fn = self.config.get("crawler", {}).get("fallback_fetch_function")
        fallback_triggered = False
        error_text = (self._extract_error_text(result) or "").lower()
        
        if not result.success and fallback_fn:
            if "403" in error_text or "429" in error_text or "forbidden" in error_text or "too many requests" in error_text:
                logger.info(f"Escalation triggered for {url} due to error: {self._extract_error_text(result)}")
                fallback_triggered = True

                # Record the failed crawl attempt before fallback
                error_type = self._classify_error_type(error_text)
                anti_bot = error_type in (ErrorType.ANTI_BOT_DETECTED, ErrorType.RATE_LIMIT)
                get_metrics_collector().record_extraction(
                    url=url,
                    mode=extraction_mode,
                    success=False,
                    duration_ms=duration_ms,
                    error_type=error_type,
                    error_message=self._extract_error_text(result),
                    anti_bot_triggered=anti_bot,
                )

                fallback_result = await fallback_fn(url)
                fallback_result["fallback_triggered"] = True
                return fallback_result

        # Record metrics for the crawl
        success = bool(getattr(result, "success", False))
        error_type_val: ErrorType | None = None
        if not success:
            error_type_val = self._classify_error_type(error_text)
        get_metrics_collector().record_extraction(
            url=url,
            mode=extraction_mode,
            success=success,
            duration_ms=duration_ms,
            error_type=error_type_val,
            error_message=self._extract_error_text(result) if not success else None,
        )

        return self._build_result_payload(fallback_triggered=fallback_triggered, result=result, source_url=url)

    @staticmethod
    def _classify_error_type(error_text: str) -> ErrorType:
        """Classify an error string into an ErrorType for metrics."""
        if not error_text:
            return ErrorType.UNKNOWN
        if "timeout" in error_text or "timed out" in error_text:
            return ErrorType.TIMEOUT
        if "429" in error_text or "rate limit" in error_text or "too many requests" in error_text:
            return ErrorType.RATE_LIMIT
        if "403" in error_text or "forbidden" in error_text or "blocked" in error_text or "captcha" in error_text:
            return ErrorType.ANTI_BOT_DETECTED
        if "network" in error_text or "connection" in error_text or "dns" in error_text:
            return ErrorType.NETWORK_ERROR
        return ErrorType.UNKNOWN

    async def crawl_many(self, urls: list[str]) -> list[dict[str, Any]]:
        """Crawl multiple URLs concurrently using arun_many.

        Args:
            urls: List of URLs to crawl.

        Returns:
            List of crawl results.
        """
        if not self._crawler:
            raise RuntimeError("Crawler not initialized. Use async context manager.")

        global_session_id = self.config.get("crawler", {}).get("session_id")

        if global_session_id:
            run_config: CrawlerRunConfig | list[CrawlerRunConfig] = self._build_run_config(session_id=global_session_id)
        else:
            run_config = [
                self._build_run_config(session_id=self._get_domain_session_id(url), url_matcher=url)
                for url in urls
            ]

        batch_start = _time.perf_counter()
        results = await self._crawler.arun_many(
            urls=urls,
            config=run_config,
        )
        batch_duration_ms = (_time.perf_counter() - batch_start) * 1000

        def _record_and_build(item: Any) -> dict[str, Any]:
            item_url = str(getattr(item, "url", ""))
            item_success = bool(getattr(item, "success", False))
            per_item_ms = batch_duration_ms / max(len(urls), 1)
            error_text = (self._extract_error_text(item) or "").lower() if not item_success else ""
            get_metrics_collector().record_extraction(
                url=item_url,
                mode=ExtractionMode.LLM_FREE,
                success=item_success,
                duration_ms=per_item_ms,
                error_type=self._classify_error_type(error_text) if not item_success else None,
                error_message=self._extract_error_text(item) if not item_success else None,
            )
            return self._build_result_payload(fallback_triggered=False, result=item, source_url=item_url)

        if hasattr(results, "__aiter__"):
            collected_results: list[dict[str, Any]] = []
            async for item in results:
                collected_results.append(_record_and_build(item))
            return collected_results

        return [_record_and_build(item) for item in results]

    async def crawl_multiple(self, urls: list[str]) -> list[Any]:
        """Compatibility wrapper for legacy benchmark callers.

        The historical API returned attribute-style result objects; the newer
        engine uses normalized dictionaries internally. Adapt the modern output
        back into a simple attribute-bearing shape for callers that still use
        ``getattr(result, "success", ...)``.
        """
        return [SimpleNamespace(**result) for result in await self.crawl_many(urls)]

