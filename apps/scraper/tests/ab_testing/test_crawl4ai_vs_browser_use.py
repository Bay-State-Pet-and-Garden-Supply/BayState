from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Any

import pytest

from scrapers.ai_cost_tracker import AICostTracker
from tests.ab_testing.report_generator import generate_report


REPO_ROOT = Path(__file__).resolve().parents[2]
GROUND_TRUTH_PATH = REPO_ROOT / "tests" / "fixtures" / "test_skus_ground_truth.json"
CRAWL4AI_RESULTS_PATH = REPO_ROOT / "tests" / "results" / "results_v2.json"
BROWSER_USE_RESULTS_PATH = REPO_ROOT / "tests" / "results" / "results_baseline.json"


@dataclass
class SystemResult:
    success: bool
    duration: float
    cost: float
    fields_present: int
    fields_missing: list[str]
    data_quality: float
    source: str | None
    error: str | None


class ABTestingFramework:
    REQUIRED_FIELDS = ["product_name", "brand", "description", "size_metrics", "images"]
    CRAWL4AI_MODEL = "gpt-4o-mini"
    BROWSER_USE_MODEL = "gpt-4o"

    def __init__(self) -> None:
        self.ground_truth = self._load_json(GROUND_TRUTH_PATH)
        self.crawl4ai_records = self._index_by_sku(self._load_json(CRAWL4AI_RESULTS_PATH))
        self.browser_use_records = self._index_by_sku(self._load_json(BROWSER_USE_RESULTS_PATH))
        self.cost_tracker = AICostTracker()

    def _load_json(self, path: Path) -> list[dict[str, Any]]:
        if not path.exists():
            pytest.skip(f"Missing fixture data: {path}")
        return json.loads(path.read_text(encoding="utf-8"))

    def _index_by_sku(self, rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        return {str(row.get("sku")): row for row in rows if row.get("sku")}

    async def run(self, concurrency: int = 5) -> dict[str, Any]:
        if len(self.ground_truth) < 10:
            raise AssertionError("Need at least 10 SKUs for A/B test")

        semaphore = asyncio.Semaphore(concurrency)

        async def _bound(sample: dict[str, Any]) -> dict[str, Any]:
            async with semaphore:
                return await self._run_sample(sample)

        tasks = [_bound(sample) for sample in self.ground_truth]
        samples = await asyncio.gather(*tasks)
        return {"samples": samples}

    async def _run_sample(self, sample: dict[str, Any]) -> dict[str, Any]:
        crawl_task = self._run_system("crawl4ai", sample, self.crawl4ai_records, self.CRAWL4AI_MODEL)
        browser_task = self._run_system("browser_use", sample, self.browser_use_records, self.BROWSER_USE_MODEL)
        crawl4ai, browser_use = await asyncio.gather(crawl_task, browser_task)
        return {
            "sku": str(sample.get("sku")),
            "brand": sample.get("brand"),
            "crawl4ai": crawl4ai.__dict__ if crawl4ai else None,
            "browser_use": browser_use.__dict__ if browser_use else None,
        }

    async def _run_system(
        self,
        system_name: str,
        sample: dict[str, Any],
        records: dict[str, dict[str, Any]],
        model: str,
    ) -> SystemResult:
        record = records.get(str(sample.get("sku")), {})
        start = perf_counter()
        # Simulate async workload even though we're using recorded outputs
        await asyncio.sleep(0)
        duration = float(record.get("extraction_time_seconds") or 0.0)
        if duration <= 0:
            duration = 5.0
        duration = round(duration, 4)

        present_fields = self._present_fields(record)
        missing_fields = [field for field in self.REQUIRED_FIELDS if field not in present_fields]
        quality_ratio = round(len(present_fields) / len(self.REQUIRED_FIELDS), 4)

        success_flag = bool(record.get("success"))
        brand_match = self._normalized(record.get("brand")) == self._normalized(sample.get("brand"))
        success = success_flag and quality_ratio >= 0.6 and brand_match

        estimated_input_tokens, estimated_output_tokens = self._estimate_tokens(sample, record)
        cost = self.cost_tracker.calculate_cost(model, estimated_input_tokens, estimated_output_tokens)

        error = record.get("error") if not success else None
        source = record.get("source_website") or record.get("url")

        # Guarantee non-zero duration measurement
        measured_duration = round(max(perf_counter() - start, 0.0001), 4)

        return SystemResult(
            success=success,
            duration=duration,
            cost=round(cost, 6),
            fields_present=len(present_fields),
            fields_missing=missing_fields,
            data_quality=quality_ratio,
            source=source,
            error=error,
        )

    def _present_fields(self, record: dict[str, Any]) -> list[str]:
        present: list[str] = []
        for field in self.REQUIRED_FIELDS:
            value = record.get(field)
            if field == "images":
                if isinstance(value, list) and value:
                    present.append(field)
            elif isinstance(value, str) and value.strip():
                present.append(field)
        return present

    def _estimate_tokens(self, sample: dict[str, Any], record: dict[str, Any]) -> tuple[int, int]:
        sample_text = json.dumps(sample, sort_keys=True)
        record_text = json.dumps(record, sort_keys=True)
        input_tokens = max(len(sample_text) // 4, 10)
        output_tokens = max(len(record_text) // 4, 10)
        return input_tokens, output_tokens

    def _normalized(self, value: Any) -> str:
        if not isinstance(value, str):
            return ""
        return value.strip().lower()


def _execute_framework(framework: ABTestingFramework) -> dict[str, Any]:
    return asyncio.run(framework.run())


@pytest.mark.benchmark
def test_crawl4ai_vs_browser_use_ab_test(benchmark: Any) -> None:
    framework = ABTestingFramework()

    results = benchmark.pedantic(
        lambda: _execute_framework(framework),
        iterations=1,
        rounds=1,
        warmup_rounds=0,
    )

    report_info = generate_report(results)
    payload = report_info["payload"]

    assert payload["sku_count"] >= 10
    assert payload["recommendation"] in {"go", "no-go", "conditional"}
    assert report_info["json_path"].exists()
    assert report_info["markdown_path"].exists()

    crawl_success = payload["crawl4ai"]["success_rate"]
    browser_success = payload["browser_use"]["success_rate"]
    assert crawl_success >= 0.5  # ensure baseline reliability
    assert browser_success > 0
