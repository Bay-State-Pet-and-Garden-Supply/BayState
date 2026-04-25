from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import TypedDict, cast

import pytest

from scrapers.ai_cost_tracker import AICostTracker
from tests.ab_testing.conftest import MockExtractionPayload, MockExtractor, ProductRecord


class PerSkuMetrics(TypedDict):
    sku: str
    success: bool
    extraction_time_seconds: float
    input_tokens: int
    output_tokens: int
    model: str
    cost_usd: float


class EngineMetrics(TypedDict):
    extractor: str
    sku_count: int
    successes: int
    success_rate: float
    total_extraction_time_seconds: float
    average_extraction_time_seconds: float
    total_cost_usd: float
    average_cost_usd: float
    per_sku: list[PerSkuMetrics]


class SkuScope(TypedDict):
    count: int
    skus: list[str]


class ComparisonMetrics(TypedDict):
    success_rate_delta: float
    average_time_delta_seconds: float
    speedup_ratio_browser_use_over_crawl4ai: float
    total_cost_delta_usd: float
    cost_reduction_percent: float


class ComparisonReport(TypedDict):
    generated_at: str
    sku_scope: SkuScope
    metrics: dict[str, EngineMetrics]
    comparison: ComparisonMetrics


def _require_dict(value: object) -> dict[str, object]:
    assert isinstance(value, dict)
    typed_value = cast(dict[object, object], value)
    normalized: dict[str, object] = {}
    for raw_key, raw_item in typed_value.items():
        assert isinstance(raw_key, str)
        normalized[raw_key] = raw_item
    return normalized


def _require_int(value: object) -> int:
    assert isinstance(value, int)
    assert not isinstance(value, bool)
    return value


def _require_float(value: object) -> float:
    assert isinstance(value, (int, float))
    assert not isinstance(value, bool)
    return float(value)


def _require_str(value: object) -> str:
    assert isinstance(value, str)
    return value


def _require_list(value: object) -> list[object]:
    assert isinstance(value, list)
    return cast(list[object], value)


def _load_json(path: Path) -> object:
    return cast(object, json.loads(path.read_text(encoding="utf-8")))


def _parse_per_sku_metrics(value: object) -> list[PerSkuMetrics]:
    parsed: list[PerSkuMetrics] = []
    for item in _require_list(value):
        row = _require_dict(item)
        parsed.append(
            {
                "sku": _require_str(row["sku"]),
                "success": bool(row["success"]),
                "extraction_time_seconds": _require_float(row["extraction_time_seconds"]),
                "input_tokens": _require_int(row["input_tokens"]),
                "output_tokens": _require_int(row["output_tokens"]),
                "model": _require_str(row["model"]),
                "cost_usd": _require_float(row["cost_usd"]),
            }
        )
    return parsed


def _parse_engine_metrics(value: object) -> EngineMetrics:
    data = _require_dict(value)
    return {
        "extractor": _require_str(data["extractor"]),
        "sku_count": _require_int(data["sku_count"]),
        "successes": _require_int(data["successes"]),
        "success_rate": _require_float(data["success_rate"]),
        "total_extraction_time_seconds": _require_float(data["total_extraction_time_seconds"]),
        "average_extraction_time_seconds": _require_float(data["average_extraction_time_seconds"]),
        "total_cost_usd": _require_float(data["total_cost_usd"]),
        "average_cost_usd": _require_float(data["average_cost_usd"]),
        "per_sku": _parse_per_sku_metrics(data["per_sku"]),
    }


def _parse_sku_scope(value: object) -> SkuScope:
    scope = _require_dict(value)
    skus: list[str] = []
    for sku in _require_list(scope["skus"]):
        skus.append(_require_str(sku))
    return {
        "count": _require_int(scope["count"]),
        "skus": skus,
    }


