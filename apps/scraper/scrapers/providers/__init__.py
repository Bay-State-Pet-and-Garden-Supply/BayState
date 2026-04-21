from __future__ import annotations

from scrapers.providers.base import BaseBatchProvider, BaseLLMProvider, BaseSearchProvider, ProviderResponse, ProviderUsage
from scrapers.providers.factory import create_llm_provider


def __getattr__(name: str):
    if name == "GeminiSearchClient":
        from scrapers.providers.gemini_search import GeminiSearchClient

        return GeminiSearchClient
    if name == "SerperSearchClient":
        from scrapers.providers.serper import SerperSearchClient

        return SerperSearchClient
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "BaseBatchProvider",
    "BaseLLMProvider",
    "BaseSearchProvider",
    "GeminiSearchClient",
    "ProviderResponse",
    "ProviderUsage",
    "SerperSearchClient",
    "create_llm_provider",
]
