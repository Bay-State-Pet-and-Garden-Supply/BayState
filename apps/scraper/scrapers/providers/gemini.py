from __future__ import annotations

import asyncio
from typing import Any

from google import genai
from google.genai import types

from scrapers.providers.base import BaseLLMProvider, ProviderResponse, ProviderUsage


class GeminiProvider(BaseLLMProvider):
    def __init__(self, *, model: str, api_key: str, max_retries: int = 3) -> None:
        self.provider_name = "gemini"
        self.model = model
        self._max_retries = max_retries
        self._client = genai.Client(api_key=api_key)

    async def generate_text(
        self,
        *,
        system_prompt: str | None,
        user_prompt: str,
        temperature: float = 0.0,
        max_output_tokens: int | None = None,
        response_schema: dict[str, Any] | None = None,
    ) -> ProviderResponse:
        config_kwargs: dict[str, Any] = {
            "temperature": temperature,
        }
        if system_prompt:
            config_kwargs["system_instruction"] = system_prompt
        if max_output_tokens is not None:
            config_kwargs["max_output_tokens"] = max_output_tokens
        if response_schema is not None:
            config_kwargs["response_mime_type"] = "application/json"
            config_kwargs["response_json_schema"] = response_schema

        last_error: Exception | None = None
        for attempt in range(self._max_retries):
            try:
                response = await self._client.aio.models.generate_content(
                    model=self.model,
                    contents=user_prompt,
                    config=types.GenerateContentConfig(**config_kwargs),
                )
                usage = getattr(response, "usage_metadata", None)
                return ProviderResponse(
                    text=str(getattr(response, "text", "") or "").strip(),
                    usage=ProviderUsage(
                        prompt_tokens=int(getattr(usage, "prompt_token_count", 0) or 0),
                        completion_tokens=int(getattr(usage, "candidates_token_count", 0) or 0),
                        total_tokens=int(getattr(usage, "total_token_count", 0) or 0),
                    ),
                    raw=response,
                )
            except Exception as exc:
                last_error = exc
                if attempt >= self._max_retries - 1:
                    raise
                await asyncio.sleep(2 ** attempt)

        if last_error:
            raise last_error
        raise RuntimeError("Gemini provider failed without a captured exception")
