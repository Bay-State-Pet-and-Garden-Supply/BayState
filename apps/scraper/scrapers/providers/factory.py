from __future__ import annotations

from scrapers.ai_search.llm_runtime import LOCAL_OPENAI_COMPATIBLE_API_KEY, resolve_llm_runtime
from scrapers.providers.base import BaseLLMProvider
from scrapers.providers.openai import OpenAIProvider


def create_llm_provider(
    *,
    provider: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
) -> BaseLLMProvider | None:
    runtime = resolve_llm_runtime(
        provider=provider,
        model=model,
        base_url=base_url,
        api_key=api_key,
    )

    if runtime.provider == "openai":
        if not runtime.api_key:
            return None
        return OpenAIProvider(
            model=runtime.model,
            api_key=runtime.api_key,
            provider_name=runtime.provider,
        )

    if not runtime.base_url:
        return None
    return OpenAIProvider(
        model=runtime.model,
        api_key=runtime.api_key or LOCAL_OPENAI_COMPATIBLE_API_KEY,
        base_url=runtime.base_url,
        provider_name=runtime.provider,
    )
