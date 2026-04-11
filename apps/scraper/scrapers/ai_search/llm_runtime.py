"""Helpers for provider-aware LLM runtime configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from openai import AsyncOpenAI

LLMProvider = Literal["openai", "openai_compatible", "gemini"]
DEFAULT_LLM_MODEL = "gpt-4o-mini"
DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite-preview"
DEFAULT_OPENAI_COMPATIBLE_MODEL = "google/gemma-3-12b-it"
LOCAL_OPENAI_COMPATIBLE_API_KEY = "baystate-local"


def _normalize_optional_string(value: str | None) -> str | None:
    if value is None:
        return None

    trimmed = value.strip()
    return trimmed if trimmed else None


def _normalize_base_url(value: str | None) -> str | None:
    normalized = _normalize_optional_string(value)
    if normalized is None:
        return None

    return normalized.rstrip("/")


def normalize_llm_provider(value: str | None) -> LLMProvider:
    normalized = (_normalize_optional_string(value) or "").lower()
    if normalized == "openai":
        return "openai"
    if normalized == "openai_compatible":
        return "openai_compatible"
    return "openai"


@dataclass(frozen=True)
class LLMRuntimeConfig:
    provider: LLMProvider
    model: str
    base_url: str | None
    api_key: str | None

    @property
    def crawl4ai_provider(self) -> str:
        if self.provider == "gemini":
            return f"gemini/{self.model}"
        return f"openai/{self.model}"


def resolve_llm_runtime(
    *,
    provider: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
) -> LLMRuntimeConfig:
    normalized_provider = normalize_llm_provider(provider)
    default_model = DEFAULT_LLM_MODEL
    if normalized_provider == "openai_compatible":
        default_model = DEFAULT_OPENAI_COMPATIBLE_MODEL
    normalized_model = _normalize_optional_string(model) or default_model

    if normalized_provider == "openai_compatible":
        normalized_base_url = _normalize_base_url(base_url or os.getenv("OPENAI_COMPATIBLE_BASE_URL"))
        normalized_api_key = _normalize_optional_string(api_key or os.getenv("OPENAI_COMPATIBLE_API_KEY"))
        if normalized_base_url and normalized_api_key is None:
            normalized_api_key = LOCAL_OPENAI_COMPATIBLE_API_KEY
    else:
        normalized_base_url = None
        normalized_api_key = _normalize_optional_string(api_key or os.getenv("OPENAI_API_KEY"))

    return LLMRuntimeConfig(
        provider=normalized_provider,
        model=normalized_model,
        base_url=normalized_base_url,
        api_key=normalized_api_key,
    )


def create_async_openai_client(runtime: LLMRuntimeConfig) -> AsyncOpenAI | None:
    if runtime.provider == "openai":
        if runtime.api_key is None:
            return None
        return AsyncOpenAI(api_key=runtime.api_key)

    if runtime.base_url is None:
        return None

    return AsyncOpenAI(
        api_key=runtime.api_key or LOCAL_OPENAI_COMPATIBLE_API_KEY,
        base_url=runtime.base_url,
    )
