"""Benchmark metrics collection, storage, and trend analysis.

Provides:
- BenchmarkMetricsCollector: Collects per-benchmark metrics (accuracy, cost, duration, etc.)
- MetricsStore: Persists reports as JSON to reports/benchmarks/
- TrendAnalyzer: Compares runs, detects regressions
- BenchmarkReport: Full report dataclass with timestamp and commit hash
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class BenchmarkMetrics:
    """Metrics for a single benchmark run."""

    accuracy: float = 0.0
    success_rate: float = 0.0
    duration_ms: float = 0.0
    cost_usd: float = 0.0
    retries: int = 0
    errors: int = 0
    proxy_blocks: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class BenchmarkReport:
    """Full benchmark report with metadata."""

    timestamp: str
    commit_hash: str
    benchmark_name: str
    metrics: BenchmarkMetrics
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "commit_hash": self.commit_hash,
            "benchmark_name": self.benchmark_name,
            "metrics": self.metrics.to_dict(),
            "metadata": self.metadata,
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, default=str)


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------


def _get_commit_hash() -> str:
    """Get current git commit hash, returning 'unknown' if git is unavailable."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        pass
    return "unknown"


# ---------------------------------------------------------------------------
# BenchmarkMetricsCollector
# ---------------------------------------------------------------------------


class BenchmarkMetricsCollector:
    """Collects per-benchmark metrics across multiple runs.

    Accumulates metrics for a named benchmark and produces a BenchmarkReport.

    Example:
        collector = BenchmarkMetricsCollector("crawl4ai_auto")
        collector.record(accuracy=0.92, success_rate=1.0, duration_ms=3500.0)
        collector.record(accuracy=0.85, success_rate=0.9, duration_ms=4200.0)
        report = collector.build_report()
    """

    def __init__(self, benchmark_name: str) -> None:
        self.benchmark_name = benchmark_name
        self._records: list[BenchmarkMetrics] = []
        self._metadata: dict[str, Any] = {}

    def record(
        self,
        accuracy: float = 0.0,
        success_rate: float = 0.0,
        duration_ms: float = 0.0,
        cost_usd: float = 0.0,
        retries: int = 0,
        errors: int = 0,
        proxy_blocks: int = 0,
    ) -> BenchmarkMetrics:
        """Record a single benchmark measurement."""
        metrics = BenchmarkMetrics(
            accuracy=accuracy,
            success_rate=success_rate,
            duration_ms=duration_ms,
            cost_usd=cost_usd,
            retries=retries,
            errors=errors,
            proxy_blocks=proxy_blocks,
        )
        self._records.append(metrics)
        return metrics

    def set_metadata(self, key: str, value: Any) -> None:
        """Attach arbitrary metadata to the report."""
        self._metadata[key] = value

    @property
    def record_count(self) -> int:
        return len(self._records)

    def aggregate(self) -> BenchmarkMetrics:
        """Aggregate all recorded metrics into a single summary.

        Numeric fields are averaged; count fields (retries, errors, proxy_blocks)
        are summed.
        """
        if not self._records:
            return BenchmarkMetrics()

        n = len(self._records)
        return BenchmarkMetrics(
            accuracy=sum(r.accuracy for r in self._records) / n,
            success_rate=sum(r.success_rate for r in self._records) / n,
            duration_ms=sum(r.duration_ms for r in self._records) / n,
            cost_usd=sum(r.cost_usd for r in self._records),
            retries=sum(r.retries for r in self._records),
            errors=sum(r.errors for r in self._records),
            proxy_blocks=sum(r.proxy_blocks for r in self._records),
        )

    def build_report(self) -> BenchmarkReport:
        """Build a BenchmarkReport from aggregated metrics."""
        return BenchmarkReport(
            timestamp=datetime.utcnow().isoformat(),
            commit_hash=_get_commit_hash(),
            benchmark_name=self.benchmark_name,
            metrics=self.aggregate(),
            metadata=dict(self._metadata),
        )

    def reset(self) -> None:
        """Clear all recorded metrics and metadata."""
        self._records.clear()
        self._metadata.clear()


# ---------------------------------------------------------------------------
# MetricsStore
# ---------------------------------------------------------------------------

