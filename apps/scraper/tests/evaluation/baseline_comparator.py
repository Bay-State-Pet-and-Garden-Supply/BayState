# pyright: reportUnknownVariableType=false, reportUnknownArgumentType=false, reportUnknownMemberType=false
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

from scrapers.ai_search.models import AISearchResult
from tests.evaluation.ground_truth_loader import get_ground_truth
from tests.evaluation.metrics_calculator import SKUMetrics
from tests.evaluation.metrics_calculator import calculate_per_sku_metrics
from tests.evaluation.metrics_calculator import get_per_field_accuracy
from tests.evaluation.types import GroundTruthProduct


WORKSPACE_ROOT = Path(__file__).resolve().parents[4]
BASELINE_CACHE_DIR = WORKSPACE_ROOT / ".sisyphus" / "evidence" / "baselines"


@dataclass(frozen=True)
class BaselineComparison:
    baseline_version: str
    challenger_version: str
    baseline_accuracy: float
    challenger_accuracy: float
    improvement: float
    is_significant: bool
    recommendation: str
    per_field_deltas: dict[str, float] = field(default_factory=dict)
    baseline_per_field: dict[str, float] = field(default_factory=dict)
    challenger_per_field: dict[str, float] = field(default_factory=dict)
    p_value: float | None = None
    confidence_level: float | None = 0.95
    wins: int = 0
    losses: int = 0
    ties: int = 0


def _quality_for_version(version: str) -> float:
    digest = hashlib.sha256(version.encode("utf-8")).digest()
    return 0.68 + (digest[0] / 255.0) * 0.26


def _stable_score(*parts: str) -> float:
    joined = "::".join(parts)
    digest = hashlib.sha256(joined.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") / float(2**32)


def _cache_key(version: str, skus: list[str]) -> str:
    sku_fingerprint = hashlib.sha256("|".join(skus).encode("utf-8")).hexdigest()[:12]
    safe_version = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in version)
    return f"{safe_version}_{sku_fingerprint}.json"


def _serialize_cache_payload(
    version: str,
    skus: list[str],
    accuracy: float,
    per_field_accuracy: dict[str, float],
    per_sku_accuracy: list[float],
) -> str:
    serialized_fields = ";".join(f"{field}={value:.12f}" for field, value in sorted(per_field_accuracy.items()))
    serialized_per_sku = ",".join(f"{value:.12f}" for value in per_sku_accuracy)
    serialized_skus = ",".join(skus)
    return "\n".join(
        [
            f"version={version}",
            f"skus={serialized_skus}",
            f"accuracy={accuracy:.12f}",
            f"per_field={serialized_fields}",
            f"per_sku={serialized_per_sku}",
        ]
    )


def _parse_cache_payload(payload: str, cache_path: Path) -> tuple[str, list[str], float, dict[str, float], list[float]]:
    values: dict[str, str] = {}
    for raw_line in payload.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if "=" not in line:
            raise ValueError(f"invalid baseline cache line in {cache_path}: {line}")
        key, raw_value = line.split("=", 1)
        values[key.strip()] = raw_value.strip()

    required_keys = {"version", "skus", "accuracy", "per_field", "per_sku"}
    missing_keys = required_keys - set(values)
    if missing_keys:
        raise ValueError(f"missing keys in baseline cache {cache_path}: {sorted(missing_keys)}")

    parsed_version = values["version"]
    parsed_skus = [item for item in values["skus"].split(",") if item]
    parsed_accuracy = float(values["accuracy"])

    parsed_per_field: dict[str, float] = {}
    if values["per_field"]:
        for field_entry in values["per_field"].split(";"):
            if not field_entry:
                continue
            if "=" not in field_entry:
                raise ValueError(f"invalid per_field entry in baseline cache {cache_path}: {field_entry}")
            field_name, field_value = field_entry.split("=", 1)
            parsed_per_field[field_name] = float(field_value)

    parsed_per_sku: list[float] = []
    if values["per_sku"]:
        for token in values["per_sku"].split(","):
            if token:
                parsed_per_sku.append(float(token))

    return parsed_version, parsed_skus, parsed_accuracy, parsed_per_field, parsed_per_sku


def _build_synthetic_extraction(version: str, ground_truth: GroundTruthProduct) -> AISearchResult:
    quality = _quality_for_version(version)
    sku = ground_truth.sku

    def maybe_keep_scalar(field_name: str, value: str | None) -> str | None:
        keep_probability = quality
        roll = _stable_score(version, sku, field_name)
        if roll <= keep_probability:
            return value
        return None

    def maybe_keep_list(field_name: str, value: list[str]) -> list[str]:
        keep_probability = quality
        roll = _stable_score(version, sku, field_name)
        if roll <= keep_probability:
            return value
        return []

    return AISearchResult(
        success=True,
        sku=sku,
        product_name=maybe_keep_scalar("product_name", ground_truth.name),
        brand=maybe_keep_scalar("brand", ground_truth.brand),
        description=maybe_keep_scalar("description", ground_truth.description),
        size_metrics=maybe_keep_scalar("size_metrics", str(ground_truth.size_metrics) if ground_truth.size_metrics is not None else None),
        images=maybe_keep_list("images", ground_truth.images),
        categories=maybe_keep_list("categories", ground_truth.categories),
        confidence=quality,
    )


