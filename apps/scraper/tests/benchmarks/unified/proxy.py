"""Proxy configuration and rotation infrastructure for benchmark runs.

Provides ProxyConfig dataclass, ProxyRotator with round-robin rotation,
and ProxyHealthChecker for periodic health checks. Integrates with
Crawl4AIEngine's proxy config format (simple URL strings).

Supports loading from:
  - Environment variable BENCHMARK_PROXY_POOL (comma-separated URLs)
  - YAML config file
  - Direct list of ProxyConfig objects
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from itertools import cycle
from pathlib import Path
from typing import Any, Sequence
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ProxyConfig — single proxy endpoint
# ---------------------------------------------------------------------------

PROXY_PROTOCOLS = ("http", "https", "socks4", "socks5")


@dataclass(frozen=True, slots=True)
class ProxyConfig:
    """Configuration for a single proxy endpoint.

    Converts to a URL string compatible with Crawl4AIEngine's ``proxy``
    parameter (e.g. ``http://user:pass@host:port``).
    """

    host: str
    port: int
    protocol: str = "http"
    username: str | None = None
    password: str | None = None

    def __post_init__(self) -> None:
        if self.protocol not in PROXY_PROTOCOLS:
            raise ValueError(f"Unsupported proxy protocol '{self.protocol}'. Must be one of: {', '.join(PROXY_PROTOCOLS)}")
        if not self.host:
            raise ValueError("Proxy host must not be empty")
        if not (1 <= self.port <= 65535):
            raise ValueError(f"Proxy port must be 1-65535, got {self.port}")

    def to_url(self) -> str:
        """Convert to a URL string for Crawl4AIEngine proxy config.

        Format: ``protocol://username:password@host:port``
        Credentials are omitted when not provided.
        """
        if self.username and self.password:
            netloc = f"{self.username}:{self.password}@{self.host}:{self.port}"
        elif self.username:
            netloc = f"{self.username}@{self.host}:{self.port}"
        else:
            netloc = f"{self.host}:{self.port}"
        return f"{self.protocol}://{netloc}"

    def to_crawl4ai_config(self) -> dict[str, Any]:
        """Convert to Crawl4AIEngine browser config dict format.

        Returns a dict with ``proxy`` key containing the URL string,
        matching the format used in ``engine.py`` _build_browser_config.
        """
        return {"proxy": self.to_url()}

    @classmethod
    def from_url(cls, url: str) -> ProxyConfig:
        """Parse a proxy URL string into a ProxyConfig.

        Accepts formats like:
          - ``http://host:port``
          - ``http://user:pass@host:port``
          - ``socks5://user:pass@host:port``
        """
        parsed = urlparse(url)
        protocol = parsed.scheme or "http"
        host = parsed.hostname or ""
        port = parsed.port or (443 if protocol == "https" else 80)
        username = parsed.username or None
        password = parsed.password or None
        return cls(host=host, port=port, protocol=protocol, username=username, password=password)


# ---------------------------------------------------------------------------
# ProxyRotator — round-robin rotation with failure tracking
# ---------------------------------------------------------------------------

DEFAULT_MAX_FAILURES = 3
DEFAULT_COOLDOWN_SECONDS = 300.0


@dataclass
class ProxyHealth:
    """Tracks health state for a single proxy."""

    proxy: ProxyConfig
    consecutive_failures: int = 0
    total_failures: int = 0
    total_successes: int = 0
    last_failure_time: float = 0.0
    marked_down: bool = False


class ProxyRotator:
    """Round-robin proxy rotation with failure tracking and cooldown.

    Supports:
      - Round-robin rotation across healthy proxies
      - Marking proxies as failed (with configurable threshold)
      - Cooldown period before retrying failed proxies
      - No-proxy mode when pool is empty
      - Loading from env vars, config file, or direct list
    """

    def __init__(
        self,
        proxies: Sequence[ProxyConfig] | None = None,
        *,
        max_failures: int = DEFAULT_MAX_FAILURES,
        cooldown_seconds: float = DEFAULT_COOLDOWN_SECONDS,
    ) -> None:
        self._proxies: list[ProxyConfig] = list(proxies) if proxies else []
        self._health: dict[str, ProxyHealth] = {}
        self._max_failures = max_failures
        self._cooldown_seconds = cooldown_seconds
        self._cycle: cycle[ProxyConfig] | None = None
        self._initialize_health()

    def _initialize_health(self) -> None:
        """Build health tracking for all proxies in the pool."""
        self._health = {p.to_url(): ProxyHealth(proxy=p) for p in self._proxies}
        self._cycle = cycle(self._proxies) if self._proxies else None

    # -- Factory methods -----------------------------------------------------

    @classmethod
    def from_env(cls, env_var: str = "BENCHMARK_PROXY_POOL", **kwargs: Any) -> ProxyRotator:
        """Create a ProxyRotator from a comma-separated env var.

        Format: ``http://user:pass@host:port,socks5://host:port``
        Returns an empty rotator (no-proxy mode) if the env var is unset.
        """
        raw = os.environ.get(env_var, "").strip()
        if not raw:
            return cls(**kwargs)
        urls = [u.strip() for u in raw.split(",") if u.strip()]
        proxies = [ProxyConfig.from_url(u) for u in urls]
        return cls(proxies, **kwargs)

    @classmethod
    def from_yaml(cls, path: str | Path, **kwargs: Any) -> ProxyRotator:
        """Create a ProxyRotator from a YAML config file.

        Expected structure:
          proxies:
            - host: proxy1.example.com
              port: 8080
              protocol: http
              username: user
              password: pass
        """
        try:
            import yaml  # type: ignore[import-untyped]
        except ImportError:
            raise ImportError("PyYAML is required to load proxy config from YAML. Install with: pip install pyyaml")

        path = Path(path)
        if not path.exists():
            logger.warning("Proxy config file not found: %s — using no-proxy mode", path)
            return cls(**kwargs)

        with open(path) as f:
            data = yaml.safe_load(f) or {}

        proxy_list = data.get("proxies", [])
        if not proxy_list:
            logger.info("No proxies defined in %s — using no-proxy mode", path)
            return cls(**kwargs)

        proxies = []
        for entry in proxy_list:
            proxies.append(
                ProxyConfig(
                    host=entry["host"],
                    port=int(entry["port"]),
                    protocol=entry.get("protocol", "http"),
                    username=entry.get("username"),
                    password=entry.get("password"),
                )
            )
        return cls(proxies, **kwargs)

    @classmethod
    def from_config(cls, config: dict[str, Any], **kwargs: Any) -> ProxyRotator:
        """Create a ProxyRotator from a config dict (e.g., parsed YAML).

        Accepts the same structure as from_yaml but from an already-parsed dict.
        """
        proxy_list = config.get("proxies", [])
        if not proxy_list:
            return cls(**kwargs)

        proxies = []
        for entry in proxy_list:
            if isinstance(entry, str):
                proxies.append(ProxyConfig.from_url(entry))
            else:
                proxies.append(
                    ProxyConfig(
                        host=entry["host"],
                        port=int(entry["port"]),
                        protocol=entry.get("protocol", "http"),
                        username=entry.get("username"),
                        password=entry.get("password"),
                    )
                )
        return cls(proxies, **kwargs)

    # -- Rotation logic ------------------------------------------------------

    def get_next(self) -> ProxyConfig | None:
        """Get the next healthy proxy via round-robin.

        Returns None if the pool is empty (no-proxy mode) or all proxies
        are currently in cooldown.
        """
        if not self._proxies:
            return None

        for _ in range(len(self._proxies)):
            if self._cycle is None:
                return None
            proxy = next(self._cycle)
            health = self._health.get(proxy.to_url())
            if health is None:
                continue

            if health.marked_down:
                elapsed = time.monotonic() - health.last_failure_time
                if elapsed >= self._cooldown_seconds:
                    health.marked_down = False
                    health.consecutive_failures = 0
                    logger.info("Proxy %s cooldown expired, retrying", proxy.host)
                else:
                    continue

            return proxy

        logger.warning("All proxies are in cooldown — returning None")
        return None

    def get_proxy_url(self) -> str | None:
        """Get the next proxy URL string for Crawl4AIEngine.

        Returns None for no-proxy mode.
        """
        proxy = self.get_next()
        return proxy.to_url() if proxy else None

    def get_crawl4ai_browser_config(self) -> dict[str, Any]:
        """Get a browser config dict with the next proxy for Crawl4AIEngine.

        Returns ``{}`` (empty dict) for no-proxy mode, matching the pattern
        in ``engine.py`` where proxy is only set when available.
        """
        proxy = self.get_next()
        if proxy is None:
            return {}
        return proxy.to_crawl4ai_config()

    # -- Health tracking ----------------------------------------------------

    def report_success(self, proxy: ProxyConfig) -> None:
        """Report a successful request through the given proxy."""
        key = proxy.to_url()
        health = self._health.get(key)
        if health is None:
            return
        health.consecutive_failures = 0
        health.total_successes += 1
        health.marked_down = False

    def report_failure(self, proxy: ProxyConfig) -> None:
        """Report a failed request through the given proxy.

        After ``max_failures`` consecutive failures, the proxy is marked
        down for the cooldown period.
        """
        key = proxy.to_url()
        health = self._health.get(key)
        if health is None:
            return
        health.consecutive_failures += 1
        health.total_failures += 1
        health.last_failure_time = time.monotonic()

        if health.consecutive_failures >= self._max_failures:
            health.marked_down = True
            logger.warning(
                "Proxy %s marked down after %d consecutive failures (cooldown: %.0fs)",
                proxy.host,
                health.consecutive_failures,
                self._cooldown_seconds,
            )

    # -- Pool management -----------------------------------------------------

    @property
    def pool_size(self) -> int:
        """Total number of proxies in the pool."""
        return len(self._proxies)

    @property
    def healthy_count(self) -> int:
        """Number of currently healthy (not marked down) proxies."""
        return sum(1 for h in self._health.values() if not h.marked_down)

    @property
    def is_empty(self) -> bool:
        """Whether the proxy pool is empty (no-proxy mode)."""
        return len(self._proxies) == 0

    def get_health_summary(self) -> dict[str, Any]:
        """Get a summary of all proxy health states."""
        return {
            "total": self.pool_size,
            "healthy": self.healthy_count,
            "down": self.pool_size - self.healthy_count,
            "proxies": {
                url: {
                    "host": h.proxy.host,
                    "consecutive_failures": h.consecutive_failures,
                    "total_failures": h.total_failures,
                    "total_successes": h.total_successes,
                    "marked_down": h.marked_down,
                }
                for url, h in self._health.items()
            },
        }


# ---------------------------------------------------------------------------
# ProxyHealthChecker — periodic health checks
# ---------------------------------------------------------------------------

DEFAULT_CHECK_TIMEOUT = 10.0
DEFAULT_CHECK_URL = "https://httpbin.org/ip"


class ProxyHealthChecker:
    """Periodic health checker for proxy endpoints.

    Performs lightweight HTTP requests through each proxy to verify
    connectivity. Proxies that fail the check are reported to the
    ProxyRotator for cooldown.
    """

    def __init__(
        self,
        rotator: ProxyRotator,
        *,
        check_url: str = DEFAULT_CHECK_URL,
        timeout: float = DEFAULT_CHECK_TIMEOUT,
    ) -> None:
        self._rotator = rotator
        self._check_url = check_url
        self._timeout = timeout

    async def check_proxy(self, proxy: ProxyConfig) -> bool:
        """Check a single proxy by making a request through it.

        Returns True if the proxy is healthy, False otherwise.
        Uses aiohttp if available, falls back to urllib.
        """
        proxy_url = proxy.to_url()
        try:
            try:
                import aiohttp

                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        self._check_url,
                        proxy=proxy_url,
                        timeout=aiohttp.ClientTimeout(total=self._timeout),
                    ) as resp:
                        return resp.status == 200
            except ImportError:
                import urllib.request

                proxy_handler = urllib.request.ProxyHandler(
                    {
                        proxy.protocol: proxy_url,
                    }
                )
                opener = urllib.request.build_opener(proxy_handler)
                req = urllib.request.Request(self._check_url, method="GET")
                req.add_header("User-Agent", "BayState-ProxyHealthCheck/1.0")
                with opener.open(req, timeout=self._timeout) as resp:
                    return resp.status == 200
        except Exception as exc:
            logger.debug("Proxy health check failed for %s: %s", proxy.host, exc)
            return False

    async def check_all(self) -> dict[str, bool]:
        """Check all proxies in the rotator pool.

        Returns a dict mapping proxy URL to health status (True=healthy).
        """
        results: dict[str, bool] = {}
        for proxy in self._rotator._proxies:
            is_healthy = await self.check_proxy(proxy)
            url = proxy.to_url()
            results[url] = is_healthy
            if is_healthy:
                self._rotator.report_success(proxy)
            else:
                self._rotator.report_failure(proxy)
        return results

    def check_proxy_sync(self, proxy: ProxyConfig) -> bool:
        """Synchronous health check for a single proxy.

        Uses urllib.request — no async dependencies required.
        """
        proxy_url = proxy.to_url()
        try:
            import urllib.request

            proxy_handler = urllib.request.ProxyHandler(
                {
                    proxy.protocol: proxy_url,
                }
            )
            opener = urllib.request.build_opener(proxy_handler)
            req = urllib.request.Request(self._check_url, method="GET")
            req.add_header("User-Agent", "BayState-ProxyHealthCheck/1.0")
            with opener.open(req, timeout=self._timeout) as resp:
                return resp.status == 200
        except Exception as exc:
            logger.debug("Sync proxy health check failed for %s: %s", proxy.host, exc)
            return False

    def check_all_sync(self) -> dict[str, bool]:
        """Synchronous health check for all proxies.

        Returns a dict mapping proxy URL to health status (True=healthy).
        """
        results: dict[str, bool] = {}
        for proxy in self._rotator._proxies:
            is_healthy = self.check_proxy_sync(proxy)
            url = proxy.to_url()
            results[url] = is_healthy
            if is_healthy:
                self._rotator.report_success(proxy)
            else:
                self._rotator.report_failure(proxy)
        return results


# ---------------------------------------------------------------------------
# Convenience — load proxy config from multiple sources
# ---------------------------------------------------------------------------


def load_proxy_rotator(
    *,
    env_var: str = "BENCHMARK_PROXY_POOL",
    config_path: str | Path | None = None,
    proxies: Sequence[ProxyConfig] | None = None,
    **kwargs: Any,
) -> ProxyRotator:
    """Load a ProxyRotator from the first available source.

    Priority order:
      1. Direct ``proxies`` list (if provided)
      2. Environment variable ``BENCHMARK_PROXY_POOL``
      3. YAML config file (if ``config_path`` is provided)
      4. Empty rotator (no-proxy mode)
    """
    if proxies:
        return ProxyRotator(proxies, **kwargs)

    env_val = os.environ.get(env_var, "").strip()
    if env_val:
        return ProxyRotator.from_env(env_var=env_var, **kwargs)

    if config_path is not None:
        return ProxyRotator.from_yaml(config_path, **kwargs)

    return ProxyRotator(**kwargs)


__all__ = [
    "ProxyConfig",
    "ProxyHealth",
    "ProxyRotator",
    "ProxyHealthChecker",
    "load_proxy_rotator",
    "DEFAULT_MAX_FAILURES",
    "DEFAULT_COOLDOWN_SECONDS",
    "DEFAULT_CHECK_TIMEOUT",
    "DEFAULT_CHECK_URL",
]
