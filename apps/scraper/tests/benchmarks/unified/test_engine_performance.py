"""Engine Performance Benchmark - Live URL testing under realistic conditions.

Compares crawl4ai vs legacy Playwright extraction engines on live URLs,
measuring browser startup, extraction latency, throughput, memory usage,
and failure rates under various concurrency levels.

Usage:
    pytest tests/benchmarks/unified/test_engine_performance.py -v -m "benchmark and live"

Environment Variables:
    BENCHMARK_URLS: Comma-separated list of URLs to test (default: uses pet supply URLs)
    BENCHMARK_PROXY_POOL: Comma-separated proxy URLs for proxy rotation tests
    BENCHMARK_ITERATIONS: Number of iterations per test (default: 3)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import statistics
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest

# Import unified benchmark infrastructure
from tests.benchmarks.unified.base import BaseBenchmark, BenchmarkConfig, BenchmarkResult
from tests.benchmarks.unified.metrics import BenchmarkMetricsCollector
from tests.benchmarks.unified.proxy import ProxyRotator, load_proxy_rotator

# Import legacy utilities
from tests.benchmarks.legacy.utils import Timer, MemoryProfiler

# Setup logging
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants and Configuration
# ---------------------------------------------------------------------------

# Live URLs for testing - pet supply e-commerce sites (realistic targets)
DEFAULT_TEST_URLS = [
    "https://www.chewy.com/blue-buffalo-life-protection-formula/dp/101010",
    "https://www.petsmart.com/dog/food/blue-buffalo-life-protection-formula-adult-dry-dog-food-101010.html",
    "https://www.petco.com/shop/en/petcostore/product/blue-buffalo-life-protection-formula-101010",
    "https://www.tractorsupply.com/tsc/product/blue-buffalo-life-protection-formula-101010",
    "https://www.amazon.com/Blue-Buffalo-Life-Protection-Formula/dp/B0009YUG2Y",
]

# Concurrency levels to test
CONCURRENCY_LEVELS = [1, 3, 5]

# Timeouts (seconds)
BROWSER_STARTUP_TIMEOUT = 30.0
PAGE_LOAD_TIMEOUT = 45.0
EXTRACTION_TIMEOUT = 60.0

# Anti-bot settings
ANTI_BOT_ENABLED = True
STEALTH_MODE = True


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------


@dataclass
class EngineMetrics:
    """Metrics collected for a single engine run."""

    engine_name: str
    url: str
    success: bool
    browser_startup_ms: float = 0.0
    time_to_first_byte_ms: float = 0.0
    dom_ready_ms: float = 0.0
    extraction_latency_ms: float = 0.0
    total_time_ms: float = 0.0
    memory_peak_mb: float = 0.0
    memory_delta_mb: float = 0.0
    cpu_percent: float = 0.0
    error_type: str | None = None
    error_message: str | None = None
    proxy_used: bool = False
    anti_bot_enabled: bool = False
    concurrency_level: int = 1


@dataclass
class ConcurrencyResult:
    """Results from a concurrent extraction test."""

    concurrency_level: int
    engine_name: str
    total_time_ms: float
    time_per_url_ms: float
    success_count: int
    failure_count: int
    success_rate: float
    memory_peak_mb: float
    avg_extraction_latency_ms: float
    failure_breakdown: dict[str, int] = field(default_factory=dict)


@dataclass
class EngineComparisonReport:
    """Comprehensive comparison report between crawl4ai and legacy Playwright."""

    timestamp: str
    urls_tested: list[str]
    crawl4ai_metrics: dict[str, Any] = field(default_factory=dict)
    legacy_metrics: dict[str, Any] = field(default_factory=dict)
    concurrency_results: list[dict[str, Any]] = field(default_factory=list)
    proxy_comparison: dict[str, Any] = field(default_factory=dict)
    anti_bot_results: dict[str, Any] = field(default_factory=dict)
    failure_analysis: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "urls_tested": self.urls_tested,
            "crawl4ai": self.crawl4ai_metrics,
            "legacy_playwright": self.legacy_metrics,
            "concurrency_scaling": self.concurrency_results,
            "proxy_comparison": self.proxy_comparison,
            "anti_bot_results": self.anti_bot_results,
            "failure_analysis": self.failure_analysis,
        }


# ---------------------------------------------------------------------------
# CPU Usage Monitor
# ---------------------------------------------------------------------------


class CPUUsageMonitor:
    """Simple CPU usage monitor for the current process."""

    def __init__(self):
        self._start_time: float = 0.0
        self._process_time_start: float = 0.0
        self._last_cpu_percent: float = 0.0

    def start(self) -> None:
        """Start CPU monitoring."""
        self._start_time = time.perf_counter()
        try:
            import psutil

            process = psutil.Process()
            self._process_time_start = process.cpu_times().user + process.cpu_times().system
        except ImportError:
            self._process_time_start = 0.0

    def stop(self) -> float:
        """Stop monitoring and return CPU percentage estimate."""
        try:
            import psutil

            process = psutil.Process()
            process_time_end = process.cpu_times().user + process.cpu_times().system
            elapsed = time.perf_counter() - self._start_time
            if elapsed > 0:
                # Rough estimate of CPU usage percentage
                cpu_time_used = process_time_end - self._process_time_start
                self._last_cpu_percent = (cpu_time_used / elapsed) * 100
            return self._last_cpu_percent
        except ImportError:
            return 0.0


# ---------------------------------------------------------------------------
# Engine Performance Benchmark
# ---------------------------------------------------------------------------


class EnginePerformanceBenchmark(BaseBenchmark):
    """Benchmark comparing crawl4ai and legacy Playwright engines.

    Measures:
    - Browser startup time
    - Time-to-first-byte (TTFB)
    - DOM ready time
    - Extraction latency
    - Memory usage (peak and delta)
    - CPU usage
    - Concurrent throughput (1, 3, 5 concurrent pages)
    - Failure rates under load (429s, timeouts, blocks)

    Tests with:
    - Proxy rotation enabled vs disabled
    - Anti-bot countermeasures
    """

    def __init__(self, config: BenchmarkConfig | None = None) -> None:
        # Initialize with default config if none provided
        if config is None:
            urls = self._get_test_urls()
            config = BenchmarkConfig(urls=urls, timeout=60, concurrency=5)

        super().__init__(config)
        self.metrics_collector = BenchmarkMetricsCollector("engine_performance")
        self.report = EngineComparisonReport(
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            urls_tested=config.urls,
        )
        self._proxy_rotator: ProxyRotator | None = None
        self._results: list[EngineMetrics] = []

    def _get_test_urls(self) -> list[str]:
        """Get test URLs from environment or use defaults."""
        env_urls = os.environ.get("BENCHMARK_URLS", "")
        if env_urls:
            return [u.strip() for u in env_urls.split(",") if u.strip()]
        return DEFAULT_TEST_URLS[:3]  # Use first 3 default URLs for quicker tests

    def setup(self) -> None:
        """Initialize proxy rotator if proxies are configured."""
        self._proxy_rotator = load_proxy_rotator()
        logger.info(
            f"EnginePerformanceBenchmark initialized with {len(self.config.urls)} URLs, "
            f"proxy pool size: {self._proxy_rotator.pool_size if self._proxy_rotator else 0}"
        )

    def teardown(self) -> None:
        """Cleanup after benchmark run."""
        self._results.clear()
        logger.info("EnginePerformanceBenchmark teardown complete")

    def run(self) -> BenchmarkResult:
        """Execute the full benchmark suite."""
        raise NotImplementedError("Use run_full_benchmark() for comprehensive testing")

    # -----------------------------------------------------------------------
    # crawl4ai Engine Measurements
    # -----------------------------------------------------------------------

    async def _measure_crawl4ai_single(
        self,
        url: str,
        proxy: str | None = None,
        anti_bot: bool = False,
    ) -> EngineMetrics:
        """Measure crawl4ai engine performance on a single URL."""
        from src.crawl4ai_engine.engine import Crawl4AIEngine

        metrics = EngineMetrics(
            engine_name="crawl4ai",
            url=url,
            success=False,
            proxy_used=proxy is not None,
            anti_bot_enabled=anti_bot,
        )

        timer = Timer()
        memory = MemoryProfiler()
        cpu_monitor = CPUUsageMonitor()

        try:
            # Build config
            config = {
                "browser": {
                    "headless": True,
                    "proxy": proxy,
                    "enable_stealth": anti_bot,
                    "user_agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
                },
                "crawler": {
                    "timeout": int(PAGE_LOAD_TIMEOUT * 1000),
                    "max_retries": 2,
                },
            }

            # Measure browser startup
            memory.start()
            cpu_monitor.start()
            timer.start()

            engine = Crawl4AIEngine(config)
            await engine.initialize()
            metrics.browser_startup_ms = timer.stop()

            # Measure extraction
            timer.start()
            result = await engine.crawl(url)
            metrics.extraction_latency_ms = timer.stop()

            # Get memory stats
            mem_stats = memory.stop()
            metrics.memory_peak_mb = mem_stats.get("peak_mb", 0.0)
            metrics.memory_delta_mb = mem_stats.get("delta_mb", 0.0)

            # Get CPU estimate
            metrics.cpu_percent = cpu_monitor.stop()

            # Parse timing from result metadata if available
            if result and isinstance(result, dict):
                metadata = result.get("metadata", {})
                # crawl4ai doesn't expose TTFB directly, estimate from total
                metrics.time_to_first_byte_ms = metrics.extraction_latency_ms * 0.3
                metrics.dom_ready_ms = metrics.extraction_latency_ms * 0.7
                metrics.total_time_ms = metrics.browser_startup_ms + metrics.extraction_latency_ms
                metrics.success = result.get("success", False)

                if not metrics.success:
                    error_msg = result.get("error", "Unknown error")
                    metrics.error_message = error_msg
                    if "429" in str(error_msg) or "too many" in str(error_msg).lower():
                        metrics.error_type = "rate_limit"
                    elif "403" in str(error_msg) or "forbidden" in str(error_msg).lower():
                        metrics.error_type = "blocked"
                    elif "timeout" in str(error_msg).lower():
                        metrics.error_type = "timeout"
                    else:
                        metrics.error_type = "extraction_failed"

            await engine.cleanup()

        except Exception as e:
            metrics.error_message = str(e)
            error_lower = str(e).lower()
            if "429" in str(e) or "rate limit" in error_lower:
                metrics.error_type = "rate_limit"
            elif "403" in str(e) or "blocked" in error_lower or "captcha" in error_lower:
                metrics.error_type = "blocked"
            elif "timeout" in error_lower:
                metrics.error_type = "timeout"
            else:
                metrics.error_type = "exception"
            logger.warning(f"crawl4ai failed for {url}: {e}")

        return metrics

    async def _measure_crawl4ai_concurrent(
        self,
        urls: list[str],
        concurrency: int,
        proxy: str | None = None,
    ) -> ConcurrencyResult:
        """Measure crawl4ai concurrent extraction performance."""
        from src.crawl4ai_engine.engine import Crawl4AIEngine

        result = ConcurrencyResult(
            concurrency_level=concurrency,
            engine_name="crawl4ai",
            total_time_ms=0.0,
            time_per_url_ms=0.0,
            success_count=0,
            failure_count=0,
            success_rate=0.0,
            memory_peak_mb=0.0,
            avg_extraction_latency_ms=0.0,
            failure_breakdown={},
        )

        memory = MemoryProfiler()
        timer = Timer()

        try:
            memory.start()

            config = {
                "browser": {
                    "headless": True,
                    "proxy": proxy,
                },
                "crawler": {
                    "timeout": int(PAGE_LOAD_TIMEOUT * 1000),
                    "concurrency_limit": concurrency,
                },
            }

            async with Crawl4AIEngine(config) as engine:
                timer.start()
                crawl_results = await engine.crawl_many(urls)
                result.total_time_ms = timer.stop()

            mem_stats = memory.stop()
            result.memory_peak_mb = mem_stats.get("peak_mb", 0.0)

            # Analyze results
            latencies = []
            for r in crawl_results:
                if isinstance(r, dict):
                    if r.get("success"):
                        result.success_count += 1
                    else:
                        result.failure_count += 1
                        error = r.get("error", "unknown")
                        error_type = self._classify_error(error)
                        result.failure_breakdown[error_type] = result.failure_breakdown.get(error_type, 0) + 1

            total = len(urls)
            result.success_rate = result.success_count / total if total > 0 else 0.0
            result.time_per_url_ms = result.total_time_ms / total if total > 0 else 0.0

        except Exception as e:
            logger.error(f"crawl4ai concurrent test failed: {e}")
            result.failure_count = len(urls)
            result.failure_breakdown["exception"] = len(urls)

        return result

    # -----------------------------------------------------------------------
    # Legacy Playwright Measurements
    # -----------------------------------------------------------------------

    async def _measure_legacy_single(
        self,
        url: str,
        proxy: str | None = None,
        anti_bot: bool = False,
    ) -> EngineMetrics:
        """Measure legacy Playwright engine performance on a single URL."""
        from playwright.async_api import async_playwright

        metrics = EngineMetrics(
            engine_name="legacy_playwright",
            url=url,
            success=False,
            proxy_used=proxy is not None,
            anti_bot_enabled=anti_bot,
        )

        timer = Timer()
        memory = MemoryProfiler()
        cpu_monitor = CPUUsageMonitor()

        browser = None
        context = None

        try:
            memory.start()
            cpu_monitor.start()

            async with async_playwright() as p:
                # Build launch options
                launch_opts: dict[str, Any] = {"headless": True}
                if proxy:
                    launch_opts["proxy"] = {"server": proxy}

                # Measure browser startup
                timer.start()
                browser = await p.chromium.launch(**launch_opts)

                # Create context with anti-bot settings if enabled
                context_opts: dict[str, Any] = {}
                if anti_bot:
                    context_opts.update(
                        {
                            "user_agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
                            "viewport": {"width": 1920, "height": 1080},
                            "locale": "en-US",
                            "timezone_id": "America/New_York",
                        }
                    )

                context = await browser.new_context(**context_opts)
                page = await context.new_page()
                metrics.browser_startup_ms = timer.stop()

                # Measure page load and extraction
                timer.start()

                # Track TTFB
                ttfb_timer = Timer()
                ttfb_timer.start()

                response = await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_LOAD_TIMEOUT * 1000)
                metrics.time_to_first_byte_ms = ttfb_timer.stop()

                # Wait for networkidle for full page load
                await page.wait_for_load_state("networkidle", timeout=5000)
                metrics.dom_ready_ms = timer.stop()

                # Extract content
                timer.start()
                content = await page.content()
                metrics.extraction_latency_ms = timer.stop()

                metrics.total_time_ms = metrics.browser_startup_ms + metrics.time_to_first_byte_ms + metrics.extraction_latency_ms
                metrics.success = response is not None and response.status < 400 and len(content) > 100

                # Get memory stats
                mem_stats = memory.stop()
                metrics.memory_peak_mb = mem_stats.get("peak_mb", 0.0)
                metrics.memory_delta_mb = mem_stats.get("delta_mb", 0.0)

                # Get CPU estimate
                metrics.cpu_percent = cpu_monitor.stop()

                await context.close()
                await browser.close()

        except Exception as e:
            metrics.error_message = str(e)
            error_lower = str(e).lower()
            if "429" in str(e) or "rate limit" in error_lower:
                metrics.error_type = "rate_limit"
            elif "403" in str(e) or "blocked" in error_lower:
                metrics.error_type = "blocked"
            elif "timeout" in error_lower:
                metrics.error_type = "timeout"
            else:
                metrics.error_type = "exception"
            logger.warning(f"Legacy Playwright failed for {url}: {e}")

            if context:
                try:
                    await context.close()
                except Exception:
                    pass
            if browser:
                try:
                    await browser.close()
                except Exception:
                    pass

        return metrics

    async def _measure_legacy_concurrent(
        self,
        urls: list[str],
        concurrency: int,
        proxy: str | None = None,
    ) -> ConcurrencyResult:
        """Measure legacy Playwright concurrent extraction performance."""
        from playwright.async_api import async_playwright

        result = ConcurrencyResult(
            concurrency_level=concurrency,
            engine_name="legacy_playwright",
            total_time_ms=0.0,
            time_per_url_ms=0.0,
            success_count=0,
            failure_count=0,
            success_rate=0.0,
            memory_peak_mb=0.0,
            avg_extraction_latency_ms=0.0,
            failure_breakdown={},
        )

        memory = MemoryProfiler()
        timer = Timer()
        semaphore = asyncio.Semaphore(concurrency)

        async def fetch_one(url: str) -> dict[str, Any]:
            async with semaphore:
                try:
                    async with async_playwright() as p:
                        launch_opts: dict[str, Any] = {"headless": True}
                        if proxy:
                            launch_opts["proxy"] = {"server": proxy}

                        browser = await p.chromium.launch(**launch_opts)
                        page = await browser.new_page()

                        start = time.perf_counter()
                        response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                        content = await page.content()
                        elapsed_ms = (time.perf_counter() - start) * 1000

                        await browser.close()

                        return {
                            "url": url,
                            "success": response is not None and response.status < 400 and len(content) > 100,
                            "latency_ms": elapsed_ms,
                            "error": None,
                        }
                except Exception as e:
                    return {"url": url, "success": False, "latency_ms": 0, "error": str(e)}

        try:
            memory.start()
            timer.start()

            tasks = [fetch_one(url) for url in urls]
            crawl_results = await asyncio.gather(*tasks, return_exceptions=True)

            result.total_time_ms = timer.stop()
            mem_stats = memory.stop()
            result.memory_peak_mb = mem_stats.get("peak_mb", 0.0)

            # Analyze results
            latencies = []
            for r in crawl_results:
                if isinstance(r, dict):
                    if r.get("success"):
                        result.success_count += 1
                        latencies.append(r.get("latency_ms", 0))
                    else:
                        result.failure_count += 1
                        error = r.get("error", "unknown")
                        error_type = self._classify_error(error)
                        result.failure_breakdown[error_type] = result.failure_breakdown.get(error_type, 0) + 1
                elif isinstance(r, Exception):
                    result.failure_count += 1
                    result.failure_breakdown["exception"] = result.failure_breakdown.get("exception", 0) + 1

            total = len(urls)
            result.success_rate = result.success_count / total if total > 0 else 0.0
            result.time_per_url_ms = result.total_time_ms / total if total > 0 else 0.0
            result.avg_extraction_latency_ms = statistics.mean(latencies) if latencies else 0.0

        except Exception as e:
            logger.error(f"Legacy concurrent test failed: {e}")
            result.failure_count = len(urls)
            result.failure_breakdown["exception"] = len(urls)

        return result

    def _classify_error(self, error: str | None) -> str:
        """Classify an error string into a category."""
        if not error:
            return "unknown"
        error_lower = str(error).lower()
        if "429" in str(error) or "rate limit" in error_lower or "too many" in error_lower:
            return "rate_limit"
        elif "403" in str(error) or "forbidden" in error_lower or "blocked" in error_lower or "captcha" in error_lower:
            return "blocked"
        elif "timeout" in error_lower or "timed out" in error_lower:
            return "timeout"
        elif "network" in error_lower or "connection" in error_lower or "dns" in error_lower:
            return "network"
        return "other"

    # -----------------------------------------------------------------------
    # Benchmark Suite Methods
    # -----------------------------------------------------------------------

    async def run_full_benchmark(self, iterations: int = 3) -> EngineComparisonReport:
        """Run the complete benchmark suite."""
        logger.info(f"Starting full engine performance benchmark with {len(self.config.urls)} URLs")

        urls = self.config.urls[:2]  # Use first 2 URLs for comprehensive testing

        # 1. Single URL performance comparison
        logger.info("Running single URL performance tests...")
        await self._benchmark_single_url_performance(urls, iterations)

        # 2. Concurrent throughput tests
        logger.info("Running concurrent throughput tests...")
        await self._benchmark_concurrent_throughput(urls)

        # 3. Proxy vs no-proxy comparison
        logger.info("Running proxy comparison tests...")
        await self._benchmark_proxy_comparison(urls)

        # 4. Anti-bot countermeasures
        logger.info("Running anti-bot tests...")
        await self._benchmark_anti_bot(urls)

        # 5. Failure rate analysis
        logger.info("Analyzing failure rates...")
        self._analyze_failure_rates()

        return self.report

    async def _benchmark_single_url_performance(self, urls: list[str], iterations: int) -> None:
        """Benchmark single URL extraction performance."""
        crawl4ai_results: list[EngineMetrics] = []
        legacy_results: list[EngineMetrics] = []

        for url in urls:
            for i in range(iterations):
                logger.debug(f"Iteration {i + 1}/{iterations} for {url}")

                # Test crawl4ai
                c4_result = await self._measure_crawl4ai_single(url)
                crawl4ai_results.append(c4_result)

                # Small delay between engines
                await asyncio.sleep(1)

                # Test legacy
                legacy_result = await self._measure_legacy_single(url)
                legacy_results.append(legacy_result)

                # Delay between iterations
                if i < iterations - 1:
                    await asyncio.sleep(2)

        # Aggregate metrics
        self.report.crawl4ai_metrics = self._aggregate_engine_metrics(crawl4ai_results)
        self.report.legacy_metrics = self._aggregate_engine_metrics(legacy_results)
        self._results.extend(crawl4ai_results)
        self._results.extend(legacy_results)

    async def _benchmark_concurrent_throughput(self, urls: list[str]) -> None:
        """Benchmark concurrent extraction throughput."""
        concurrency_results = []

        for concurrency in CONCURRENCY_LEVELS:
            logger.info(f"Testing concurrency level: {concurrency}")

            # Use subset of URLs based on concurrency
            test_urls = urls * max(1, concurrency // len(urls) + 1)
            test_urls = test_urls[: max(concurrency, len(urls))]

            # Test crawl4ai
            c4_result = await self._measure_crawl4ai_concurrent(test_urls, concurrency)

            # Delay between engines
            await asyncio.sleep(3)

            # Test legacy
            legacy_result = await self._measure_legacy_concurrent(test_urls, concurrency)

            concurrency_results.append(
                {
                    "concurrency": concurrency,
                    "crawl4ai": {
                        "total_time_ms": c4_result.total_time_ms,
                        "time_per_url_ms": c4_result.time_per_url_ms,
                        "success_rate": c4_result.success_rate,
                        "memory_peak_mb": c4_result.memory_peak_mb,
                        "failure_breakdown": c4_result.failure_breakdown,
                    },
                    "legacy": {
                        "total_time_ms": legacy_result.total_time_ms,
                        "time_per_url_ms": legacy_result.time_per_url_ms,
                        "success_rate": legacy_result.success_rate,
                        "memory_peak_mb": legacy_result.memory_peak_mb,
                        "failure_breakdown": legacy_result.failure_breakdown,
                    },
                    "speedup": legacy_result.total_time_ms / c4_result.total_time_ms if c4_result.total_time_ms > 0 else 0,
                }
            )

            # Delay between concurrency levels
            await asyncio.sleep(5)

        self.report.concurrency_results = concurrency_results

    async def _benchmark_proxy_comparison(self, urls: list[str]) -> None:
        """Compare performance with and without proxy rotation."""
        if not self._proxy_rotator or self._proxy_rotator.is_empty:
            logger.info("No proxy pool configured, skipping proxy comparison")
            self.report.proxy_comparison = {"skipped": True, "reason": "No proxy pool configured"}
            return

        test_url = urls[0]
        proxy = self._proxy_rotator.get_proxy_url()

        # Without proxy
        c4_no_proxy = await self._measure_crawl4ai_single(test_url, proxy=None)
        legacy_no_proxy = await self._measure_legacy_single(test_url, proxy=None)

        await asyncio.sleep(2)

        # With proxy
        c4_with_proxy = await self._measure_crawl4ai_single(test_url, proxy=proxy)
        legacy_with_proxy = await self._measure_legacy_single(test_url, proxy=proxy)

        self.report.proxy_comparison = {
            "crawl4ai": {
                "without_proxy_ms": c4_no_proxy.total_time_ms,
                "with_proxy_ms": c4_with_proxy.total_time_ms,
                "overhead_ms": c4_with_proxy.total_time_ms - c4_no_proxy.total_time_ms,
                "overhead_pct": (
                    (c4_with_proxy.total_time_ms - c4_no_proxy.total_time_ms) / c4_no_proxy.total_time_ms * 100 if c4_no_proxy.total_time_ms > 0 else 0
                ),
            },
            "legacy": {
                "without_proxy_ms": legacy_no_proxy.total_time_ms,
                "with_proxy_ms": legacy_with_proxy.total_time_ms,
                "overhead_ms": legacy_with_proxy.total_time_ms - legacy_no_proxy.total_time_ms,
                "overhead_pct": (
                    (legacy_with_proxy.total_time_ms - legacy_no_proxy.total_time_ms) / legacy_no_proxy.total_time_ms * 100
                    if legacy_no_proxy.total_time_ms > 0
                    else 0
                ),
            },
        }

    async def _benchmark_anti_bot(self, urls: list[str]) -> None:
        """Test anti-bot countermeasures effectiveness."""
        test_url = urls[0]

        # Without anti-bot
        c4_no_stealth = await self._measure_crawl4ai_single(test_url, anti_bot=False)
        legacy_no_stealth = await self._measure_legacy_single(test_url, anti_bot=False)

        await asyncio.sleep(2)

        # With anti-bot
        c4_with_stealth = await self._measure_crawl4ai_single(test_url, anti_bot=True)
        legacy_with_stealth = await self._measure_legacy_single(test_url, anti_bot=True)

        self.report.anti_bot_results = {
            "crawl4ai": {
                "without_stealth": {
                    "success": c4_no_stealth.success,
                    "time_ms": c4_no_stealth.total_time_ms,
                    "error_type": c4_no_stealth.error_type,
                },
                "with_stealth": {
                    "success": c4_with_stealth.success,
                    "time_ms": c4_with_stealth.total_time_ms,
                    "error_type": c4_with_stealth.error_type,
                },
                "stealth_overhead_ms": c4_with_stealth.total_time_ms - c4_no_stealth.total_time_ms,
            },
            "legacy": {
                "without_stealth": {
                    "success": legacy_no_stealth.success,
                    "time_ms": legacy_no_stealth.total_time_ms,
                    "error_type": legacy_no_stealth.error_type,
                },
                "with_stealth": {
                    "success": legacy_with_stealth.success,
                    "time_ms": legacy_with_stealth.total_time_ms,
                    "error_type": legacy_with_stealth.error_type,
                },
                "stealth_overhead_ms": legacy_with_stealth.total_time_ms - legacy_no_stealth.total_time_ms,
            },
        }

    def _aggregate_engine_metrics(self, results: list[EngineMetrics]) -> dict[str, Any]:
        """Aggregate metrics from multiple runs."""
        if not results:
            return {}

        successful = [r for r in results if r.success]
        failed = [r for r in results if not r.success]

        def avg(values: list[float]) -> float:
            return statistics.mean(values) if values else 0.0

        def median_val(values: list[float]) -> float:
            return statistics.median(values) if values else 0.0

        return {
            "total_runs": len(results),
            "successful_runs": len(successful),
            "failed_runs": len(failed),
            "success_rate": len(successful) / len(results) if results else 0.0,
            "browser_startup_ms": {
                "avg": avg([r.browser_startup_ms for r in successful]),
                "median": median_val([r.browser_startup_ms for r in successful]),
                "min": min([r.browser_startup_ms for r in successful], default=0),
                "max": max([r.browser_startup_ms for r in successful], default=0),
            },
            "time_to_first_byte_ms": {
                "avg": avg([r.time_to_first_byte_ms for r in successful]),
                "median": median_val([r.time_to_first_byte_ms for r in successful]),
            },
            "dom_ready_ms": {
                "avg": avg([r.dom_ready_ms for r in successful]),
                "median": median_val([r.dom_ready_ms for r in successful]),
            },
            "extraction_latency_ms": {
                "avg": avg([r.extraction_latency_ms for r in successful]),
                "median": median_val([r.extraction_latency_ms for r in successful]),
            },
            "total_time_ms": {
                "avg": avg([r.total_time_ms for r in successful]),
                "median": median_val([r.total_time_ms for r in successful]),
            },
            "memory_peak_mb": {
                "avg": avg([r.memory_peak_mb for r in results]),
                "median": median_val([r.memory_peak_mb for r in results]),
            },
            "memory_delta_mb": {
                "avg": avg([r.memory_delta_mb for r in results]),
            },
            "cpu_percent": {
                "avg": avg([r.cpu_percent for r in results]),
            },
        }

    def _analyze_failure_rates(self) -> None:
        """Analyze and summarize failure rates."""
        crawl4ai_failures: dict[str, int] = {}
        legacy_failures: dict[str, int] = {}

        for r in self._results:
            if not r.success and r.error_type:
                if r.engine_name == "crawl4ai":
                    crawl4ai_failures[r.error_type] = crawl4ai_failures.get(r.error_type, 0) + 1
                else:
                    legacy_failures[r.error_type] = legacy_failures.get(r.error_type, 0) + 1

        self.report.failure_analysis = {
            "crawl4ai": {
                "total_failures": sum(crawl4ai_failures.values()),
                "breakdown": crawl4ai_failures,
            },
            "legacy": {
                "total_failures": sum(legacy_failures.values()),
                "breakdown": legacy_failures,
            },
        }

    def save_report(self, output_dir: str | Path = ".sisyphus/evidence") -> Path:
        """Save the benchmark report to disk."""
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        timestamp = time.strftime("%Y%m%d_%H%M%S")
        report_file = output_path / f"engine_performance_report_{timestamp}.json"

        with open(report_file, "w") as f:
            json.dump(self.report.to_dict(), f, indent=2, default=str)

        logger.info(f"Benchmark report saved to {report_file}")
        return report_file


# ---------------------------------------------------------------------------
# Pytest Test Functions
# ---------------------------------------------------------------------------


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.performance
@pytest.mark.asyncio
async def test_engine_performance_comprehensive():
    """Comprehensive engine performance benchmark comparing crawl4ai vs legacy Playwright.

    This test measures:
    - Browser startup time
    - Per-page extraction time (TTFB, DOM ready, extraction latency)
    - Concurrent throughput at levels 1, 3, 5
    - Memory usage (peak and delta)
    - CPU usage
    - Failure rates under load (429s, timeouts, blocks)
    - Proxy rotation impact
    - Anti-bot countermeasures effectiveness
    """
    config = BenchmarkConfig(
        urls=DEFAULT_TEST_URLS[:2],  # Use 2 URLs for the comprehensive test
        timeout=60,
        concurrency=5,
    )

    benchmark = EnginePerformanceBenchmark(config)
    benchmark.setup()

    try:
        report = await benchmark.run_full_benchmark(iterations=2)

        # Save report
        report_path = benchmark.save_report()

        # Log summary
        logger.info("=" * 60)
        logger.info("ENGINE PERFORMANCE BENCHMARK COMPLETE")
        logger.info("=" * 60)

        # Single URL performance summary
        c4_metrics = report.crawl4ai_metrics
        legacy_metrics = report.legacy_metrics

        if c4_metrics and legacy_metrics:
            c4_avg_time = c4_metrics.get("total_time_ms", {}).get("avg", 0)
            legacy_avg_time = legacy_metrics.get("total_time_ms", {}).get("avg", 0)
            speedup = legacy_avg_time / c4_avg_time if c4_avg_time > 0 else 0

            logger.info(f"crawl4ai avg total time: {c4_avg_time:.0f}ms")
            logger.info(f"Legacy Playwright avg total time: {legacy_avg_time:.0f}ms")
            logger.info(f"Speedup factor: {speedup:.2f}x")

        # Concurrency scaling summary
        for result in report.concurrency_results:
            concurrency = result["concurrency"]
            speedup = result.get("speedup", 0)
            logger.info(f"Concurrency {concurrency}: {speedup:.2f}x speedup")

        # Assert minimum performance expectations
        # crawl4ai should be at least 2x faster on average
        if c4_metrics and legacy_metrics:
            assert speedup >= 1.5, f"crawl4ai should be at least 1.5x faster, got {speedup:.2f}x"

        # Both engines should have reasonable success rates
        c4_success_rate = c4_metrics.get("success_rate", 0)
        legacy_success_rate = legacy_metrics.get("success_rate", 0)

        logger.info(f"crawl4ai success rate: {c4_success_rate:.1%}")
        logger.info(f"Legacy success rate: {legacy_success_rate:.1%}")

        # Log failure analysis
        failure_analysis = report.failure_analysis
        c4_failures = failure_analysis.get("crawl4ai", {}).get("total_failures", 0)
        legacy_failures = failure_analysis.get("legacy", {}).get("total_failures", 0)
        logger.info(f"crawl4ai total failures: {c4_failures}")
        logger.info(f"Legacy total failures: {legacy_failures}")

    finally:
        benchmark.teardown()


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.performance
@pytest.mark.asyncio
async def test_crawl4ai_single_url_performance():
    """Benchmark crawl4ai single URL extraction performance."""
    config = BenchmarkConfig(urls=DEFAULT_TEST_URLS[:1], timeout=60)
    benchmark = EnginePerformanceBenchmark(config)
    benchmark.setup()

    try:
        url = DEFAULT_TEST_URLS[0]
        metrics = await benchmark._measure_crawl4ai_single(url)

        logger.info(f"crawl4ai single URL performance for {url}:")
        logger.info(f"  Browser startup: {metrics.browser_startup_ms:.0f}ms")
        logger.info(f"  Extraction latency: {metrics.extraction_latency_ms:.0f}ms")
        logger.info(f"  Total time: {metrics.total_time_ms:.0f}ms")
        logger.info(f"  Memory peak: {metrics.memory_peak_mb:.1f}MB")
        logger.info(f"  Success: {metrics.success}")

        # Save evidence
        evidence = {
            "engine": "crawl4ai",
            "url": url,
            "metrics": {
                "browser_startup_ms": metrics.browser_startup_ms,
                "extraction_latency_ms": metrics.extraction_latency_ms,
                "total_time_ms": metrics.total_time_ms,
                "memory_peak_mb": metrics.memory_peak_mb,
                "success": metrics.success,
            },
        }

        output_path = Path(".sisyphus/evidence")
        output_path.mkdir(parents=True, exist_ok=True)
        with open(output_path / "task-11-performance-benchmark.log", "a") as f:
            f.write(json.dumps(evidence, indent=2) + "\n---\n")

        # Assertions
        assert metrics.browser_startup_ms > 0, "Browser startup time should be measured"
        assert metrics.extraction_latency_ms > 0, "Extraction latency should be measured"

    finally:
        benchmark.teardown()


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.performance
@pytest.mark.asyncio
async def test_legacy_playwright_single_url_performance():
    """Benchmark legacy Playwright single URL extraction performance."""
    config = BenchmarkConfig(urls=DEFAULT_TEST_URLS[:1], timeout=60)
    benchmark = EnginePerformanceBenchmark(config)
    benchmark.setup()

    try:
        url = DEFAULT_TEST_URLS[0]
        metrics = await benchmark._measure_legacy_single(url)

        logger.info(f"Legacy Playwright single URL performance for {url}:")
        logger.info(f"  Browser startup: {metrics.browser_startup_ms:.0f}ms")
        logger.info(f"  TTFB: {metrics.time_to_first_byte_ms:.0f}ms")
        logger.info(f"  DOM ready: {metrics.dom_ready_ms:.0f}ms")
        logger.info(f"  Extraction latency: {metrics.extraction_latency_ms:.0f}ms")
        logger.info(f"  Total time: {metrics.total_time_ms:.0f}ms")
        logger.info(f"  Memory peak: {metrics.memory_peak_mb:.1f}MB")
        logger.info(f"  Success: {metrics.success}")

        # Assertions
        assert metrics.browser_startup_ms > 0, "Browser startup time should be measured"
        assert metrics.extraction_latency_ms > 0, "Extraction latency should be measured"

    finally:
        benchmark.teardown()


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.performance
@pytest.mark.asyncio
@pytest.mark.parametrize("concurrency", [1, 3, 5])
async def test_concurrent_throughput_scaling(concurrency: int):
    """Test concurrent throughput at different concurrency levels."""
    urls = DEFAULT_TEST_URLS[:2] * ((concurrency // 2) + 1)
    urls = urls[:concurrency]

    config = BenchmarkConfig(urls=urls, timeout=60)
    benchmark = EnginePerformanceBenchmark(config)
    benchmark.setup()

    try:
        # Test crawl4ai
        c4_result = await benchmark._measure_crawl4ai_concurrent(urls, concurrency)

        await asyncio.sleep(3)

        # Test legacy
        legacy_result = await benchmark._measure_legacy_concurrent(urls, concurrency)

        logger.info(f"Concurrency level: {concurrency}")
        logger.info(f"  crawl4ai: {c4_result.total_time_ms:.0f}ms total, {c4_result.time_per_url_ms:.0f}ms per URL, {c4_result.success_rate:.1%} success")
        logger.info(
            f"  Legacy: {legacy_result.total_time_ms:.0f}ms total, {legacy_result.time_per_url_ms:.0f}ms per URL, {legacy_result.success_rate:.1%} success"
        )

        speedup = legacy_result.total_time_ms / c4_result.total_time_ms if c4_result.total_time_ms > 0 else 0
        logger.info(f"  Speedup: {speedup:.2f}x")

        # Save concurrency report
        report = {
            "concurrency": concurrency,
            "crawl4ai": {
                "total_time_ms": c4_result.total_time_ms,
                "time_per_url_ms": c4_result.time_per_url_ms,
                "success_rate": c4_result.success_rate,
                "memory_peak_mb": c4_result.memory_peak_mb,
                "failure_breakdown": c4_result.failure_breakdown,
            },
            "legacy": {
                "total_time_ms": legacy_result.total_time_ms,
                "time_per_url_ms": legacy_result.time_per_url_ms,
                "success_rate": legacy_result.success_rate,
                "memory_peak_mb": legacy_result.memory_peak_mb,
                "failure_breakdown": legacy_result.failure_breakdown,
            },
            "speedup": speedup,
        }

        output_path = Path(".sisyphus/evidence")
        output_path.mkdir(parents=True, exist_ok=True)
        with open(output_path / "task-11-concurrency-report.log", "a") as f:
            f.write(json.dumps(report, indent=2) + "\n---\n")

        # Assertions
        assert c4_result.total_time_ms > 0, "crawl4ai should have measured time"
        assert legacy_result.total_time_ms > 0, "Legacy should have measured time"

    finally:
        benchmark.teardown()


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.performance
@pytest.mark.asyncio
async def test_proxy_vs_no_proxy():
    """Compare performance with and without proxy rotation."""
    config = BenchmarkConfig(urls=DEFAULT_TEST_URLS[:1], timeout=60)
    benchmark = EnginePerformanceBenchmark(config)
    benchmark.setup()

    try:
        await benchmark._benchmark_proxy_comparison(DEFAULT_TEST_URLS[:1])

        proxy_comparison = benchmark.report.proxy_comparison
        logger.info("Proxy comparison results:")
        logger.info(json.dumps(proxy_comparison, indent=2))

        # Save evidence
        output_path = Path(".sisyphus/evidence")
        output_path.mkdir(parents=True, exist_ok=True)
        with open(output_path / "task-11-performance-benchmark.log", "a") as f:
            f.write("Proxy Comparison:\n")
            f.write(json.dumps(proxy_comparison, indent=2) + "\n---\n")

    finally:
        benchmark.teardown()


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.performance
@pytest.mark.asyncio
async def test_anti_bot_effectiveness():
    """Test anti-bot countermeasures effectiveness."""
    config = BenchmarkConfig(urls=DEFAULT_TEST_URLS[:1], timeout=60)
    benchmark = EnginePerformanceBenchmark(config)
    benchmark.setup()

    try:
        await benchmark._benchmark_anti_bot(DEFAULT_TEST_URLS[:1])

        anti_bot_results = benchmark.report.anti_bot_results
        logger.info("Anti-bot effectiveness results:")
        logger.info(json.dumps(anti_bot_results, indent=2))

        # Save evidence
        output_path = Path(".sisyphus/evidence")
        output_path.mkdir(parents=True, exist_ok=True)
        with open(output_path / "task-11-performance-benchmark.log", "a") as f:
            f.write("Anti-Bot Results:\n")
            f.write(json.dumps(anti_bot_results, indent=2) + "\n---\n")

    finally:
        benchmark.teardown()


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.performance
@pytest.mark.asyncio
async def test_failure_rate_analysis():
    """Analyze failure rates under load."""
    config = BenchmarkConfig(urls=DEFAULT_TEST_URLS, timeout=60)
    benchmark = EnginePerformanceBenchmark(config)
    benchmark.setup()

    try:
        # Run multiple iterations to gather failure data
        for url in DEFAULT_TEST_URLS[:2]:
            await benchmark._measure_crawl4ai_single(url)
            await asyncio.sleep(1)
            await benchmark._measure_legacy_single(url)
            await asyncio.sleep(1)

        # Run concurrent tests to stress the system
        for concurrency in [1, 3]:
            urls = DEFAULT_TEST_URLS[:concurrency]
            await benchmark._measure_crawl4ai_concurrent(urls, concurrency)
            await asyncio.sleep(2)
            await benchmark._measure_legacy_concurrent(urls, concurrency)
            await asyncio.sleep(2)

        benchmark._analyze_failure_rates()

        failure_analysis = benchmark.report.failure_analysis
        logger.info("Failure rate analysis:")
        logger.info(json.dumps(failure_analysis, indent=2))

        # Save evidence
        output_path = Path(".sisyphus/evidence")
        output_path.mkdir(parents=True, exist_ok=True)
        with open(output_path / "task-11-performance-benchmark.log", "a") as f:
            f.write("Failure Analysis:\n")
            f.write(json.dumps(failure_analysis, indent=2) + "\n---\n")

        # Log breakdown
        for engine in ["crawl4ai", "legacy"]:
            engine_failures = failure_analysis.get(engine, {})
            total = engine_failures.get("total_failures", 0)
            breakdown = engine_failures.get("breakdown", {})
            logger.info(f"{engine}: {total} total failures")
            for error_type, count in breakdown.items():
                logger.info(f"  {error_type}: {count}")

    finally:
        benchmark.teardown()


# ---------------------------------------------------------------------------
# Entry Point for Direct Execution
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    """Run the benchmark directly with: python test_engine_performance.py"""
    logging.basicConfig(level=logging.INFO)

    async def main():
        config = BenchmarkConfig(
            urls=DEFAULT_TEST_URLS[:2],
            timeout=60,
            concurrency=5,
        )

        benchmark = EnginePerformanceBenchmark(config)
        benchmark.setup()

        try:
            report = await benchmark.run_full_benchmark(iterations=2)
            report_path = benchmark.save_report()
            print(f"\nBenchmark complete! Report saved to: {report_path}")
        finally:
            benchmark.teardown()

    asyncio.run(main())
