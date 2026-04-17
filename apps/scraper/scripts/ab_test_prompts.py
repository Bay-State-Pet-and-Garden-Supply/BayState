#!/usr/bin/env python3
"""A/B test AI Search source-selection strategies on a golden dataset."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Protocol, TypedDict, cast

import yaml

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.benchmark_ai_search import BenchmarkReport, BenchmarkResultRow, BenchmarkRunner, BenchmarkSummary, write_report as write_benchmark_report
from scripts.compare_benchmarks import BenchmarkComparator, ComparisonReport, ComparisonSummary, MetricComparison

REPORTS_DIR = ROOT / "reports"
REPORT_VERSION = "1.0"
DEFAULT_STRATEGY_A_ENV_PREFIX = "AB_TEST_STRATEGY_A"
DEFAULT_STRATEGY_B_ENV_PREFIX = "AB_TEST_STRATEGY_B"
VALID_MODES = {"heuristic", "llm"}
PRIMARY_METRIC = "accuracy_exact_match"


@dataclass(frozen=True)
class ABTestArgs:
    """Typed CLI arguments."""

    dataset: Path
    strategy_a: str
    strategy_b: str
    prompt_a: Path | None
    prompt_b: Path | None
    output: Path | None


@dataclass(frozen=True)
class PromptConfig:
    """Configuration for a prompt version."""

    label: str
    name: str
    content: str
    source: str
    version: str = "1.0"
    metadata: dict[str, str] | None = None


@dataclass(frozen=True)
class StrategyConfig:
    """Resolved configuration for one benchmark strategy."""

    label: str
    name: str
    mode: str
    source: str
    cache_dir: Path | None = None
    llm_model: str = "gpt-4o-mini"
    llm_provider: str = "openai"
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    prompt: PromptConfig | None = None


@dataclass(frozen=True)
class PromptComparisonResult:
    """Result of comparing two prompt versions."""

    prompt_a_accuracy: float
    prompt_b_accuracy: float
    accuracy_delta: float
    improved_count: int
    regressed_count: int
    unchanged_count: int
    total_examples: int
    improved_examples: list[dict[str, object]]
    regressed_examples: list[dict[str, object]]


class PromptReport(TypedDict):
    """Serialized prompt metadata for the A/B report."""

    label: str
    name: str
    version: str
    source: str
    content_hash: str
    content_preview: str
    metadata: dict[str, str] | None


class PromptMetrics(TypedDict):
    """Metrics specific to a prompt version."""

    prompt_label: str
    prompt_name: str
    prompt_version: str
    accuracy: float
    exact_matches: int
    total_examples: int
    avg_selection_cost_usd: float


class PromptComparisonReport(TypedDict):
    """Comparison between two prompt versions."""

    accuracy_delta: float
    accuracy_delta_pct: float
    improved_count: int
    regressed_count: int
    unchanged_count: int
    total_examples: int
    improved_examples: list[dict[str, object]]
    regressed_examples: list[dict[str, object]]
    prompt_a_metrics: PromptMetrics
    prompt_b_metrics: PromptMetrics


class StrategyReport(TypedDict):
    """Serialized strategy metadata for the A/B report."""

    label: str
    name: str
    mode: str
    source: str
    cache_dir: str | None
    llm_model: str
    llm_provider: str
    llm_base_url: str | None
    llm_api_key_configured: bool
    benchmark_summary: BenchmarkSummary
    prompt: PromptReport | None


 


class DifferingExample(TypedDict):
    """One example where the strategies produced different outputs."""

    index: int
    query: str
    expected_source_url: str
    strategy_a_predicted_source_url: str | None
    strategy_b_predicted_source_url: str | None
    strategy_a_exact_match: bool
    strategy_b_exact_match: bool
    strategy_a_selection_method: str
    strategy_b_selection_method: str
    strategy_a_error: str | None
    strategy_b_error: str | None
    outcome: str


class RecommendationPayload(TypedDict):
    """Serialized recommendation for the comparison."""

    choice: str
    winner: str | None
    statistically_significant: bool
    primary_metric: str
    reasons: list[str]


class ABTestReport(TypedDict):
    """Top-level A/B test report payload."""

    report_version: str
    generated_at: str
    dataset_path: str
    strategy_a: StrategyReport
    strategy_b: StrategyReport
    comparison_summary: ComparisonSummary
    comparison_metrics: dict[str, MetricComparison]
    recommendation: RecommendationPayload
    differing_examples_count: int
    differing_examples: list[DifferingExample]
    prompt_comparison: PromptComparisonReport | None


class BenchmarkRunnerLike(Protocol):
    """Protocol for benchmark runner instances used by the A/B runner."""

    async def run(self) -> BenchmarkReport: ...


class BenchmarkRunnerFactory(Protocol):
    """Protocol for constructing benchmark runners."""

    def __call__(
        self,
        dataset_path: Path,
        *,
        mode: str,
        cache_dir: Path | None = None,
        llm_model: str = "gpt-4o-mini",
        llm_provider: str = "openai",
        llm_base_url: str | None = None,
        llm_api_key: str | None = None,
    ) -> BenchmarkRunnerLike: ...


def parse_args(argv: list[str] | None = None) -> ABTestArgs:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(description="A/B test AI Search selection strategies against a golden dataset")
    _ = parser.add_argument("--dataset", type=Path, required=True, help="Path to the golden dataset JSON file")
    _ = parser.add_argument(
        "--strategy-a",
        required=True,
        help="Strategy A spec: heuristic, llm, env[:PREFIX], or a JSON/YAML config path",
    )
    _ = parser.add_argument(
        "--strategy-b",
        required=True,
        help="Strategy B spec: heuristic, llm, env[:PREFIX], or a JSON/YAML config path",
    )
    _ = parser.add_argument("--output", type=Path, default=None, help="Optional path to write the JSON A/B report")
    _ = parser.add_argument("--prompt-a", type=Path, default=None, help="Optional path to prompt A text file")
    _ = parser.add_argument("--prompt-b", type=Path, default=None, help="Optional path to prompt B text file")

    args = parser.parse_args(argv)
    return ABTestArgs(
        dataset=cast(Path, args.dataset),
        strategy_a=cast(str, args.strategy_a),
        strategy_b=cast(str, args.strategy_b),
        prompt_a=cast(Path | None, args.prompt_a),
        prompt_b=cast(Path | None, args.prompt_b),
        output=cast(Path | None, args.output),
    )


class ABTestRunner:

    def __init__(
        self,
        dataset_path: Path,
        *,
        strategy_a_spec: str,
        strategy_b_spec: str,
        prompt_a_path: Path | None = None,
        prompt_b_path: Path | None = None,
        runner_cls: BenchmarkRunnerFactory = BenchmarkRunner,
        comparator_cls: type[BenchmarkComparator] = BenchmarkComparator,
    ) -> None:
        self.dataset_path: Path = dataset_path
        self.strategy_a_spec: str = strategy_a_spec
        self.strategy_b_spec: str = strategy_b_spec
        self.prompt_a_path: Path | None = prompt_a_path
        self.prompt_b_path: Path | None = prompt_b_path
        self._runner_cls: BenchmarkRunnerFactory = runner_cls
        self._comparator_cls: type[BenchmarkComparator] = comparator_cls

    async def run_ab_test(self) -> ABTestReport:
        """Execute both strategies, compare them, and build a recommendation."""
        strategy_a = load_strategy_config(self.strategy_a_spec, label="A")
        strategy_b = load_strategy_config(self.strategy_b_spec, label="B")

        # Load prompts if provided
        if self.prompt_a_path:
            strategy_a = self._attach_prompt(strategy_a, self.prompt_a_path)
        if self.prompt_b_path:
            strategy_b = self._attach_prompt(strategy_b, self.prompt_b_path)

        report_a = await self._run_strategy(strategy_a)
        report_b = await self._run_strategy(strategy_b)
        comparison = self._compare_reports(report_a, report_b)
        differing_examples = self._find_differing_examples(report_a["results"], report_b["results"])
        recommendation = self._build_recommendation(
            strategy_a=strategy_a,
            strategy_b=strategy_b,
            report_a=report_a,
            report_b=report_b,
            comparison=comparison,
            differing_examples=differing_examples,
        )

        # Generate prompt comparison if prompts were provided
        prompt_comparison = None
        if strategy_a.prompt or strategy_b.prompt:
            prompt_comparison = self._compare_prompts(report_a, report_b, strategy_a, strategy_b)

        generated_at = datetime.now(timezone.utc).isoformat()
        return ABTestReport(
            report_version=REPORT_VERSION,
            generated_at=generated_at,
            dataset_path=str(self.dataset_path),
            strategy_a=_serialize_strategy(strategy_a, report_a["summary"]),
            strategy_b=_serialize_strategy(strategy_b, report_b["summary"]),
            comparison_summary=comparison["summary"],
            comparison_metrics=comparison["comparisons"],
            recommendation=recommendation,
            differing_examples_count=len(differing_examples),
            differing_examples=differing_examples,
            prompt_comparison=prompt_comparison,
        )

    def _attach_prompt(self, strategy: StrategyConfig, prompt_path: Path) -> StrategyConfig:
        """Attach a prompt configuration to a strategy."""
        prompt_config = load_prompt_from_file(prompt_path, label=strategy.label)
        return StrategyConfig(
            label=strategy.label,
            name=strategy.name,
            mode=strategy.mode,
            source=strategy.source,
            cache_dir=strategy.cache_dir,
            llm_model=strategy.llm_model,
            llm_provider=strategy.llm_provider,
            llm_base_url=strategy.llm_base_url,
            llm_api_key=strategy.llm_api_key,
            prompt=prompt_config,
        )

    def _compare_prompts(
        self,
        report_a: BenchmarkReport,
        report_b: BenchmarkReport,
        strategy_a: StrategyConfig,
        strategy_b: StrategyConfig,
    ) -> PromptComparisonReport:
        """Compare metrics between two prompt versions."""
        results_a = report_a["results"]
        results_b = report_b["results"]

        # Calculate accuracy for each prompt
        exact_matches_a = sum(1 for row in results_a if row["exact_match"])
        exact_matches_b = sum(1 for row in results_b if row["exact_match"])
        total = len(results_a)

        accuracy_a = exact_matches_a / total if total > 0 else 0.0
        accuracy_b = exact_matches_b / total if total > 0 else 0.0
        accuracy_delta = accuracy_b - accuracy_a
        accuracy_delta_pct = (accuracy_delta / accuracy_a * 100) if accuracy_a > 0 else 0.0

        # Identify improved and regressed examples
        improved_examples: list[dict[str, object]] = []
        regressed_examples: list[dict[str, object]] = []
        unchanged_count = 0

        indexed_a = {_result_key(row): row for row in results_a}
        indexed_b = {_result_key(row): row for row in results_b}

        for key in indexed_a:
            row_a = indexed_a[key]
            row_b = indexed_b[key]

            a_correct = bool(row_a["exact_match"])
            b_correct = bool(row_b["exact_match"])

            example_data = {
                "index": int(row_a["index"]),
                "query": str(row_a["query"]),
                "expected_source_url": str(row_a["expected_source_url"]),
                "strategy_a_predicted": _predicted_url(row_a),
                "strategy_b_predicted": _predicted_url(row_b),
            }

            if not a_correct and b_correct:
                improved_examples.append(example_data)
            elif a_correct and not b_correct:
                regressed_examples.append(example_data)
            else:
                unchanged_count += 1

        # Calculate average selection cost
        total_cost_a = sum(float(row.get("selection_cost_usd", 0)) for row in results_a)
        total_cost_b = sum(float(row.get("selection_cost_usd", 0)) for row in results_b)
        avg_cost_a = total_cost_a / total if total > 0 else 0.0
        avg_cost_b = total_cost_b / total if total > 0 else 0.0

        prompt_a_name = strategy_a.prompt.name if strategy_a.prompt else strategy_a.name
        prompt_b_name = strategy_b.prompt.name if strategy_b.prompt else strategy_b.name
        prompt_a_version = strategy_a.prompt.version if strategy_a.prompt else "1.0"
        prompt_b_version = strategy_b.prompt.version if strategy_b.prompt else "1.0"

        return PromptComparisonReport(
            accuracy_delta=accuracy_delta,
            accuracy_delta_pct=accuracy_delta_pct,
            improved_count=len(improved_examples),
            regressed_count=len(regressed_examples),
            unchanged_count=unchanged_count,
            total_examples=total,
            improved_examples=improved_examples,
            regressed_examples=regressed_examples,
            prompt_a_metrics=PromptMetrics(
                prompt_label="A",
                prompt_name=prompt_a_name,
                prompt_version=prompt_a_version,
                accuracy=accuracy_a,
                exact_matches=exact_matches_a,
                total_examples=total,
                avg_selection_cost_usd=avg_cost_a,
            ),
            prompt_b_metrics=PromptMetrics(
                prompt_label="B",
                prompt_name=prompt_b_name,
                prompt_version=prompt_b_version,
                accuracy=accuracy_b,
                exact_matches=exact_matches_b,
                total_examples=total,
                avg_selection_cost_usd=avg_cost_b,
            ),
        )

    def _compare_reports(self, report_a: BenchmarkReport, report_b: BenchmarkReport) -> ComparisonReport:
        with TemporaryDirectory(prefix="ai_search_ab_test_") as tmp_dir:
            tmp_path = Path(tmp_dir)
            report_a_path = tmp_path / "strategy_a_benchmark.json"
            report_b_path = tmp_path / "strategy_b_benchmark.json"
            write_benchmark_report(report_a, report_a_path)
            write_benchmark_report(report_b, report_b_path)
            return self._comparator_cls(report_a_path, report_b_path).compare()

    def _find_differing_examples(
        self,
        results_a: list[BenchmarkResultRow],
        results_b: list[BenchmarkResultRow],
    ) -> list[DifferingExample]:
        indexed_a = {_result_key(row): row for row in results_a}
        indexed_b = {_result_key(row): row for row in results_b}
        if set(indexed_a) != set(indexed_b):
            raise ValueError("benchmark reports do not contain the same paired examples")

        differing_examples: list[DifferingExample] = []
        ordered_keys = sorted(indexed_a, key=lambda key: (key[0], key[1], key[2]))
        for key in ordered_keys:
            row_a = indexed_a[key]
            row_b = indexed_b[key]
            if _predicted_url(row_a) == _predicted_url(row_b) and _error_value(row_a) == _error_value(row_b):
                continue

            differing_examples.append(
                DifferingExample(
                    index=int(row_a["index"]),
                    query=str(row_a["query"]),
                    expected_source_url=str(row_a["expected_source_url"]),
                    strategy_a_predicted_source_url=_predicted_url(row_a),
                    strategy_b_predicted_source_url=_predicted_url(row_b),
                    strategy_a_exact_match=bool(row_a["exact_match"]),
                    strategy_b_exact_match=bool(row_b["exact_match"]),
                    strategy_a_selection_method=str(row_a.get("selection_method") or "none"),
                    strategy_b_selection_method=str(row_b.get("selection_method") or "none"),
                    strategy_a_error=_error_value(row_a),
                    strategy_b_error=_error_value(row_b),
                    outcome=_classify_difference(row_a, row_b),
                )
            )
        return differing_examples

    def _build_recommendation(
        self,
        *,
        strategy_a: StrategyConfig,
        strategy_b: StrategyConfig,
        report_a: BenchmarkReport,
        report_b: BenchmarkReport,
        comparison: ComparisonReport,
        differing_examples: list[DifferingExample],
    ) -> RecommendationPayload:
        comparison_summary = comparison["summary"]
        accuracy_metric = comparison["comparisons"][PRIMARY_METRIC]
        paired_t_p = float(accuracy_metric["paired_t_test"]["p_value"])
        wilcoxon_p = float(accuracy_metric["wilcoxon_signed_rank"]["p_value"])
        decision = str(comparison_summary["decision"])

        a_only_correct = sum(1 for example in differing_examples if example["outcome"] == "strategy_a_only_correct")
        b_only_correct = sum(1 for example in differing_examples if example["outcome"] == "strategy_b_only_correct")
        accuracy_a = float(report_a["summary"]["accuracy_exact_match_pct"])
        accuracy_b = float(report_b["summary"]["accuracy_exact_match_pct"])

        reasons = [
            f"Exact-match accuracy: {strategy_a.name} {accuracy_a:.3f}% vs {strategy_b.name} {accuracy_b:.3f}% across {int(comparison_summary['paired_examples'])} paired examples.",
            f"Primary-metric significance: paired t-test p={paired_t_p:.6f}; Wilcoxon p={wilcoxon_p:.6f}.",
        ]

        if differing_examples:
            reasons.append(
                f"Differing predictions: {len(differing_examples)} examples ({strategy_a.label}-only correct={a_only_correct}, {strategy_b.label}-only correct={b_only_correct})."
            )
        else:
            reasons.append("Both strategies produced identical predictions for every paired example.")

        if decision == "significant_improvement":
            reasons.insert(0, f"{strategy_b.name} significantly improved the primary accuracy metric over {strategy_a.name}.")
            choice = "Use B"
            winner = "B"
        elif decision == "significant_regression":
            reasons.insert(0, f"{strategy_b.name} significantly regressed on the primary accuracy metric versus {strategy_a.name}.")
            choice = "Use A"
            winner = "A"
        else:
            reasons.insert(0, "No statistically significant primary-metric difference was detected between the two strategies.")
            cost_a = float(report_a["summary"]["total_selection_cost_usd"])
            cost_b = float(report_b["summary"]["total_selection_cost_usd"])
            if cost_a != cost_b:
                reasons.append(
                    f"Secondary note: selection cost was ${cost_a:.6f} for {strategy_a.name} vs ${cost_b:.6f} for {strategy_b.name}, but the primary metric was not significantly different."
                )
            choice = "No difference"
            winner = None

        return RecommendationPayload(
            choice=choice,
            winner=winner,
            statistically_significant=bool(accuracy_metric["significant"]),
            primary_metric=PRIMARY_METRIC,
            reasons=reasons,
        )


def load_strategy_config(spec: str, *, label: str) -> StrategyConfig:
    """Resolve a strategy from an inline mode, env vars, or config file."""
    normalized = spec.strip()
    if not normalized:
        raise ValueError(f"strategy {label} spec cannot be empty")

    lowered = normalized.lower()
    if lowered in VALID_MODES:
        return StrategyConfig(label=label, name=lowered, mode=lowered, source=f"inline:{lowered}")

    if lowered == "env" or lowered.startswith("env:"):
        env_prefix = normalized.split(":", 1)[1] if ":" in normalized else _default_env_prefix(label)
        return _load_strategy_from_env(label=label, env_prefix=env_prefix)

    config_path = Path(normalized).expanduser()
    if config_path.exists():
        return _load_strategy_from_file(label=label, config_path=config_path)

    raise ValueError(f"unsupported strategy spec for {label}: {spec}. Expected heuristic, llm, env[:PREFIX], or an existing JSON/YAML config path")


def load_prompt_from_file(path: Path, *, label: str, version: str = "1.0") -> PromptConfig:
    """Load a prompt from a text file.

    Args:
        path: Path to the prompt text file
        label: Label for this prompt (A or B)
        version: Version identifier for the prompt

    Returns:
        PromptConfig with loaded content and metadata

    Raises:
        FileNotFoundError: If the prompt file doesn't exist
        ValueError: If the prompt file is empty
    """
    resolved_path = path.expanduser().resolve()

    if not resolved_path.exists():
        raise FileNotFoundError(f"prompt file not found: {resolved_path}")

    content = resolved_path.read_text(encoding="utf-8")

    if not content.strip():
        raise ValueError(f"prompt file is empty: {resolved_path}")

    # Extract metadata from frontmatter if present (--- yaml frontmatter ---)
    metadata: dict[str, str] | None = None
    clean_content = content

    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            try:
                frontmatter = yaml.safe_load(parts[1])
                if isinstance(frontmatter, dict):
                    metadata = {str(k): str(v) for k, v in frontmatter.items()}
                    # Override version if specified in frontmatter
                    if "version" in metadata:
                        version = metadata["version"]
                clean_content = parts[2].strip()
            except yaml.YAMLError:
                # If frontmatter parsing fails, treat as regular content
                pass

    return PromptConfig(
        label=label,
        name=resolved_path.stem,
        content=clean_content,
        source=f"file:{resolved_path}",
        version=version,
        metadata=metadata,
    )


def write_report(report: ABTestReport, output_path: Path) -> None:
    """Persist the JSON report to disk."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(dict(report), handle, indent=2)
        _ = handle.write("\n")


