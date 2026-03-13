"""
Selector Health Monitoring Framework

Tracks selector success/failure rates per site and provides health insights
for optimizing scraper reliability. Integrates with SelectorResolver for
automatic tracking of selector performance.

Features:
- Per-selector success rate tracking
- Per-site aggregation and analysis
- JSON persistence with 30-day rotation
- Alert mechanism for degraded selectors
- Alternative selector recommendations
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Constants
DEFAULT_RETENTION_DAYS = 30
DEFAULT_ALERT_THRESHOLD = 0.7  # 70% success rate
DEFAULT_MIN_ATTEMPTS_FOR_ALERT = 10  # Minimum attempts before alerting
DATA_DIR = Path(__file__).parent.parent / ".data"


@dataclass
class SelectorHealthRecord:
    """Individual selector health record."""

    selector: str
    site: str
    timestamp: float
    success: bool
    duration_ms: float
    error_type: str | None = None  # Type of error if failed

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SelectorHealthRecord:
        """Create from dictionary."""
        return cls(**data)


@dataclass
class SelectorHealthSummary:
    """Aggregated health metrics for a selector on a specific site."""

    selector: str
    site: str
    total_attempts: int = 0
    success_count: int = 0
    failure_count: int = 0
    success_rate: float = 1.0
    last_attempt: float | None = None
    last_success: float | None = None
    last_failure: float | None = None
    average_duration_ms: float = 0.0
    min_duration_ms: float = 0.0
    max_duration_ms: float = 0.0
    # Trend over last 7 days
    recent_success_rate: float = 1.0
    recent_attempts: int = 0
    # Recommendations
    alternative_selectors: list[str] = field(default_factory=list)
    recommendation: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return asdict(self)


@dataclass
class SiteSelectorHealth:
    """Health summary for all selectors on a site."""

    site: str
    overall_success_rate: float = 1.0
    total_selectors: int = 0
    healthy_selectors: int = 0
    degraded_selectors: int = 0
    failing_selectors: int = 0
    selector_summaries: list[SelectorHealthSummary] = field(default_factory=list)


class SelectorHealthTracker:
    """
    Track selector health and success rates across all sites.

    This class provides comprehensive monitoring of selector performance,
    alerting when success rates drop below thresholds, and recommending
    alternative selectors based on historical data.

    Usage:
        tracker = SelectorHealthTracker()
        tracker.track_selector_result(".price", "amazon", success=True, duration_ms=150)

        # Get health summary
        summary = tracker.get_selector_summary(".price", "amazon")
        if summary.success_rate < 0.7:
            print(f"Selector {summary.selector} is unhealthy!")
    """

    def __init__(
        self,
        history_file: str | Path | None = None,
        retention_days: int = DEFAULT_RETENTION_DAYS,
        alert_threshold: float = DEFAULT_ALERT_THRESHOLD,
        min_attempts_for_alert: int = DEFAULT_MIN_ATTEMPTS_FOR_ALERT,
    ):
        """
        Initialize the selector health tracker.

        Args:
            history_file: Path to JSON file for persistence (default: .data/selector_health.json)
            retention_days: Number of days to retain history records
            alert_threshold: Success rate threshold below which to alert (0.0-1.0)
            min_attempts_for_alert: Minimum attempts before triggering alerts
        """
        self.retention_days = retention_days
        self.alert_threshold = alert_threshold
        self.min_attempts_for_alert = min_attempts_for_alert

        # Set up data file
        if history_file:
            self.history_file = Path(history_file)
        else:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            self.history_file = DATA_DIR / "selector_health.json"

        self.history_file.parent.mkdir(parents=True, exist_ok=True)

        # Thread-safe data structures
        self._lock = threading.RLock()
        self._records: list[SelectorHealthRecord] = []
        self._summaries: dict[str, SelectorHealthSummary] = {}  # key: "site:selector"
        self._alternative_selectors: dict[str, list[str]] = {}  # key: "site:selector"

        # Load existing data
        self._load_history()

        # Start background cleanup thread
        self._cleanup_thread = threading.Thread(target=self._background_cleanup, daemon=True)
        self._cleanup_thread.start()

        logger.info(f"SelectorHealthTracker initialized: file={self.history_file}, retention={retention_days}d, threshold={alert_threshold:.0%}")

    def track_selector_result(
        self,
        selector: str,
        site: str,
        success: bool,
        duration_ms: float,
        error_type: str | None = None,
    ) -> SelectorHealthSummary | None:
        """
        Record a selector result and return updated health summary.

        This method records the result of a selector attempt, updates the
        health summary, triggers alerts if needed, and persists the data.

        Args:
            selector: The CSS/XPath selector that was used
            site: The site name where the selector was used
            success: Whether the selector resolved successfully
            duration_ms: Time taken to resolve the selector in milliseconds
            error_type: Type of error if the selector failed (optional)

        Returns:
            Updated SelectorHealthSummary for this selector/site combination
        """
        # Create and store record
        record = SelectorHealthRecord(
            selector=selector,
            site=site,
            timestamp=time.time(),
            success=success,
            duration_ms=duration_ms,
            error_type=error_type,
        )

        with self._lock:
            self._records.append(record)
            self._update_summary(record)
            summary = self._summaries.get(self._make_key(selector, site))

        # Check if we should alert (outside lock for performance)
        if summary and summary.total_attempts >= self.min_attempts_for_alert:
            if summary.success_rate < self.alert_threshold:
                self._trigger_alert(summary)

        # Save asynchronously to avoid blocking (lightweight fire-and-forget)
        threading.Thread(target=self._save_history, daemon=True).start()

        return summary

    def get_selector_summary(self, selector: str, site: str) -> SelectorHealthSummary | None:
        """
        Get health summary for a specific selector on a site.

        Args:
            selector: The selector string
            site: The site name

        Returns:
            SelectorHealthSummary or None if no data exists
        """
        key = self._make_key(selector, site)
        with self._lock:
            return self._summaries.get(key)

    def get_site_health(self, site: str) -> SiteSelectorHealth:
        """
        Get health summary for all selectors on a site.

        Args:
            site: The site name

        Returns:
            SiteSelectorHealth with aggregated metrics
        """
        with self._lock:
            site_summaries = [s for s in self._summaries.values() if s.site == site]

            if not site_summaries:
                return SiteSelectorHealth(site=site)

            total_attempts = sum(s.total_attempts for s in site_summaries)
            total_successes = sum(s.success_count for s in site_summaries)

            healthy = sum(1 for s in site_summaries if s.success_rate >= 0.9)
            degraded = sum(1 for s in site_summaries if 0.7 <= s.success_rate < 0.9)
            failing = sum(1 for s in site_summaries if s.success_rate < 0.7)

            overall_rate = total_successes / total_attempts if total_attempts > 0 else 1.0

            return SiteSelectorHealth(
                site=site,
                overall_success_rate=overall_rate,
                total_selectors=len(site_summaries),
                healthy_selectors=healthy,
                degraded_selectors=degraded,
                failing_selectors=failing,
                selector_summaries=site_summaries,
            )

    def get_unhealthy_selectors(
        self,
        site: str | None = None,
        threshold: float | None = None,
        min_attempts: int | None = None,
    ) -> list[SelectorHealthSummary]:
        """
        Get selectors with success rate below threshold.

        Args:
            site: Filter by specific site (None for all sites)
            threshold: Success rate threshold (default: alert_threshold)
            min_attempts: Minimum attempts required (default: min_attempts_for_alert)

        Returns:
            List of unhealthy selector summaries, sorted by success rate (ascending)
        """
        threshold = threshold or self.alert_threshold
        min_attempts = min_attempts or self.min_attempts_for_alert

        with self._lock:
            candidates = [
                s for s in self._summaries.values() if (site is None or s.site == site) and s.total_attempts >= min_attempts and s.success_rate < threshold
            ]

            return sorted(candidates, key=lambda x: x.success_rate)

    def get_all_sites(self) -> list[str]:
        """Get list of all tracked sites."""
        with self._lock:
            return list({s.site for s in self._summaries.values()})

    def register_alternative_selector(
        self,
        selector: str,
        site: str,
        alternative: str,
    ) -> None:
        """
        Register an alternative selector for a given selector/site.

        Alternative selectors are suggested when the primary selector
        becomes unhealthy.

        Args:
            selector: The primary selector
            site: The site name
            alternative: The alternative selector to suggest
        """
        key = self._make_key(selector, site)
        with self._lock:
            if key not in self._alternative_selectors:
                self._alternative_selectors[key] = []
            if alternative not in self._alternative_selectors[key]:
                self._alternative_selectors[key].append(alternative)

    def get_alternative_selectors(
        self,
        selector: str,
        site: str,
    ) -> list[str]:
        """
        Get registered alternative selectors for a selector/site.

        Args:
            selector: The primary selector
            site: The site name

        Returns:
            List of alternative selectors
        """
        key = self._make_key(selector, site)
        with self._lock:
            return list(self._alternative_selectors.get(key, []))

    def get_recommendations(
        self,
        site: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Get actionable recommendations for unhealthy selectors.

        Args:
            site: Filter by site (None for all sites)

        Returns:
            List of recommendation dictionaries with selector, site, issue, and suggestions
        """
        unhealthy = self.get_unhealthy_selectors(site)
        recommendations = []

        for summary in unhealthy:
            rec = {
                "selector": summary.selector,
                "site": summary.site,
                "success_rate": summary.success_rate,
                "total_attempts": summary.total_attempts,
                "issue": self._classify_issue(summary),
                "suggestions": [],
            }

            # Add alternative selectors if available
            alternatives = self.get_alternative_selectors(summary.selector, summary.site)
            if alternatives:
                rec["suggestions"].append(f"Try alternative selectors: {', '.join(alternatives)}")

            # Add generic suggestions based on failure pattern
            if summary.success_rate == 0.0:
                rec["suggestions"].append("Selector is completely failing - check if site structure has changed")
            elif summary.success_rate < 0.5:
                rec["suggestions"].append("High failure rate - consider adding fallback selectors")
            else:
                rec["suggestions"].append("Moderate failure rate - monitor for intermittent issues")

            # Suggest timeout increase if duration is high
            if summary.average_duration_ms > 5000:
                rec["suggestions"].append(
                    f"Slow selector (avg {summary.average_duration_ms:.0f}ms) - consider increasing timeout or using more specific selector"
                )

            recommendations.append(rec)

        return recommendations

    def _make_key(self, selector: str, site: str) -> str:
        """Create a unique key for a selector/site combination."""
        return f"{site}:{selector}"

    def _update_summary(self, record: SelectorHealthRecord) -> None:
        """Update health summary with a new record."""
        key = self._make_key(record.selector, record.site)

        if key not in self._summaries:
            self._summaries[key] = SelectorHealthSummary(
                selector=record.selector,
                site=record.site,
            )

        summary = self._summaries[key]

        # Update counts
        summary.total_attempts += 1
        if record.success:
            summary.success_count += 1
            summary.last_success = record.timestamp
        else:
            summary.failure_count += 1
            summary.last_failure = record.timestamp

        summary.last_attempt = record.timestamp

        # Recalculate success rate
        summary.success_rate = summary.success_count / summary.total_attempts

        # Update duration statistics
        if summary.total_attempts == 1:
            summary.average_duration_ms = record.duration_ms
            summary.min_duration_ms = record.duration_ms
            summary.max_duration_ms = record.duration_ms
        else:
            # Rolling average
            summary.average_duration_ms = ((summary.average_duration_ms * (summary.total_attempts - 1)) + record.duration_ms) / summary.total_attempts
            summary.min_duration_ms = min(summary.min_duration_ms, record.duration_ms)
            summary.max_duration_ms = max(summary.max_duration_ms, record.duration_ms)

        # Calculate recent success rate (last 7 days)
        cutoff = time.time() - (7 * 24 * 60 * 60)
        recent_records = [r for r in self._records if r.selector == record.selector and r.site == record.site and r.timestamp >= cutoff]
        if recent_records:
            recent_successes = sum(1 for r in recent_records if r.success)
            summary.recent_attempts = len(recent_records)
            summary.recent_success_rate = recent_successes / len(recent_records)

        # Update alternative selectors if available
        summary.alternative_selectors = self._alternative_selectors.get(key, [])

        # Generate recommendation
        summary.recommendation = self._generate_recommendation(summary)

    def _classify_issue(self, summary: SelectorHealthSummary) -> str:
        """Classify the type of issue affecting a selector."""
        if summary.success_rate == 0.0:
            return "complete_failure"
        elif summary.success_rate < 0.5:
            return "high_failure_rate"
        elif summary.average_duration_ms > 5000:
            return "slow_performance"
        else:
            return "degraded_performance"

    def _generate_recommendation(self, summary: SelectorHealthSummary) -> str:
        """Generate a recommendation string for a selector."""
        if summary.success_rate >= 0.9:
            return "Selector is healthy"
        elif summary.success_rate >= 0.7:
            return "Selector is degraded - monitor closely"
        elif summary.alternative_selectors:
            return f"Consider using alternative: {summary.alternative_selectors[0]}"
        else:
            return "Selector needs attention - add fallback selectors"

    def _trigger_alert(self, summary: SelectorHealthSummary) -> None:
        """Trigger an alert for an unhealthy selector."""
        logger.warning(
            f"[SELECTOR_HEALTH] Low success rate ({summary.success_rate:.1%}) "
            f"for selector '{summary.selector}' on {summary.site} "
            f"({summary.success_count}/{summary.total_attempts} succeeded). "
            f"Recommendation: {summary.recommendation}"
        )

    def _cleanup_old_records(self) -> None:
        """Remove records older than retention period."""
        cutoff = time.time() - (self.retention_days * 24 * 60 * 60)

        with self._lock:
            old_count = len(self._records)
            self._records = [r for r in self._records if r.timestamp > cutoff]
            removed = old_count - len(self._records)

            if removed > 0:
                logger.debug(f"Cleaned up {removed} old selector health records")

    def _background_cleanup(self) -> None:
        """Background thread for periodic cleanup."""
        while True:
            try:
                time.sleep(3600)  # Run cleanup every hour
                self._cleanup_old_records()
                self._save_history()
            except Exception as e:
                logger.error(f"Background cleanup failed: {e}")

    def _load_history(self) -> None:
        """Load history from JSON file."""
        try:
            if self.history_file.exists():
                with open(self.history_file) as f:
                    data = json.load(f)

                    # Load records
                    for record_data in data.get("records", []):
                        record = SelectorHealthRecord.from_dict(record_data)
                        self._records.append(record)
                        self._update_summary(record)

                    # Load alternative selectors
                    self._alternative_selectors = data.get("alternatives", {})

                logger.info(f"Loaded {len(self._records)} selector health records for {len(self._summaries)} selector/site combinations")

        except Exception as e:
            logger.warning(f"Failed to load selector health history: {e}")
            # Start fresh if loading fails
            self._records = []
            self._summaries = {}

    def _save_history(self) -> None:
        """Save history to JSON file."""
        try:
            with self._lock:
                data = {
                    "records": [r.to_dict() for r in self._records],
                    "summaries": {k: v.to_dict() for k, v in self._summaries.items()},
                    "alternatives": self._alternative_selectors,
                    "last_updated": time.time(),
                    "metadata": {
                        "retention_days": self.retention_days,
                        "alert_threshold": self.alert_threshold,
                        "version": "1.0.0",
                    },
                }

            with open(self.history_file, "w") as f:
                json.dump(data, f, indent=2)

        except Exception as e:
            logger.error(f"Failed to save selector health history: {e}")

    def shutdown(self) -> None:
        """Shutdown the tracker and save final data."""
        logger.info("Shutting down SelectorHealthTracker")
        self._save_history()

    def export_report(self, site: str | None = None) -> dict[str, Any]:
        """
        Export a comprehensive health report.

        Args:
            site: Filter by site (None for all sites)

        Returns:
            Dictionary with health report data
        """
        with self._lock:
            if site:
                summaries = [s for s in self._summaries.values() if s.site == site]
            else:
                summaries = list(self._summaries.values())

            total_attempts = sum(s.total_attempts for s in summaries)
            total_successes = sum(s.success_count for s in summaries)

            return {
                "generated_at": datetime.now().isoformat(),
                "site": site or "all",
                "total_selectors": len(summaries),
                "total_attempts": total_attempts,
                "overall_success_rate": (total_successes / total_attempts if total_attempts > 0 else 1.0),
                "selectors_by_health": {
                    "healthy": sum(1 for s in summaries if s.success_rate >= 0.9),
                    "degraded": sum(1 for s in summaries if 0.7 <= s.success_rate < 0.9),
                    "failing": sum(1 for s in summaries if s.success_rate < 0.7),
                },
                "unhealthy_selectors": [s.to_dict() for s in self.get_unhealthy_selectors(site)],
                "recommendations": self.get_recommendations(site),
            }


# Global instance for singleton pattern
_health_tracker_instance: SelectorHealthTracker | None = None
_health_tracker_lock = threading.Lock()


def get_selector_health_tracker(
    history_file: str | Path | None = None,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    alert_threshold: float = DEFAULT_ALERT_THRESHOLD,
) -> SelectorHealthTracker:
    """
    Get or create the global SelectorHealthTracker instance.

    This function provides a singleton pattern for easy access to the
    health tracker throughout the application.

    Args:
        history_file: Path to JSON file for persistence
        retention_days: Number of days to retain history
        alert_threshold: Success rate threshold for alerts

    Returns:
        SelectorHealthTracker instance
    """
    global _health_tracker_instance

    with _health_tracker_lock:
        if _health_tracker_instance is None:
            _health_tracker_instance = SelectorHealthTracker(
                history_file=history_file,
                retention_days=retention_days,
                alert_threshold=alert_threshold,
            )
        return _health_tracker_instance


def reset_health_tracker() -> None:
    """Reset the global health tracker instance (mainly for testing)."""
    global _health_tracker_instance
    with _health_tracker_lock:
        if _health_tracker_instance:
            _health_tracker_instance.shutdown()
        _health_tracker_instance = None
