"""Proxy rotation and health management for web scraping.

This module provides the ProxyRotator class for managing proxy lists with
multiple rotation strategies and health tracking.

Example:
    >>> from utils.proxy_rotator import ProxyRotator
    >>> rotator = ProxyRotator(
    ...     ["http://p1:8080", "http://p2:8080"],
    ...     strategy="per_request"
    ... )
    >>> proxy = rotator.get_proxy()
    >>> rotator.mark_failed(proxy)  # Temporarily exclude from rotation
"""

from __future__ import annotations

import hashlib
import threading
import time
from typing import List, Optional


class ProxyRotator:
    """Manages proxy lists and rotation strategies for web scraping.

    Supports multiple rotation strategies (per_request, per_site, off) and
    tracks proxy health to temporarily exclude failed proxies from rotation.

    Thread-safe for concurrent access.
    """

    DEFAULT_FAILURE_COOLDOWN = 300  # 5 minutes in seconds

    def __init__(
        self,
        proxy_list: List[str],
        strategy: str = "off",
        proxy_username: Optional[str] = None,
        proxy_password: Optional[str] = None,
        failure_cooldown: int = DEFAULT_FAILURE_COOLDOWN,
    ) -> None:
        """Initialize the proxy rotator.

        Args:
            proxy_list: List of proxy URLs (http://host:port or https://host:port)
            strategy: Rotation strategy - "per_request", "per_site", or "off"
            proxy_username: Optional username for proxy authentication
            proxy_password: Optional password for proxy authentication
            failure_cooldown: Seconds to exclude failed proxies (default 300)

        Raises:
            ValueError: If proxy_list is empty or strategy is invalid
        """
        if not proxy_list:
            raise ValueError("proxy_list cannot be empty")

        valid_strategies = {"per_request", "per_site", "off"}
        if strategy not in valid_strategies:
            raise ValueError(f"Invalid strategy '{strategy}'. Must be one of: {valid_strategies}")

        self._proxy_list = list(proxy_list)  # Copy to avoid external mutation
        self.strategy = strategy
        self.proxy_username = proxy_username
        self.proxy_password = proxy_password
        self.failure_cooldown = failure_cooldown

        # Thread-safe state
        self._lock = threading.Lock()
        self._current_index = 0
        self._failed_proxies: dict[str, float] = {}  # proxy_url -> failed_until timestamp

    def get_proxy(self, site: Optional[str] = None) -> Optional[str]:
        """Get the next proxy URL based on rotation strategy.

        Args:
            site: Optional site identifier for per_site strategy (e.g., "amazon.com")

        Returns:
            Proxy URL string, or None if no healthy proxies available
        """
        with self._lock:
            healthy_proxies = self._get_healthy_proxies()

            if not healthy_proxies:
                return None

            if self.strategy == "off":
                # Always return first healthy proxy
                proxy = healthy_proxies[0]
                return self._format_proxy_url(proxy)

            elif self.strategy == "per_request":
                # Rotate to next proxy
                proxy = healthy_proxies[self._current_index % len(healthy_proxies)]
                self._current_index = (self._current_index + 1) % len(healthy_proxies)
                return self._format_proxy_url(proxy)

            elif self.strategy == "per_site":
                # Return same proxy for same site (hash-based)
                if site is None:
                    # Fall back to per_request if no site specified
                    proxy = healthy_proxies[self._current_index % len(healthy_proxies)]
                    self._current_index = (self._current_index + 1) % len(healthy_proxies)
                else:
                    # Hash site to get consistent proxy index
                    site_hash = int(hashlib.md5(site.encode()).hexdigest(), 16)
                    proxy = healthy_proxies[site_hash % len(healthy_proxies)]
                return self._format_proxy_url(proxy)

            return None  # Should not reach here

    def mark_failed(self, proxy_url: str) -> None:
        """Mark a proxy as temporarily failed.

        Failed proxies are excluded from rotation until the cooldown period expires.

        Args:
            proxy_url: The proxy URL that failed (can include credentials)
        """
        # Normalize URL to match stored format
        normalized_url = self._normalize_proxy_url(proxy_url)

        with self._lock:
            failed_until = time.time() + self.failure_cooldown
            self._failed_proxies[normalized_url] = failed_until

    def mark_success(self, proxy_url: str) -> None:
        """Mark a proxy as successfully working.

        Removes the proxy from the failed list if present, allowing immediate reuse.

        Args:
            proxy_url: The proxy URL that succeeded (can include credentials)
        """
        # Normalize URL to match stored format
        normalized_url = self._normalize_proxy_url(proxy_url)

        with self._lock:
            if normalized_url in self._failed_proxies:
                del self._failed_proxies[normalized_url]

    def get_stats(self) -> dict:
        """Get current proxy statistics.

        Returns:
            Dictionary with total, healthy, and failed proxy counts
        """
        with self._lock:
            healthy = self._get_healthy_proxies()
            failed_count = len(self._failed_proxies)
            recovering = sum(1 for until in self._failed_proxies.values() if until <= time.time())

            return {
                "total": len(self._proxy_list),
                "healthy": len(healthy),
                "failed": failed_count - recovering,
                "recovering": recovering,
                "strategy": self.strategy,
            }

    def _get_healthy_proxies(self) -> List[str]:
        """Get list of proxies not currently marked as failed.

        Also cleans up expired failures.

        Returns:
            List of healthy proxy URLs
        """
        now = time.time()

        # Clean up expired failures
        expired = [url for url, until in self._failed_proxies.items() if until <= now]
        for url in expired:
            del self._failed_proxies[url]

        # Return proxies not in failed list
        return [p for p in self._proxy_list if p not in self._failed_proxies]

    def _format_proxy_url(self, base_url: str) -> str:
        """Format proxy URL with authentication credentials.

        If proxy has embedded credentials, returns as-is.
        If separate username/password provided, embeds them.

        Args:
            base_url: Base proxy URL (e.g., http://proxy.host:port)

        Returns:
            Formatted proxy URL with credentials if available
        """
        # Check if URL already has credentials
        if "@" in base_url:
            return base_url

        # Check if credentials are provided separately
        if self.proxy_username and self.proxy_password:
            # Insert credentials into URL
            # http://host:port -> http://user:pass@host:port
            protocol_end = base_url.find("://")
            if protocol_end != -1:
                protocol = base_url[: protocol_end + 3]
                host_port = base_url[protocol_end + 3 :]
                auth = f"{self.proxy_username}:{self.proxy_password}"
                return f"{protocol}{auth}@{host_port}"

        return base_url

    def _normalize_proxy_url(self, proxy_url: str) -> str:
        """Normalize proxy URL for comparison.

        Strips credentials to match base proxy list format.

        Args:
            proxy_url: Proxy URL potentially with credentials

        Returns:
            Normalized URL without credentials
        """
        # Remove credentials if present
        if "@" in proxy_url:
            protocol_end = proxy_url.find("://")
            if protocol_end != -1:
                protocol = proxy_url[: protocol_end + 3]
                at_index = proxy_url.find("@")
                host_port = proxy_url[at_index + 1 :]
                return f"{protocol}{host_port}"

        return proxy_url

    @property
    def proxy_count(self) -> int:
        """Total number of configured proxies."""
        return len(self._proxy_list)

    @property
    def healthy_count(self) -> int:
        """Number of currently healthy proxies."""
        with self._lock:
            return len(self._get_healthy_proxies())

    @classmethod
    def from_proxy_config(cls, proxy_config) -> "ProxyRotator":
        """Create a ProxyRotator from a ProxyConfig model.

        Args:
            proxy_config: ProxyConfig instance from scrapers.models.config

        Returns:
            Configured ProxyRotator instance
        """
        # Build proxy list from config
        proxies: List[str] = []

        if proxy_config.proxy_list:
            proxies.extend(proxy_config.proxy_list)

        if proxy_config.proxy_url and proxy_config.proxy_url not in proxies:
            proxies.append(proxy_config.proxy_url)

        if not proxies:
            raise ValueError("ProxyConfig has no proxy_url or proxy_list")

        return cls(
            proxy_list=proxies,
            strategy=proxy_config.rotation_strategy or "off",
            proxy_username=proxy_config.proxy_username,
            proxy_password=proxy_config.proxy_password,
        )
