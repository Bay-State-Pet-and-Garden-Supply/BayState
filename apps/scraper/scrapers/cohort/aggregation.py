from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass, field
import logging
from typing import cast

from .job_processor import CohortJobResult

logger = logging.getLogger(__name__)

_DEFAULT_RESULT_PATHS: dict[str, tuple[str, ...]] = {
    "brand": ("brand", "results.brand", "data.brand"),
    "category": ("category", "results.category", "data.category"),
}


@dataclass(frozen=True, slots=True)
class ConsistencyRule:
    """Configurable consistency check for a cohort field."""

    label: str
    paths: tuple[str, ...]
    max_unique_values: int = 1
    score_penalty: float = 0.0
    enabled: bool = True


@dataclass(slots=True)
class CohortAggregationResult:
    """Result of aggregating cohort product output without mutating raw results."""

    cohort_id: str
    total_products: int = 0
    successful_products: int = 0
    failed_products: int = 0
    brands: set[str] = field(default_factory=set)
    categories: set[str] = field(default_factory=set)
    brand_inconsistencies: list[str] = field(default_factory=list)
    category_inconsistencies: list[str] = field(default_factory=list)
    product_results: dict[str, object] = field(default_factory=dict)
    consistency_score: float = 1.0
    warnings: list[str] = field(default_factory=list)
    metadata: dict[str, object] = field(default_factory=dict)
    inconsistency_reports: dict[str, list[str]] = field(default_factory=dict)


@dataclass(slots=True)
class FieldConsistencySummary:
    """Normalized summary for one consistency-checked field."""

    label: str
    paths: list[str]
    values: list[str] = field(default_factory=list)
    values_by_sku: dict[str, list[str]] = field(default_factory=dict)
    missing_skus: list[str] = field(default_factory=list)
    max_unique_values: int = 1

    @property
    def value_count(self) -> int:
        return len(self.values)

    @property
    def missing_count(self) -> int:
        return len(self.missing_skus)

    @property
    def is_consistent(self) -> bool:
        return self.value_count <= self.max_unique_values

    def as_metadata(self) -> dict[str, object]:
        return {
            "label": self.label,
            "paths": list(self.paths),
            "values": list(self.values),
            "value_count": self.value_count,
            "values_by_sku": {value: list(skus) for value, skus in self.values_by_sku.items()},
            "missing_skus": list(self.missing_skus),
            "missing_count": self.missing_count,
            "max_unique_values": self.max_unique_values,
            "is_consistent": self.is_consistent,
        }


ConsistencyRuleConfig = ConsistencyRule | Mapping[str, object]


