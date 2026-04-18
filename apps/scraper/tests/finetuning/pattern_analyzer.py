# basedpyright: reportAny=false, reportExplicitAny=false, reportUnknownArgumentType=false, reportUnknownVariableType=false, reportUnknownMemberType=false, reportUnannotatedClassAttribute=false, reportUnusedCallResult=false, reportUnusedParameter=false, reportOptionalOperand=false
from __future__ import annotations

import argparse
import json
import time
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class FailureTypeSummary:
    type: str
    count: int
    pct: float
    critical: bool = False


@dataclass(frozen=True)
class PatternSummary:
    pattern: str
    count: int
    pct: float


@dataclass(frozen=True)
class PriorityIssue:
    issue: str
    failure_type: str
    count: int
    impact: float
    priority_score: float
    rationale: str


@dataclass(frozen=True)
class FailurePatternReport:
    generated_at: datetime
    days_analyzed: int
    sample_count: int
    top_failure_types: list[FailureTypeSummary]
    missing_field_counts: dict[str, int]
    patterns: dict[str, list[PatternSummary]]
    priority_list: list[PriorityIssue]
    recommendations: list[str]


@dataclass(frozen=True)
class FailureRecord:
    timestamp: datetime
    sku: str
    failure_type: str
    error_message: str
    missing_fields: tuple[str, ...] = ()
    category: str = "unknown"
    source_website: str = "unknown"
    sku_format: str = "unknown"
    confidence: float | None = None
    extraction_time_ms: float | None = None


