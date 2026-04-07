from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterable
from urllib.parse import urlsplit

import httpx

GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com"
GROUNDING_REDIRECT_PATH_PREFIX = "/grounding-api-redirect/"
GROUNDING_RESOLUTION_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def canonicalize_grounding_url(url: str) -> str:
    return str(url or "").strip().rstrip("/")


def is_grounding_redirect_url(url: str) -> bool:
    parts = urlsplit(canonicalize_grounding_url(url))
    return parts.netloc.lower() == GROUNDING_REDIRECT_HOST and parts.path.startswith(GROUNDING_REDIRECT_PATH_PREFIX)


class GroundingRedirectResolver:
    def __init__(self, *, logger_instance: logging.Logger | None = None) -> None:
        self._logger = logger_instance or logging.getLogger(__name__)
        self._cache: dict[str, str] = {}

    async def _resolve_with_client(self, url: str, client: httpx.AsyncClient, *, label: str) -> str:
        canonical_url = canonicalize_grounding_url(url)
        if not is_grounding_redirect_url(canonical_url):
            return canonical_url

        if canonical_url in self._cache:
            return self._cache[canonical_url]

        for method in ("HEAD", "GET"):
            try:
                response = await client.request(method, canonical_url)
            except Exception as exc:
                self._logger.warning("[AI Search] Failed to resolve Google grounding %s via %s: %s", label, method, exc)
                continue

            resolved_url = canonicalize_grounding_url(str(response.url))
            if resolved_url and not is_grounding_redirect_url(resolved_url):
                self._cache[canonical_url] = resolved_url
                return resolved_url

        self._cache[canonical_url] = ""
        return ""

    async def resolve_many(self, urls: Iterable[str], *, label: str) -> dict[str, str]:
        redirect_urls: list[str] = []
        seen_urls: set[str] = set()

        for url in urls:
            canonical_url = canonicalize_grounding_url(url)
            if not canonical_url or canonical_url in seen_urls or not is_grounding_redirect_url(canonical_url):
                continue
            seen_urls.add(canonical_url)
            redirect_urls.append(canonical_url)

        if not redirect_urls:
            return {}

        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True, headers=GROUNDING_RESOLUTION_HEADERS) as client:
            resolved_urls = await asyncio.gather(
                *[self._resolve_with_client(url, client, label=label) for url in redirect_urls]
            )

        return dict(zip(redirect_urls, resolved_urls, strict=False))
