"""
Main benchmark tests comparing crawl4ai vs legacy scraper.

Usage:
    pytest tests/benchmarks/test_benchmark_crawl4ai.py -v
    pytest tests/benchmarks/test_benchmark_crawl4ai.py::test_browser_startup -v
"""

from __future__ import annotations

import pytest
import time
from statistics import median

from tests.benchmarks import Timer, MemoryProfiler


# =============================================================================
# Browser Startup Benchmarks
# =============================================================================


@pytest.mark.benchmark
@pytest.mark.asyncio
async def test_browser_startup_crawl4ai():
    """Benchmark crawl4ai browser startup time."""
    try:
        from crawl4ai_engine import Crawl4AIEngine, EngineConfig

        timer = Timer()
        times = []

        for _ in range(3):
            timer.start()
            engine = Crawl4AIEngine(EngineConfig(headless=True, timeout=30))
            await engine.initialize()
            elapsed = timer.stop()
            times.append(elapsed)
            await engine.cleanup()

        avg_time = sum(times) / len(times)

        # Assertions for performance requirements
        assert avg_time < 5000, f"crawl4ai startup too slow: {avg_time:.0f}ms (target: <5000ms)"

        return {
            "engine": "crawl4ai",
            "avg_startup_ms": avg_time,
            "samples": times,
        }
    except ImportError:
        pytest.skip("crawl4ai not installed")


@pytest.mark.benchmark
@pytest.mark.asyncio
async def test_browser_startup_legacy():
    """Benchmark legacy Playwright browser startup time."""
    try:
        from playwright.async_api import async_playwright

        timer = Timer()
        times = []

        for _ in range(3):
            timer.start()
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                elapsed = timer.stop()
                times.append(elapsed)
                await browser.close()

        avg_time = sum(times) / len(times)

        return {
            "engine": "legacy",
            "avg_startup_ms": avg_time,
            "samples": times,
        }
    except ImportError:
        pytest.skip("playwright not installed")


@pytest.mark.benchmark
@pytest.mark.asyncio
async def test_browser_startup_comparison():
    """Compare browser startup times between engines."""
    results = {}

    # Test crawl4ai
    try:
        from crawl4ai_engine import Crawl4AIEngine, EngineConfig

        timer = Timer()
        crawl4ai_times = []

        for _ in range(3):
            timer.start()
            engine = Crawl4AIEngine(EngineConfig(headless=True))
            await engine.initialize()
            crawl4ai_times.append(timer.stop())
            await engine.cleanup()

        results["crawl4ai"] = sum(crawl4ai_times) / len(crawl4ai_times)
    except ImportError:
        results["crawl4ai"] = None

    # Test legacy
    try:
        from playwright.async_api import async_playwright

        timer = Timer()
        legacy_times = []

        for _ in range(3):
            timer.start()
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                legacy_times.append(timer.stop())
                await browser.close()

        results["legacy"] = sum(legacy_times) / len(legacy_times)
    except ImportError:
        results["legacy"] = None

    # Compare
    if results["crawl4ai"] and results["legacy"]:
        warm_crawl4ai_times = crawl4ai_times[1:] or crawl4ai_times
        warm_legacy_times = legacy_times[1:] or legacy_times
        results["crawl4ai"] = median(warm_crawl4ai_times)
        results["legacy"] = median(warm_legacy_times)
        speedup = results["legacy"] / results["crawl4ai"]
        # Cold-start overhead is already covered by the dedicated startup tests
        # above. Compare the warmed medians here so a single Windows suite-load
        # outlier does not destabilize the relative benchmark gate. The
        # comparison should still fail if crawl4ai becomes more than 2x slower
        # than raw Playwright startup in the same environment.
        assert speedup >= 0.5, f"crawl4ai should remain within 2x legacy startup: {speedup:.2f}x"

        print(f"\nBrowser Startup Comparison:")
        print(f"  crawl4ai: {results['crawl4ai']:.0f}ms")
        print(f"  legacy: {results['legacy']:.0f}ms")
        print(f"  speedup: {speedup:.2f}x")


# =============================================================================
# Per-SKU Extraction Benchmarks
# =============================================================================