class FailurePatternAnalyzer:
    _CRITICAL_FAILURE_TYPES = {"wrong_product", "brand_mismatch", "extraction_timeout"}
    _FAILURE_IMPACT_WEIGHTS = {
        "missing_fields": 2.0,
        "wrong_product": 4.5,
        "brand_mismatch": 4.0,
        "low_confidence": 2.5,
        "extraction_timeout": 4.2,
    }

    def __init__(self, base_dir: Path | None = None, minimum_samples: int = 10) -> None:
        self.base_dir = base_dir or Path(__file__).resolve().parents[2]
        self.minimum_samples = minimum_samples
        self._recent_failures: list[FailureRecord] = []

    def analyze_failures(self, days: int = 7) -> FailurePatternReport:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        failures = self._load_failures(cutoff=cutoff)

        if len(failures) < self.minimum_samples:
            raise ValueError(f"Insufficient failure samples for analysis: {len(failures)} found, {self.minimum_samples} required")

        self._recent_failures = failures
        failure_types, missing_fields = self.categorize_by_type()
        patterns = self.group_by_patterns()
        priority_list = self.generate_priority_list()
        recommendations = self._build_recommendations(failure_types, patterns, priority_list)

        return FailurePatternReport(
            generated_at=datetime.now(timezone.utc),
            days_analyzed=days,
            sample_count=len(failures),
            top_failure_types=failure_types,
            missing_field_counts=dict(missing_fields),
            patterns=patterns,
            priority_list=priority_list,
            recommendations=recommendations,
        )

    def categorize_by_type(self) -> tuple[list[FailureTypeSummary], Counter[str]]:
        self._ensure_loaded()
        total = len(self._recent_failures)

        type_counts = Counter(record.failure_type for record in self._recent_failures)
        missing_field_counts: Counter[str] = Counter()
        for record in self._recent_failures:
            missing_field_counts.update(record.missing_fields)

        summaries: list[FailureTypeSummary] = []
        for failure_type, count in type_counts.most_common():
            summaries.append(
                FailureTypeSummary(
                    type=failure_type,
                    count=count,
                    pct=round((count / total) * 100.0, 2) if total else 0.0,
                    critical=failure_type in self._CRITICAL_FAILURE_TYPES,
                )
            )

        return summaries, missing_field_counts

    def group_by_patterns(self) -> dict[str, list[PatternSummary]]:
        self._ensure_loaded()
        total = len(self._recent_failures)
        grouped_counters: dict[str, Counter[str]] = {
            "product_category": Counter(),
            "source_website": Counter(),
            "sku_format": Counter(),
            "time_of_day": Counter(),
        }

        for record in self._recent_failures:
            grouped_counters["product_category"][record.category] += 1
            grouped_counters["source_website"][record.source_website] += 1
            grouped_counters["sku_format"][record.sku_format] += 1
            grouped_counters["time_of_day"][self._time_bucket(record.timestamp)] += 1

        summary: dict[str, list[PatternSummary]] = {}
        for group_name, counter in grouped_counters.items():
            summary[group_name] = [
                PatternSummary(pattern=pattern, count=count, pct=round((count / total) * 100.0, 2) if total else 0.0)
                for pattern, count in counter.most_common()
            ]

        return summary

    def generate_priority_list(self) -> list[PriorityIssue]:
        self._ensure_loaded()
        type_counts = Counter(record.failure_type for record in self._recent_failures)
        issues: list[PriorityIssue] = []

        for failure_type, count in type_counts.items():
            impact = self._FAILURE_IMPACT_WEIGHTS.get(failure_type, 1.0)
            is_critical = failure_type in self._CRITICAL_FAILURE_TYPES
            critical_boost = 8.0 if is_critical and count <= 2 else 0.0
            priority_score = round((count * impact) + critical_boost, 2)

            issues.append(
                PriorityIssue(
                    issue=self._issue_label(failure_type),
                    failure_type=failure_type,
                    count=count,
                    impact=impact,
                    priority_score=priority_score,
                    rationale=self._priority_rationale(failure_type, count, is_critical),
                )
            )

        issues.sort(key=lambda item: item.priority_score, reverse=True)
        return issues

    def run_on_schedule(
        self,
        days: int = 7,
        interval_hours: int = 24,
        output_dir: Path | None = None,
        max_runs: int | None = None,
    ) -> None:
        run_count = 0
        while max_runs is None or run_count < max_runs:
            report = self.analyze_failures(days=days)
            self._write_report(report=report, output_dir=output_dir)
            run_count += 1
            if max_runs is not None and run_count >= max_runs:
                break
            time.sleep(max(1, interval_hours) * 3600)

    def _load_failures(self, cutoff: datetime) -> list[FailureRecord]:
        records: list[FailureRecord] = []
        records.extend(self._load_evaluation_failures(cutoff=cutoff))
        records.extend(self._load_weekly_review_failures(cutoff=cutoff))
        records.extend(self._load_ai_metrics_failures(cutoff=cutoff))
        records.extend(self._load_extraction_log_failures(cutoff=cutoff))
        return [record for record in records if record.timestamp >= cutoff]

    def _load_evaluation_failures(self, cutoff: datetime) -> list[FailureRecord]:
        records: list[FailureRecord] = []
        for path in self.base_dir.glob(".sisyphus/evidence/**/evaluation-report.json"):
            payload = self._read_json(path)
            for item in payload.get("per_sku_results", []):
                timestamp = self._parse_ts(item.get("timestamp"))
                if timestamp is None or timestamp < cutoff:
                    continue

                is_failure = (not bool(item.get("success", False))) or float(item.get("accuracy", 0.0) or 0.0) < 0.8
                if not is_failure:
                    records.extend(self._field_comparison_failures_from_evaluation_item(item=item, timestamp=timestamp))
                    continue

                record = self._record_from_result_item(item)
                if record is not None:
                    records.append(record)
                records.extend(self._field_comparison_failures_from_evaluation_item(item=item, timestamp=timestamp))
        return records

    def _load_weekly_review_failures(self, cutoff: datetime) -> list[FailureRecord]:
        records: list[FailureRecord] = []
        for path in self.base_dir.glob(".sisyphus/evidence/**/weekly-validation-report.json"):
            payload = self._read_json(path)
            for item in payload.get("per_product_results", []):
                timestamp = self._parse_ts(item.get("timestamp"))
                if timestamp is None or timestamp < cutoff:
                    continue

                accuracy = float(item.get("accuracy", 0.0) or 0.0)
                is_failure = (not bool(item.get("success", False))) or accuracy < 0.8
                field_accuracy = item.get("field_accuracy", {}) if isinstance(item.get("field_accuracy"), dict) else {}
                missing_fields = tuple(sorted(field for field, score in field_accuracy.items() if score == 0.0))
                if not is_failure and not any(float(score) < 0.8 for score in field_accuracy.values() if isinstance(score, (int, float))):
                    continue

                failure_type = self._infer_failure_type(
                    error_message=str(item.get("error_message") or item.get("notes") or ""),
                    missing_fields=missing_fields,
                    confidence=self._coerce_float(item.get("confidence")),
                    product_score=self._coerce_float(field_accuracy.get("name")),
                    brand_score=self._coerce_float(field_accuracy.get("brand")),
                )

                extracted_data = item.get("extracted_data", {}) if isinstance(item.get("extracted_data"), dict) else {}
                record = FailureRecord(
                    timestamp=timestamp,
                    sku=str(item.get("sku", "unknown")),
                    failure_type=failure_type,
                    error_message=str(item.get("error_message") or item.get("notes") or ""),
                    missing_fields=missing_fields,
                    category=self._extract_category(extracted_data),
                    source_website=str(extracted_data.get("source_website") or "unknown"),
                    sku_format=self._sku_format(str(item.get("sku", ""))),
                    confidence=self._coerce_float(extracted_data.get("confidence")),
                    extraction_time_ms=self._coerce_float(item.get("extraction_time_ms")),
                )
                records.append(record)
                records.extend(self._field_accuracy_failures_from_weekly_item(item=item, timestamp=timestamp))
        return records

    def _field_comparison_failures_from_evaluation_item(self, item: dict[str, Any], timestamp: datetime) -> list[FailureRecord]:
        records: list[FailureRecord] = []
        field_comparisons = item.get("field_comparisons", [])
        if not isinstance(field_comparisons, list):
            return records

        sku = str(item.get("sku") or "unknown")
        for comparison in field_comparisons:
            if not isinstance(comparison, dict):
                continue
            score = comparison.get("match_score")
            if not isinstance(score, (int, float)) or float(score) >= 0.8:
                continue

            field_name = str(comparison.get("field_name") or "unknown")
            failure_type = "low_confidence"
            if field_name == "brand":
                failure_type = "brand_mismatch"
            if field_name == "product_name":
                failure_type = "wrong_product"
            if comparison.get("actual") in (None, "", []):
                failure_type = "missing_fields"

            records.append(
                FailureRecord(
                    timestamp=timestamp,
                    sku=sku,
                    failure_type=failure_type,
                    error_message=f"Field mismatch: {field_name}",
                    missing_fields=(field_name,) if failure_type == "missing_fields" else (),
                    source_website=str(item.get("source_website") or "unknown"),
                    sku_format=self._sku_format(sku),
                    extraction_time_ms=self._coerce_float(item.get("extraction_time_ms")),
                )
            )
        return records

    def _field_accuracy_failures_from_weekly_item(self, item: dict[str, Any], timestamp: datetime) -> list[FailureRecord]:
        records: list[FailureRecord] = []
        field_accuracy = item.get("field_accuracy", {})
        if not isinstance(field_accuracy, dict):
            return records

        extracted_data = item.get("extracted_data", {}) if isinstance(item.get("extracted_data"), dict) else {}
        sku = str(item.get("sku") or "unknown")
        for field_name, score in field_accuracy.items():
            if not isinstance(score, (int, float)) or float(score) >= 0.8:
                continue
            failure_type = "low_confidence"
            if field_name == "brand":
                failure_type = "brand_mismatch"
            if field_name == "name":
                failure_type = "wrong_product"
            records.append(
                FailureRecord(
                    timestamp=timestamp,
                    sku=sku,
                    failure_type=failure_type,
                    error_message=f"Weekly field score below threshold: {field_name}",
                    category=self._extract_category(extracted_data),
                    source_website=str(extracted_data.get("source_website") or "unknown"),
                    sku_format=self._sku_format(sku),
                    confidence=self._coerce_float(extracted_data.get("confidence")),
                )
            )
        return records

    def _load_ai_metrics_failures(self, cutoff: datetime) -> list[FailureRecord]:
        records: list[FailureRecord] = []
        try:
            from scrapers.ai_metrics import _collector  # pyright: ignore[reportPrivateUsage]
        except Exception:
            return records

        metrics = getattr(_collector, "_metrics", [])
        if not isinstance(metrics, list):
            return records

        for metric in metrics:
            success = bool(getattr(metric, "success", True))
            if success:
                continue

            timestamp = self._parse_ts(getattr(metric, "timestamp", None))
            if timestamp is None or timestamp < cutoff:
                continue

            details = getattr(metric, "details", {})
            details_map = details if isinstance(details, dict) else {}
            error_message = str(details_map.get("error") or details_map.get("error_message") or "")
            missing_fields_raw = details_map.get("missing_fields", [])
            missing_fields = tuple(str(item) for item in missing_fields_raw) if isinstance(missing_fields_raw, list) else ()
            duration_seconds = self._coerce_float(getattr(metric, "duration_seconds", 0.0))
            extraction_time_ms = duration_seconds * 1000.0 if duration_seconds is not None else None

            record = FailureRecord(
                timestamp=timestamp,
                sku=str(details_map.get("sku") or "unknown"),
                failure_type=self._infer_failure_type(
                    error_message=error_message,
                    missing_fields=missing_fields,
                    confidence=self._coerce_float(details_map.get("confidence")),
                    product_score=self._coerce_float(details_map.get("product_score")),
                    brand_score=self._coerce_float(details_map.get("brand_score")),
                ),
                error_message=error_message,
                missing_fields=missing_fields,
                category=self._extract_category(details_map),
                source_website=str(details_map.get("source_website") or "unknown"),
                sku_format=self._sku_format(str(details_map.get("sku") or "")),
                confidence=self._coerce_float(details_map.get("confidence")),
                extraction_time_ms=extraction_time_ms,
            )
            records.append(record)

        return records

    def _load_extraction_log_failures(self, cutoff: datetime) -> list[FailureRecord]:
        records: list[FailureRecord] = []
        extraction_log_paths: list[Path] = []
        extraction_log_paths.extend(self.base_dir.glob("logs/**/*extraction*.json"))
        extraction_log_paths.extend(self.base_dir.glob(".sisyphus/evidence/**/*extraction*.json"))

        for path in extraction_log_paths:
            payload = self._read_json(path)
            entries = payload if isinstance(payload, list) else payload.get("entries", []) if isinstance(payload, dict) else []
            if not isinstance(entries, list):
                continue

            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                if bool(entry.get("success", True)):
                    continue

                timestamp = self._parse_ts(entry.get("timestamp"))
                if timestamp is None or timestamp < cutoff:
                    continue

                missing_fields = tuple(str(item) for item in entry.get("missing_fields", []) if isinstance(item, str))
                error_message = str(entry.get("error") or entry.get("error_message") or "")
                record = FailureRecord(
                    timestamp=timestamp,
                    sku=str(entry.get("sku") or "unknown"),
                    failure_type=self._infer_failure_type(
                        error_message=error_message,
                        missing_fields=missing_fields,
                        confidence=self._coerce_float(entry.get("confidence")),
                        product_score=self._coerce_float(entry.get("product_score")),
                        brand_score=self._coerce_float(entry.get("brand_score")),
                    ),
                    error_message=error_message,
                    missing_fields=missing_fields,
                    category=self._extract_category(entry),
                    source_website=str(entry.get("source_website") or "unknown"),
                    sku_format=self._sku_format(str(entry.get("sku") or "")),
                    confidence=self._coerce_float(entry.get("confidence")),
                    extraction_time_ms=self._coerce_float(entry.get("extraction_time_ms")),
                )
                records.append(record)

        return records

    def _record_from_result_item(self, item: dict[str, Any]) -> FailureRecord | None:
        timestamp = self._parse_ts(item.get("timestamp"))
        if timestamp is None:
            return None

        field_comparisons = item.get("field_comparisons", [])
        missing_fields = self._detect_missing_fields(field_comparisons)
        brand_score = self._field_score(field_comparisons, "brand")
        product_score = self._field_score(field_comparisons, "product_name")
        confidence = self._coerce_float(item.get("confidence"))
        error_message = str(item.get("error_message") or "")

        return FailureRecord(
            timestamp=timestamp,
            sku=str(item.get("sku") or "unknown"),
            failure_type=self._infer_failure_type(
                error_message=error_message,
                missing_fields=missing_fields,
                confidence=confidence,
                product_score=product_score,
                brand_score=brand_score,
            ),
            error_message=error_message,
            missing_fields=missing_fields,
            category="unknown",
            source_website=str(item.get("source_website") or "unknown"),
            sku_format=self._sku_format(str(item.get("sku") or "")),
            confidence=confidence,
            extraction_time_ms=self._coerce_float(item.get("extraction_time_ms")),
        )

    def _build_recommendations(
        self,
        failure_types: list[FailureTypeSummary],
        patterns: dict[str, list[PatternSummary]],
        priority_list: list[PriorityIssue],
    ) -> list[str]:
        recommendations: list[str] = []

        if priority_list:
            top_issue = priority_list[0]
            recommendations.append(f"Address '{top_issue.issue}' first; it has the highest combined frequency/impact score.")

        top_sources = patterns.get("source_website", [])
        if top_sources and top_sources[0].pattern != "unknown":
            recommendations.append(f"Prioritize source-specific fixes for {top_sources[0].pattern}; it drives {top_sources[0].pct:.1f}% of failures.")

        top_time_bucket = patterns.get("time_of_day", [])
        if top_time_bucket:
            recommendations.append(f"Add anti-bot hardening during '{top_time_bucket[0].pattern}' windows where failures cluster.")

        critical_present = [item for item in failure_types if item.critical and item.count > 0]
        if critical_present:
            labels = ", ".join(item.type for item in critical_present)
            recommendations.append(f"Do not defer critical but rare failures: {labels}.")

        if not recommendations:
            recommendations.append("No dominant failure pattern detected; continue collecting data.")

        return recommendations

    def _write_report(self, report: FailurePatternReport, output_dir: Path | None) -> Path:
        target_dir = output_dir or self.base_dir / ".sisyphus" / "evidence"
        target_dir.mkdir(parents=True, exist_ok=True)
        output_path = target_dir / "failure-pattern-report.json"

        payload = {
            "generated_at": report.generated_at.isoformat(),
            "days_analyzed": report.days_analyzed,
            "sample_count": report.sample_count,
            "top_failure_types": [{"type": item.type, "count": item.count, "pct": item.pct, "critical": item.critical} for item in report.top_failure_types],
            "missing_field_counts": report.missing_field_counts,
            "patterns": {
                group: [{"pattern": item.pattern, "count": item.count, "pct": item.pct} for item in values] for group, values in report.patterns.items()
            },
            "priority_list": [
                {
                    "issue": item.issue,
                    "failure_type": item.failure_type,
                    "count": item.count,
                    "impact": item.impact,
                    "priority_score": item.priority_score,
                    "rationale": item.rationale,
                }
                for item in report.priority_list
            ],
            "recommendations": report.recommendations,
        }
        output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return output_path

    @staticmethod
    def _read_json(path: Path) -> dict[str, Any]:
        try:
            raw = path.read_text(encoding="utf-8")
            payload = json.loads(raw)
            return payload if isinstance(payload, dict) else {}
        except Exception:
            return {}

    @staticmethod
    def _parse_ts(value: Any) -> datetime | None:
        if not value or not isinstance(value, str):
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    @staticmethod
    def _detect_missing_fields(field_comparisons: Any) -> tuple[str, ...]:
        if not isinstance(field_comparisons, list):
            return ()
        missing: list[str] = []
        for comparison in field_comparisons:
            if not isinstance(comparison, dict):
                continue
            field_name = str(comparison.get("field_name") or "")
            expected = comparison.get("expected")
            actual = comparison.get("actual")
            if field_name and expected not in (None, "", []) and actual in (None, "", []):
                missing.append(field_name)
        return tuple(sorted(set(missing)))

    @staticmethod
    def _field_score(field_comparisons: Any, field_name: str) -> float | None:
        if not isinstance(field_comparisons, list):
            return None
        for comparison in field_comparisons:
            if isinstance(comparison, dict) and str(comparison.get("field_name")) == field_name:
                score = comparison.get("match_score")
                if isinstance(score, (int, float)):
                    return float(score)
        return None

    @staticmethod
    def _coerce_float(value: Any) -> float | None:
        if isinstance(value, (int, float)):
            return float(value)
        return None

    @staticmethod
    def _extract_category(payload: dict[str, Any]) -> str:
        categories = payload.get("categories")
        if isinstance(categories, list) and categories:
            return str(categories[0])
        if isinstance(categories, str) and categories.strip():
            return categories.strip()
        category = payload.get("category")
        if isinstance(category, str) and category.strip():
            return category.strip()
        return "unknown"

    @staticmethod
    def _sku_format(sku: str) -> str:
        value = sku.strip()
        if not value:
            return "unknown"
        if value.isdigit() and len(value) in (12, 13, 14):
            return "upc_like"
        if "-" in value:
            return "hyphenated"
        if any(char.isalpha() for char in value) and any(char.isdigit() for char in value):
            return "alphanumeric"
        if value.isdigit():
            return "numeric"
        return "other"

    @staticmethod
    def _time_bucket(timestamp: datetime) -> str:
        hour = timestamp.hour
        if 0 <= hour < 6:
            return "overnight"
        if 6 <= hour < 12:
            return "morning"
        if 12 <= hour < 18:
            return "afternoon"
        return "evening"

    def _infer_failure_type(
        self,
        error_message: str,
        missing_fields: tuple[str, ...],
        confidence: float | None,
        product_score: float | None,
        brand_score: float | None,
    ) -> str:
        lowered = error_message.lower()
        if "timeout" in lowered or "timed out" in lowered:
            return "extraction_timeout"
        if missing_fields:
            return "missing_fields"
        if product_score is not None and product_score < 0.5:
            return "wrong_product"
        if "wrong product" in lowered or "non-product" in lowered:
            return "wrong_product"
        if brand_score is not None and brand_score < 0.8:
            return "brand_mismatch"
        if "brand" in lowered and "mismatch" in lowered:
            return "brand_mismatch"
        if confidence is not None and confidence < 0.6:
            return "low_confidence"
        return "low_confidence"

    @staticmethod
    def _issue_label(failure_type: str) -> str:
        return {
            "missing_fields": "Required fields frequently missing",
            "wrong_product": "Incorrect product selected during extraction",
            "brand_mismatch": "Brand attribution mismatch",
            "low_confidence": "Low-confidence extraction quality",
            "extraction_timeout": "Extraction pipeline timeouts",
        }.get(failure_type, f"Unhandled failure class: {failure_type}")

    @staticmethod
    def _priority_rationale(failure_type: str, count: int, is_critical: bool) -> str:
        if is_critical and count <= 2:
            return "Rare but critical failure promoted to prevent severe data quality regressions."
        return "Priority driven by observed frequency and estimated downstream impact."

    def _ensure_loaded(self) -> None:
        if not self._recent_failures:
            raise RuntimeError("No failure data loaded. Call analyze_failures() first.")


def _build_cli_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Analyze extraction failure patterns")
    parser.add_argument("--days", type=int, default=7, help="Lookback window in days")
    parser.add_argument("--schedule", action="store_true", help="Run continuously on a schedule")
    parser.add_argument("--interval-hours", type=int, default=24, help="Schedule interval in hours")
    parser.add_argument("--output-dir", type=str, default=None, help="Directory for saved reports")
    parser.add_argument("--max-runs", type=int, default=1, help="Maximum scheduled runs")
    return parser


def main() -> None:
    parser = _build_cli_parser()
    args = parser.parse_args()
    analyzer = FailurePatternAnalyzer()

    output_dir = Path(args.output_dir) if args.output_dir else None
    if args.schedule:
        analyzer.run_on_schedule(
            days=args.days,
            interval_hours=args.interval_hours,
            output_dir=output_dir,
            max_runs=args.max_runs,
        )
        return

    report = analyzer.analyze_failures(days=args.days)
    print("Top failure types:")
    for item in report.top_failure_types[:5]:
        print(f"- {item.type}: {item.count} ({item.pct:.1f}%)")


if __name__ == "__main__":
    main()