class CohortAggregator:
    """Aggregate cohort member results into cohort-level summaries and warnings."""

    def __init__(
        self,
        consistency_rules: Mapping[str, ConsistencyRuleConfig] | None = None,
        failure_penalty: float = 0.5,
    ) -> None:
        self.failure_penalty: float = max(0.0, failure_penalty)
        self.rules: dict[str, ConsistencyRule] = self._build_rules(consistency_rules)

    def aggregate(self, cohort_id: str, product_results: Mapping[str, object]) -> CohortAggregationResult:
        """Aggregate raw product results for a cohort without altering member payloads."""

        result = CohortAggregationResult(
            cohort_id=cohort_id,
            total_products=len(product_results),
            product_results=dict(product_results),
        )

        observed_values: dict[str, defaultdict[str, list[str]]] = {field_name: defaultdict(list) for field_name, rule in self.rules.items() if rule.enabled}
        missing_values: dict[str, list[str]] = {field_name: [] for field_name, rule in self.rules.items() if rule.enabled}
        successful_skus: list[str] = []
        failed_skus: list[str] = []

        for sku, product_result in result.product_results.items():
            if self._is_failed_result(product_result):
                result.failed_products += 1
                failed_skus.append(sku)
            else:
                result.successful_products += 1
                successful_skus.append(sku)

            for field_name, rule in self.rules.items():
                if not rule.enabled:
                    continue

                extracted_value = self._extract_value(product_result, rule.paths)
                if extracted_value is None:
                    missing_values[field_name].append(sku)
                    continue

                observed_values[field_name][extracted_value].append(sku)

        if "brand" in observed_values:
            result.brands = set(observed_values["brand"])

        if "category" in observed_values:
            result.categories = set(observed_values["category"])

        field_summary = self._build_field_summary(observed_values, missing_values)
        self._detect_inconsistencies(result, field_summary)
        result.consistency_score = self._calculate_consistency_score(result)
        result.metadata = {
            "product_skus": sorted(result.product_results),
            "successful_skus": successful_skus,
            "failed_skus": failed_skus,
            "configured_rules": sorted(self.rules),
            "field_summary": {field_name: summary.as_metadata() for field_name, summary in field_summary.items()},
            "inconsistent_fields": sorted(result.inconsistency_reports),
            "warning_count": len(result.warnings),
        }
        return result

    def aggregate_job_result(self, job_result: CohortJobResult) -> CohortAggregationResult:
        """Aggregate a CohortJobResult while preserving upstream job metadata."""

        result = self.aggregate(job_result.cohort_id, job_result.results)
        result.metadata = {
            **result.metadata,
            "job_status": job_result.status,
            "job_errors": list(job_result.errors),
            "job_metadata": dict(job_result.metadata),
            "products_processed": job_result.products_processed,
            "products_succeeded": job_result.products_succeeded,
            "products_failed": job_result.products_failed,
        }
        return result

    def generate_report(self, result: CohortAggregationResult) -> str:
        """Generate a human-readable summary of cohort aggregation output."""

        lines = [
            f"Cohort Aggregation Report: {result.cohort_id}",
            ("  Products: " + f"{result.total_products} total, " + f"{result.successful_products} successful, " + f"{result.failed_products} failed"),
            f"  Consistency Score: {result.consistency_score:.2f}",
            f"  Brands: {', '.join(sorted(result.brands)) if result.brands else 'N/A'}",
            f"  Categories: {', '.join(sorted(result.categories)) if result.categories else 'N/A'}",
        ]

        if result.brand_inconsistencies:
            lines.append("  Brand Issues:")
            for issue in result.brand_inconsistencies:
                lines.append(f"    - {issue}")

        if result.category_inconsistencies:
            lines.append("  Category Issues:")
            for issue in result.category_inconsistencies:
                lines.append(f"    - {issue}")

        for field_name, issues in sorted(result.inconsistency_reports.items()):
            if field_name in {"brand", "category"}:
                continue

            rule = self.rules[field_name]
            lines.append(f"  {rule.label} Issues:")
            for issue in issues:
                lines.append(f"    - {issue}")

        if result.warnings:
            lines.append("  Warnings:")
            for warning in result.warnings:
                lines.append(f"    - {warning}")

        return "\n".join(lines)

    def _build_rules(self, consistency_rules: Mapping[str, ConsistencyRuleConfig] | None) -> dict[str, ConsistencyRule]:
        rules: dict[str, ConsistencyRule] = {
            "brand": ConsistencyRule(label="Brand", paths=_DEFAULT_RESULT_PATHS["brand"], score_penalty=0.3),
            "category": ConsistencyRule(label="Category", paths=_DEFAULT_RESULT_PATHS["category"], score_penalty=0.2),
        }

        for field_name, raw_rule in (consistency_rules or {}).items():
            default_rule = rules.get(field_name)
            rules[field_name] = self._coerce_rule(field_name, raw_rule, default_rule)

        return rules

    def _coerce_rule(
        self,
        field_name: str,
        raw_rule: ConsistencyRuleConfig,
        default_rule: ConsistencyRule | None,
    ) -> ConsistencyRule:
        if isinstance(raw_rule, ConsistencyRule):
            return raw_rule

        label = str(raw_rule.get("label") or (default_rule.label if default_rule else field_name.replace("_", " ").title()))
        paths = self._coerce_paths(
            raw_rule.get("paths"),
            default_rule.paths if default_rule is not None else (field_name,),
        )
        max_unique_values = self._coerce_int(
            raw_rule.get("max_unique_values"),
            default_rule.max_unique_values if default_rule else 1,
        )
        score_penalty = self._coerce_float(
            raw_rule.get("score_penalty"),
            default_rule.score_penalty if default_rule else 0.0,
        )
        enabled = bool(raw_rule.get("enabled", default_rule.enabled if default_rule else True))
        return ConsistencyRule(
            label=label,
            paths=paths,
            max_unique_values=max(1, max_unique_values),
            score_penalty=max(0.0, score_penalty),
            enabled=enabled,
        )

    def _extract_value(self, product_result: object, paths: tuple[str, ...]) -> str | None:
        result_mapping = self._as_mapping(product_result)
        if result_mapping is None:
            return None

        for path in paths:
            current: object = result_mapping
            for segment in path.split("."):
                current_mapping = self._as_mapping(current)
                if current_mapping is None:
                    current = None
                    break
                current = current_mapping.get(segment)

            normalized = self._normalize_value(current)
            if normalized is not None:
                return normalized

        return None

    def _normalize_value(self, value: object) -> str | None:
        if value is None:
            return None

        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None

        if isinstance(value, (bool, int, float)):
            return str(value)

        if isinstance(value, (tuple, list, set)):
            sequence_items = cast(tuple[object, ...] | list[object] | set[object], value)
            items = [self._normalize_value(item) for item in sequence_items]
            normalized_items = [item for item in items if item]
            if normalized_items:
                return ", ".join(normalized_items)
            return None

        normalized = str(value).strip()
        return normalized or None

    def _is_failed_result(self, product_result: object) -> bool:
        result_mapping = self._as_mapping(product_result)
        if result_mapping is None:
            return False

        if result_mapping.get("success") is False:
            return True

        error = result_mapping.get("error")
        return bool(error)

    def _build_field_summary(
        self,
        observed_values: Mapping[str, Mapping[str, list[str]]],
        missing_values: Mapping[str, list[str]],
    ) -> dict[str, FieldConsistencySummary]:
        summary: dict[str, FieldConsistencySummary] = {}
        for field_name, rule in self.rules.items():
            if not rule.enabled:
                continue

            values_by_sku = {value: sorted(skus) for value, skus in sorted(observed_values.get(field_name, {}).items())}
            values = sorted(values_by_sku)
            missing_skus = sorted(missing_values.get(field_name, []))
            summary[field_name] = FieldConsistencySummary(
                label=rule.label,
                paths=list(rule.paths),
                values=values,
                values_by_sku=values_by_sku,
                missing_skus=missing_skus,
                max_unique_values=rule.max_unique_values,
            )

        return summary

    def _detect_inconsistencies(
        self,
        result: CohortAggregationResult,
        field_summary: Mapping[str, FieldConsistencySummary],
    ) -> None:
        for field_name, summary in field_summary.items():
            if summary.is_consistent:
                continue

            headline = (
                f"{self.rules[field_name].label} inconsistency: "
                + f"expected at most {self.rules[field_name].max_unique_values} unique value(s), "
                + f"found {len(summary.values)} ({', '.join(summary.values)})"
            )
            issues = [headline]
            for value, skus in summary.values_by_sku.items():
                issues.append(f"{value}: {', '.join(skus)}")

            result.inconsistency_reports[field_name] = issues
            result.warnings.append(headline)

            if field_name == "brand":
                result.brand_inconsistencies = issues
            elif field_name == "category":
                result.category_inconsistencies = issues

    def _calculate_consistency_score(self, result: CohortAggregationResult) -> float:
        score = 1.0

        for field_name in result.inconsistency_reports:
            score -= self.rules[field_name].score_penalty

        failure_rate = result.failed_products / max(result.total_products, 1)
        score -= failure_rate * self.failure_penalty

        return max(0.0, min(1.0, round(score, 4)))

    def _as_mapping(self, value: object) -> Mapping[str, object] | None:
        if isinstance(value, Mapping):
            return cast(Mapping[str, object], value)
        return None

    def _coerce_paths(self, raw_paths: object, default_paths: tuple[str, ...]) -> tuple[str, ...]:
        if isinstance(raw_paths, str):
            normalized = raw_paths.strip()
            return (normalized,) if normalized else default_paths

        if isinstance(raw_paths, (tuple, list)):
            path_values = cast(tuple[object, ...] | list[object], raw_paths)
            paths = tuple(str(path).strip() for path in path_values if str(path).strip())
            return paths or default_paths

        return default_paths

    def _coerce_int(self, value: object, default: int) -> int:
        if value is None:
            return default

        if isinstance(value, bool):
            return int(value)

        if isinstance(value, int):
            return value

        if isinstance(value, float):
            return int(value)

        if isinstance(value, str):
            try:
                return int(value.strip())
            except ValueError:
                return default

        try:
            return int(str(value).strip())
        except (TypeError, ValueError):
            return default

    def _coerce_float(self, value: object, default: float) -> float:
        if value is None:
            return default

        if isinstance(value, bool):
            return float(value)

        if isinstance(value, (int, float)):
            return float(value)

        if isinstance(value, str):
            try:
                return float(value.strip())
            except ValueError:
                return default

        try:
            return float(str(value).strip())
        except (TypeError, ValueError):
            return default


__all__ = [
    "CohortAggregationResult",
    "CohortAggregator",
    "ConsistencyRule",
    "FieldConsistencySummary",
]
