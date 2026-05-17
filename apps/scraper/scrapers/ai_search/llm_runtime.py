"""Helpers for DeepSeek-first LLM runtime configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from openai import AsyncOpenAI

LLMProvider = Literal["deepseek", "openai", "openai_compatible"]
DEFAULT_LLM_MODEL = "deepseek-chat"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_OPENAI_COMPATIBLE_MODEL = "google/gemma-3-12b-it"
LOCAL_OPENAI_COMPATIBLE_API_KEY = "baystate-local"
DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"


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
    provider_str = _normalize_optional_string(value) or os.getenv("LLM_PROVIDER")
    normalized = (provider_str or "").lower().strip()
    if normalized == "deepseek":
        return "deepseek"
    if normalized == "openai":
        return "openai"
    if normalized == "openai_compatible":
        return "openai_compatible"
    return "deepseek"


@dataclass(frozen=True)
class LLMRuntimeConfig:
    provider: LLMProvider
    model: str
    base_url: str | None
    api_key: str | None

    @property
    def crawl4ai_provider(self) -> str:
        return f"openai/{self.model}"

    def to_metadata(self) -> dict[str, str | None]:
        """Return model and mode metadata for enrichment contract."""
        return {
            "model": self.model,
            "provider": self.provider,
        }


def resolve_llm_runtime(
    *,
    provider: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
) -> LLMRuntimeConfig:
    normalized_provider = normalize_llm_provider(provider)

    if normalized_provider == "openai_compatible":
        # Allow specifying default model via LLM_MODEL env var
        default_model = os.getenv("LLM_MODEL") or DEFAULT_OPENAI_COMPATIBLE_MODEL
        passed_model = _normalize_optional_string(model)
        # If deepseek-chat is passed by default but we are using openai_compatible, override with local model if defined
        if passed_model == "deepseek-chat" and os.getenv("LLM_MODEL"):
            normalized_model = os.getenv("LLM_MODEL")
        else:
            normalized_model = passed_model or default_model

        normalized_base_url = _normalize_base_url(base_url or os.getenv("OPENAI_COMPATIBLE_BASE_URL"))
        normalized_api_key = _normalize_optional_string(api_key or os.getenv("OPENAI_COMPATIBLE_API_KEY"))
        if normalized_base_url and normalized_api_key is None:
            normalized_api_key = LOCAL_OPENAI_COMPATIBLE_API_KEY
    elif normalized_provider == "openai":
        default_model = DEFAULT_OPENAI_MODEL
        normalized_model = _normalize_optional_string(model) or default_model
        normalized_base_url = _normalize_base_url(base_url or os.getenv("OPENAI_BASE_URL"))
        normalized_api_key = _normalize_optional_string(api_key or os.getenv("OPENAI_API_KEY"))
    else:
        default_model = DEFAULT_LLM_MODEL
        normalized_model = _normalize_optional_string(model) or default_model
        normalized_base_url = _normalize_base_url(base_url or os.getenv("DEEPSEEK_BASE_URL") or DEFAULT_DEEPSEEK_BASE_URL)
        normalized_api_key = _normalize_optional_string(api_key or os.getenv("DEEPSEEK_API_KEY"))

    return LLMRuntimeConfig(
        provider=normalized_provider,
        model=normalized_model,
        base_url=normalized_base_url,
        api_key=normalized_api_key,
    )


def create_async_openai_client(runtime: LLMRuntimeConfig) -> AsyncOpenAI | None:
    if runtime.api_key is None:
        return None

    return AsyncOpenAI(
        api_key=runtime.api_key,
        base_url=runtime.base_url,
    )