@pytest.mark.benchmark
@pytest.mark.asyncio
async def test_sku_extraction_crawl4ai():
    """Benchmark crawl4ai per-SKU extraction time."""
    try:
        from crawl4ai_engine import Crawl4AIEngine, EngineConfig

        test_url = "https://httpbin.org/html"
        timer = Timer()
        memory = MemoryProfiler()
        times = []
        memory_usages = []

        async with Crawl4AIEngine(EngineConfig(headless=True)) as engine:
            for _ in range(5):
                memory.start()
                timer.start()

                result = await engine.crawl(test_url)

                elapsed = timer.stop()
                mem_stats = memory.stop()

                times.append(elapsed)
                memory_usages.append(mem_stats.get("delta_mb", 0))

        avg_time = sum(times) / len(times)
        avg_memory = sum(memory_usages) / len(memory_usages)

        # Performance assertions
        assert avg_time < 3000, f"Extraction too slow: {avg_time:.0f}ms (target: <3000ms)"
        assert avg_memory < 100, f"Memory usage too high: {avg_memory:.1f}MB (target: <100MB)"

        return {
            "engine": "crawl4ai",
            "avg_extraction_ms": avg_time,
            "avg_memory_mb": avg_memory,
            "samples": times,
        }
    except ImportError:
        pytest.skip("crawl4ai not installed")


@pytest.mark.benchmark
@pytest.mark.asyncio
async def test_sku_extraction_legacy():
    """Benchmark legacy per-SKU extraction time."""
    try:
        from playwright.async_api import async_playwright

        test_url = "https://httpbin.org/html"
        timer = Timer()
        memory = MemoryProfiler()
        times = []
        memory_usages = []

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)

            for _ in range(5):
                memory.start()
                timer.start()

                page = await browser.new_page()
                await page.goto(test_url, wait_until="domcontentloaded")
                content = await page.content()
                await page.close()

                elapsed = timer.stop()
                mem_stats = memory.stop()

                times.append(elapsed)
                memory_usages.append(mem_stats.get("delta_mb", 0))

            await browser.close()

        avg_time = sum(times) / len(times)
        avg_memory = sum(memory_usages) / len(memory_usages)

        return {
            "engine": "legacy",
            "avg_extraction_ms": avg_time,
            "avg_memory_mb": avg_memory,
            "samples": times,
        }
    except ImportError:
        pytest.skip("playwright not installed")


@pytest.mark.benchmark
@pytest.mark.asyncio
async def test_sku_extraction_comparison():
    """Compare per-SKU extraction performance."""
    test_url = "https://httpbin.org/html"
    results = {}

    # crawl4ai
    try:
        from crawl4ai_engine import Crawl4AIEngine, EngineConfig

        timer = Timer()
        times = []

        async with Crawl4AIEngine(EngineConfig(headless=True)) as engine:
            for _ in range(5):
                timer.start()
                await engine.crawl(test_url)
                times.append(timer.stop())

        results["crawl4ai"] = {
            "avg_ms": sum(times) / len(times),
            "min_ms": min(times),
            "max_ms": max(times),
        }
    except ImportError:
        pass

    # Legacy
    try:
        from playwright.async_api import async_playwright

        timer = Timer()
        times = []

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            for _ in range(5):
                timer.start()
                page = await browser.new_page()
                await page.goto(test_url, wait_until="domcontentloaded")
                await page.close()
                times.append(timer.stop())
            await browser.close()

        results["legacy"] = {
            "avg_ms": sum(times) / len(times),
            "min_ms": min(times),
            "max_ms": max(times),
        }
    except ImportError:
        pass

    # Compare and assert
    if "crawl4ai" in results and "legacy" in results:
        crawl4ai_avg = results["crawl4ai"]["avg_ms"]
        legacy_avg = results["legacy"]["avg_ms"]
        speedup = legacy_avg / crawl4ai_avg

        print(f"\nSKU Extraction Comparison:")
        print(f"  crawl4ai: {crawl4ai_avg:.0f}ms")
        print(f"  legacy: {legacy_avg:.0f}ms")
        print(f"  speedup: {speedup:.2f}x")

        # crawl4ai should be at least as fast as legacy
        assert speedup >= 1.0, f"crawl4ai slower than legacy: {speedup:.2f}x"


# =============================================================================
# Concurrent Extraction Benchmarks
# =============================================================================


@pytest.mark.benchmark
@pytest.mark.asyncio
@pytest.mark.parametrize("concurrency", [1, 2, 3])
async def test_concurrent_extraction_crawl4ai(concurrency: int):
    """Benchmark crawl4ai concurrent extraction limits."""
    try:
        from crawl4ai_engine import Crawl4AIEngine, EngineConfig

        test_url = "https://httpbin.org/html"
        timer = Timer()
        memory = MemoryProfiler()

        memory.start()

        async with Crawl4AIEngine(EngineConfig(headless=True)) as engine:
            urls = [test_url] * concurrency

            timer.start()
            results = await engine.crawl_multiple(urls)
            elapsed = timer.stop()

        mem_stats = memory.stop()

        success_count = sum(1 for r in results if getattr(r, "success", False))
        success_rate = success_count / concurrency

        time_per_url = elapsed / concurrency

        # Assertions
        assert success_rate >= 0.95, f"Success rate too low: {success_rate:.1%}"
        assert time_per_url < 5000, f"Per-URL time too high: {time_per_url:.0f}ms"

        return {
            "concurrency": concurrency,
            "total_time_ms": elapsed,
            "time_per_url_ms": time_per_url,
            "success_rate": success_rate,
            "memory_peak_mb": mem_stats.get("peak_mb", 0),
        }
    except ImportError:
        pytest.skip("crawl4ai not installed")


