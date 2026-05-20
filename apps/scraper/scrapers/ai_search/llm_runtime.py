"""Helpers for OpenAI-compatible LLM runtime configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI

DEFAULT_LLM_MODEL = "gpt-4o-mini"


def _normalize_optional_string(value: str | None) -> str | None:
    if value is None:
        return None

    trimmed = value.strip()
    return trimmed if trimmed else None


def _normalize_base_url(value: str | None) -> str | None:
    normalized = _normalize_optional_string(value)
    if normalized is None:
        return None

    url = normalized.rstrip("/")
    # Defensively correct common misconfigurations for local LM Studio endpoints:
    if "localhost:1234/api/v1" in url:
        url = url.replace("localhost:1234/api/v1", "localhost:1234/v1")
    elif "127.0.0.1:1234/api/v1" in url:
        url = url.replace("127.0.0.1:1234/api/v1", "127.0.0.1:1234/v1")
    return url


@dataclass(frozen=True)
class LLMRuntimeConfig:
    model: str
    base_url: str | None
    api_key: str | None

    @property
    def crawl4ai_provider(self) -> str:
        # Crawl4AI expects provider/model format for extraction strategies
        return f"openai/{self.model}"

    def to_metadata(self) -> dict[str, str | None]:
        """Return model and mode metadata for enrichment contract."""
        return {
            "model": self.model,
            "provider": "openai_compatible",
        }


def resolve_llm_runtime(
    *,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    **kwargs: Any,  # Absorb legacy 'provider' arg if passed
) -> LLMRuntimeConfig:
    """Resolve LLM runtime configuration.

    All endpoints are assumed to be OpenAI-compatible.
    Configuration is driven strictly by LLM_API_KEY, LLM_BASE_URL, and LLM_MODEL.

    Fails if LLM_API_KEY is missing.
    """
    # 1. Resolve API Key (Argument > Env)
    normalized_api_key = _normalize_optional_string(api_key or os.getenv("LLM_API_KEY"))
    if not normalized_api_key:
        raise ValueError(
            "Missing LLM_API_KEY. Please set the LLM_API_KEY environment variable."
        )

    # 2. Resolve Model (Argument > Env > Default)
    normalized_model = (
        _normalize_optional_string(model)
        or os.getenv("LLM_MODEL")
        or DEFAULT_LLM_MODEL
    )

    # 3. Resolve Base URL (Argument > Env)
    normalized_base_url = _normalize_base_url(
        base_url or os.getenv("LLM_BASE_URL")
    )

    return LLMRuntimeConfig(
        model=normalized_model,
        base_url=normalized_base_url,
        api_key=normalized_api_key,
    )


def create_async_openai_client(runtime: LLMRuntimeConfig) -> AsyncOpenAI:
    if runtime.api_key is None:
        raise ValueError("Cannot create client without API key")

    return AsyncOpenAI(
        api_key=runtime.api_key,
        base_url=runtime.base_url,
    )
