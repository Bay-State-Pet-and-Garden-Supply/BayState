from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ProviderUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    grounding_queries: int = 0


@dataclass(frozen=True)
class ProviderResponse:
    text: str
    usage: ProviderUsage = field(default_factory=ProviderUsage)
    citations: list[dict[str, str]] = field(default_factory=list)
    raw: Any = None
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseLLMProvider(ABC):
    provider_name: str
    model: str

    @abstractmethod
    async def generate_text(
        self,
        *,
        system_prompt: str | None,
        user_prompt: str,
        temperature: float = 0.0,
        max_output_tokens: int | None = None,
        response_schema: dict[str, Any] | None = None,
    ) -> ProviderResponse:
        raise NotImplementedError


class BaseSearchProvider(ABC):
    @abstractmethod
    async def search(self, query: str) -> tuple[list[dict[str, Any]], str | None]:
        raise NotImplementedError


class BaseBatchProvider(ABC):
    @abstractmethod
    async def submit_batch(self, requests: list[dict[str, Any]]) -> str:
        raise NotImplementedError

    @abstractmethod
    async def get_status(self, batch_id: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    async def retrieve_results(self, batch_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError
