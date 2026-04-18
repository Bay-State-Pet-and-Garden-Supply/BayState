#!/usr/bin/env python3
from __future__ import annotations

import json
import hashlib
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import cast

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
for import_root in (PROJECT_ROOT, SRC_ROOT):
    if str(import_root) not in sys.path:
        _ = sys.path.insert(0, str(import_root))

from scrapers.ai_search.models import AISearchResult
from tests.evaluation.baseline_comparator import compare as compare_against_baseline
from tests.evaluation.field_comparator import compare_field
from tests.evaluation.ground_truth_loader import load_ground_truth
from tests.evaluation.metrics_calculator import (
    SKUMetrics,
    calculate_aggregate_metrics,
    calculate_per_sku_metrics,
    get_per_field_accuracy,
)
from tests.evaluation.types import GroundTruthProduct


OUTPUT_DIR = PROJECT_ROOT / ".sisyphus" / "evidence" / "demo-workflow"
PROMPT_V1_PATH = PROJECT_ROOT / "prompts" / "extraction_v1.txt"
PROMPT_V2_PATH = PROJECT_ROOT / "prompts" / "extraction_v2.txt"


@dataclass(frozen=True)
class SimulationSummary:
    prompt_version: str
    sku_metrics: list[SKUMetrics]
    per_field_accuracy: dict[str, float]
    average_field_accuracy: float
    required_success_rate: float
    overall_success_rate: float
    mean_cost_usd: float
    total_cost_usd: float
    mean_latency_ms: float
    total_cost_for_1000_skus_usd: float
    price_accuracy: float
    availability_accuracy: float
    price_cost_per_correct: float
    availability_cost_per_correct: float


@dataclass(frozen=True)
class PromptDiffSummary:
    overlap_score: float
    added_focus_areas: list[str]
    removed_focus_areas: list[str]
    expected_improvements: list[str]


