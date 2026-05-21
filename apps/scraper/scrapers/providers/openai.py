from __future__ import annotations

import asyncio
from typing import Any

from openai import APIConnectionError, APITimeoutError, AsyncOpenAI, InternalServerError, RateLimitError

from scrapers.providers.base import BaseLLMProvider, ProviderResponse, ProviderUsage


class OpenAIProvider(BaseLLMProvider):
    def __init__(
        self,
        *,
        model: str,
        api_key: str | None,
        base_url: str | None = None,
        provider_name: str = "openai",
        max_retries: int = 3,
    ) -> None:
        self.provider_name = provider_name
        self.model = model
        self._max_retries = max_retries
        client_kwargs: dict[str, Any] = {}
        if api_key:
            client_kwargs["api_key"] = api_key
        if base_url:
            client_kwargs["base_url"] = base_url
        self._client = AsyncOpenAI(**client_kwargs)

    async def generate_text(
        self,
        *,
        system_prompt: str | None,
        user_prompt: str,
        temperature: float = 0.0,
        max_output_tokens: int | None = None,
        response_schema: dict[str, Any] | None = None,
    ) -> ProviderResponse:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                *(
                    [{"role": "system", "content": system_prompt}]
                    if system_prompt
                    else []
                ),
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
        }
        if max_output_tokens is not None:
            payload["max_tokens"] = max_output_tokens
        if response_schema is not None:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "structured_response",
                    "schema": response_schema,
                },
            }

        last_error: Exception | None = None
        for attempt in range(self._max_retries):
            try:
                response = await self._client.chat.completions.create(**payload)
                usage = response.usage
                return ProviderResponse(
                    text=str(response.choices[0].message.content or "").strip(),
                    usage=ProviderUsage(
                        prompt_tokens=int(getattr(usage, "prompt_tokens", 0) or 0),
                        completion_tokens=int(getattr(usage, "completion_tokens", 0) or 0),
                        total_tokens=int(getattr(usage, "total_tokens", 0) or 0),
                    ),
                    raw=response,
                    metadata={
                        "finish_reason": response.choices[0].finish_reason,
                    },
                )
            except (APIConnectionError, APITimeoutError, InternalServerError, RateLimitError) as exc:
                last_error = exc
                if attempt >= self._max_retries - 1:
                    raise
                await asyncio.sleep(2 ** attempt)
            except Exception as exc:
                # Catch BadRequestError dynamically (e.g. from openai.BadRequestError)
                # to handle cases where the target provider/endpoint does not support json_schema
                from openai import BadRequestError
                if isinstance(exc, BadRequestError):
                    err_msg = str(exc).lower()
                    if response_schema is not None and ("response_format" in err_msg or "response_schema" in err_msg or "schema" in err_msg):
                        # Fallback to json_object response format
                        payload["response_format"] = {"type": "json_object"}
                        # Append instructions to output JSON to user prompt
                        if "json" not in payload["messages"][-1]["content"].lower():
                            payload["messages"][-1]["content"] += "\n\nRespond in JSON format."
                        continue
                raise exc

        if last_error:
            raise last_error
        raise RuntimeError("LLM provider failed without a captured exception")