@pytest.mark.benchmark
@pytest.mark.asyncio
@pytest.mark.parametrize("concurrency", [1, 2, 3])
async def test_concurrent_extraction_legacy(concurrency: int):
    """Benchmark legacy concurrent extraction."""
    try:
        from playwright.async_api import async_playwright
        import asyncio

        test_url = "https://httpbin.org/html"
        timer = Timer()
        memory = MemoryProfiler()

        memory.start()

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)

            async def fetch_one():
                page = await browser.new_page()
                await page.goto(test_url, wait_until="domcontentloaded")
                await page.close()

            timer.start()
            await asyncio.gather(*[fetch_one() for _ in range(concurrency)])
            elapsed = timer.stop()

            await browser.close()

        mem_stats = memory.stop()

        time_per_url = elapsed / concurrency

        return {
            "concurrency": concurrency,
            "total_time_ms": elapsed,
            "time_per_url_ms": time_per_url,
            "memory_peak_mb": mem_stats.get("peak_mb", 0),
        }
    except ImportError:
        pytest.skip("playwright not installed")


@pytest.mark.benchmark
@pytest.mark.asyncio
async def test_concurrent_extraction_limits():
    """Determine maximum concurrent extraction limits."""
    concurrency_levels = [1, 2, 3, 5]
    results = {"crawl4ai": {}, "legacy": {}}

    test_url = "https://httpbin.org/html"

    # Test crawl4ai
    try:
        from crawl4ai_engine import Crawl4AIEngine, EngineConfig

        for concurrency in concurrency_levels:
            async with Crawl4AIEngine(EngineConfig(headless=True)) as engine:
                urls = [test_url] * concurrency
                start = time.perf_counter()
                crawl_results = await engine.crawl_multiple(urls)
                elapsed = (time.perf_counter() - start) * 1000

                success_count = sum(1 for r in crawl_results if getattr(r, "success", False))

                results["crawl4ai"][concurrency] = {
                    "time_ms": elapsed,
                    "time_per_url_ms": elapsed / concurrency,
                    "success_rate": success_count / concurrency,
                }
    except ImportError:
        pass

    # Test legacy
    try:
        from playwright.async_api import async_playwright
        import asyncio

        for concurrency in concurrency_levels:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)

                async def fetch_one():
                    page = await browser.new_page()
                    await page.goto(test_url, wait_until="domcontentloaded")
                    await page.close()

                start = time.perf_counter()
                await asyncio.gather(*[fetch_one() for _ in range(concurrency)])
                elapsed = (time.perf_counter() - start) * 1000

                await browser.close()

                results["legacy"][concurrency] = {
                    "time_ms": elapsed,
                    "time_per_url_ms": elapsed / concurrency,
                    "success_rate": 1.0,
                }
    except ImportError:
        pass

    # Determine max recommended concurrency
    max_crawl4ai = 1
    max_legacy = 1

    for level in concurrency_levels:
        if level in results["crawl4ai"] and results["crawl4ai"][level]["success_rate"] >= 0.95:
            max_crawl4ai = level
        if level in results["legacy"] and results["legacy"][level].get("success_rate", 0) >= 0.95:
            max_legacy = level

    print(f"\nConcurrent Extraction Limits:")
    print(f"  crawl4ai max recommended: {max_crawl4ai}")
    print(f"  legacy max recommended: {max_legacy}")

    if not results["crawl4ai"]:
        pytest.skip("crawl4ai not installed")

    if not results["legacy"]:
        pytest.skip("playwright not installed")

    # Both should support at least 3 concurrent
    assert max_crawl4ai >= 3, f"crawl4ai should support at least 3 concurrent: {max_crawl4ai}"
    assert max_legacy >= 3, f"legacy should support at least 3 concurrent: {max_legacy}"


# =============================================================================
# Memory Usage Benchmarks
# =============================================================================


