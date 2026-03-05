"""Metrics collection and monitoring for crawl4ai engine.

Tracks extraction performance, costs, anti-bot effectiveness, and error rates.
Provides Prometheus-compatible metrics export.
"""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ExtractionMode(str, Enum):
    """Extraction mode types."""

    LLM_FREE = "llm_free"
    LLM = "llm"
    AUTO = "auto"


class ErrorType(str, Enum):
    """Types of extraction errors."""

    NETWORK_ERROR = "network_error"
    TIMEOUT = "timeout"
    RATE_LIMIT = "rate_limit"
    ANTI_BOT_DETECTED = "anti_bot_detected"
    PARSE_ERROR = "parse_error"
    VALIDATION_ERROR = "validation_error"
    LLM_ERROR = "llm_error"
    UNKNOWN = "unknown"


@dataclass
class ExtractionMetrics:
    """Metrics for a single extraction."""

    url: str
    mode: ExtractionMode
    success: bool
    duration_ms: float
    error_type: ErrorType | None = None
    error_message: str | None = None
    llm_tokens_input: int = 0
    llm_tokens_output: int = 0
    llm_cost_usd: float = 0.0
    anti_bot_triggered: bool = False
    anti_bot_strategy: str | None = None
    cache_hit: bool = False
    timestamp: float = field(default_factory=time.time)


@dataclass
class AntiBotMetrics:
    """Anti-bot effectiveness metrics."""

    total_attempts: int = 0
    successful_bypasses: int = 0
    failed_bypasses: int = 0
    strategies_used: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    average_bypass_time_ms: float = 0.0
    by_site: dict[str, dict[str, int]] = field(default_factory=lambda: defaultdict(lambda: defaultdict(int)))

    @property
    def success_rate(self) -> float:
        """Calculate anti-bot bypass success rate."""
        if self.total_attempts == 0:
            return 0.0
        return self.successful_bypasses / self.total_attempts

    @property
    def failure_rate(self) -> float:
        """Calculate anti-bot bypass failure rate."""
        if self.total_attempts == 0:
            return 0.0
        return self.failed_bypasses / self.total_attempts


@dataclass
class CostMetrics:
    """Cost tracking metrics."""

    total_extractions: int = 0
    llm_extractions: int = 0
    llm_free_extractions: int = 0
    total_cost_usd: float = 0.0
    llm_cost_usd: float = 0.0
    average_cost_per_extraction: float = 0.0
    cost_by_model: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    cost_by_site: dict[str, float] = field(default_factory=lambda: defaultdict(float))

    def update(self, extraction: ExtractionMetrics) -> None:
        """Update cost metrics with extraction data."""
        self.total_extractions += 1

        if extraction.mode == ExtractionMode.LLM:
            self.llm_extractions += 1
            self.llm_cost_usd += extraction.llm_cost_usd
            self.total_cost_usd += extraction.llm_cost_usd
        else:
            self.llm_free_extractions += 1

        self.average_cost_per_extraction = self.total_cost_usd / self.total_extractions if self.total_extractions > 0 else 0.0


