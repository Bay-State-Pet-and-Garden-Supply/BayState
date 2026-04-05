from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Mapping


def _coerce_bool(raw_value: Any, default: bool = False) -> bool:
    if isinstance(raw_value, bool):
        return raw_value
    if isinstance(raw_value, str):
        return raw_value.strip().lower() in {"1", "true", "yes", "on"}
    if raw_value is None:
        return default
    return bool(raw_value)


def _coerce_int(raw_value: Any, default: int = 0) -> int:
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return default

    return max(0, min(100, value))


@dataclass(frozen=True)
class GeminiFeatureFlags:
    gemini_ai_search_enabled: bool = False
    gemini_crawl4ai_enabled: bool = False
    gemini_batch_enabled: bool = False
    gemini_parallel_run_enabled: bool = False
    gemini_traffic_percent: int = 0
    gemini_parallel_sample_percent: int = 10

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any] | None = None) -> "GeminiFeatureFlags":
        values = dict(payload or {})
        return cls(
            gemini_ai_search_enabled=_coerce_bool(
                values.get("GEMINI_AI_SEARCH_ENABLED"),
                _coerce_bool(os.getenv("GEMINI_AI_SEARCH_ENABLED")),
            ),
            gemini_crawl4ai_enabled=_coerce_bool(
                values.get("GEMINI_CRAWL4AI_ENABLED"),
                _coerce_bool(os.getenv("GEMINI_CRAWL4AI_ENABLED")),
            ),
            gemini_batch_enabled=_coerce_bool(
                values.get("GEMINI_BATCH_ENABLED"),
                _coerce_bool(os.getenv("GEMINI_BATCH_ENABLED")),
            ),
            gemini_parallel_run_enabled=_coerce_bool(
                values.get("GEMINI_PARALLEL_RUN_ENABLED"),
                _coerce_bool(os.getenv("GEMINI_PARALLEL_RUN_ENABLED")),
            ),
            gemini_traffic_percent=_coerce_int(
                values.get("GEMINI_TRAFFIC_PERCENT"),
                _coerce_int(os.getenv("GEMINI_TRAFFIC_PERCENT"), 0),
            ),
            gemini_parallel_sample_percent=_coerce_int(
                values.get("GEMINI_PARALLEL_SAMPLE_PERCENT"),
                _coerce_int(os.getenv("GEMINI_PARALLEL_SAMPLE_PERCENT"), 10),
            ),
        )
