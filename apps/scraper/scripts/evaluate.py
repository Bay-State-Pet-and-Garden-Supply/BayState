#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import cast

from scrapers.ai_search.scraper import AISearchScraper
from tests.evaluation.cost_tracker import EvaluationCostReport, EvaluationCostTracker
from tests.evaluation.metrics_calculator import calculate_per_sku_metrics
from tests.evaluation.ground_truth_loader import load_ground_truth
from tests.evaluation.report_generator import generate_evaluation_report
from tests.evaluation.types import EvaluationResult, FieldComparison, GroundTruthProduct


DEFAULT_OUTPUT_DIR = Path(".sisyphus/evidence/evaluation")
DEFAULT_MODEL = "gpt-4o-mini"


@dataclass(frozen=True)
class RunConfiguration:
    prompt_version: str
    skus: list[str] | None
    output_dir: Path
    report_format: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the AI extraction evaluation pipeline")
    _ = parser.add_argument(
        "--prompt-version",
        default="v1",
        help="Prompt version for Crawl4AI extraction (default: v1)",
    )
    _ = parser.add_argument(
        "--skus",
        help="Comma-separated SKU list to evaluate (default: all ground truth SKUs)",
    )
    _ = parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory where reports are written",
    )
    _ = parser.add_argument(
        "--format",
        choices=("json", "markdown", "both"),
        default="both",
        help="Report format to keep (default: both)",
    )
    return parser.parse_args()


def _parse_requested_skus(raw_skus: str | None) -> list[str] | None:
    if raw_skus is None:
        return None

    parsed = [sku.strip() for sku in raw_skus.split(",") if sku.strip()]
    if not parsed:
        raise ValueError("--skus was provided but no valid SKUs were found")
    return parsed


def _build_configuration(args: argparse.Namespace) -> RunConfiguration:
    prompt_version = str(getattr(args, "prompt_version", "v1")).strip() or "v1"
    raw_skus = cast(str | None, getattr(args, "skus", None))
    output_dir = Path(str(getattr(args, "output_dir", DEFAULT_OUTPUT_DIR)))
    report_format = str(getattr(args, "format", "both"))

    return RunConfiguration(
        prompt_version=prompt_version,
        skus=_parse_requested_skus(raw_skus),
        output_dir=output_dir,
        report_format=report_format,
    )


def _select_ground_truth_products(config: RunConfiguration) -> list[GroundTruthProduct]:
    products = load_ground_truth()
    if config.skus is None:
        return products

    product_by_sku = {product.sku: product for product in products}
    missing_skus = [sku for sku in config.skus if sku not in product_by_sku]
    if missing_skus:
        missing_str = ", ".join(missing_skus)
        raise ValueError(f"Requested SKUs not found in ground truth: {missing_str}")

    return [product_by_sku[sku] for sku in config.skus]


def _estimate_tokens_from_cost(cost_usd: float, model: str) -> int:
    pricing = EvaluationCostTracker.MODEL_PRICING.get(model.lower())
    if not pricing or cost_usd <= 0:
        return 0
    return max(1, round((cost_usd / pricing) * 1000))


def _track_cost(
    tracker: EvaluationCostTracker,
    *,
    search_performed: bool,
    extraction_cost_usd: float,
    model: str,
) -> None:
    if search_performed:
        _ = tracker.add_search_call()

    estimated_tokens = _estimate_tokens_from_cost(extraction_cost_usd, model)
    if estimated_tokens > 0:
        _ = tracker.add_llm_call(tokens=estimated_tokens, model=model)