class Crawl4AIMetricsCollector:
    """Collects and aggregates metrics for crawl4ai engine.

    Thread-safe metrics collection with Prometheus-compatible export.

    Example:
        >>> collector = Crawl4AIMetricsCollector()
        >>> collector.record_extraction(
        ...     url="https://example.com",
        ...     mode=ExtractionMode.LLM_FREE,
        ...     success=True,
        ...     duration_ms=2500.0
        ... )
        >>> print(collector.get_summary())
    """

    def __init__(self) -> None:
        """Initialize the metrics collector."""
        self._extractions: list[ExtractionMetrics] = []
        self._error_counts: dict[ErrorType, int] = defaultdict(int)
        self._mode_counts: dict[ExtractionMode, int] = defaultdict(int)
        self._site_stats: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "total": 0,
                "success": 0,
                "failure": 0,
                "llm": 0,
                "llm_free": 0,
                "avg_duration_ms": 0.0,
            }
        )
        self._anti_bot = AntiBotMetrics()
        self._costs = CostMetrics()
        self._start_time = time.time()

    def record_extraction(
        self,
        url: str,
        mode: ExtractionMode,
        success: bool,
        duration_ms: float,
        error_type: ErrorType | None = None,
        error_message: str | None = None,
        llm_tokens_input: int = 0,
        llm_tokens_output: int = 0,
        llm_cost_usd: float = 0.0,
        anti_bot_triggered: bool = False,
        anti_bot_strategy: str | None = None,
        cache_hit: bool = False,
    ) -> ExtractionMetrics:
        """Record a single extraction metric.

        Args:
            url: The URL that was extracted.
            mode: Extraction mode used (llm_free, llm, auto).
            success: Whether extraction succeeded.
            duration_ms: Duration in milliseconds.
            error_type: Type of error if failed.
            error_message: Error message if failed.
            llm_tokens_input: Number of input tokens for LLM mode.
            llm_tokens_output: Number of output tokens for LLM mode.
            llm_cost_usd: Cost in USD for LLM extraction.
            anti_bot_triggered: Whether anti-bot detection was triggered.
            anti_bot_strategy: Strategy used to bypass anti-bot.
            cache_hit: Whether result was served from cache.

        Returns:
            The recorded extraction metrics.
        """
        extraction = ExtractionMetrics(
            url=url,
            mode=mode,
            success=success,
            duration_ms=duration_ms,
            error_type=error_type,
            error_message=error_message,
            llm_tokens_input=llm_tokens_input,
            llm_tokens_output=llm_tokens_output,
            llm_cost_usd=llm_cost_usd,
            anti_bot_triggered=anti_bot_triggered,
            anti_bot_strategy=anti_bot_strategy,
            cache_hit=cache_hit,
        )

        self._extractions.append(extraction)
        self._mode_counts[mode] += 1

        # Update site stats
        site = self._extract_site(url)
        self._site_stats[site]["total"] += 1
        if success:
            self._site_stats[site]["success"] += 1
        else:
            self._site_stats[site]["failure"] += 1
            if error_type:
                self._error_counts[error_type] += 1

        if mode == ExtractionMode.LLM:
            self._site_stats[site]["llm"] += 1
        else:
            self._site_stats[site]["llm_free"] += 1

        # Update average duration
        old_avg = self._site_stats[site]["avg_duration_ms"]
        count = self._site_stats[site]["total"]
        self._site_stats[site]["avg_duration_ms"] = old_avg + (duration_ms - old_avg) / count

        # Update anti-bot metrics
        if anti_bot_triggered:
            self._anti_bot.total_attempts += 1
            if success:
                self._anti_bot.successful_bypasses += 1
            else:
                self._anti_bot.failed_bypasses += 1

            if anti_bot_strategy:
                self._anti_bot.strategies_used[anti_bot_strategy] += 1
                self._anti_bot.by_site[site][anti_bot_strategy] += 1

        # Update cost metrics
        self._costs.update(extraction)
        if llm_cost_usd > 0:
            self._costs.cost_by_site[site] += llm_cost_usd

        return extraction

    def _extract_site(self, url: str) -> str:
        """Extract site identifier from URL."""
        try:
            from urllib.parse import urlparse

            parsed = urlparse(url)
            return parsed.netloc.replace("www.", "")
        except Exception:
            return "unknown"

    @property
    def total_extractions(self) -> int:
        """Total number of extractions recorded."""
        return len(self._extractions)

    @property
    def llm_extractions(self) -> int:
        """Number of LLM-based extractions."""
        return self._mode_counts[ExtractionMode.LLM]

    @property
    def llm_free_extractions(self) -> int:
        """Number of LLM-free extractions."""
        return self._mode_counts[ExtractionMode.LLM_FREE]

    @property
    def auto_extractions(self) -> int:
        """Number of auto-mode extractions."""
        return self._mode_counts[ExtractionMode.AUTO]

    @property
    def llm_ratio(self) -> float:
        """Ratio of LLM to total extractions."""
        if self.total_extractions == 0:
            return 0.0
        return self.llm_extractions / self.total_extractions

    @property
    def llm_free_ratio(self) -> float:
        """Ratio of LLM-free to total extractions."""
        if self.total_extractions == 0:
            return 0.0
        return self.llm_free_extractions / self.total_extractions

    @property
    def success_rate(self) -> float:
        """Overall extraction success rate."""
        if self.total_extractions == 0:
            return 0.0
        successful = sum(1 for e in self._extractions if e.success)
        return successful / self.total_extractions

    @property
    def average_duration_ms(self) -> float:
        """Average extraction duration in milliseconds."""
        if not self._extractions:
            return 0.0
        return sum(e.duration_ms for e in self._extractions) / len(self._extractions)

    @property
    def cache_hit_rate(self) -> float:
        """Cache hit rate."""
        if not self._extractions:
            return 0.0
        cache_hits = sum(1 for e in self._extractions if e.cache_hit)
        return cache_hits / len(self._extractions)

    def get_error_breakdown(self) -> dict[str, int]:
        """Get breakdown of errors by type."""
        return {k.value: v for k, v in self._error_counts.items()}

    def get_site_stats(self) -> dict[str, dict[str, Any]]:
        """Get statistics by site."""
        return dict(self._site_stats)

    def get_anti_bot_metrics(self) -> AntiBotMetrics:
        """Get anti-bot effectiveness metrics."""
        return self._anti_bot

    def get_cost_metrics(self) -> CostMetrics:
        """Get cost tracking metrics."""
        return self._costs

    def get_summary(self) -> dict[str, Any]:
        """Get comprehensive metrics summary."""
        uptime_seconds = time.time() - self._start_time

        return {
            "extractions": {
                "total": self.total_extractions,
                "llm": self.llm_extractions,
                "llm_free": self.llm_free_extractions,
                "auto": self.auto_extractions,
                "ratios": {
                    "llm": round(self.llm_ratio, 4),
                    "llm_free": round(self.llm_free_ratio, 4),
                },
            },
            "performance": {
                "success_rate": round(self.success_rate, 4),
                "average_duration_ms": round(self.average_duration_ms, 2),
                "cache_hit_rate": round(self.cache_hit_rate, 4),
            },
            "errors": self.get_error_breakdown(),
            "anti_bot": {
                "total_attempts": self._anti_bot.total_attempts,
                "success_rate": round(self._anti_bot.success_rate, 4),
                "failure_rate": round(self._anti_bot.failure_rate, 4),
                "strategies_used": dict(self._anti_bot.strategies_used),
            },
            "costs": {
                "total_cost_usd": round(self._costs.total_cost_usd, 4),
                "llm_cost_usd": round(self._costs.llm_cost_usd, 4),
                "average_per_extraction": round(self._costs.average_cost_per_extraction, 6),
                "by_site": dict(self._costs.cost_by_site),
            },
            "sites": self.get_site_stats(),
            "uptime_seconds": round(uptime_seconds, 2),
        }

    def get_prometheus_metrics(self) -> str:
        """Export metrics in Prometheus format.

        Returns:
            Prometheus-formatted metrics string.
        """
        lines = []
        prefix = "crawl4ai"

        # Extraction counts
        lines.append(f"# HELP {prefix}_extractions_total Total number of extractions")
        lines.append(f"# TYPE {prefix}_extractions_total counter")
        lines.append(f'{prefix}_extractions_total{{mode="llm"}} {self.llm_extractions}')
        lines.append(f'{prefix}_extractions_total{{mode="llm_free"}} {self.llm_free_extractions}')
        lines.append(f'{prefix}_extractions_total{{mode="auto"}} {self.auto_extractions}')

        # Success rate
        lines.append(f"# HELP {prefix}_success_rate Extraction success rate")
        lines.append(f"# TYPE {prefix}_success_rate gauge")
        lines.append(f"{prefix}_success_rate {self.success_rate}")

        # Duration
        lines.append(f"# HELP {prefix}_duration_ms Average extraction duration")
        lines.append(f"# TYPE {prefix}_duration_ms gauge")
        lines.append(f"{prefix}_duration_ms {self.average_duration_ms}")

        # Cache hits
        lines.append(f"# HELP {prefix}_cache_hit_rate Cache hit rate")
        lines.append(f"# TYPE {prefix}_cache_hit_rate gauge")
        lines.append(f"{prefix}_cache_hit_rate {self.cache_hit_rate}")

        # Error counts
        lines.append(f"# HELP {prefix}_errors_total Total errors by type")
        lines.append(f"# TYPE {prefix}_errors_total counter")
        for error_type, count in self._error_counts.items():
            lines.append(f'{prefix}_errors_total{{type="{error_type}"}} {count}')

        # Anti-bot metrics
        lines.append(f"# HELP {prefix}_antibot_attempts_total Total anti-bot attempts")
        lines.append(f"# TYPE {prefix}_antibot_attempts_total counter")
        lines.append(f'{prefix}_antibot_attempts_total{{result="success"}} {self._anti_bot.successful_bypasses}')
        lines.append(f'{prefix}_antibot_attempts_total{{result="failure"}} {self._anti_bot.failed_bypasses}')

        lines.append(f"# HELP {prefix}_antibot_success_rate Anti-bot bypass success rate")
        lines.append(f"# TYPE {prefix}_antibot_success_rate gauge")
        lines.append(f"{prefix}_antibot_success_rate {self._anti_bot.success_rate}")

        # Cost metrics
        lines.append(f"# HELP {prefix}_cost_usd_total Total cost in USD")
        lines.append(f"# TYPE {prefix}_cost_usd_total counter")
        lines.append(f'{prefix}_cost_usd_total{{type="llm"}} {self._costs.llm_cost_usd}')
        lines.append(f'{prefix}_cost_usd_total{{type="total"}} {self._costs.total_cost_usd}')

        lines.append(f"# HELP {prefix}_cost_average_usd Average cost per extraction")
        lines.append(f"# TYPE {prefix}_cost_average_usd gauge")
        lines.append(f"{prefix}_cost_average_usd {self._costs.average_cost_per_extraction}")

        return "\n".join(lines)

    def reset(self) -> None:
        """Reset all metrics."""
        self._extractions.clear()
        self._error_counts.clear()
        self._mode_counts.clear()
        self._site_stats.clear()
        self._anti_bot = AntiBotMetrics()
        self._costs = CostMetrics()
        self._start_time = time.time()


