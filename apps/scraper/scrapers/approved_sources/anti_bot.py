"""Anti-bot utilities for Approved Source adapters.

Provides shared infrastructure so every adapter benefits from:
- User-Agent rotation (pool of modern Chrome UAs)
- Bot-block / CAPTCHA detection
- Retry with jittered exponential backoff
- Proxy configuration builder (reads env vars)
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import re
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

# ---------------------------------------------------------------------------
# 1. User-Agent Rotation
# ---------------------------------------------------------------------------

_USER_AGENT_POOL: list[str] = [
    # Chrome 124 – macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    # Chrome 124 – Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    # Chrome 123 – macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    # Chrome 123 – Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    # Chrome 122 – macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    # Chrome 122 – Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    # Chrome 121 – macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    # Chrome 121 – Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    # Chrome 120 – macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    # Chrome 120 – Linux
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]


def get_random_user_agent() -> str:
    """Return a random user-agent string from the pool."""
    return random.choice(_USER_AGENT_POOL)


# ---------------------------------------------------------------------------
# 2. Bot-Block Detection
# ---------------------------------------------------------------------------

@dataclass
class BotBlockResult:
    """Result of bot-block detection on HTML content."""

    is_blocked: bool
    block_type: str | None = None  # "captcha", "robot_check", "cloudflare", "access_denied"
    message: str | None = None


# Compiled patterns for performance
_CAPTCHA_SELECTOR_PATTERN = re.compile(
    r'form[^>]*action[^>]*validateCaptcha'
    r'|id=["\']captchacharacters["\']'
    r'|class=["\'][^"\']*captcha[^"\']*["\']',
    re.IGNORECASE,
)

_ROBOT_TEXT_PATTERNS = [
    "make sure you're not a robot",
    "automated access",
    "sorry, we just need to make sure you're not a robot",
    "enter the characters you see below",
    "to discuss automated access",
]

_CLOUDFLARE_PATTERNS = [
    "checking your browser before accessing",
    "please wait while we verify your browser",
    "cf-browser-verification",
    "ray id:",
    "attention required! | cloudflare",
]

_ACCESS_DENIED_PATTERNS = [
    "access denied",
    "403 forbidden",
    "request blocked",
    "bot detected",
    "suspicious activity detected",
]


def detect_bot_block(html: str | None) -> BotBlockResult:
    """Detect whether an HTML page is a bot-block / CAPTCHA wall.

    Checks for:
    - Amazon-style CAPTCHA forms
    - Generic "robot check" pages
    - Cloudflare challenge pages
    - Access denied / 403 pages

    Returns a BotBlockResult with is_blocked=True and the detected block_type
    if a block is found, otherwise is_blocked=False.
    """
    if not html:
        return BotBlockResult(is_blocked=False)

    html_lower = html.lower()

    # 1. CAPTCHA form detection (highest confidence)
    if _CAPTCHA_SELECTOR_PATTERN.search(html):
        return BotBlockResult(
            is_blocked=True,
            block_type="captcha",
            message="CAPTCHA form detected on page",
        )

    # 2. Robot-check text
    for pattern in _ROBOT_TEXT_PATTERNS:
        if pattern in html_lower:
            return BotBlockResult(
                is_blocked=True,
                block_type="robot_check",
                message=f"Robot check text detected: '{pattern}'",
            )

    # 3. Cloudflare challenge
    cf_hits = sum(1 for p in _CLOUDFLARE_PATTERNS if p in html_lower)
    if cf_hits >= 2:
        return BotBlockResult(
            is_blocked=True,
            block_type="cloudflare",
            message="Cloudflare browser verification challenge detected",
        )

    # 4. Access denied (only if page is very short — real pages may contain
    #    these phrases in body text)
    if len(html) < 5000:
        for pattern in _ACCESS_DENIED_PATTERNS:
            if pattern in html_lower:
                return BotBlockResult(
                    is_blocked=True,
                    block_type="access_denied",
                    message=f"Access denied indicator detected: '{pattern}'",
                )

    return BotBlockResult(is_blocked=False)


# ---------------------------------------------------------------------------
# 3. Retry with Jittered Exponential Backoff
# ---------------------------------------------------------------------------


async def retry_with_backoff(
    fn: Callable[[], Awaitable[T]],
    *,
    max_retries: int = 2,
    base_delay: float = 2.0,
    jitter_range: tuple[float, float] = (0.5, 1.5),
    label: str = "operation",
) -> T:
    """Execute an async callable with retry and jittered exponential backoff.

    Args:
        fn: Zero-argument async callable to execute.
        max_retries: Number of retries after the initial attempt (total = 1 + max_retries).
        base_delay: Base delay in seconds; doubles each retry.
        jitter_range: (min, max) multiplier for randomising delay.
        label: Human-readable label for log messages.

    Returns:
        The result of the first successful call.

    Raises:
        The exception from the final attempt if all attempts fail.
    """
    last_exception: Exception | None = None

    for attempt in range(1 + max_retries):
        try:
            result = await fn()
            if attempt > 0:
                logger.info(
                    "[retry] %s succeeded on attempt %d/%d",
                    label, attempt + 1, 1 + max_retries,
                )
            return result
        except Exception as exc:
            last_exception = exc
            if attempt < max_retries:
                delay = base_delay * (2 ** attempt) * random.uniform(*jitter_range)
                logger.info(
                    "[retry] %s attempt %d/%d failed (%s), retrying in %.1fs",
                    label, attempt + 1, 1 + max_retries, exc, delay,
                )
                await asyncio.sleep(delay)
            else:
                logger.warning(
                    "[retry] %s failed after %d attempts: %s",
                    label, 1 + max_retries, exc,
                )

    # Should not reach here, but satisfy type checker
    if last_exception:
        raise last_exception
    raise RuntimeError(f"{label}: all attempts exhausted with no result or exception")


# ---------------------------------------------------------------------------
# 4. Proxy Configuration Builder
# ---------------------------------------------------------------------------


def get_proxy_config() -> dict[str, str] | None:
    """Build a Crawl4AI-compatible proxy_config from environment variables.

    Reads:
        PROXY_URL      — proxy server URL (e.g. "http://proxy.example.com:8080")
        PROXY_USERNAME  — optional authentication username
        PROXY_PASSWORD  — optional authentication password

    Returns:
        A dict suitable for BrowserConfig(proxy_config=...) or None if
        PROXY_URL is not set.
    """
    proxy_url = os.environ.get("PROXY_URL")
    if not proxy_url:
        return None

    config: dict[str, str] = {"server": proxy_url}

    username = os.environ.get("PROXY_USERNAME")
    password = os.environ.get("PROXY_PASSWORD")
    if username:
        config["username"] = username
    if password:
        config["password"] = password

    logger.info("[proxy] Using proxy server: %s", proxy_url)
    return config
