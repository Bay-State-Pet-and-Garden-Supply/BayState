"""
Metrics collection and reporting for AI-powered scraper operations.

Tracks token usage, extraction success rates, and costs across different
models and providers.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class AIExtractionMetric:
    """Detailed metric for a single AI extraction event."""

    timestamp: str
    scraper_name: str
    success: bool
    duration_seconds: float
    cost_usd: float
    anti_bot_detected: bool = False
    details: dict[str, Any] = field(default_factory=dict)


class AIMetricsCollector:
    """
    Central collector for AI-related scraping metrics.

    Implements a thread-safe singleton pattern to ensure all AI operations
    report to the same registry for accurate job-wide reporting.
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._lock = threading.Lock()
        self._metrics: list[AIExtractionMetric] = []
        self._start_time = time.time()

        # Aggregate counters
        self._extraction_count = 0
        self._extraction_success_count = 0
        self._extraction_failure_count = 0
        self._fallback_count = 0
        self._total_cost_usd = 0.0
        self._anti_bot_count = 0

        # Performance tracking
        self._scraper_stats: dict[str, dict[str, Any]] = {}
        self._circuit_breakers: dict[str, bool] = {}

        self._initialized = True
        logger.info("AI Metrics Collector initialized")

    def record_extraction(
        self,
        scraper_name: str,
        success: bool,
        duration_seconds: float,
        cost_usd: float,
        anti_bot_detected: bool = False,
        details: dict[str, Any] | None = None,
    ) -> None:
        """Record an AI extraction event."""
        metric = AIExtractionMetric(
            timestamp=datetime.now().isoformat(),
            scraper_name=scraper_name,
            success=success,
            duration_seconds=duration_seconds,
            cost_usd=cost_usd,
            anti_bot_detected=anti_bot_detected,
            details=details or {},
        )

        with self._lock:
            self._metrics.append(metric)
            self._extraction_count += 1

            if success:
                self._extraction_success_count += 1
            else:
                self._extraction_failure_count += 1

            self._total_cost_usd += cost_usd

            if anti_bot_detected:
                self._anti_bot_count += 1

            # Update scraper-specific stats
            if scraper_name not in self._scraper_stats:
                self._scraper_stats[scraper_name] = {
                    "count": 0,
                    "success": 0,
                    "cost": 0.0,
                    "avg_duration": 0.0,
                    "fallbacks": 0,
                    "circuit_breaker_active": False,
                }

            stats = self._scraper_stats[scraper_name]
            stats["count"] += 1
            if success:
                stats["success"] += 1
            stats["cost"] += cost_usd

            # Running average for duration
            n = stats["count"]
            stats["avg_duration"] = ((stats["avg_duration"] * (n - 1)) + duration_seconds) / n

    def record_fallback(self, scraper_name: str, reason: str) -> None:
        """Record an AI to traditional fallback event."""
        with self._lock:
            self._fallback_count += 1
            if scraper_name in self._scraper_stats:
                self._scraper_stats[scraper_name]["fallbacks"] += 1
            else:
                self._scraper_stats[scraper_name] = {
                    "count": 0,
                    "success": 0,
                    "cost": 0.0,
                    "avg_duration": 0.0,
                    "fallbacks": 1,
                    "circuit_breaker_active": False,
                }
            logger.info(f"AI Fallback recorded for {scraper_name}: {reason}")

    def set_circuit_breaker(self, scraper_name: str, active: bool) -> None:
        """Set circuit breaker status for a scraper."""
        with self._lock:
            self._circuit_breakers[scraper_name] = active
            if scraper_name in self._scraper_stats:
                self._scraper_stats[scraper_name]["circuit_breaker_active"] = active
            logger.warning(f"AI Circuit Breaker for {scraper_name} set to {active}")

    def get_summary(self) -> dict[str, Any]:
        """Get a high-level summary of AI operations."""
        with self._lock:
            uptime = time.time() - self._start_time
            success_rate = (self._extraction_success_count / self._extraction_count * 100) if self._extraction_count > 0 else 0.0

            return {
                "uptime_seconds": round(uptime, 2),
                "total_extractions": self._extraction_count,
                "success_rate": round(success_rate, 2),
                "total_cost_usd": round(self._total_cost_usd, 4),
                "anti_bot_detections": self._anti_bot_count,
                "fallback_count": self._fallback_count,
                "scrapers": self._scraper_stats,
            }

    def get_prometheus_metrics(self) -> list[str]:
        """Export metrics in Prometheus-compatible string format."""
        with self._lock:
            lines = []

            # Extraction Count
            lines.append("# HELP ai_extraction_count Total number of AI extractions")
            lines.append("# TYPE ai_extraction_count counter")
            lines.append(f"ai_extraction_count {{}} {self._extraction_count}")

            # Success Count
            lines.append("# HELP ai_extraction_success Total number of successful AI extractions")
            lines.append("# TYPE ai_extraction_success counter")
            lines.append(f"ai_extraction_success {{}} {self._extraction_success_count}")

            # Failure Count
            lines.append("# HELP ai_extraction_failure Total number of failed AI extractions")
            lines.append("# TYPE ai_extraction_failure counter")
            lines.append(f"ai_extraction_failure {{}} {self._extraction_failure_count}")

            # Fallback Count
            lines.append("# HELP ai_fallback_count Total number of AI fallbacks to traditional extraction")
            lines.append("# TYPE ai_fallback_count counter")
            lines.append(f"ai_fallback_count {{}} {self._fallback_count}")

            # Cost
            lines.append("# HELP ai_cost_usd_total Total cost of AI operations in USD")
            lines.append("# TYPE ai_cost_usd_total counter")
            lines.append(f"ai_cost_usd_total {{}} {self._total_cost_usd}")

            # Anti-bot
            lines.append("# HELP ai_anti_bot_detected_total Count of anti-bot detections during AI calls")
            lines.append("# TYPE ai_anti_bot_detected_total counter")
            lines.append(f"ai_anti_bot_detected_total {{}} {self._anti_bot_count}")

            # Circuit Breakers
            for scraper_name, active in self._circuit_breakers.items():
                status = 1 if active else 0
                lines.append(f"ai_circuit_breaker_active{{scraper=\"{scraper_name}\"}} {status}")

            return lines

    def reset(self) -> None:
        """Reset all counters and metrics."""
        with self._lock:
            self._metrics = []
            self._extraction_count = 0
            self._extraction_success_count = 0
            self._extraction_failure_count = 0
            self._fallback_count = 0
            self._total_cost_usd = 0.0
            self._anti_bot_count = 0
            self._scraper_stats = {}
            self._circuit_breakers = {}
            self._start_time = time.time()


# Global helper functions for easy recording from anywhere in the scraper
_collector = AIMetricsCollector()


def record_ai_extraction(
    scraper_name: str,
    success: bool,
    cost_usd: float,
    duration_seconds: float = 0.0,
    anti_bot_detected: bool = False,
    **kwargs,
) -> None:
    """Global helper to record AI extraction events."""
    _collector.record_extraction(
        scraper_name=scraper_name,
        success=success,
        duration_seconds=duration_seconds,
        cost_usd=cost_usd,
        anti_bot_detected=anti_bot_detected,
        details=kwargs,
    )


def record_ai_fallback(scraper_name: str, reason: str) -> None:
    """Global helper to record AI fallback events."""
    _collector.record_fallback(scraper_name, reason)


def set_circuit_breaker(scraper_name: str, active: bool) -> None:
    """Global helper to set circuit breaker status."""
    _collector.set_circuit_breaker(scraper_name, active)


def get_ai_metrics_summary() -> dict[str, Any]:
    """Global helper to get current AI metrics summary."""
    return _collector.get_summary()