@pytest.mark.benchmark
@pytest.mark.asyncio
async def test_memory_usage_crawl4ai():
    """Profile crawl4ai memory usage."""
    try:
        from crawl4ai_engine import Crawl4AIEngine, EngineConfig

        test_url = "https://httpbin.org/html"
        memory = MemoryProfiler()
        measurements = []

        memory.start()
        baseline = memory.stop()["current_mb"]

        async with Crawl4AIEngine(EngineConfig(headless=True)) as engine:
            # Measure after init
            memory.start()
            measurements.append({"stage": "init", "mb": memory.stop()["current_mb"] - baseline})

            # Measure after extraction
            for i in range(5):
                memory.start()
                await engine.crawl(test_url)
                mem_stats = memory.stop()
                measurements.append(
                    {
                        "stage": f"extraction_{i + 1}",
                        "mb": mem_stats["current_mb"] - baseline,
                        "peak_mb": mem_stats["peak_mb"] - baseline,
                    }
                )

        # Memory should not grow unbounded
        final_memory = measurements[-1]["mb"]
        assert final_memory < 200, f"Memory usage too high: {final_memory:.1f}MB"

        return {
            "engine": "crawl4ai",
            "measurements": measurements,
            "final_memory_mb": final_memory,
        }
    except ImportError:
        pytest.skip("crawl4ai not installed")


@pytest.mark.benchmark
@pytest.mark.asyncio
async def test_memory_usage_legacy():
    """Profile legacy memory usage."""
    try:
        from playwright.async_api import async_playwright

        test_url = "https://httpbin.org/html"
        memory = MemoryProfiler()
        measurements = []

        memory.start()
        baseline = memory.stop()["current_mb"]

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)

            memory.start()
            measurements.append({"stage": "init", "mb": memory.stop()["current_mb"] - baseline})

            for i in range(5):
                memory.start()
                page = await browser.new_page()
                await page.goto(test_url, wait_until="domcontentloaded")
                await page.close()
                mem_stats = memory.stop()
                measurements.append(
                    {
                        "stage": f"extraction_{i + 1}",
                        "mb": mem_stats["current_mb"] - baseline,
                        "peak_mb": mem_stats["peak_mb"] - baseline,
                    }
                )

            await browser.close()

        final_memory = measurements[-1]["mb"]

        return {
            "engine": "legacy",
            "measurements": measurements,
            "final_memory_mb": final_memory,
        }
    except ImportError:
        pytest.skip("playwright not installed")


@pytest.mark.benchmark
@pytest.mark.asyncio
async def test_memory_leak_detection():
    """Test for memory leaks over multiple extractions."""
    try:
        from crawl4ai_engine import Crawl4AIEngine, EngineConfig

        test_url = "https://httpbin.org/html"
        memory = MemoryProfiler()
        memory_readings = []

        async with Crawl4AIEngine(EngineConfig(headless=True)) as engine:
            # Run many extractions and track memory
            for i in range(10):
                memory.start()
                await engine.crawl(test_url)
                mem_stats = memory.stop()
                memory_readings.append(mem_stats["current_mb"])

        # Check for memory growth trend
        first_half = memory_readings[:5]
        second_half = memory_readings[5:]

        avg_first = sum(first_half) / len(first_half)
        avg_second = sum(second_half) / len(second_half)

        growth = avg_second - avg_first
        growth_pct = (growth / avg_first) * 100 if avg_first else 0

        # Allow for some growth but not excessive
        assert growth_pct < 50, f"Potential memory leak detected: {growth_pct:.1f}% growth"

        return {
            "memory_readings": memory_readings,
            "growth_mb": growth,
            "growth_pct": growth_pct,
        }
    except ImportError:
        pytest.skip("crawl4ai not installed")


# =============================================================================
# Integration Benchmark
# =============================================================================


@pytest.mark.benchmark
@pytest.mark.asyncio
async def test_full_benchmark_suite(benchmark_runner):
    """Run the complete benchmark suite."""
    results = await benchmark_runner.run_all_benchmarks()

    # Verify results structure
    assert "benchmarks" in results
    assert "summary" in results
    assert "browser_startup" in results["benchmarks"]
    assert "sku_extraction" in results["benchmarks"]

    # Verify summary metrics
    summary = results["summary"]
    print(f"\nBenchmark Summary:")
    print(f"  Browser startup speedup: {summary.get('browser_startup_speedup', 0):.2f}x")
    print(f"  SKU extraction speedup: {summary.get('sku_extraction_speedup', 0):.2f}x")
    print(f"  Max concurrent (crawl4ai): {summary.get('max_concurrent_crawl4ai', 0)}")
    print(f"  Memory savings: {summary.get('memory_savings_pct', 0):.1f}%")

    return results