def _run_evaluation(version: str, skus: list[str]) -> tuple[float, dict[str, float], list[float]]:
    sku_metrics: list[SKUMetrics] = []

    for sku in skus:
        ground_truth = get_ground_truth(sku)
        if ground_truth is None:
            raise ValueError(f"ground truth not found for sku: {sku}")

        extraction = _build_synthetic_extraction(version=version, ground_truth=ground_truth)
        sku_metrics.append(calculate_per_sku_metrics(extraction, ground_truth))

    per_sku_accuracy = [metric.field_accuracy for metric in sku_metrics]
    average_accuracy = sum(per_sku_accuracy) / len(per_sku_accuracy) if per_sku_accuracy else 0.0
    per_field_accuracy = get_per_field_accuracy(sku_metrics)
    return average_accuracy, per_field_accuracy, per_sku_accuracy


def _load_or_create_baseline(version: str, skus: list[str]) -> tuple[float, dict[str, float], list[float]]:
    BASELINE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = BASELINE_CACHE_DIR / _cache_key(version, skus)

    if cache_path.exists():
        parsed_version, cached_skus, cached_accuracy, cached_per_field, cached_per_sku = _parse_cache_payload(
            cache_path.read_text(encoding="utf-8"),
            cache_path,
        )
        if parsed_version != version:
            raise ValueError("cached baseline version does not match requested baseline version")
        if cached_skus != skus:
            raise ValueError("cached baseline sku set does not match requested sku set")
        return cached_accuracy, cached_per_field, cached_per_sku

    accuracy, per_field_accuracy, per_sku_accuracy = _run_evaluation(version, skus)
    payload = _serialize_cache_payload(
        version=version,
        skus=skus,
        accuracy=accuracy,
        per_field_accuracy=per_field_accuracy,
        per_sku_accuracy=per_sku_accuracy,
    )
    _ = cache_path.write_text(payload, encoding="utf-8")
    return accuracy, per_field_accuracy, per_sku_accuracy


def _binomial_two_sided_p_value(wins: int, losses: int) -> float:
    trials = wins + losses
    if trials == 0:
        return 1.0

    def _combination(n: int, k: int) -> int:
        if k < 0 or k > n:
            return 0
        k = min(k, n - k)
        result = 1
        for i in range(1, k + 1):
            result = (result * (n - (k - i))) // i
        return result

    smaller_tail = min(wins, losses)
    tail_count = 0
    for k in range(0, smaller_tail + 1):
        tail_count += _combination(trials, k)
    denominator = 1 << trials
    tail_probability = tail_count / denominator
    two_sided = 2.0 * tail_probability
    return 1.0 if two_sided > 1.0 else two_sided


def _determine_recommendation(improvement: float, is_significant: bool) -> str:
    if improvement < 0:
        return "REJECT"
    if is_significant:
        return "MERGE"
    if improvement > 0:
        return "REVIEW"
    return "MERGE"


def compare(
    baseline: str,
    challenger: str,
    skus: list[str],
    confidence_level: float = 0.95,
) -> BaselineComparison:
    if not skus:
        raise ValueError("compare requires at least one sku")

    unique_skus = list(dict.fromkeys(skus))
    if len(unique_skus) != len(skus):
        raise ValueError("compare requires unique sku values")

    baseline_accuracy, baseline_per_field, baseline_per_sku = _load_or_create_baseline(baseline, unique_skus)
    challenger_accuracy, challenger_per_field, challenger_per_sku = _run_evaluation(challenger, unique_skus)

    if len(baseline_per_sku) != len(challenger_per_sku):
        raise ValueError("baseline and challenger must evaluate the same sku set")

    deltas = [challenger_value - baseline_value for baseline_value, challenger_value in zip(baseline_per_sku, challenger_per_sku)]
    wins = sum(1 for delta in deltas if delta > 0)
    losses = sum(1 for delta in deltas if delta < 0)
    p_value = _binomial_two_sided_p_value(wins=wins, losses=losses)
    alpha = 1.0 - confidence_level
    is_significant = p_value < alpha

    all_fields = sorted(set(baseline_per_field) | set(challenger_per_field))
    per_field_deltas = {field_name: challenger_per_field.get(field_name, 0.0) - baseline_per_field.get(field_name, 0.0) for field_name in all_fields}

    improvement = challenger_accuracy - baseline_accuracy
    recommendation = _determine_recommendation(improvement=improvement, is_significant=is_significant)

    return BaselineComparison(
        baseline_version=baseline,
        challenger_version=challenger,
        baseline_accuracy=baseline_accuracy,
        challenger_accuracy=challenger_accuracy,
        improvement=improvement,
        is_significant=is_significant,
        recommendation=recommendation,
        per_field_deltas=per_field_deltas,
        baseline_per_field=baseline_per_field,
        challenger_per_field=challenger_per_field,
        p_value=p_value,
        confidence_level=confidence_level,
        wins=wins,
        losses=losses,
        ties=len(deltas) - wins - losses,
    )