# Default reports directory relative to the scraper project root
_DEFAULT_REPORTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "..",
    "reports",
    "benchmarks",
)


class MetricsStore:
    """Persists benchmark reports as JSON files.

    Reports are saved to ``reports/benchmarks/`` with filenames that include
    the timestamp and commit hash. A ``latest_summary.json`` symlink/pointer
    is also maintained.

    Example:
        store = MetricsStore()
        report = collector.build_report()
        path = store.save(report)
        print(f"Report saved to {path}")
    """

    def __init__(self, reports_dir: str | Path | None = None) -> None:
        if reports_dir is not None:
            self._reports_dir = Path(reports_dir)
        else:
            self._reports_dir = Path(_DEFAULT_REPORTS_DIR).resolve()
        self._reports_dir.mkdir(parents=True, exist_ok=True)

    @property
    def reports_dir(self) -> Path:
        return self._reports_dir

    def _report_filename(self, report: BenchmarkReport) -> str:
        """Generate filename: benchmark_{timestamp}_{commit_hash}.json"""
        # Sanitize timestamp for filesystem safety
        safe_ts = report.timestamp.replace(":", "-").replace(".", "_")
        return f"benchmark_{safe_ts}_{report.commit_hash}.json"

    def save(self, report: BenchmarkReport) -> Path:
        """Save a benchmark report to disk and update latest summary.

        Returns:
            Path to the saved report file.
        """
        filename = self._report_filename(report)
        filepath = self._reports_dir / filename

        with open(filepath, "w") as f:
            f.write(report.to_json())

        self._write_latest_summary(report)

        return filepath

    def _write_latest_summary(self, report: BenchmarkReport) -> None:
        """Write latest_summary.json with the most recent report data."""
        summary_path = self._reports_dir / "latest_summary.json"
        summary = {
            "latest_report": report.to_dict(),
            "reports_dir": str(self._reports_dir),
        }
        with open(summary_path, "w") as f:
            json.dump(summary, f, indent=2, default=str)

    def load(self, filename: str) -> BenchmarkReport:
        """Load a benchmark report from disk by filename.

        Args:
            filename: The report filename (e.g. ``benchmark_2026-04-23T12-00-00_abc1234.json``)

        Returns:
            The deserialized BenchmarkReport.
        """
        filepath = self._reports_dir / filename
        with open(filepath) as f:
            data = json.load(f)

        metrics_data = data["metrics"]
        return BenchmarkReport(
            timestamp=data["timestamp"],
            commit_hash=data["commit_hash"],
            benchmark_name=data["benchmark_name"],
            metrics=BenchmarkMetrics(**metrics_data),
            metadata=data.get("metadata", {}),
        )

    def list_reports(self) -> list[str]:
        """List all benchmark report filenames, sorted newest first."""
        reports = sorted(
            (p.name for p in self._reports_dir.glob("benchmark_*.json")),
            reverse=True,
        )
        return reports

    def load_latest(self) -> BenchmarkReport | None:
        """Load the most recent benchmark report.

        Returns:
            The latest BenchmarkReport, or None if no reports exist.
        """
        reports = self.list_reports()
        if not reports:
            return None
        return self.load(reports[0])


# ---------------------------------------------------------------------------
# TrendAnalyzer
# ---------------------------------------------------------------------------


@dataclass
class RegressionResult:
    """Result of comparing two benchmark reports for regression."""

    metric_name: str
    previous_value: float
    current_value: float
    change: float
    change_pct: float
    is_regression: bool


@dataclass
class TrendComparison:
    """Full comparison between two benchmark runs."""

    previous_report: BenchmarkReport
    current_report: BenchmarkReport
    regressions: list[RegressionResult] = field(default_factory=list)
    improvements: list[RegressionResult] = field(default_factory=list)
    stable: list[RegressionResult] = field(default_factory=list)

    @property
    def has_regressions(self) -> bool:
        return len(self.regressions) > 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "previous": self.previous_report.to_dict(),
            "current": self.current_report.to_dict(),
            "regressions": [asdict(r) for r in self.regressions],
            "improvements": [asdict(r) for r in self.improvements],
            "stable": [asdict(r) for r in self.stable],
            "has_regressions": self.has_regressions,
        }


