#!/usr/bin/env python3
"""
Metrics Dashboard Generator

Aggregates data from all evaluation sources and generates an HTML dashboard
with time series charts, alerts for regressions, and links to detailed reports.

Data sources:
- Weekly validation results (.sisyphus/evidence/weekly_validation/)
- Evaluation runs (.sisyphus/evidence/evaluation/)
- A/B test results (tests/finetuning/experiments.json)
- Thresholds (config/evaluation_thresholds.yaml)

Output: .sisyphus/evidence/dashboard/index.html
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
for import_root in (PROJECT_ROOT, SRC_ROOT):
    if str(import_root) not in sys.path:
        sys.path.insert(0, str(import_root))

DEFAULT_EVIDENCE_DIR = Path(".sisyphus/evidence")
DEFAULT_OUTPUT_DIR = Path(".sisyphus/evidence/dashboard")
REGRESSION_THRESHOLD_PCT = 0.02  # 2% drop triggers alert


@dataclass
class TimeSeriesPoint:
    """Single data point in a time series."""

    timestamp: str
    value: float
    label: str = ""


@dataclass
class MetricSummary:
    """Summary of a single metric."""

    name: str
    current: float
    target: float
    unit: str
    status: str  # "pass", "warn", "fail"
    trend: list[TimeSeriesPoint] = field(default_factory=list)


@dataclass
class FieldAccuracy:
    """Accuracy for a single field."""

    field_name: str
    accuracy: float
    samples: int


@dataclass
class ExperimentSummary:
    """Summary of a recent experiment."""

    id: str
    hypothesis: str
    conclusion: str
    improvement_pct: float
    created_at: str


@dataclass
class Alert:
    """An alert for regression or threshold breach."""

    severity: str  # "error", "warning", "info"
    message: str
    timestamp: str
    details: str = ""


@dataclass
class DashboardData:
    """All data needed for the dashboard."""

    generated_at: str
    metrics: list[MetricSummary]
    field_accuracy: list[FieldAccuracy]
    experiments: list[ExperimentSummary]
    alerts: list[Alert]
    weekly_runs: list[dict[str, Any]]
    evaluation_runs: list[dict[str, Any]]


def load_yaml_config(path: Path) -> dict[str, Any]:
    """Load YAML configuration file."""
    if not path.exists():
        return {}
    with open(path, "r") as f:
        return yaml.safe_load(f) or {}


def load_json_file(path: Path) -> dict[str, Any] | None:
    """Load JSON file, returning None if not found or invalid."""
    if not path.exists():
        return None
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def load_weekly_validation_results(evidence_dir: Path) -> list[dict[str, Any]]:
    """Load all weekly validation results."""
    weekly_dir = evidence_dir / "weekly_validation"
    if not weekly_dir.exists():
        return []

    results = []
    for run_dir in sorted(weekly_dir.iterdir()):
        if not run_dir.is_dir():
            continue
        json_path = run_dir / "raw-results.json"
        data = load_json_file(json_path)
        if data:
            data["_run_dir"] = str(run_dir.name)
            results.append(data)

    return results


def load_evaluation_results(evidence_dir: Path) -> list[dict[str, Any]]:
    """Load all evaluation results."""
    eval_dir = evidence_dir / "evaluation"
    if not eval_dir.exists():
        return []

    results = []
    for json_file in sorted(eval_dir.glob("*.json")):
        data = load_json_file(json_file)
        if data:
            data["_file_name"] = json_file.name
            results.append(data)

    return results


def load_experiments() -> list[dict[str, Any]]:
    """Load experiments from hypothesis tracker storage."""
    experiments_file = PROJECT_ROOT / "tests" / "finetuning" / "experiments.json"
    data = load_json_file(experiments_file)
    if not data:
        return []

    return list(data.values())


def calculate_accuracy_trend(
    weekly_results: list[dict[str, Any]],
    evaluation_results: list[dict[str, Any]],
) -> list[TimeSeriesPoint]:
    """Calculate accuracy trend over time."""
    points = []

    # From evaluation results
    for result in evaluation_results:
        summary = result.get("summary", {})
        accuracy = summary.get("overall_accuracy") or summary.get("accuracy", 0)
        timestamp = result.get("generated_at") or result.get("_file_name", "")[:10]
        if timestamp:
            points.append(
                TimeSeriesPoint(
                    timestamp=timestamp,
                    value=accuracy * 100 if accuracy <= 1 else accuracy,
                    label=f"Eval: {result.get('prompt_version', 'v1')}",
                )
            )

    # From weekly validation
    for result in weekly_results:
        summary = result.get("summary", {})
        success_rate = summary.get("success_rate", 0)
        timestamp = result.get("run_started_at") or f"2026-01-{result.get('_run_dir', '01')[:2]}"
        if timestamp:
            points.append(
                TimeSeriesPoint(
                    timestamp=timestamp[:10],
                    value=success_rate * 100 if success_rate <= 1 else success_rate,
                    label=f"Weekly: {summary.get('prompt_version', 'v1')}",
                )
            )

    # Sort by timestamp
    points.sort(key=lambda p: p.timestamp)
    return points


def calculate_cost_trend(
    weekly_results: list[dict[str, Any]],
    evaluation_results: list[dict[str, Any]],
) -> list[TimeSeriesPoint]:
    """Calculate cost trend over time."""
    points = []

    for result in evaluation_results:
        summary = result.get("summary", {})
        cost = summary.get("total_cost_usd") or summary.get("total_cost", 0)
        timestamp = result.get("generated_at") or result.get("_file_name", "")[:10]
        if timestamp:
            points.append(
                TimeSeriesPoint(
                    timestamp=timestamp[:10],
                    value=cost,
                    label="Evaluation",
                )
            )

    for result in weekly_results:
        summary = result.get("summary", {})
        cost = summary.get("total_cost_usd", 0)
        timestamp = result.get("run_started_at") or f"2026-01-{result.get('_run_dir', '01')[:2]}"
        if timestamp:
            points.append(
                TimeSeriesPoint(
                    timestamp=timestamp[:10],
                    value=cost,
                    label="Weekly",
                )
            )

    points.sort(key=lambda p: p.timestamp)
    return points


def calculate_success_rate_trend(
    weekly_results: list[dict[str, Any]],
    evaluation_results: list[dict[str, Any]],
) -> list[TimeSeriesPoint]:
    """Calculate success rate trend over time."""
    points = []

    for result in evaluation_results:
        summary = result.get("summary", {})
        rate = summary.get("success_rate", 0)
        timestamp = result.get("generated_at") or result.get("_file_name", "")[:10]
        if timestamp:
            points.append(
                TimeSeriesPoint(
                    timestamp=timestamp[:10],
                    value=rate * 100 if rate <= 1 else rate,
                    label="Evaluation",
                )
            )

    for result in weekly_results:
        summary = result.get("summary", {})
        rate = summary.get("success_rate", 0)
        timestamp = result.get("run_started_at") or f"2026-01-{result.get('_run_dir', '01')[:2]}"
        if timestamp:
            points.append(
                TimeSeriesPoint(
                    timestamp=timestamp[:10],
                    value=rate * 100 if rate <= 1 else rate,
                    label="Weekly",
                )
            )

    points.sort(key=lambda p: p.timestamp)
    return points


def calculate_field_accuracy(
    evaluation_results: list[dict[str, Any]],
) -> list[FieldAccuracy]:
    """Calculate per-field accuracy from evaluation results."""
    field_scores: dict[str, list[float]] = {}

    for result in evaluation_results:
        per_field = result.get("per_field_accuracy", {})
        for field_name, accuracy in per_field.items():
            if field_name not in field_scores:
                field_scores[field_name] = []
            field_scores[field_name].append(accuracy if accuracy <= 1 else accuracy / 100)

    results = []
    for field_name, scores in field_scores.items():
        avg_accuracy = sum(scores) / len(scores) if scores else 0
        results.append(
            FieldAccuracy(
                field_name=field_name,
                accuracy=avg_accuracy,
                samples=len(scores),
            )
        )

    # Sort by accuracy ascending (worst first)
    results.sort(key=lambda f: f.accuracy)
    return results


def check_for_regressions(
    accuracy_trend: list[TimeSeriesPoint],
    success_trend: list[TimeSeriesPoint],
    thresholds: dict[str, Any],
) -> list[Alert]:
    """Check for regressions based on trends and thresholds."""
    alerts = []

    # Check accuracy trend for > 2% drop
    if len(accuracy_trend) >= 2:
        recent = accuracy_trend[-5:] if len(accuracy_trend) >= 5 else accuracy_trend
        for i in range(1, len(recent)):
            drop = recent[i - 1].value - recent[i].value
            if drop > REGRESSION_THRESHOLD_PCT * 100:
                alerts.append(
                    Alert(
                        severity="error",
                        message=f"Accuracy regression: {drop:.1f}% drop",
                        timestamp=recent[i].timestamp,
                        details=f"From {recent[i - 1].value:.1f}% to {recent[i].value:.1f}%",
                    )
                )

    # Check success rate trend for > 2% drop
    if len(success_trend) >= 2:
        recent = success_trend[-5:] if len(success_trend) >= 5 else success_trend
        for i in range(1, len(recent)):
            drop = recent[i - 1].value - recent[i].value
            if drop > REGRESSION_THRESHOLD_PCT * 100:
                alerts.append(
                    Alert(
                        severity="error",
                        message=f"Success rate regression: {drop:.1f}% drop",
                        timestamp=recent[i].timestamp,
                        details=f"From {recent[i - 1].value:.1f}% to {recent[i].value:.1f}%",
                    )
                )

    # Check thresholds
    min_accuracy = thresholds.get("min_field_accuracy", 0.80)
    if accuracy_trend:
        current_accuracy = accuracy_trend[-1].value / 100
        if current_accuracy < min_accuracy:
            alerts.append(
                Alert(
                    severity="warning",
                    message=f"Accuracy below threshold: {current_accuracy:.1%} < {min_accuracy:.0%}",
                    timestamp=accuracy_trend[-1].timestamp,
                    details=f"Target: {min_accuracy:.0%}",
                )
            )

    min_success = thresholds.get("min_success_rate", 0.70)
    if success_trend:
        current_success = success_trend[-1].value / 100
        if current_success < min_success:
            alerts.append(
                Alert(
                    severity="warning",
                    message=f"Success rate below threshold: {current_success:.1%} < {min_success:.0%}",
                    timestamp=success_trend[-1].timestamp,
                    details=f"Target: {min_success:.0%}",
                )
            )

    return alerts


def get_metric_status(current: float, target: float, higher_is_better: bool = True) -> str:
    """Determine metric status (pass/warn/fail)."""
    if higher_is_better:
        if current >= target:
            return "pass"
        elif current >= target * 0.9:
            return "warn"
        return "fail"
    else:
        if current <= target:
            return "pass"
        elif current <= target * 1.1:
            return "warn"
        return "fail"


def build_dashboard_data(
    weekly_results: list[dict[str, Any]],
    evaluation_results: list[dict[str, Any]],
    experiments: list[dict[str, Any]],
    thresholds: dict[str, Any],
) -> DashboardData:
    """Build all dashboard data from sources."""
    # Calculate trends
    accuracy_trend = calculate_accuracy_trend(weekly_results, evaluation_results)
    success_trend = calculate_success_rate_trend(weekly_results, evaluation_results)
    cost_trend = calculate_cost_trend(weekly_results, evaluation_results)

    # Current values
    current_accuracy = accuracy_trend[-1].value if accuracy_trend else 0
    current_success = success_trend[-1].value if success_trend else 0
    current_cost = cost_trend[-1].value if cost_trend else 0

    # Build metrics
    metrics = [
        MetricSummary(
            name="Accuracy",
            current=current_accuracy,
            target=thresholds.get("min_field_accuracy", 0.80) * 100,
            unit="%",
            status=get_metric_status(current_accuracy / 100, thresholds.get("min_field_accuracy", 0.80)),
            trend=accuracy_trend,
        ),
        MetricSummary(
            name="Success Rate",
            current=current_success,
            target=thresholds.get("min_success_rate", 0.70) * 100,
            unit="%",
            status=get_metric_status(current_success / 100, thresholds.get("min_success_rate", 0.70)),
            trend=success_trend,
        ),
        MetricSummary(
            name="Cost per SKU",
            current=current_cost,
            target=thresholds.get("max_cost_per_sku", 0.10),
            unit="$",
            status=get_metric_status(current_cost, thresholds.get("max_cost_per_sku", 0.10), higher_is_better=False),
            trend=cost_trend,
        ),
    ]

    # Field accuracy
    field_accuracy = calculate_field_accuracy(evaluation_results)

    # Recent experiments
    experiment_summaries = []
    for exp in experiments[:10]:  # Last 10
        improvement = 0.0
        if exp.get("results") and exp["results"].get("improvement_pct"):
            improvement = exp["results"]["improvement_pct"].get("accuracy", 0)

        experiment_summaries.append(
            ExperimentSummary(
                id=exp.get("id", "unknown"),
                hypothesis=exp.get("hypothesis", "")[:60] + "..." if len(exp.get("hypothesis", "")) > 60 else exp.get("hypothesis", ""),
                conclusion=exp.get("conclusion", "pending") or "pending",
                improvement_pct=improvement,
                created_at=exp.get("created_at", "")[:10],
            )
        )

    # Alerts
    alerts = check_for_regressions(accuracy_trend, success_trend, thresholds)

    return DashboardData(
        generated_at=datetime.now(timezone.utc).isoformat(),
        metrics=metrics,
        field_accuracy=field_accuracy,
        experiments=experiment_summaries,
        alerts=alerts,
        weekly_runs=weekly_results,
        evaluation_runs=evaluation_results,
    )


def generate_svg_line_chart(
    data: list[TimeSeriesPoint],
    width: int = 400,
    height: int = 150,
    color: str = "#008850",
) -> str:
    """Generate SVG line chart from time series data."""
    if not data:
        return f'<svg width="{width}" height="{height}" class="chart empty"><text x="50%" y="50%" text-anchor="middle" fill="#999">No data</text></svg>'

    # Calculate bounds
    values = [p.value for p in data]
    min_val = min(values)
    max_val = max(values)
    range_val = max_val - min_val if max_val != min_val else 1

    # Padding
    padding = 30
    chart_width = width - padding * 2
    chart_height = height - padding * 2

    # Generate points
    points = []
    for i, point in enumerate(data):
        x = padding + (i / (len(data) - 1)) * chart_width if len(data) > 1 else padding + chart_width / 2
        y = padding + chart_height - ((point.value - min_val) / range_val) * chart_height
        points.append(f"{x:.1f},{y:.1f}")

    # Generate SVG
    svg = f'''<svg width="{width}" height="{height}" class="chart">
  <!-- Grid lines -->
  <line x1="{padding}" y1="{padding}" x2="{width - padding}" y2="{padding}" stroke="#eee" stroke-width="1"/>
  <line x1="{padding}" y1="{height - padding}" x2="{width - padding}" y2="{height - padding}" stroke="#eee" stroke-width="1"/>
  
  <!-- Y-axis labels -->
  <text x="{padding - 5}" y="{padding}" text-anchor="end" fill="#666" font-size="10">{max_val:.1f}</text>
  <text x="{padding - 5}" y="{height - padding}" text-anchor="end" fill="#666" font-size="10">{min_val:.1f}</text>
  
  <!-- Line -->
  <polyline fill="none" stroke="{color}" stroke-width="2" points="{" ".join(points)}"/>
  
  <!-- Points -->
'''
    for i, point in enumerate(data):
        x = padding + (i / (len(data) - 1)) * chart_width if len(data) > 1 else padding + chart_width / 2
        y = padding + chart_height - ((point.value - min_val) / range_val) * chart_height
        svg += f'  <circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="{color}"/>\n'
        # X-axis labels (every few points)
        if i % max(1, len(data) // 5) == 0:
            svg += f'  <text x="{x:.1f}" y="{height - 5}" text-anchor="middle" fill="#666" font-size="9">{point.timestamp[5:10]}</text>\n'

    svg += "</svg>"
    return svg


def generate_html_dashboard(data: DashboardData) -> str:
    """Generate HTML dashboard from data."""
    # CSS styles
    styles = """
    <style>
        :root {
            --forest-green: #008850;
            --burgundy: #66161D;
            --gold: #FCD048;
            --pass: #008850;
            --warn: #FCD048;
            --fail: #66161D;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f9f9f9;
            color: #333;
        }
        
        h1 { color: var(--forest-green); margin-bottom: 5px; }
        h2 { color: #555; border-bottom: 2px solid var(--forest-green); padding-bottom: 10px; }
        h3 { color: #666; margin-top: 0; }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
        }
        
        .generated { color: #999; font-size: 0.9em; }
        
        .alerts {
            background: #fff;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
        }
        
        .alert {
            padding: 10px 15px;
            margin: 5px 0;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .alert.error { background: #fee2e2; border-left: 4px solid var(--fail); }
        .alert.warning { background: #fef3c7; border-left: 4px solid var(--warn); }
        .alert.info { background: #e0f2fe; border-left: 4px solid #0284c7; }
        
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .metric-card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .metric-card.pass { border-top: 4px solid var(--pass); }
        .metric-card.warn { border-top: 4px solid var(--warn); }
        .metric-card.fail { border-top: 4px solid var(--fail); }
        
        .metric-value {
            font-size: 2.5em;
            font-weight: bold;
            margin: 10px 0;
        }
        
        .metric-target {
            color: #999;
            font-size: 0.9em;
        }
        
        .chart { margin-top: 15px; }
        .chart.empty { background: #f5f5f5; border-radius: 4px; }
        
        .section {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .field-table, .experiment-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .field-table th, .experiment-table th {
            text-align: left;
            padding: 10px;
            background: #f5f5f5;
            border-bottom: 2px solid #ddd;
        }
        
        .field-table td, .experiment-table td {
            padding: 10px;
            border-bottom: 1px solid #eee;
        }
        
        .accuracy-bar {
            height: 20px;
            background: #eee;
            border-radius: 4px;
            overflow: hidden;
            display: inline-block;
            width: 100px;
        }
        
        .accuracy-fill {
            height: 100%;
            background: var(--forest-green);
        }
        
        .conclusion {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.85em;
            font-weight: 500;
        }
        
        .conclusion.accepted { background: #d1fae5; color: #065f46; }
        .conclusion.rejected { background: #fee2e2; color: #991b1b; }
        .conclusion.inconclusive { background: #f3f4f6; color: #374151; }
        .conclusion.pending { background: #fef3c7; color: #92400e; }
        
        .links {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }
        
        .links a {
            color: var(--forest-green);
            text-decoration: none;
            margin-right: 20px;
        }
        
        .links a:hover { text-decoration: underline; }
        
        @media (max-width: 768px) {
            .metrics-grid { grid-template-columns: 1fr; }
        }
    </style>
"""

    # Build HTML
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Scraper Metrics Dashboard</title>
    {styles}
</head>
<body>
    <div class="header">
        <div>
            <h1>AI Scraper Metrics</h1>
            <p class="generated">Generated: {data.generated_at}</p>
        </div>
    </div>
"""

    # Alerts section
    if data.alerts:
        html += """
    <div class="section alerts">
        <h2>⚠️ Alerts</h2>
"""
        for alert in data.alerts:
            html += f"""
        <div class="alert {alert.severity}">
            <strong>{alert.message}</strong>
            <span style="color:#666">{alert.timestamp}</span>
            {f'<span style="color:#888">{alert.details}</span>' if alert.details else ""}
        </div>
"""
        html += "    </div>\n"

    # Metrics grid
    html += """
    <div class="metrics-grid">
"""
    for metric in data.metrics:
        html += f"""
        <div class="metric-card {metric.status}">
            <h3>{metric.name}</h3>
            <div class="metric-value">{metric.current:.1f}{metric.unit}</div>
            <div class="metric-target">Target: {metric.target:.1f}{metric.unit}</div>
            {generate_svg_line_chart(metric.trend)}
        </div>
"""
    html += "    </div>\n"

    # Field accuracy section
    if data.field_accuracy:
        html += """
    <div class="section">
        <h2>Per-Field Accuracy</h2>
        <table class="field-table">
            <thead>
                <tr>
                    <th>Field</th>
                    <th>Accuracy</th>
                    <th>Samples</th>
                </tr>
            </thead>
            <tbody>
"""
        for field in data.field_accuracy:
            fill_pct = field.accuracy * 100
            html += f"""
                <tr>
                    <td><code>{field.field_name}</code></td>
                    <td>
                        <div class="accuracy-bar">
                            <div class="accuracy-fill" style="width: {fill_pct:.0f}%"></div>
                        </div>
                        {fill_pct:.1f}%
                    </td>
                    <td>{field.samples}</td>
                </tr>
"""
        html += """
            </tbody>
        </table>
    </div>
"""

    # Experiments section
    if data.experiments:
        html += """
    <div class="section">
        <h2>Recent Experiments</h2>
        <table class="experiment-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Hypothesis</th>
                    <th>Conclusion</th>
                    <th>Improvement</th>
                    <th>Date</th>
                </tr>
            </thead>
            <tbody>
"""
        for exp in data.experiments:
            improvement_str = f"+{exp.improvement_pct:.1f}%" if exp.improvement_pct > 0 else f"{exp.improvement_pct:.1f}%"
            html += f"""
                <tr>
                    <td><code>{exp.id[:20]}...</code></td>
                    <td>{exp.hypothesis}</td>
                    <td><span class="conclusion {exp.conclusion}">{exp.conclusion}</span></td>
                    <td>{improvement_str}</td>
                    <td>{exp.created_at}</td>
                </tr>
"""
        html += """
            </tbody>
        </table>
    </div>
"""

    # Links section
    html += """
    <div class="section links">
        <h3>Quick Links</h3>
        <a href="../evaluation/">📊 Evaluation Reports</a>
        <a href="../weekly_validation/">📅 Weekly Validation</a>
        <a href="../regression/">🔄 Regression Reports</a>
        <a href="../baselines/">📈 Baselines</a>
    </div>
"""

    html += """
</body>
</html>
"""
    return html


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Generate metrics dashboard")
    parser.add_argument(
        "--evidence-dir",
        default=str(DEFAULT_EVIDENCE_DIR),
        help="Evidence directory root",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Output directory for dashboard",
    )
    args = parser.parse_args()

    evidence_dir = Path(args.evidence_dir)
    output_dir = Path(args.output_dir)

    # Load data sources
    print("Loading data sources...")
    thresholds = load_yaml_config(PROJECT_ROOT / "config" / "evaluation_thresholds.yaml")
    weekly_results = load_weekly_validation_results(evidence_dir)
    evaluation_results = load_evaluation_results(evidence_dir)
    experiments = load_experiments()

    print(f"  - Weekly validation runs: {len(weekly_results)}")
    print(f"  - Evaluation runs: {len(evaluation_results)}")
    print(f"  - Experiments: {len(experiments)}")

    # Build dashboard data
    print("\nBuilding dashboard data...")
    dashboard_data = build_dashboard_data(
        weekly_results=weekly_results,
        evaluation_results=evaluation_results,
        experiments=experiments,
        thresholds=thresholds,
    )

    # Generate HTML
    print("Generating HTML dashboard...")
    html = generate_html_dashboard(dashboard_data)

    # Write output
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "index.html"
    output_path.write_text(html, encoding="utf-8")

    print(f"\n✅ Dashboard generated: {output_path}")
    print(f"   - Metrics: {len(dashboard_data.metrics)}")
    print(f"   - Field accuracy: {len(dashboard_data.field_accuracy)} fields")
    print(f"   - Experiments: {len(dashboard_data.experiments)}")
    print(f"   - Alerts: {len(dashboard_data.alerts)}")

    # Save evidence
    evidence_path = evidence_dir / "task-5-4-dashboard.txt"
    evidence_path.write_text(
        f"""Metrics Dashboard Generation
=============================
Generated: {dashboard_data.generated_at}

Data Sources:
- Weekly validation runs: {len(weekly_results)}
- Evaluation runs: {len(evaluation_results)}
- Experiments: {len(experiments)}

Output:
- Dashboard: {output_path}

Metrics Summary:
{chr(10).join(f"  - {m.name}: {m.current:.1f}{m.unit} (target: {m.target:.1f}{m.unit}, status: {m.status})" for m in dashboard_data.metrics)}

Alerts: {len(dashboard_data.alerts)}
{chr(10).join(f"  - [{a.severity}] {a.message}" for a in dashboard_data.alerts)}
""",
        encoding="utf-8",
    )
    print(f"   - Evidence: {evidence_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