async def _evaluate_product(
    product: GroundTruthProduct,
    *,
    prompt_version: str,
    cost_tracker: EvaluationCostTracker,
) -> EvaluationResult:
    start = perf_counter()
    scraper = AISearchScraper(prompt_version=prompt_version)

    try:
        extraction = await scraper.scrape_product(
            sku=product.sku,
            product_name=product.name,
            brand=product.brand,
            category=product.categories[0] if product.categories else None,
        )
        elapsed_ms = (perf_counter() - start) * 1000
        _track_cost(
            cost_tracker,
            search_performed=True,
            extraction_cost_usd=float(extraction.cost_usd),
            model=DEFAULT_MODEL,
        )

        if not extraction.success:
            return EvaluationResult(
                sku=product.sku,
                success=False,
                field_comparisons=[],
                accuracy=0.0,
                cost=float(extraction.cost_usd),
                error_message=extraction.error or "Extraction failed",
                extraction_time_ms=elapsed_ms,
            )

        sku_metrics = calculate_per_sku_metrics(extraction, product)
        return EvaluationResult(
            sku=product.sku,
            success=True,
            field_comparisons=cast(list[FieldComparison], sku_metrics.field_comparisons),
            accuracy=float(sku_metrics.field_accuracy),
            cost=float(extraction.cost_usd),
            extraction_time_ms=elapsed_ms,
        )
    except Exception as exc:
        elapsed_ms = (perf_counter() - start) * 1000
        return EvaluationResult(
            sku=product.sku,
            success=False,
            field_comparisons=[],
            accuracy=0.0,
            cost=0.0,
            error_message=str(exc),
            extraction_time_ms=elapsed_ms,
        )


def _finalize_cost_report(tracker: EvaluationCostTracker, results: list[EvaluationResult]) -> EvaluationCostReport:
    report = tracker.get_report()
    report.success_count = sum(1 for result in results if result.success)
    report.cost_per_success_usd = tracker.cost_per_success(report.success_count)
    return report


def _prune_report_files(report_format: str, json_path: Path, markdown_path: Path) -> list[Path]:
    kept_paths: list[Path] = []

    if report_format in {"json", "both"}:
        kept_paths.append(json_path)
    elif json_path.exists():
        if markdown_path.exists():
            markdown_content = markdown_path.read_text(encoding="utf-8")
            markdown_content = markdown_content.replace(f"\nRaw JSON: `{json_path.name}`", "")
            _ = markdown_path.write_text(markdown_content, encoding="utf-8")
        _ = json_path.unlink()

    if report_format in {"markdown", "both"}:
        kept_paths.append(markdown_path)
    elif markdown_path.exists():
        _ = markdown_path.unlink()

    return kept_paths


def _print_summary(results: list[EvaluationResult], cost_report: EvaluationCostReport) -> None:
    total_results = len(results)
    success_count = sum(1 for result in results if result.success)
    pass_count = sum(1 for result in results if result.passed)
    overall_accuracy = sum(result.accuracy for result in results) / total_results if total_results else 0.0

    print("\nEvaluation summary")
    print(f"- Accuracy: {overall_accuracy:.1%}")
    print(f"- Success rate: {success_count / total_results:.1%}" if total_results else "- Success rate: 0.0%")
    print(f"- Pass rate: {pass_count / total_results:.1%}" if total_results else "- Pass rate: 0.0%")
    print(f"- Total cost: ${cost_report.total_cost_usd:.4f}")
    print(f"- Cost per success: ${cost_report.cost_per_success_usd:.4f}")


async def run_evaluation(config: RunConfiguration) -> int:
    products = _select_ground_truth_products(config)
    if not products:
        raise ValueError("No ground truth SKUs available for evaluation")

    print(f"Loaded {len(products)} ground truth SKU(s)")
    print(f"Prompt version: {config.prompt_version}")
    print(f"Report output: {config.output_dir}")

    cost_tracker = EvaluationCostTracker()
    results: list[EvaluationResult] = []

    for index, product in enumerate(products, start=1):
        print(f"Testing SKU {index}/{len(products)}: {product.sku}...")
        result = await _evaluate_product(
            product,
            prompt_version=config.prompt_version,
            cost_tracker=cost_tracker,
        )
        results.append(result)

        status = "ok" if result.success else "failed"
        line = f"  -> {status} | accuracy={result.accuracy:.1%} | cost=${result.cost:.4f}"
        if result.error_message:
            line = f"{line} | error={result.error_message}"
        print(line)

    report = generate_evaluation_report(
        results=results,
        prompt_version=config.prompt_version,
        output_dir=config.output_dir,
    )
    kept_reports = _prune_report_files(config.report_format, report.json_path, report.markdown_path)
    cost_report = _finalize_cost_report(cost_tracker, results)

    _print_summary(results, cost_report)
    print("Generated report files:")
    for path in kept_reports:
        print(f"- {path}")

    had_failures = any(not result.success for result in results)
    return 1 if had_failures else 0


def main() -> int:
    try:
        args = parse_args()
        config = _build_configuration(args)
        return asyncio.run(run_evaluation(config))
    except KeyboardInterrupt:
        print("Evaluation interrupted", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Evaluation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
