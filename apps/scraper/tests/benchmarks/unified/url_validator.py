"""
URL validation and live manifest generator for benchmark datasets.

Validates URLs from the golden dataset using async HEAD requests,
filters dead links, and generates a live manifest for benchmark runs.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Default paths relative to scraper root
DEFAULT_DATASET_PATH = Path(__file__).resolve().parents[3] / "data" / "golden_dataset_v3.json"
DEFAULT_MANIFEST_PATH = Path(__file__).resolve().parents[3] / "data" / "benchmark_live_manifest.json"

# HTTP settings
DEFAULT_TIMEOUT_SECONDS = 10
DEFAULT_MAX_CONCURRENCY = 20
DEFAULT_MAX_RETRIES = 2
RETRY_BACKOFF_MULTIPLIER = 2
RETRY_INITIAL_DELAY = 1.0


@dataclass
class URLCheckResult:
    """Result of checking a single URL."""

    url: str
    alive: bool
    status_code: int | None = None
    response_time_ms: float | None = None
    error: str | None = None
    redirect_url: str | None = None
    content_type: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, default=str)


@dataclass
class LiveURLManifest:
    """Manifest of live URLs ready for benchmarking."""

    generated_at: str
    dataset_version: str
    total_urls: int
    alive_urls: int
    dead_urls: int
    entries: list[dict[str, Any]] = field(default_factory=list)
    dead_entries: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, default=str)

    def save(self, path: Path | None = None) -> Path:
        """Save manifest to disk."""
        target = path or DEFAULT_MANIFEST_PATH
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(self.to_json(indent=2))
        logger.info(f"Manifest saved to {target} ({self.alive_urls} alive / {self.total_urls} total)")
        return target


def _is_retryable_status(status_code: int | None, exception: Exception | None) -> bool:
    """Determine if a URL check failure is retryable."""
    if exception is not None:
        if isinstance(exception, (httpx.NetworkError, httpx.TimeoutException)):
            return True
        # SSL errors are not retryable
        if isinstance(exception, ssl_error_types()):
            return False
        # Other connection errors may be transient
        return True

    if status_code is not None:
        # 5xx server errors are retryable
        if 500 <= status_code < 600:
            return True
        # 429 rate limiting is retryable
        if status_code == 429:
            return True

    return False


def ssl_error_types() -> tuple[type[Exception], ...]:
    """Return SSL-related exception types for detection."""
    try:
        import ssl

        return (ssl.SSLError,)
    except ImportError:
        return ()


class URLValidator:
    """
    Async URL validator using HEAD requests.

    Checks URLs from the golden dataset for liveness, measures response
    times, and generates a live manifest for benchmark runs.
    """

    def __init__(
        self,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        max_concurrency: int = DEFAULT_MAX_CONCURRENCY,
        max_retries: int = DEFAULT_MAX_RETRIES,
        user_agent: str = "BayState-Benchmark-Validator/1.0",
    ) -> None:
        self.timeout = timeout
        self.max_concurrency = max_concurrency
        self.max_retries = max_retries
        self.user_agent = user_agent
        self._semaphore = asyncio.Semaphore(max_concurrency)

    async def check_url(self, url: str) -> URLCheckResult:
        """
        Check a single URL with HEAD request and retry logic.

        Args:
            url: The URL to validate.

        Returns:
            URLCheckResult with status, timing, and error info.
        """
        headers = {"User-Agent": self.user_agent}
        last_exception: Exception | None = None
        delay = RETRY_INITIAL_DELAY

        for attempt in range(self.max_retries + 1):
            try:
                async with httpx.AsyncClient(
                    timeout=httpx.Timeout(self.timeout, connect=5.0),
                    follow_redirects=True,
                    verify=True,
                ) as client:
                    start = time.perf_counter()
                    response = await client.head(url, headers=headers)
                    elapsed_ms = (time.perf_counter() - start) * 1000

                    status_code = response.status_code
                    redirect_url = str(response.url) if str(response.url) != url else None
                    content_type = response.headers.get("content-type")

                    alive = 200 <= status_code < 400

                    return URLCheckResult(
                        url=url,
                        alive=alive,
                        status_code=status_code,
                        response_time_ms=round(elapsed_ms, 2),
                        redirect_url=redirect_url,
                        content_type=content_type,
                    )

            except httpx.TimeoutException as e:
                last_exception = e
                logger.warning(f"URL check timeout (attempt {attempt + 1}/{self.max_retries + 1}): {url}")

            except httpx.NetworkError as e:
                last_exception = e
                logger.warning(f"URL check network error (attempt {attempt + 1}/{self.max_retries + 1}): {url} - {type(e).__name__}")

            except httpx.HTTPStatusError as e:
                status_code = e.response.status_code
                if not _is_retryable_status(status_code, None):
                    return URLCheckResult(
                        url=url,
                        alive=False,
                        status_code=status_code,
                        error=f"HTTP {status_code}",
                    )
                last_exception = e
                logger.warning(f"URL check HTTP error (attempt {attempt + 1}/{self.max_retries + 1}): {url} - {status_code}")

            except Exception as e:
                last_exception = e
                error_type = type(e).__name__
                # SSL errors are not retryable
                if isinstance(e, ssl_error_types()):
                    return URLCheckResult(
                        url=url,
                        alive=False,
                        error=f"SSL error: {error_type}: {e}",
                    )
                logger.warning(f"URL check error (attempt {attempt + 1}/{self.max_retries + 1}): {url} - {error_type}: {e}")

            # Retry with exponential backoff
            if attempt < self.max_retries and _is_retryable_status(None, last_exception):
                await asyncio.sleep(delay)
                delay *= RETRY_BACKOFF_MULTIPLIER

        # All retries exhausted
        error_msg = f"{type(last_exception).__name__}: {last_exception}" if last_exception else "Unknown error"
        return URLCheckResult(
            url=url,
            alive=False,
            error=error_msg,
        )

    async def validate_dataset(
        self,
        dataset_path: Path | None = None,
    ) -> tuple[list[dict[str, Any]], list[URLCheckResult]]:
        """
        Validate all URLs in the golden dataset.

        Args:
            dataset_path: Path to golden_dataset_v3.json. Defaults to standard location.

        Returns:
            Tuple of (dataset_entries, check_results) for all URLs.
        """
        path = dataset_path or DEFAULT_DATASET_PATH
        if not path.exists():
            raise FileNotFoundError(f"Golden dataset not found: {path}")

        with open(path) as f:
            dataset = json.load(f)

        entries = dataset.get("entries", [])
        urls = [e.get("expected_source_url", "") for e in entries if e.get("expected_source_url")]

        logger.info(f"Validating {len(urls)} URLs from dataset v{dataset.get('version', '?')}")

        # Check all URLs concurrently with semaphore limiting
        tasks = [self._check_with_semaphore(url) for url in urls]
        results = await asyncio.gather(*tasks)

        return entries, list(results)

    async def _check_with_semaphore(self, url: str) -> URLCheckResult:
        """Check a URL with semaphore-based concurrency limiting."""
        async with self._semaphore:
            return await self.check_url(url)

    async def generate_live_manifest(
        self,
        dataset_path: Path | None = None,
        manifest_path: Path | None = None,
    ) -> LiveURLManifest:
        """
        Generate a live manifest from the golden dataset.

        Validates all URLs, filters dead links, and saves a manifest
        containing only live URLs ready for benchmarking.

        Args:
            dataset_path: Path to golden_dataset_v3.json.
            manifest_path: Path to save the manifest JSON.

        Returns:
            LiveURLManifest with alive entries and dead link info.
        """
        path = dataset_path or DEFAULT_DATASET_PATH
        if not path.exists():
            raise FileNotFoundError(f"Golden dataset not found: {path}")

        with open(path) as f:
            dataset = json.load(f)

        entries, results = await self.validate_dataset(path)

        # Build URL -> check result mapping
        url_to_result: dict[str, URLCheckResult] = {}
        for entry, result in zip(entries, results):
            url = entry.get("expected_source_url", "")
            if url:
                url_to_result[url] = result

        # Separate alive and dead entries
        alive_entries: list[dict[str, Any]] = []
        dead_entries: list[dict[str, Any]] = []

        for entry in entries:
            url = entry.get("expected_source_url", "")
            result = url_to_result.get(url)

            if result and result.alive:
                # Enrich entry with validation metadata
                enriched = dict(entry)
                enriched["_validation"] = {
                    "status_code": result.status_code,
                    "response_time_ms": result.response_time_ms,
                    "redirect_url": result.redirect_url,
                    "content_type": result.content_type,
                    "last_checked": datetime.now(timezone.utc).isoformat(),
                }
                alive_entries.append(enriched)
            else:
                # Record dead link info
                dead_info = dict(entry)
                dead_info["_validation"] = {
                    "alive": False,
                    "error": result.error if result else "URL missing from entry",
                    "status_code": result.status_code if result else None,
                    "last_checked": datetime.now(timezone.utc).isoformat(),
                }
                dead_entries.append(dead_info)

        manifest = LiveURLManifest(
            generated_at=datetime.now(timezone.utc).isoformat(),
            dataset_version=dataset.get("version", "unknown"),
            total_urls=len(entries),
            alive_urls=len(alive_entries),
            dead_urls=len(dead_entries),
            entries=alive_entries,
            dead_entries=dead_entries,
        )

        # Save to disk
        save_path = manifest_path or DEFAULT_MANIFEST_PATH
        manifest.save(save_path)

        logger.info(f"Manifest generated: {manifest.alive_urls} alive, {manifest.dead_urls} dead out of {manifest.total_urls} total")

        return manifest


async def validate_single_url(url: str, timeout: float = DEFAULT_TIMEOUT_SECONDS) -> URLCheckResult:
    """Convenience function to validate a single URL."""
    validator = URLValidator(timeout=timeout)
    return await validator.check_url(url)


async def generate_manifest(
    dataset_path: Path | None = None,
    manifest_path: Path | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    max_concurrency: int = DEFAULT_MAX_CONCURRENCY,
) -> LiveURLManifest:
    """Convenience function to generate a live manifest."""
    validator = URLValidator(timeout=timeout, max_concurrency=max_concurrency)
    return await validator.generate_live_manifest(dataset_path, manifest_path)


def run_validation(
    dataset_path: Path | None = None,
    manifest_path: Path | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    max_concurrency: int = DEFAULT_MAX_CONCURRENCY,
) -> LiveURLManifest:
    """Synchronous entry point for manifest generation."""
    return asyncio.run(generate_manifest(dataset_path, manifest_path, timeout, max_concurrency))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    manifest = run_validation()
    print(f"Live manifest: {manifest.alive_urls}/{manifest.total_urls} URLs alive")
    print(f"Dead URLs: {manifest.dead_urls}")