# Metrics where an increase is a regression (higher = worse)
_REGRESSION_ON_INCREASE = {"duration_ms", "cost_usd", "retries", "errors", "proxy_blocks"}
# Metrics where a decrease is a regression (lower = worse)
_REGRESSION_ON_DECREASE = {"accuracy", "success_rate"}

# Default thresholds: percentage change that qualifies as a regression
DEFAULT_REGRESSION_THRESHOLD_PCT = 10.0


class TrendAnalyzer:
    """Compares benchmark runs and detects regressions.

    A regression is detected when a metric changes by more than the configured
    threshold percentage in the "wrong" direction:
    - Increase in duration_ms, cost_usd, retries, errors, proxy_blocks
    - Decrease in accuracy, success_rate

    Example:
        analyzer = TrendAnalyzer(regression_threshold_pct=15.0)
        comparison = analyzer.compare(previous_report, current_report)
        if comparison.has_regressions:
            for r in comparison.regressions:
                print(f"REGRESSION: {r.metric_name} changed by {r.change_pct:.1f}%")
    """

    def __init__(self, regression_threshold_pct: float = DEFAULT_REGRESSION_THRESHOLD_PCT) -> None:
        self.regression_threshold_pct = regression_threshold_pct

    def _classify_change(
        self,
        metric_name: str,
        previous: float,
        current: float,
    ) -> RegressionResult:
        """Classify a metric change as regression, improvement, or stable."""
        if previous == 0:
            change = current
            change_pct = float("inf") if current != 0 else 0.0
        else:
            change = current - previous
            change_pct = (change / abs(previous)) * 100.0

        is_regression = False
        abs_pct = abs(change_pct) if change_pct != float("inf") else float("inf")

        if metric_name in _REGRESSION_ON_INCREASE:
            # Higher is worse — increase is regression
            is_regression = change > 0 and abs_pct >= self.regression_threshold_pct
        elif metric_name in _REGRESSION_ON_DECREASE:
            # Lower is worse — decrease is regression
            is_regression = change < 0 and abs_pct >= self.regression_threshold_pct

        return RegressionResult(
            metric_name=metric_name,
            previous_value=previous,
            current_value=current,
            change=change,
            change_pct=change_pct,
            is_regression=is_regression,
        )

    def compare(
        self,
        previous: BenchmarkReport,
        current: BenchmarkReport,
    ) -> TrendComparison:
        """Compare two benchmark reports and detect regressions.

        Args:
            previous: The baseline/previous report.
            current: The new/current report.

        Returns:
            TrendComparison with regressions, improvements, and stable metrics.
        """
        comparison = TrendComparison(
            previous_report=previous,
            current_report=current,
        )

        prev_metrics = previous.metrics
        curr_metrics = current.metrics

        fields = [
            ("accuracy", prev_metrics.accuracy, curr_metrics.accuracy),
            ("success_rate", prev_metrics.success_rate, curr_metrics.success_rate),
            ("duration_ms", prev_metrics.duration_ms, curr_metrics.duration_ms),
            ("cost_usd", prev_metrics.cost_usd, curr_metrics.cost_usd),
            ("retries", prev_metrics.retries, curr_metrics.retries),
            ("errors", prev_metrics.errors, curr_metrics.errors),
            ("proxy_blocks", prev_metrics.proxy_blocks, curr_metrics.proxy_blocks),
        ]

        for metric_name, prev_val, curr_val in fields:
            result = self._classify_change(metric_name, prev_val, curr_val)

            if result.is_regression:
                comparison.regressions.append(result)
            elif abs(result.change_pct) < self.regression_threshold_pct or result.change_pct == 0.0:
                comparison.stable.append(result)
            else:
                comparison.improvements.append(result)

        return comparison

    def compare_from_store(
        self,
        store: MetricsStore,
        current: BenchmarkReport,
    ) -> TrendComparison | None:
        """Compare current report against the latest stored report.

        Returns:
            TrendComparison if a previous report exists, None otherwise.
        """
        previous = store.load_latest()
        if previous is None:
            return None
        return self.compare(previous, current)
