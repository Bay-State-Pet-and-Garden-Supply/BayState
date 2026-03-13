from __future__ import annotations

import pytest

from core.timeout_config import (
    DEFAULT_CRITICAL_TIMEOUT_MS,
    DEFAULT_ESCALATION_MULTIPLIER,
    DEFAULT_FALLBACK_TIMEOUT_MS,
    DEFAULT_IMPORTANT_TIMEOUT_MS,
    DEFAULT_MAX_TIMEOUT_MS,
    DEFAULT_OPTIONAL_TIMEOUT_MS,
    TIER_CRITICAL,
    TIER_FALLBACK,
    TIER_IMPORTANT,
    TIER_OPTIONAL,
    TimeoutConfig,
)


def test_timeout_config_defaults() -> None:
    config = TimeoutConfig()

    assert config.critical_timeout_ms == DEFAULT_CRITICAL_TIMEOUT_MS
    assert config.important_timeout_ms == DEFAULT_IMPORTANT_TIMEOUT_MS
    assert config.optional_timeout_ms == DEFAULT_OPTIONAL_TIMEOUT_MS
    assert config.fallback_timeout_ms == DEFAULT_FALLBACK_TIMEOUT_MS
    assert config.escalation_multiplier == DEFAULT_ESCALATION_MULTIPLIER
    assert config.max_timeout_ms == DEFAULT_MAX_TIMEOUT_MS


@pytest.mark.parametrize(
    ("tier", "expected"),
    [
        (TIER_CRITICAL, DEFAULT_CRITICAL_TIMEOUT_MS),
        (TIER_IMPORTANT, DEFAULT_IMPORTANT_TIMEOUT_MS),
        (TIER_OPTIONAL, DEFAULT_OPTIONAL_TIMEOUT_MS),
        (TIER_FALLBACK, DEFAULT_FALLBACK_TIMEOUT_MS),
    ],
)
def test_get_timeout_returns_base_timeout_for_first_attempt(tier: str, expected: int) -> None:
    config = TimeoutConfig()

    assert config.get_timeout(tier, attempt=0) == expected


def test_get_timeout_escalates_progressively() -> None:
    config = TimeoutConfig()

    assert config.get_timeout(TIER_CRITICAL, attempt=1) == 45000


def test_get_timeout_respects_max_timeout_cap() -> None:
    config = TimeoutConfig()

    assert config.get_timeout(TIER_CRITICAL, attempt=5) == DEFAULT_MAX_TIMEOUT_MS


def test_get_timeout_uses_custom_multiplier_and_cap() -> None:
    config = TimeoutConfig(optional_timeout_ms=4000, escalation_multiplier=2.0, max_timeout_ms=9000)

    assert config.get_timeout(TIER_OPTIONAL, attempt=1) == 8000
    assert config.get_timeout(TIER_OPTIONAL, attempt=2) == 9000


def test_get_timeout_normalizes_tier_values() -> None:
    config = TimeoutConfig()

    assert config.get_timeout("  IMPORTANT  ", attempt=0) == DEFAULT_IMPORTANT_TIMEOUT_MS


def test_get_timeout_rejects_unknown_tier() -> None:
    config = TimeoutConfig()

    with pytest.raises(ValueError, match="Unsupported timeout tier"):
        _ = config.get_timeout("unknown", attempt=0)


@pytest.mark.parametrize("tier", ["", "   ", 123])
def test_get_timeout_requires_non_empty_string_tier(tier: object) -> None:
    config = TimeoutConfig()

    with pytest.raises(ValueError, match="tier must be a non-empty string"):
        _ = config.get_timeout(tier, attempt=0)


def test_get_timeout_requires_integer_attempt() -> None:
    config = TimeoutConfig()

    with pytest.raises(TypeError, match="attempt must be an integer"):
        _ = config.get_timeout(TIER_CRITICAL, attempt="1")


def test_get_timeout_rejects_negative_attempt() -> None:
    config = TimeoutConfig()

    with pytest.raises(ValueError, match="attempt must be greater than or equal to 0"):
        _ = config.get_timeout(TIER_CRITICAL, attempt=-1)


@pytest.mark.parametrize(
    ("field", "error_message"),
    [
        ("critical_timeout_ms", "critical_timeout_ms must be greater than 0"),
        ("important_timeout_ms", "important_timeout_ms must be greater than 0"),
        ("optional_timeout_ms", "optional_timeout_ms must be greater than 0"),
        ("fallback_timeout_ms", "fallback_timeout_ms must be greater than 0"),
        ("escalation_multiplier", "escalation_multiplier must be at least 1.0"),
        ("max_timeout_ms", "max_timeout_ms must be greater than 0"),
    ],
)
def test_validation_rejects_invalid_configuration(field: str, error_message: str) -> None:
    with pytest.raises(ValueError, match=error_message):
        if field == "critical_timeout_ms":
            _ = TimeoutConfig(critical_timeout_ms=0)
        elif field == "important_timeout_ms":
            _ = TimeoutConfig(important_timeout_ms=0)
        elif field == "optional_timeout_ms":
            _ = TimeoutConfig(optional_timeout_ms=0)
        elif field == "fallback_timeout_ms":
            _ = TimeoutConfig(fallback_timeout_ms=0)
        elif field == "escalation_multiplier":
            _ = TimeoutConfig(escalation_multiplier=0.9)
        else:
            _ = TimeoutConfig(max_timeout_ms=0)