def resolve_report_path(output_path: Path | None = None) -> Path:
    """Resolve the JSON output path for an A/B test run."""
    if output_path is None:
        return REPORTS_DIR / f"ab_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    return output_path


def render_console_report(report: ABTestReport) -> str:
    """Render a concise text summary for terminal output."""
    recommendation = report["recommendation"]
    strategy_a = report["strategy_a"]
    strategy_b = report["strategy_b"]
    comparison_summary = report["comparison_summary"]
    differing_examples = report["differing_examples"]
    prompt_comparison = report.get("prompt_comparison")

    lines = [
        "# A/B Test Recommendation",
        "",
        f"- Strategy A: {strategy_a['name']} ({strategy_a['mode']})",
        f"- Strategy B: {strategy_b['name']} ({strategy_b['mode']})",
        f"- Recommendation: {recommendation['choice']}",
        f"- Paired Examples: {comparison_summary['paired_examples']}",
        f"- Differing Examples: {report['differing_examples_count']}",
        "",
        "## Reasons",
        "",
    ]
    lines.extend(f"- {reason}" for reason in recommendation["reasons"])

    # Add prompt comparison section if available
    if prompt_comparison:
        lines.extend([
            "",
            "## Prompt Comparison",
            "",
            f"- Prompt A Accuracy: {prompt_comparison['prompt_a_metrics']['accuracy']:.3f} ({prompt_comparison['prompt_a_metrics']['exact_matches']}/{prompt_comparison['prompt_a_metrics']['total_examples']})",
            f"- Prompt B Accuracy: {prompt_comparison['prompt_b_metrics']['accuracy']:.3f} ({prompt_comparison['prompt_b_metrics']['exact_matches']}/{prompt_comparison['prompt_b_metrics']['total_examples']})",
            f"- Accuracy Delta: {prompt_comparison['accuracy_delta']:.3f} ({prompt_comparison['accuracy_delta_pct']:+.1f}%)",
            f"- Improved Examples: {prompt_comparison['improved_count']}",
            f"- Regressed Examples: {prompt_comparison['regressed_count']}",
        ])

        # Show improved examples
        if prompt_comparison["improved_examples"]:
            lines.extend(["", "### Improved Examples (B better than A)", ""])
            for example in prompt_comparison["improved_examples"][:3]:
                lines.append(
                    "- #{index} {query} | A={a_pred} | B={b_pred}".format(
                        index=example["index"],
                        query=_truncate(str(example["query"]), 60),
                        a_pred=example.get("strategy_a_predicted") or "—",
                        b_pred=example.get("strategy_b_predicted") or "—",
                    )
                )
        # Show regressed examples
        if prompt_comparison["regressed_examples"]:
            lines.extend(["", "### Regressed Examples (A better than B)", ""])
            for example in prompt_comparison["regressed_examples"][:3]:
                lines.append(
                    "- #{index} {query} | A={a_pred} | B={b_pred}".format(
                        index=example["index"],
                        query=_truncate(str(example["query"]), 60),
                        a_pred=example.get("strategy_a_predicted") or "—",
                        b_pred=example.get("strategy_b_predicted") or "—",
                    )
                )
    if differing_examples:
        lines.extend(["", "## Sample Differing Examples", ""])
        for example in differing_examples[:5]:
            lines.append(
                "- #{index} {query} | A={a_url} | B={b_url} | outcome={outcome}".format(
                    index=example["index"],
                    query=_truncate(str(example["query"]), 72),
                    a_url=example["strategy_a_predicted_source_url"] or "—",
                    b_url=example["strategy_b_predicted_source_url"] or "—",
                    outcome=example["outcome"],
                )
            )

    return "\n".join(lines).rstrip() + "\n"