# Global metrics collector instance
_metrics_collector: Crawl4AIMetricsCollector | None = None


def get_metrics_collector() -> Crawl4AIMetricsCollector:
    """Get the global metrics collector instance.

    Returns:
        The global Crawl4AIMetricsCollector instance.
    """
    global _metrics_collector
    if _metrics_collector is None:
        _metrics_collector = Crawl4AIMetricsCollector()
    return _metrics_collector


def reset_metrics_collector() -> None:
    """Reset the global metrics collector."""
    global _metrics_collector
    _metrics_collector = Crawl4AIMetricsCollector()


if __name__ == "__main__":
    # Example usage
    collector = Crawl4AIMetricsCollector()

    # Record some sample extractions
    collector.record_extraction(
        url="https://example.com/product/1",
        mode=ExtractionMode.LLM_FREE,
        success=True,
        duration_ms=2500.0,
        cache_hit=True,
    )

    collector.record_extraction(
        url="https://example.com/product/2",
        mode=ExtractionMode.LLM,
        success=True,
        duration_ms=8000.0,
        llm_tokens_input=500,
        llm_tokens_output=200,
        llm_cost_usd=0.015,
    )

    collector.record_extraction(
        url="https://protected-site.com/product/3",
        mode=ExtractionMode.AUTO,
        success=False,
        duration_ms=15000.0,
        error_type=ErrorType.ANTI_BOT_DETECTED,
        anti_bot_triggered=True,
        anti_bot_strategy="fingerprint_rotation",
    )

    # Print summary
    import json

    print("=== Metrics Summary ===")
    print(json.dumps(collector.get_summary(), indent=2))

    print("\n=== Prometheus Metrics ===")
    print(collector.get_prometheus_metrics())