def _stable_roll(*parts: str) -> float:
    digest = hashlib.sha256("::".join(parts).encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") / float(2**64)


def _parse_prompt_focus_areas(prompt_text: str) -> list[str]:
    areas: list[str] = []
    for line in prompt_text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            continue
        if stripped[0].isdigit() and ")" in stripped:
            _, _, suffix = stripped.partition(")")
            label = suffix.strip().casefold()
            if label:
                areas.append(label)
    return areas


def _compare_prompt_versions(v1_text: str, v2_text: str) -> PromptDiffSummary:
    # Step 2: compare prompts using the shared field comparator for text similarity.
    overlap = compare_field("prompt_text", v1_text, v2_text)
    v1_focus = set(_parse_prompt_focus_areas(v1_text))
    v2_focus = set(_parse_prompt_focus_areas(v2_text))
    added = sorted(v2_focus - v1_focus)
    removed = sorted(v1_focus - v2_focus)

    expected = [
        "Price and availability should improve due to explicit normalization rules.",
        "Image precision should improve from stricter variant and URL requirements.",
        "Description completeness should improve from stronger quality guidance.",
    ]

    return PromptDiffSummary(
        overlap_score=overlap.match_score,
        added_focus_areas=added,
        removed_focus_areas=removed,
        expected_improvements=expected,
    )


def _degrade_text(value: str | None, sku: str, field_name: str) -> str | None:
    if value is None:
        return None
    roll = _stable_roll(sku, field_name, "degrade_text")
    if roll < 0.33:
        return None
    if roll < 0.66:
        tokens = value.split()
        return " ".join(tokens[: max(1, len(tokens) // 2)])
    return f"{value} (variant uncertain)"


def _degrade_list(values: list[str], sku: str, field_name: str) -> list[str]:
    roll = _stable_roll(sku, field_name, "degrade_list")
    if roll < 0.4:
        return []
    if roll < 0.8:
        return values[:1]
    return [f"{values[0]}?candidate=true"] if values else []


def _simulate_extraction(
    *,
    sku: str,
    prompt_version: str,
    field_quality: dict[str, float],
    price_quality: float,
    availability_quality: float,
    ground_truth: GroundTruthProduct,
) -> tuple[AISearchResult, float, float, bool, bool]:
    # Step 3: generate realistic synthetic extraction output for each SKU.
    def keep(field_name: str) -> bool:
        return _stable_roll(sku, field_name, "keep") <= field_quality[field_name]

    product_name = ground_truth.name if keep("product_name") else _degrade_text(ground_truth.name, sku, "product_name")
    brand = ground_truth.brand if keep("brand") else _degrade_text(ground_truth.brand, sku, "brand")
    description = ground_truth.description if keep("description") else _degrade_text(ground_truth.description, sku, "description")

    if keep("size_metrics"):
        size_metrics = str(ground_truth.size_metrics) if ground_truth.size_metrics is not None else None
    else:
        size_metrics = _degrade_text(str(ground_truth.size_metrics) if ground_truth.size_metrics is not None else None, sku, "size_metrics")

    images = list(ground_truth.images) if keep("images") else _degrade_list(list(ground_truth.images), sku, "images")
    categories = list(ground_truth.categories) if keep("categories") else _degrade_list(list(ground_truth.categories), sku, "categories")

    base_cost = 0.012 if prompt_version == "v1" else 0.015
    variance_cost = _stable_roll(sku, prompt_version, "cost") * 0.004
    cost_usd = round(base_cost + variance_cost, 4)

    base_latency = 1850 if prompt_version == "v1" else 2150
    variance_latency = _stable_roll(sku, prompt_version, "latency") * 700
    latency_ms = round(base_latency + variance_latency, 2)

    price_correct = _stable_roll(sku, "price") <= price_quality
    availability_correct = _stable_roll(sku, "availability") <= availability_quality

    confidence = 0.72 if prompt_version == "v1" else 0.84
    confidence += (_stable_roll(sku, prompt_version, "confidence") - 0.5) * 0.2

    extraction = AISearchResult(
        success=True,
        sku=sku,
        product_name=product_name,
        brand=brand,
        description=description,
        size_metrics=size_metrics,
        images=images,
        categories=categories,
        confidence=max(0.0, min(1.0, confidence)),
        cost_usd=cost_usd,
    )
    return extraction, cost_usd, latency_ms, price_correct, availability_correct


def _summarize_simulation(
    *,
    prompt_version: str,
    skus: list[GroundTruthProduct],
    field_quality: dict[str, float],
    price_quality: float,
    availability_quality: float,
) -> SimulationSummary:
    sku_metrics: list[SKUMetrics] = []
    costs: list[float] = []
    latencies: list[float] = []
    price_hits = 0
    availability_hits = 0

    for product in skus:
        extraction, cost_usd, latency_ms, price_correct, availability_correct = _simulate_extraction(
            sku=product.sku,
            prompt_version=prompt_version,
            field_quality=field_quality,
            price_quality=price_quality,
            availability_quality=availability_quality,
            ground_truth=product,
        )
        sku_metrics.append(calculate_per_sku_metrics(extraction, product))
        costs.append(cost_usd)
        latencies.append(latency_ms)
        price_hits += int(price_correct)
        availability_hits += int(availability_correct)

    aggregate = calculate_aggregate_metrics(sku_metrics)
    per_field_accuracy = get_per_field_accuracy(sku_metrics)
    total_cost = sum(costs)
    mean_cost = total_cost / len(costs)
    mean_latency = sum(latencies) / len(latencies)
    price_accuracy = price_hits / len(skus)
    availability_accuracy = availability_hits / len(skus)

    return SimulationSummary(
        prompt_version=prompt_version,
        sku_metrics=sku_metrics,
        per_field_accuracy=per_field_accuracy,
        average_field_accuracy=aggregate.average_field_accuracy,
        required_success_rate=aggregate.average_required_fields_success_rate,
        overall_success_rate=aggregate.overall_success_rate,
        mean_cost_usd=mean_cost,
        total_cost_usd=total_cost,
        mean_latency_ms=mean_latency,
        total_cost_for_1000_skus_usd=mean_cost * 1000,
        price_accuracy=price_accuracy,
        availability_accuracy=availability_accuracy,
        price_cost_per_correct=(total_cost / max(1, price_hits)),
        availability_cost_per_correct=(total_cost / max(1, availability_hits)),
    )


def _paired_significance(v1: SimulationSummary, v2: SimulationSummary) -> dict[str, float | int | bool]:
    # Step 5: paired A/B test significance from per-SKU field accuracy deltas.
    wins = 0
    losses = 0
    ties = 0
    for m1, m2 in zip(v1.sku_metrics, v2.sku_metrics, strict=True):
        delta = m2.field_accuracy - m1.field_accuracy
        if delta > 0:
            wins += 1
        elif delta < 0:
            losses += 1
        else:
            ties += 1

    trials = wins + losses
    if trials == 0:
        p_value = 1.0
    else:
        tail = min(wins, losses)
        cumulative = 0
        for k in range(0, tail + 1):
            cumulative += _combination(trials, k)
        p_value = min(1.0, 2.0 * (cumulative / (1 << trials)))

    return {
        "wins": wins,
        "losses": losses,
        "ties": ties,
        "p_value": p_value,
        "is_significant_95": p_value < 0.05,
    }


def _combination(n: int, k: int) -> int:
    if k < 0 or k > n:
        return 0
    k = min(k, n - k)
    result = 1
    for i in range(1, k + 1):
        result = (result * (n - (k - i))) // i
    return result


def _build_pattern_analysis(v1: SimulationSummary, v2: SimulationSummary) -> dict[str, object]:
    # Step 4: identify persistent weak fields and largest gains.
    field_deltas: dict[str, float] = {}
    weak_fields_v2: list[str] = []
    for field_name, v2_score in v2.per_field_accuracy.items():
        v1_score = v1.per_field_accuracy.get(field_name, 0.0)
        field_deltas[field_name] = v2_score - v1_score
        if v2_score < 0.8:
            weak_fields_v2.append(field_name)

    sorted_improvements = sorted(field_deltas.items(), key=lambda item: item[1], reverse=True)
    sorted_regressions = sorted(field_deltas.items(), key=lambda item: item[1])

    return {
        "largest_improvements": sorted_improvements[:3],
        "largest_regressions": [item for item in sorted_regressions if item[1] < 0][:2],
        "still_weak_in_v2": weak_fields_v2,
        "v2_required_field_gaps": sum(1 for metric in v2.sku_metrics for _ in metric.missing_required_fields),
    }


def _create_recommendations(
    *,
    v1: SimulationSummary,
    v2: SimulationSummary,
    field_deltas: dict[str, float],
    significance: dict[str, float | int | bool],
) -> list[str]:
    # Step 6: convert observed outcomes into practical finetuning next steps.
    recommendations = [
        "Promote v2 to controlled rollout (20%-30% traffic) with guardrails on required fields.",
        "Launch a focused finetuning dataset for categories/size_metrics where v2 still underperforms.",
        "Add extraction-time checks that reject outputs missing product_name, brand, or images.",
        "Track cost per correct field weekly, not just total spend, to avoid expensive regressions.",
    ]

    if float(significance["p_value"]) >= 0.05:
        recommendations[0] = "Keep v2 in A/B testing until significance clears 95% confidence."

    if field_deltas.get("images", 0.0) < 0.2:
        recommendations.append("Create image-focused negative examples; gains are below target for vision-critical fields.")

    cost_change = v2.total_cost_for_1000_skus_usd - v1.total_cost_for_1000_skus_usd
    if cost_change > 2.0:
        recommendations.append("Enable dynamic prompt compaction for low-risk SKUs to reduce v2 token overhead.")

    return recommendations


def _build_example_experiment(v2: SimulationSummary, weak_fields: list[str]) -> dict[str, object]:
    return {
        "experiment_name": "exp_v3_field_recovery",
        "hypothesis": "Adding schema-anchored examples for weak fields improves residual error without increasing cost >10%.",
        "target_fields": weak_fields or ["categories", "size_metrics"],
        "sku_sample_size": len(v2.sku_metrics),
        "success_criteria": {
            "min_field_lift": 0.08,
            "max_cost_increase_pct": 10,
            "min_confidence_level": 0.95,
        },
        "rollout_plan": [
            "Run offline replay against 10 ground-truth SKUs.",
            "Run 50/50 A/B for 200 live SKUs.",
            "Merge only if lift and cost criteria are both met.",
        ],
    }


def _write_artifacts(*, report_md: str, report_json: object) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    markdown_path = OUTPUT_DIR / "finetuning_demo_report.md"
    json_path = OUTPUT_DIR / "finetuning_demo_report.json"
    _ = markdown_path.write_text(report_md, encoding="utf-8")
    _ = json_path.write_text(json.dumps(report_json, indent=2), encoding="utf-8")


def _format_pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def _extract_string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    for item in cast(list[object], value):
        normalized.append(str(item))
    return normalized


def main() -> int:
    # Step 1: load and display the 10 ground truth products.
    products = load_ground_truth()
    if len(products) != 10:
        raise ValueError(f"Expected 10 ground truth SKUs for this demo, found {len(products)}")

    prompt_v1 = PROMPT_V1_PATH.read_text(encoding="utf-8")
    prompt_v2 = PROMPT_V2_PATH.read_text(encoding="utf-8")
    prompt_diff = _compare_prompt_versions(prompt_v1, prompt_v2)

    v1_field_quality = {
        "product_name": 0.72,
        "brand": 0.95,
        "images": 0.36,
        "description": 0.60,
        "size_metrics": 0.54,
        "categories": 0.56,
    }
    v2_field_quality = {
        "product_name": 0.87,
        "brand": 0.96,
        "images": 0.83,
        "description": 0.80,
        "size_metrics": 0.58,
        "categories": 0.60,
    }

    v1_summary = _summarize_simulation(
        prompt_version="v1",
        skus=products,
        field_quality=v1_field_quality,
        price_quality=0.25,
        availability_quality=0.40,
    )
    v2_summary = _summarize_simulation(
        prompt_version="v2",
        skus=products,
        field_quality=v2_field_quality,
        price_quality=0.80,
        availability_quality=0.84,
    )

    significance = _paired_significance(v1_summary, v2_summary)
    pattern_analysis = _build_pattern_analysis(v1_summary, v2_summary)

    baseline_module_result = compare_against_baseline(
        baseline="v1",
        challenger="v2",
        skus=[product.sku for product in products],
        confidence_level=0.95,
    )

    field_deltas = {
        field: v2_summary.per_field_accuracy.get(field, 0.0) - v1_summary.per_field_accuracy.get(field, 0.0)
        for field in sorted(set(v1_summary.per_field_accuracy) | set(v2_summary.per_field_accuracy))
    }

    recommendations = _create_recommendations(
        v1=v1_summary,
        v2=v2_summary,
        field_deltas=field_deltas,
        significance=significance,
    )
    weak_fields = _extract_string_list(pattern_analysis.get("still_weak_in_v2", []))
    example_experiment = _build_example_experiment(v2_summary, weak_fields)

    improved_fields = [field for field, delta in sorted(field_deltas.items(), key=lambda item: item[1], reverse=True) if delta > 0]

    report_json = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ground_truth_skus": [{"sku": product.sku, "brand": product.brand, "name": product.name} for product in products],
        "prompt_diff": asdict(prompt_diff),
        "simulated_results": {
            "v1": {
                "average_field_accuracy": v1_summary.average_field_accuracy,
                "required_success_rate": v1_summary.required_success_rate,
                "overall_success_rate": v1_summary.overall_success_rate,
                "price_accuracy": v1_summary.price_accuracy,
                "availability_accuracy": v1_summary.availability_accuracy,
                "cost": {
                    "mean_cost_usd": v1_summary.mean_cost_usd,
                    "total_cost_usd": v1_summary.total_cost_usd,
                    "projected_1k_skus_usd": v1_summary.total_cost_for_1000_skus_usd,
                    "price_cost_per_correct": v1_summary.price_cost_per_correct,
                    "availability_cost_per_correct": v1_summary.availability_cost_per_correct,
                },
                "mean_latency_ms": v1_summary.mean_latency_ms,
                "per_field_accuracy": v1_summary.per_field_accuracy,
            },
            "v2": {
                "average_field_accuracy": v2_summary.average_field_accuracy,
                "required_success_rate": v2_summary.required_success_rate,
                "overall_success_rate": v2_summary.overall_success_rate,
                "price_accuracy": v2_summary.price_accuracy,
                "availability_accuracy": v2_summary.availability_accuracy,
                "cost": {
                    "mean_cost_usd": v2_summary.mean_cost_usd,
                    "total_cost_usd": v2_summary.total_cost_usd,
                    "projected_1k_skus_usd": v2_summary.total_cost_for_1000_skus_usd,
                    "price_cost_per_correct": v2_summary.price_cost_per_correct,
                    "availability_cost_per_correct": v2_summary.availability_cost_per_correct,
                },
                "mean_latency_ms": v2_summary.mean_latency_ms,
                "per_field_accuracy": v2_summary.per_field_accuracy,
            },
        },
        "ab_test": {
            "wins": significance["wins"],
            "losses": significance["losses"],
            "ties": significance["ties"],
            "p_value": significance["p_value"],
            "significant_at_95": significance["is_significant_95"],
            "baseline_module_reference": {
                "improvement": baseline_module_result.improvement,
                "p_value": baseline_module_result.p_value,
                "wins": baseline_module_result.wins,
                "losses": baseline_module_result.losses,
                "ties": baseline_module_result.ties,
                "recommendation": baseline_module_result.recommendation,
            },
        },
        "pattern_analysis": pattern_analysis,
        "improved_fields": improved_fields,
        "recommendations": recommendations,
        "example_experiment": example_experiment,
    }

    report_md = "\n".join(
        [
            "# AI Scraper Finetuning Demo Workflow",
            "",
            "This report demonstrates the full finetuning workflow from prompt analysis through A/B recommendation using simulated, realistic extraction outcomes.",
            "",
            "## 1) Ground Truth Products (10 Test SKUs)",
            "",
            *[f"- `{product.sku}` | {product.brand} | {product.name}" for product in products],
            "",
            "## 2) Prompt Comparison (v1 vs v2)",
            "",
            f"- Text overlap score: {prompt_diff.overlap_score:.2%}",
            f"- Added focus areas: {', '.join(prompt_diff.added_focus_areas) if prompt_diff.added_focus_areas else 'none'}",
            f"- Removed focus areas: {', '.join(prompt_diff.removed_focus_areas) if prompt_diff.removed_focus_areas else 'none'}",
            *[f"- Expected impact: {line}" for line in prompt_diff.expected_improvements],
            "",
            "## 3) Simulated Evaluation Results",
            "",
            f"- v1 average field accuracy: {_format_pct(v1_summary.average_field_accuracy)}",
            f"- v2 average field accuracy: {_format_pct(v2_summary.average_field_accuracy)}",
            f"- v1 required field success: {_format_pct(v1_summary.required_success_rate)}",
            f"- v2 required field success: {_format_pct(v2_summary.required_success_rate)}",
            f"- v1 price/availability accuracy: {_format_pct(v1_summary.price_accuracy)} / {_format_pct(v1_summary.availability_accuracy)}",
            f"- v2 price/availability accuracy: {_format_pct(v2_summary.price_accuracy)} / {_format_pct(v2_summary.availability_accuracy)}",
            "",
            "## 4) Pattern Analysis",
            "",
            f"- Largest improvements: {pattern_analysis['largest_improvements']}",
            f"- Largest regressions: {pattern_analysis['largest_regressions'] if pattern_analysis['largest_regressions'] else 'none'}",
            f"- Still weak in v2 (<80%): {pattern_analysis['still_weak_in_v2'] if pattern_analysis['still_weak_in_v2'] else 'none'}",
            f"- Required-field gaps in v2: {pattern_analysis['v2_required_field_gaps']}",
            "",
            "## 5) A/B Test Comparison",
            "",
            f"- Wins/Losses/Ties (v2 vs v1): {significance['wins']} / {significance['losses']} / {significance['ties']}",
            f"- Sign test p-value: {float(significance['p_value']):.6f}",
            f"- Statistically significant at 95%: {'yes' if significance['is_significant_95'] else 'no'}",
            f"- Baseline comparator recommendation: {baseline_module_result.recommendation}",
            "",
            "## 6) Cost Analysis",
            "",
            f"- v1 projected cost / 1,000 SKUs: ${v1_summary.total_cost_for_1000_skus_usd:.2f}",
            f"- v2 projected cost / 1,000 SKUs: ${v2_summary.total_cost_for_1000_skus_usd:.2f}",
            f"- v1 cost per correct price: ${v1_summary.price_cost_per_correct:.3f}",
            f"- v2 cost per correct price: ${v2_summary.price_cost_per_correct:.3f}",
            f"- v1 mean latency: {v1_summary.mean_latency_ms:.1f} ms",
            f"- v2 mean latency: {v2_summary.mean_latency_ms:.1f} ms",
            "",
            "## 7) Recommended Next Steps",
            "",
            *[f"- {item}" for item in recommendations],
            "",
            "## 8) Example Experiment To Create",
            "",
            "```json",
            json.dumps(example_experiment, indent=2),
            "```",
            "",
            "## 9) Fields Improved",
            "",
            *[f"- {field}: {(delta * 100):+.1f} percentage points" for field, delta in sorted(field_deltas.items(), key=lambda item: item[1], reverse=True)],
        ]
    )

    _write_artifacts(report_md=report_md, report_json=report_json)

    print("AI Scraper finetuning demo complete")
    print(f"Artifacts written to: {OUTPUT_DIR}")
    print(f"v1 -> v2 field accuracy: {_format_pct(v1_summary.average_field_accuracy)} -> {_format_pct(v2_summary.average_field_accuracy)}")
    print(f"A/B significance p-value: {float(significance['p_value']):.6f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
