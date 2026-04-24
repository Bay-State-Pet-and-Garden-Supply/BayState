"""
Benchmark report generator for BayState scraper.

Produces structured JSON and human-readable HTML reports from benchmark
results, with color-coded trend indicators and per-mode comparison views.
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict
from pathlib import Path
from statistics import mean
from typing import Any

from tests.benchmarks.unified.base import BenchmarkResult, BenchmarkConfig


class ModeSummary:
    """Aggregated statistics for a single extraction mode."""

    def __init__(self, mode: str, results: list[BenchmarkResult]) -> None:
        self.mode = mode
        self.results = results

    @property
    def total_runs(self) -> int:
        return len(self.results)

    @property
    def success_rate(self) -> float:
        if not self.results:
            return 0.0
        successes = sum(1 for r in self.results if r.success_rate > 0)
        return round(successes / len(self.results), 4)

    @property
    def average_accuracy(self) -> float | None:
        accuracies = [r.accuracy for r in self.results if r.accuracy > 0]
        return round(mean(accuracies), 4) if accuracies else None

    @property
    def average_duration_ms(self) -> float:
        durations = [r.duration_ms for r in self.results]
        return round(mean(durations), 2) if durations else 0.0

    @property
    def p95_duration_ms(self) -> float:
        durations = sorted(r.duration_ms for r in self.results)
        if not durations:
            return 0.0
        idx = int((len(durations) - 1) * 0.95)
        return round(durations[idx], 2)

    @property
    def total_cost_usd(self) -> float:
        return round(sum(r.cost_usd for r in self.results), 6)

    @property
    def average_cost_usd(self) -> float:
        costs = [r.cost_usd for r in self.results]
        return round(mean(costs), 6) if costs else 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "runs": self.total_runs,
            "success_rate": self.success_rate,
            "average_duration_ms": self.average_duration_ms,
            "p95_duration_ms": self.p95_duration_ms,
            "total_cost_usd": self.total_cost_usd,
            "average_cost_usd": self.average_cost_usd,
            "average_accuracy": self.average_accuracy,
        }


class URLResult:
    """Per-URL benchmark result across modes."""

    def __init__(self, url: str, sku: str, results: dict[str, BenchmarkResult]) -> None:
        self.url = url
        self.sku = sku
        self.results = results

    def to_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "sku": self.sku,
            "results": {mode: asdict(r) for mode, r in self.results.items()},
        }


class TrendIndicator:
    """Compares current vs previous value and classifies the trend."""

    COLORS = {
        "improved": "#28a745",
        "regressed": "#dc3545",
        "warning": "#ffc107",
        "neutral": "#6c757d",
    }
    SYMBOLS = {
        "improved": "&#9650;",
        "regressed": "&#9660;",
        "warning": "&#9679;",
        "neutral": "&#9644;",
    }

    @classmethod
    def classify(
        cls,
        current: float,
        previous: float | None,
        lower_is_better: bool = True,
        threshold_pct: float = 5.0,
    ) -> str:
        if previous is None:
            return "neutral"
        if previous == 0:
            return "neutral"

        change_pct = ((current - previous) / previous) * 100.0
        abs_change = abs(change_pct)

        if abs_change < threshold_pct:
            return "neutral"

        if lower_is_better:
            return "improved" if change_pct < 0 else "regressed"
        else:
            return "improved" if change_pct > 0 else "regressed"

    @classmethod
    def to_color(cls, trend: str) -> str:
        return cls.COLORS.get(trend, "#6c757d")

    @classmethod
    def to_html_symbol(cls, trend: str) -> str:
        return cls.SYMBOLS.get(trend, "&#9644;")


class BenchmarkReporter:
    """
    Generates JSON and HTML benchmark reports.

    Usage::

        reporter = BenchmarkReporter(
            config=config,
            results=all_results,
            previous_results=prev_results,  # optional, for comparison
        )
        reporter.generate_json_report(output_dir / "report.json")
        reporter.generate_html_report(output_dir / "report.html")
    """

    def __init__(
        self,
        config: BenchmarkConfig,
        results: list[BenchmarkResult],
        previous_results: list[BenchmarkResult] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.config = config
        self.results = results
        self.previous_results = previous_results or []
        self.metadata = metadata or {}
        self._generated_at = time.time()

    def generate_json_report(self, output_path: Path | None = None) -> dict[str, Any]:
        """Generate a structured JSON report and optionally write to file.

        Returns the report dict regardless of whether output_path is set.
        """
        report = self._build_report_dict()

        if output_path is not None:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(
                json.dumps(report, indent=2, default=str),
                encoding="utf-8",
            )

        return report

    def generate_html_report(self, output_path: Path | None = None) -> str:
        """Generate a human-readable HTML report and optionally write to file.

        Returns the HTML string regardless of whether output_path is set.
        """
        report = self._build_report_dict()
        html = self._render_html(report)

        if output_path is not None:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(html, encoding="utf-8")

        return html

    def _build_report_dict(self) -> dict[str, Any]:
        """Build the full report data structure."""
        mode_summaries = self._summarize_by_mode()
        url_results = self._group_by_url()
        cost_breakdown = self._cost_breakdown()

        comparison = self._mode_comparison(mode_summaries)

        previous_summary = None
        if self.previous_results:
            previous_summary = self._summarize_by_mode(self.previous_results)

        return {
            "metadata": {
                "generated_at_epoch": round(self._generated_at, 3),
                "generated_at_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self._generated_at)),
                "modes": list(self.config.modes),
                "urls_count": len(self.config.urls),
                "iterations": len(self.results),
                **self.metadata,
            },
            "summary": {
                "total_runs": len(self.results),
                "modes_tested": len(mode_summaries),
                "mode_comparison": comparison,
            },
            "mode_summaries": {m: s.to_dict() for m, s in mode_summaries.items()},
            "url_results": [u.to_dict() for u in url_results],
            "cost_breakdown": cost_breakdown,
            "previous_comparison": (self._compare_with_previous(mode_summaries, previous_summary) if previous_summary else None),
        }

    def _summarize_by_mode(self, results: list[BenchmarkResult] | None = None) -> dict[str, ModeSummary]:
        """Group results by extraction mode and compute summaries."""
        source = results if results is not None else self.results
        grouped: dict[str, list[BenchmarkResult]] = {}
        for r in source:
            mode = r.metadata.get("mode", "unknown")
            grouped.setdefault(mode, []).append(r)
        return {mode: ModeSummary(mode, rs) for mode, rs in grouped.items()}

    def _group_by_url(self) -> list[URLResult]:
        """Group results by URL across modes."""
        url_map: dict[str, dict[str, BenchmarkResult]] = {}
        url_sku: dict[str, str] = {}
        for r in self.results:
            url = r.metadata.get("url", "unknown")
            mode = r.metadata.get("mode", "unknown")
            sku = r.metadata.get("sku", url)
            url_map.setdefault(url, {})[mode] = r
            url_sku[url] = sku
        return [URLResult(url=url, sku=url_sku[url], results=modes) for url, modes in url_map.items()]

    def _cost_breakdown(self) -> dict[str, Any]:
        """Compute cost breakdown by mode."""
        breakdown: dict[str, dict[str, float]] = {}
        for r in self.results:
            mode = r.metadata.get("mode", "unknown")
            entry = breakdown.setdefault(mode, {"total_cost": 0.0, "runs": 0.0})
            entry["total_cost"] += r.cost_usd
            entry["runs"] += 1

        result = {}
        for mode, entry in breakdown.items():
            result[mode] = {
                "total_cost_usd": round(entry["total_cost"], 6),
                "runs": int(entry["runs"]),
                "avg_cost_per_run_usd": round(entry["total_cost"] / entry["runs"], 6) if entry["runs"] else 0.0,
            }
        return result

    def _mode_comparison(self, summaries: dict[str, ModeSummary]) -> list[dict[str, Any]]:
        """Rank modes by accuracy (desc), then cost (asc), then duration (asc)."""
        items = list(summaries.values())
        items.sort(
            key=lambda s: (
                -(s.average_accuracy or 0.0),
                s.average_cost_usd,
                s.average_duration_ms,
            )
        )
        return [s.to_dict() for s in items]

    def _compare_with_previous(
        self,
        current: dict[str, ModeSummary],
        previous: dict[str, ModeSummary],
    ) -> dict[str, Any]:
        """Compare current results with a previous run."""
        comparisons: dict[str, dict[str, Any]] = {}

        for mode, curr_summary in current.items():
            prev_summary = previous.get(mode)
            if prev_summary is None:
                comparisons[mode] = {"status": "new_mode"}
                continue

            comparisons[mode] = {
                "success_rate": {
                    "current": curr_summary.success_rate,
                    "previous": prev_summary.success_rate,
                    "trend": TrendIndicator.classify(
                        curr_summary.success_rate,
                        prev_summary.success_rate,
                        lower_is_better=False,
                    ),
                },
                "average_duration_ms": {
                    "current": curr_summary.average_duration_ms,
                    "previous": prev_summary.average_duration_ms,
                    "trend": TrendIndicator.classify(
                        curr_summary.average_duration_ms,
                        prev_summary.average_duration_ms,
                        lower_is_better=True,
                    ),
                },
                "average_accuracy": {
                    "current": curr_summary.average_accuracy,
                    "previous": prev_summary.average_accuracy,
                    "trend": TrendIndicator.classify(
                        curr_summary.average_accuracy or 0.0,
                        prev_summary.average_accuracy or 0.0,
                        lower_is_better=False,
                    ),
                },
                "average_cost_usd": {
                    "current": curr_summary.average_cost_usd,
                    "previous": prev_summary.average_cost_usd,
                    "trend": TrendIndicator.classify(
                        curr_summary.average_cost_usd,
                        prev_summary.average_cost_usd,
                        lower_is_better=True,
                    ),
                },
            }

        return comparisons

    def _render_html(self, report: dict[str, Any]) -> str:
        """Render the full HTML report with inline CSS."""
        sections = [
            self._html_head(),
            self._html_header(report["metadata"]),
            self._html_summary(report["summary"]),
            self._html_mode_comparison(report["summary"]["mode_comparison"]),
            self._html_url_results(report["url_results"]),
            self._html_cost_breakdown(report["cost_breakdown"]),
        ]
        if report.get("previous_comparison"):
            sections.append(self._html_previous_comparison(report["previous_comparison"]))
        sections.append(self._html_footer())
        return "\n".join(sections)

    def _html_head(self) -> str:
        return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Benchmark Report — BayState Scraper</title>
<style>
  :root {
    --green: #28a745; --red: #dc3545; --yellow: #ffc107; --gray: #6c757d;
    --bg: #ffffff; --surface: #f8f9fa; --border: #dee2e6;
    --text: #212529; --text-muted: #6c757d;
    --primary: #008850; --secondary: #66161D; --accent: #FCD048;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         color: var(--text); background: var(--bg); line-height: 1.6; padding: 2rem; }
  h1 { color: var(--primary); margin-bottom: 0.5rem; font-size: 1.75rem; }
  h2 { color: var(--secondary); margin: 1.5rem 0 0.75rem; font-size: 1.35rem;
       border-bottom: 2px solid var(--accent); padding-bottom: 0.25rem; }
  h3 { color: var(--primary); margin: 1rem 0 0.5rem; font-size: 1.1rem; }
  .meta { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; margin: 0.75rem 0 1.5rem; font-size: 0.9rem; }
  th, td { padding: 0.6rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
  th { background: var(--surface); font-weight: 600; white-space: nowrap; }
  tr:hover { background: var(--surface); }
  .improved { color: var(--green); font-weight: 600; }
  .regressed { color: var(--red); font-weight: 600; }
  .warning   { color: var(--yellow); font-weight: 600; }
  .neutral   { color: var(--gray); }
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px;
           font-size: 0.8rem; font-weight: 600; color: #fff; }
  .badge-green  { background: var(--green); }
  .badge-red    { background: var(--red); }
  .badge-yellow { background: var(--yellow); color: #212529; }
  .badge-gray   { background: var(--gray); }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                  gap: 1rem; margin: 1rem 0; }
  .summary-card { background: var(--surface); border-radius: 8px; padding: 1rem;
                  border: 1px solid var(--border); }
  .summary-card .label { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; }
  .summary-card .value { font-size: 1.5rem; font-weight: 700; color: var(--primary); }
  footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border);
           color: var(--text-muted); font-size: 0.85rem; }
</style>
</head>
<body>"""

    def _html_header(self, metadata: dict[str, Any]) -> str:
        return f"""<h1>Benchmark Report</h1>
<p class="meta">
  Generated: {metadata.get("generated_at_iso", "N/A")} &middot;
  Modes: {", ".join(metadata.get("modes", []))} &middot;
  URLs: {metadata.get("urls_count", 0)} &middot;
  Runs: {metadata.get("iterations", 0)}
</p>"""

    def _html_summary(self, summary: dict[str, Any]) -> str:
        comparison = summary.get("mode_comparison", [])
        best = comparison[0] if comparison else {}
        best_mode = best.get("mode", "N/A")
        best_accuracy = best.get("average_accuracy")
        best_duration = best.get("average_duration_ms", 0)

        accuracy_str = f"{best_accuracy:.2%}" if best_accuracy is not None else "N/A"

        return f"""<h2>Summary</h2>
<div class="summary-grid">
  <div class="summary-card">
    <div class="label">Total Runs</div>
    <div class="value">{summary.get("total_runs", 0)}</div>
  </div>
  <div class="summary-card">
    <div class="label">Modes Tested</div>
    <div class="value">{summary.get("modes_tested", 0)}</div>
  </div>
  <div class="summary-card">
    <div class="label">Best Mode</div>
    <div class="value">{best_mode}</div>
  </div>
  <div class="summary-card">
    <div class="label">Best Accuracy</div>
    <div class="value">{accuracy_str}</div>
  </div>
  <div class="summary-card">
    <div class="label">Best Avg Duration</div>
    <div class="value">{best_duration:.0f} ms</div>
  </div>
</div>"""

    def _html_mode_comparison(self, comparison: list[dict[str, Any]]) -> str:
        if not comparison:
            return "<h2>Mode Comparison</h2><p>No mode data available.</p>"

        rows = ""
        for row in comparison:
            accuracy = "N/A" if row["average_accuracy"] is None else f"{row['average_accuracy']:.2%}"
            rows += f"""<tr>
  <td>{row["mode"]}</td>
  <td>{row["success_rate"]:.2%}</td>
  <td>{accuracy}</td>
  <td>{row["average_duration_ms"]:.2f}</td>
  <td>{row["p95_duration_ms"]:.2f}</td>
  <td>${row["average_cost_usd"]:.6f}</td>
  <td>{row["runs"]}</td>
</tr>"""

        return f"""<h2>Mode Comparison</h2>
<table>
<thead>
<tr>
  <th>Mode</th><th>Success Rate</th><th>Avg Accuracy</th>
  <th>Avg Duration (ms)</th><th>P95 Duration (ms)</th>
  <th>Avg Cost</th><th>Runs</th>
</tr>
</thead>
<tbody>
{rows}
</tbody>
</table>"""

    def _html_url_results(self, url_results: list[dict[str, Any]]) -> str:
        if not url_results:
            return "<h2>Per-URL Results</h2><p>No per-URL data available.</p>"

        rows = ""
        for entry in url_results:
            url = entry["url"]
            sku = entry["sku"]
            results = entry["results"]
            mode_cells = ""
            for mode, data in results.items():
                success = data.get("success_rate", 0)
                accuracy = data.get("accuracy", 0)
                duration = data.get("duration_ms", 0)
                cost = data.get("cost_usd", 0)
                mode_cells += f"<td>{success:.2%}</td><td>{accuracy:.4f}</td><td>{duration:.0f} ms</td><td>${cost:.6f}</td>"
            rows += f"<tr><td>{sku}</td><td title='{url}'>{url[:60]}{'…' if len(url) > 60 else ''}</td>{mode_cells}</tr>"

        modes = set()
        for entry in url_results:
            modes.update(entry["results"].keys())
        mode_headers = ""
        for mode in sorted(modes):
            mode_headers += f"<th>{mode} Success</th><th>{mode} Accuracy</th><th>{mode} Duration</th><th>{mode} Cost</th>"

        return f"""<h2>Per-URL Results</h2>
<table>
<thead>
<tr><th>SKU</th><th>URL</th>{mode_headers}</tr>
</thead>
<tbody>
{rows}
</tbody>
</table>"""

    def _html_cost_breakdown(self, breakdown: dict[str, Any]) -> str:
        if not breakdown:
            return "<h2>Cost Breakdown</h2><p>No cost data available.</p>"

        rows = ""
        for mode, data in breakdown.items():
            rows += f"""<tr>
  <td>{mode}</td>
  <td>${data["total_cost_usd"]:.6f}</td>
  <td>{data["runs"]}</td>
  <td>${data["avg_cost_per_run_usd"]:.6f}</td>
</tr>"""

        return f"""<h2>Cost Breakdown</h2>
<table>
<thead>
<tr><th>Mode</th><th>Total Cost</th><th>Runs</th><th>Avg Cost/Run</th></tr>
</thead>
<tbody>
{rows}
</tbody>
</table>"""

    def _html_previous_comparison(self, comparison: dict[str, Any]) -> str:
        sections = ""
        for mode, data in comparison.items():
            if data.get("status") == "new_mode":
                sections += f"""<h3>{mode}</h3>
<p><span class="badge badge-yellow">New Mode</span> — no previous data for comparison.</p>"""
                continue

            metric_rows = ""
            for metric_name, metric_data in data.items():
                if not isinstance(metric_data, dict) or "trend" not in metric_data:
                    continue
                trend = metric_data["trend"]
                color_class = trend
                symbol = TrendIndicator.to_html_symbol(trend)
                current_val = metric_data["current"]
                previous_val = metric_data["previous"]

                if "cost" in metric_name:
                    current_str = f"${current_val:.6f}"
                    previous_str = f"${previous_val:.6f}"
                elif "duration" in metric_name:
                    current_str = f"{current_val:.2f} ms"
                    previous_str = f"{previous_val:.2f} ms"
                elif "rate" in metric_name or "accuracy" in metric_name:
                    current_str = f"{current_val:.2%}"
                    previous_str = f"{previous_val:.2%}" if previous_val is not None else "N/A"
                else:
                    current_str = str(current_val)
                    previous_str = str(previous_val)

                metric_rows += f"""<tr>
  <td>{metric_name.replace("_", " ").title()}</td>
  <td>{current_str}</td>
  <td>{previous_str}</td>
  <td class="{color_class}">{symbol} {trend}</td>
</tr>"""

            sections += f"""<h3>{mode}</h3>
<table>
<thead><tr><th>Metric</th><th>Current</th><th>Previous</th><th>Trend</th></tr></thead>
<tbody>{metric_rows}</tbody>
</table>"""

        return f"""<h2>Comparison with Previous Run</h2>
{sections}"""

    def _html_footer(self) -> str:
        ts = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(self._generated_at))
        return f"""<footer>
<p>BayState Scraper Benchmark Report &middot; {ts}</p>
</footer>
</body></html>"""