def _parse_comparison(value: object) -> ComparisonMetrics:
    data = _require_dict(value)
    return {
        "success_rate_delta": _require_float(data["success_rate_delta"]),
        "average_time_delta_seconds": _require_float(data["average_time_delta_seconds"]),
        "speedup_ratio_browser_use_over_crawl4ai": _require_float(data["speedup_ratio_browser_use_over_crawl4ai"]),
        "total_cost_delta_usd": _require_float(data["total_cost_delta_usd"]),
        "cost_reduction_percent": _require_float(data["cost_reduction_percent"]),
    }


def _run_engine(extractor_name: str, extractor: MockExtractor, products: list[ProductRecord]) -> EngineMetrics:
    tracker = AICostTracker()
    per_sku: list[PerSkuMetrics] = []

    for product in products:
        payload: MockExtractionPayload = extractor(product)
        success = payload["success"]
        extraction_time_seconds = payload["extraction_time_seconds"]
        input_tokens = payload["input_tokens"]
        output_tokens = payload["output_tokens"]
        model = payload["model"]
        cost_usd = tracker.calculate_cost(model=model, input_tokens=input_tokens, output_tokens=output_tokens)

        per_sku.append(
            {
                "sku": product["sku"],
                "success": success,
                "extraction_time_seconds": extraction_time_seconds,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "model": model,
                "cost_usd": round(cost_usd, 8),
            }
        )

    sku_count = len(per_sku)
    total_successes = sum(1 for item in per_sku if item["success"])
    total_time_seconds = sum(item["extraction_time_seconds"] for item in per_sku)
    total_cost_usd = sum(item["cost_usd"] for item in per_sku)

    return {
        "extractor": extractor_name,
        "sku_count": sku_count,
        "successes": total_successes,
        "success_rate": (total_successes / sku_count) if sku_count else 0.0,
        "total_extraction_time_seconds": round(total_time_seconds, 6),
        "average_extraction_time_seconds": round((total_time_seconds / sku_count) if sku_count else 0.0, 6),
        "total_cost_usd": round(total_cost_usd, 8),
        "average_cost_usd": round((total_cost_usd / sku_count) if sku_count else 0.0, 8),
        "per_sku": per_sku,
    }


def _build_comparison_report(
    test_skus: list[ProductRecord],
    crawl4ai_extractor: MockExtractor,
    browser_use_extractor: MockExtractor,
) -> ComparisonReport:
    crawl4ai_metrics = _run_engine("crawl4ai", crawl4ai_extractor, test_skus)
    browser_use_metrics = _run_engine("browser_use", browser_use_extractor, test_skus)

    browser_total_cost = browser_use_metrics["total_cost_usd"]
    crawl_total_cost = crawl4ai_metrics["total_cost_usd"]
    browser_avg_time = browser_use_metrics["average_extraction_time_seconds"]
    crawl_avg_time = crawl4ai_metrics["average_extraction_time_seconds"]

    cost_reduction_percent = 0.0
    if browser_total_cost > 0:
        cost_reduction_percent = ((browser_total_cost - crawl_total_cost) / browser_total_cost) * 100.0

    speedup_ratio = 0.0
    if crawl_avg_time > 0:
        speedup_ratio = browser_avg_time / crawl_avg_time

    report: ComparisonReport = {
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "sku_scope": {
            "count": len(test_skus),
            "skus": [sku["sku"] for sku in test_skus],
        },
        "metrics": {
            "crawl4ai": crawl4ai_metrics,
            "browser_use": browser_use_metrics,
        },
        "comparison": {
            "success_rate_delta": round(
                crawl4ai_metrics["success_rate"] - browser_use_metrics["success_rate"],
                6,
            ),
            "average_time_delta_seconds": round(crawl_avg_time - browser_avg_time, 6),
            "speedup_ratio_browser_use_over_crawl4ai": round(speedup_ratio, 6),
            "total_cost_delta_usd": round(crawl_total_cost - browser_total_cost, 8),
            "cost_reduction_percent": round(cost_reduction_percent, 4),
        },
    }
    return report


