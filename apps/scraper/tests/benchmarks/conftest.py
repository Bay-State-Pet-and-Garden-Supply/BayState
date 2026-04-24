"""Unified pytest fixtures and CLI options for benchmark tests.

Provides:
  - Custom pytest markers: benchmark, live, slow, performance, integration
  - CLI options: --max-urls, --max-products, --modes, --proxy, --timeout, --run-live
  - Fixtures: benchmark_config, live_urls, proxy_rotator

Live benchmarks are skipped unless --run-live is passed on the CLI.
"""

from __future__ import annotations

import os

import pytest

from tests.benchmarks.unified.config import (
    BenchmarkConfig,
    VALID_MODES,
    DEFAULT_TIMEOUT,
    DEFAULT_MAX_URLS,
)
from tests.benchmarks.unified.proxy import ProxyRotator, load_proxy_rotator


# ---------------------------------------------------------------------------
# CLI options — registered via pytest hook
# ---------------------------------------------------------------------------


def pytest_addoption(parser: pytest.Parser) -> None:
    """Register benchmark-specific CLI options."""
    group = parser.getgroup("benchmark", "Benchmark test options")

    group.addoption(
        "--max-urls",
        action="store",
        default=os.environ.get("BENCHMARK_MAX_URLS", str(DEFAULT_MAX_URLS)),
        type=int,
        help=f"Maximum number of URLs to benchmark (default: {DEFAULT_MAX_URLS})",
    )
    group.addoption(
        "--max-products",
        action="store",
        default=os.environ.get("BENCHMARK_MAX_PRODUCTS", "0"),
        type=int,
        help="Maximum number of products to benchmark (0 = no limit)",
    )
    group.addoption(
        "--modes",
        action="store",
        default=os.environ.get("BENCHMARK_MODES", "auto"),
        help=f"Comma-separated extraction modes to test (choices: {', '.join(VALID_MODES)})",
    )
    group.addoption(
        "--proxy",
        action="store",
        default=os.environ.get("BENCHMARK_PROXY", ""),
        help="Proxy URL for benchmark requests (e.g. http://user:pass@host:port)",
    )
    group.addoption(
        "--timeout",
        action="store",
        default=os.environ.get("BENCHMARK_TIMEOUT", str(DEFAULT_TIMEOUT)),
        type=int,
        help=f"Per-URL timeout in seconds (default: {DEFAULT_TIMEOUT})",
    )
    group.addoption(
        "--run-live",
        action="store_true",
        default=False,
        help="Run live benchmark tests (skipped by default)",
    )


# ---------------------------------------------------------------------------
# Marker configuration — skip live tests unless --run-live
# ---------------------------------------------------------------------------


def pytest_configure(config: pytest.Config) -> None:
    """Register custom markers and configure live test skipping."""
    # Register markers so pytest doesn't warn about unknown markers
    config.addinivalue_line("markers", "benchmark: marks performance or benchmark-oriented tests")
    config.addinivalue_line("markers", "live: marks tests that require live external APIs (search, LLM, etc.)")
    config.addinivalue_line("markers", "slow: marks tests that are slow-running (>30s)")
    config.addinivalue_line("markers", "performance: marks tests that measure performance metrics")
    config.addinivalue_line("markers", "integration: marks tests that exercise live scraper integrations")


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Skip live benchmark tests unless --run-live is passed."""
    run_live = config.getoption("--run-live", default=False)

    skip_live = pytest.mark.skip(reason="live benchmark — pass --run-live to enable")

    for item in items:
        # Skip tests marked with @pytest.mark.live unless --run-live
        if "live" in [m.name for m in item.iter_markers()]:
            if not run_live:
                item.add_marker(skip_live)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def benchmark_config(request: pytest.FixtureRequest) -> BenchmarkConfig:
    """Provide a BenchmarkConfig built from CLI options and env vars.

    CLI options take precedence over environment variables, which take
    precedence over defaults in BenchmarkConfig.
    """
    max_urls: int = request.config.getoption("--max-urls", default=DEFAULT_MAX_URLS)
    max_products: int = request.config.getoption("--max-products", default=0)
    modes_str: str = request.config.getoption("--modes", default="auto")
    timeout: int = request.config.getoption("--timeout", default=DEFAULT_TIMEOUT)

    # Parse modes from comma-separated string
    modes = [m.strip() for m in modes_str.split(",") if m.strip()]
    invalid = [m for m in modes if m not in VALID_MODES]
    if invalid:
        raise ValueError(f"Invalid modes: {invalid}. Must be subset of {VALID_MODES}")

    # Build URLs list — use env var or default placeholder URLs
    urls_env = os.environ.get("BENCHMARK_URLS", "")
    if urls_env:
        urls = [u.strip() for u in urls_env.split(",") if u.strip()]
    else:
        urls = []  # Will be populated by individual tests or products_path

    # Truncate URLs if max_urls is set
    if max_urls and len(urls) > max_urls:
        urls = urls[:max_urls]

    config = BenchmarkConfig(
        urls=urls,
        modes=modes,
        timeout=timeout,
        products_path=os.environ.get("BENCHMARK_PRODUCTS_PATH"),
    )

    # Apply max_products truncation via env override
    if max_products > 0:
        os.environ["BENCHMARK_MAX_URLS"] = str(max_products)

    return config


@pytest.fixture
def live_urls() -> list[str]:
    """Provide a list of live URLs for benchmarking.

    These are real product URLs used for live benchmark tests.
    Tests using this fixture should be marked with @pytest.mark.live.
    """
    return [
        "https://www.chewy.com/dp/1",
        "https://www.petsmart.com/product/1",
        "https://www.petco.com/product/1",
        "https://www.tractorsupply.com/product/1",
        "https://www.walmart.com/ip/1",
    ]


@pytest.fixture
def proxy_rotator(request: pytest.FixtureRequest) -> ProxyRotator:
    """Provide a ProxyRotator configured from CLI --proxy option or env vars.

    Priority:
      1. --proxy CLI option (single proxy URL)
      2. BENCHMARK_PROXY_POOL env var (comma-separated URLs)
      3. Empty rotator (no-proxy mode)
    """
    proxy_url: str = request.config.getoption("--proxy", default="")

    if proxy_url:
        from tests.benchmarks.unified.proxy import ProxyConfig

        proxy = ProxyConfig.from_url(proxy_url)
        return ProxyRotator([proxy])

    return load_proxy_rotator()
