from __future__ import annotations

from scrapers.ai_search.llm_runtime import resolve_llm_runtime
from scrapers.providers.base import BaseLLMProvider
from scrapers.providers.openai import OpenAIProvider


def create_llm_provider(
    *,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    **kwargs,
) -> BaseLLMProvider | None:
    """Create an OpenAI-compatible LLM provider.

    All endpoints are now assumed to be OpenAI-compatible.
    """
    try:
        runtime = resolve_llm_runtime(
            model=model,
            base_url=base_url,
            api_key=api_key,
        )
    except ValueError:
        # If LLM_API_KEY is missing, resolve_llm_runtime raises ValueError.
        # We return None to allow the caller to handle it gracefully or fail.
        return None

    return OpenAIProvider(
        model=runtime.model,
        api_key=runtime.api_key,
        base_url=runtime.base_url,
        provider_name="openai_compatible",
    )