def _read_report(path: Path) -> ComparisonReport:
    raw_obj = _load_json(path)
    raw = _require_dict(raw_obj)
    metrics_raw = _require_dict(raw["metrics"])

    report: ComparisonReport = {
        "generated_at": _require_str(raw["generated_at"]),
        "sku_scope": _parse_sku_scope(raw["sku_scope"]),
        "metrics": {
            "crawl4ai": _parse_engine_metrics(metrics_raw["crawl4ai"]),
            "browser_use": _parse_engine_metrics(metrics_raw["browser_use"]),
        },
        "comparison": _parse_comparison(raw["comparison"]),
    }
    return report


@pytest.mark.ab_test
class TestCrawl4AIVsBrowserUse:
    def test_success_rate_comparison(
        self,
        test_skus: list[ProductRecord],
        crawl4ai_extractor: MockExtractor,
        browser_use_extractor: MockExtractor,
    ) -> None:
        report = _build_comparison_report(test_skus, crawl4ai_extractor, browser_use_extractor)
        crawl = report["metrics"]["crawl4ai"]
        browser_use = report["metrics"]["browser_use"]

        assert crawl4ai_extractor.call_count == len(test_skus)
        assert browser_use_extractor.call_count == len(test_skus)
        assert crawl["sku_count"] == browser_use["sku_count"] == len(test_skus)
        assert crawl["success_rate"] >= browser_use["success_rate"]

    def test_extraction_time_comparison(
        self,
        test_skus: list[ProductRecord],
        crawl4ai_extractor: MockExtractor,
        browser_use_extractor: MockExtractor,
    ) -> None:
        report = _build_comparison_report(test_skus, crawl4ai_extractor, browser_use_extractor)
        crawl = report["metrics"]["crawl4ai"]
        browser_use = report["metrics"]["browser_use"]

        assert crawl4ai_extractor.call_count == len(test_skus)
        assert browser_use_extractor.call_count == len(test_skus)
        assert crawl["average_extraction_time_seconds"] < browser_use["average_extraction_time_seconds"]
        assert report["comparison"]["speedup_ratio_browser_use_over_crawl4ai"] > 1.0

    def test_cost_comparison(
        self,
        test_skus: list[ProductRecord],
        crawl4ai_extractor: MockExtractor,
        browser_use_extractor: MockExtractor,
    ) -> None:
        report = _build_comparison_report(test_skus, crawl4ai_extractor, browser_use_extractor)
        crawl = report["metrics"]["crawl4ai"]
        browser_use = report["metrics"]["browser_use"]

        assert crawl4ai_extractor.call_count == len(test_skus)
        assert browser_use_extractor.call_count == len(test_skus)
        assert crawl["total_cost_usd"] < browser_use["total_cost_usd"]
        assert crawl["average_cost_usd"] < browser_use["average_cost_usd"]
        assert report["comparison"]["cost_reduction_percent"] > 90.0

    def test_generate_comparison_report(
        self,
        test_skus: list[ProductRecord],
        crawl4ai_extractor: MockExtractor,
        browser_use_extractor: MockExtractor,
        comparison_report_path: Path,
    ) -> None:
        report = _build_comparison_report(test_skus, crawl4ai_extractor, browser_use_extractor)

        comparison_report_path.parent.mkdir(parents=True, exist_ok=True)
        serialized = json.dumps(report, indent=2, sort_keys=True)
        _ = comparison_report_path.write_text(serialized, encoding="utf-8")

        saved_report = _read_report(comparison_report_path)
        assert comparison_report_path.exists()
        assert saved_report["sku_scope"]["count"] == len(test_skus)
        assert saved_report["metrics"]["crawl4ai"]["sku_count"] == len(test_skus)
        assert saved_report["metrics"]["browser_use"]["sku_count"] == len(test_skus)
