"""Tiered timeout configuration for Playwright scraping operations."""

from __future__ import annotations

from dataclasses import dataclass

TIER_CRITICAL = "critical"
TIER_IMPORTANT = "important"
TIER_OPTIONAL = "optional"
TIER_FALLBACK = "fallback"

DEFAULT_CRITICAL_TIMEOUT_MS = 30000
DEFAULT_IMPORTANT_TIMEOUT_MS = 10000
DEFAULT_OPTIONAL_TIMEOUT_MS = 5000
DEFAULT_FALLBACK_TIMEOUT_MS = 2000

DEFAULT_ESCALATION_MULTIPLIER = 1.5
DEFAULT_MAX_TIMEOUT_MS = 60000


@dataclass
class TimeoutConfig:
    """Configures tiered base timeouts and retry-time escalation behavior."""

    critical_timeout_ms: int = DEFAULT_CRITICAL_TIMEOUT_MS
    important_timeout_ms: int = DEFAULT_IMPORTANT_TIMEOUT_MS
    optional_timeout_ms: int = DEFAULT_OPTIONAL_TIMEOUT_MS
    fallback_timeout_ms: int = DEFAULT_FALLBACK_TIMEOUT_MS
    escalation_multiplier: float = DEFAULT_ESCALATION_MULTIPLIER
    max_timeout_ms: int = DEFAULT_MAX_TIMEOUT_MS

    def __post_init__(self) -> None:
        """Validate timeout and escalation settings."""
        if self.critical_timeout_ms <= 0:
            raise ValueError("critical_timeout_ms must be greater than 0")
        if self.important_timeout_ms <= 0:
            raise ValueError("important_timeout_ms must be greater than 0")
        if self.optional_timeout_ms <= 0:
            raise ValueError("optional_timeout_ms must be greater than 0")
        if self.fallback_timeout_ms <= 0:
            raise ValueError("fallback_timeout_ms must be greater than 0")
        if self.escalation_multiplier < 1.0:
            raise ValueError("escalation_multiplier must be at least 1.0")
        if self.max_timeout_ms <= 0:
            raise ValueError("max_timeout_ms must be greater than 0")

    def get_timeout(self, tier: object, attempt: object = 0) -> int:
        """Return the capped timeout in milliseconds for a tier and retry attempt."""
        if not isinstance(attempt, int):
            raise TypeError("attempt must be an integer")
        if attempt < 0:
            raise ValueError("attempt must be greater than or equal to 0")

        if not isinstance(tier, str) or not tier.strip():
            raise ValueError("tier must be a non-empty string")

        normalized_tier = tier.strip().lower()
        tier_timeouts = {
            TIER_CRITICAL: self.critical_timeout_ms,
            TIER_IMPORTANT: self.important_timeout_ms,
            TIER_OPTIONAL: self.optional_timeout_ms,
            TIER_FALLBACK: self.fallback_timeout_ms,
        }

        if normalized_tier not in tier_timeouts:
            valid = ", ".join(sorted(tier_timeouts.keys()))
            raise ValueError(f"Unsupported timeout tier '{tier}'. Valid tiers: {valid}")

        base_timeout = tier_timeouts[normalized_tier]
        escalated_timeout = base_timeout * (self.escalation_multiplier**attempt)
        return min(int(escalated_timeout), self.max_timeout_ms)