def run_cli(argv: list[str] | None = None) -> int:
    """Run the A/B test CLI."""
    try:
        args = parse_args(argv)
        report = asyncio.run(
            ABTestRunner(
                dataset_path=args.dataset,
                strategy_a_spec=args.strategy_a,
                strategy_b_spec=args.strategy_b,
                prompt_a_path=args.prompt_a,
                prompt_b_path=args.prompt_b,
            ).run_ab_test()
        )
    except (FileNotFoundError, ValueError, json.JSONDecodeError, yaml.YAMLError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    output_path = resolve_report_path(args.output)
    write_report(report, output_path)
    print(render_console_report(report))
    print(f"JSON report: {output_path}")
    return 0
 

def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint."""
    return run_cli(argv)


def _serialize_strategy(strategy: StrategyConfig, summary: BenchmarkSummary) -> StrategyReport:
    prompt_report: PromptReport | None = None
    if strategy.prompt:
        import hashlib

        content_hash = hashlib.md5(strategy.prompt.content.encode()).hexdigest()[:12]
        preview = strategy.prompt.content[:200] + "..." if len(strategy.prompt.content) > 200 else strategy.prompt.content
        prompt_report = PromptReport(
            label=strategy.prompt.label,
            name=strategy.prompt.name,
            version=strategy.prompt.version,
            source=strategy.prompt.source,
            content_hash=content_hash,
            content_preview=preview,
            metadata=strategy.prompt.metadata,
        )

    return StrategyReport(
        label=strategy.label,
        name=strategy.name,
        mode=strategy.mode,
        source=strategy.source,
        cache_dir=str(strategy.cache_dir) if strategy.cache_dir is not None else None,
        llm_model=strategy.llm_model,
        llm_provider=strategy.llm_provider,
        llm_base_url=strategy.llm_base_url,
        llm_api_key_configured=bool(strategy.llm_api_key),
        benchmark_summary=summary,
        prompt=prompt_report,
    )
 


def _load_strategy_from_file(*, label: str, config_path: Path) -> StrategyConfig:
    payload = _load_config_mapping(config_path)
    return _coerce_strategy_config(
        payload,
        label=label,
        source=f"file:{config_path}",
        default_name=config_path.stem,
        base_dir=config_path.parent,
    )


def _load_strategy_from_env(*, label: str, env_prefix: str) -> StrategyConfig:
    payload: dict[str, object] = {
        "name": os.getenv(f"{env_prefix}_NAME") or env_prefix.lower(),
        "mode": os.getenv(f"{env_prefix}_MODE"),
        "cache_dir": os.getenv(f"{env_prefix}_CACHE_DIR"),
        "llm_model": os.getenv(f"{env_prefix}_LLM_MODEL"),
        "llm_provider": os.getenv(f"{env_prefix}_LLM_PROVIDER"),
        "llm_base_url": os.getenv(f"{env_prefix}_LLM_BASE_URL"),
        "llm_api_key": _resolve_api_key(
            direct_value=os.getenv(f"{env_prefix}_LLM_API_KEY"),
            env_var_name=os.getenv(f"{env_prefix}_LLM_API_KEY_ENV"),
        ),
    }
    return _coerce_strategy_config(
        payload,
        label=label,
        source=f"env:{env_prefix}",
        default_name=env_prefix.lower(),
        base_dir=None,
    )


def _load_config_mapping(config_path: Path) -> dict[str, object]:
    if not config_path.exists():
        raise FileNotFoundError(f"strategy config not found: {config_path}")

    raw_text = config_path.read_text(encoding="utf-8")
    if config_path.suffix.lower() == ".json":
        payload = cast(object, json.loads(raw_text))
    else:
        payload = cast(object, yaml.safe_load(raw_text))

    if not isinstance(payload, dict):
        raise ValueError(f"strategy config must be a JSON/YAML object: {config_path}")
    return cast(dict[str, object], payload)


def _coerce_strategy_config(
    payload: dict[str, object],
    *,
    label: str,
    source: str,
    default_name: str,
    base_dir: Path | None,
) -> StrategyConfig:
    mode = _coerce_mode(payload.get("mode"), label=label)
    cache_dir = _coerce_optional_path(payload.get("cache_dir"), base_dir=base_dir)
    llm_model = _coerce_optional_str(payload.get("llm_model")) or "gpt-4o-mini"
    llm_provider = _coerce_optional_str(payload.get("llm_provider")) or "openai"
    llm_base_url = _coerce_optional_str(payload.get("llm_base_url"))
    llm_api_key = _resolve_api_key(
        direct_value=_coerce_optional_str(payload.get("llm_api_key")),
        env_var_name=_coerce_optional_str(payload.get("llm_api_key_env")),
    )
    name = _coerce_optional_str(payload.get("name")) or default_name

    return StrategyConfig(
        label=label,
        name=name,
        mode=mode,
        source=source,
        cache_dir=cache_dir,
        llm_model=llm_model,
        llm_provider=llm_provider,
        llm_base_url=llm_base_url,
        llm_api_key=llm_api_key,
    )


def _coerce_mode(value: object, *, label: str) -> str:
    mode = _coerce_optional_str(value)
    if mode is None:
        raise ValueError(f"strategy {label} is missing required field: mode")

    normalized = mode.lower()
    if normalized not in VALID_MODES:
        raise ValueError(f"strategy {label} mode must be one of {sorted(VALID_MODES)}, got: {mode}")
    return normalized


def _coerce_optional_str(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _coerce_optional_path(value: object, *, base_dir: Path | None) -> Path | None:
    raw_path = _coerce_optional_str(value)
    if raw_path is None:
        return None

    path = Path(raw_path).expanduser()
    if base_dir is not None and not path.is_absolute():
        return base_dir / path
    return path


def _resolve_api_key(*, direct_value: str | None, env_var_name: str | None) -> str | None:
    if direct_value:
        return direct_value
    if env_var_name:
        return os.getenv(env_var_name)
    return None


def _default_env_prefix(label: str) -> str:
    if label == "A":
        return DEFAULT_STRATEGY_A_ENV_PREFIX
    return DEFAULT_STRATEGY_B_ENV_PREFIX


def _result_key(row: BenchmarkResultRow) -> tuple[int, str, str]:
    return int(row["index"]), str(row["query"]), str(row["expected_source_url"])


def _predicted_url(row: BenchmarkResultRow) -> str | None:
    predicted = row.get("predicted_source_url")
    return str(predicted) if predicted else None


def _error_value(row: BenchmarkResultRow) -> str | None:
    error = row.get("error")
    return str(error) if error else None


def _classify_difference(row_a: BenchmarkResultRow, row_b: BenchmarkResultRow) -> str:
    if bool(row_a["exact_match"]) and not bool(row_b["exact_match"]):
        return "strategy_a_only_correct"
    if bool(row_b["exact_match"]) and not bool(row_a["exact_match"]):
        return "strategy_b_only_correct"
    if _predicted_url(row_a) != _predicted_url(row_b):
        return "different_url_choice"
    if _error_value(row_a) != _error_value(row_b):
        return "different_error"
    return "different_result"


def _truncate(value: str, limit: int) -> str:
    normalized = " ".join(value.split())
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 1].rstrip() + "…"


if __name__ == "__main__":
    raise SystemExit(main())
