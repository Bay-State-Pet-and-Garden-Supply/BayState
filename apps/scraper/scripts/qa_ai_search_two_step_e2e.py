#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import logging
import os
import sys
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from dotenv import load_dotenv
from typing_extensions import override

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scrapers.ai_metrics import AIMetricsCollector, get_ai_metrics_summary
from scrapers.ai_search.scraper import AISearchScraper


@dataclass(frozen=True)
class LiveTestCase:
    sku: str
    product_name: str
    brand: str


@dataclass(frozen=True)
class LiveTestResult:
    sku: str
    success: bool
    confidence: float
    selection_method: str | None
    cost_usd: float
    metrics_cost_delta_usd: float
    telemetry_url_count: int
    telemetry_valid: bool
    telemetry_logged: bool
    two_step_signal: bool
    error: str | None


TEST_CASES = [
    LiveTestCase(
        sku="032247761215",
        product_name="SPREADER SCOTTS TB E DGEGUARD MINI",
        brand="Scotts",
    ),
    LiveTestCase(
        sku="032247279048",
        product_name="MIRACLE GRO POTTING MIX 50QT",
        brand="Miracle-Gro",
    ),
]


class LogCaptureHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.INFO)
        self.messages: list[str] = []

    @override
    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(self.format(record))


def load_runtime_env() -> str:
    env_name = ".env.development" if (PROJECT_ROOT / ".env.development").exists() else ".env"
    _ = load_dotenv(PROJECT_ROOT / env_name, override=False)
    os.environ["AI_SEARCH_ENABLE_TWO_STEP"] = "true"
    _ = os.environ.setdefault("HEADLESS", "true")
    return env_name


def telemetry_is_valid(telemetry: dict[str, object]) -> tuple[bool, int]:
    raw_urls = telemetry.get("urls")
    raw_by_stage = telemetry.get("by_stage")

    urls: list[dict[str, object]] = []
    if isinstance(raw_urls, list):
        for maybe_entry in cast(list[object], raw_urls):
            if isinstance(maybe_entry, Mapping):
                entry: dict[str, object] = {}
                for raw_key, raw_value in cast(Mapping[object, object], maybe_entry).items():
                    entry[str(raw_key)] = raw_value
                urls.append(entry)

    by_stage: dict[str, int] = {}
    if isinstance(raw_by_stage, Mapping):
        for raw_key, raw_value in cast(Mapping[object, object], raw_by_stage).items():
            if isinstance(raw_value, bool):
                by_stage[str(raw_key)] = int(raw_value)
            elif isinstance(raw_value, int):
                by_stage[str(raw_key)] = int(raw_value)
            elif isinstance(raw_value, float):
                by_stage[str(raw_key)] = int(raw_value)
            elif isinstance(raw_value, str):
                try:
                    by_stage[str(raw_key)] = int(raw_value)
                except ValueError:
                    continue

    has_validation_event = any(str(entry.get("stage") or "") == "validation" for entry in urls)
    has_fetch_event = any(str(entry.get("stage") or "") == "fetch_attempt" for entry in urls)
    has_stage_counters = any(key.startswith("validation") for key in by_stage)

    return bool(urls) and has_validation_event and has_fetch_event and has_stage_counters, len(urls)


async def run_case(test_case: LiveTestCase) -> LiveTestResult:
    before_total_cost = float(get_ai_metrics_summary().get("total_cost_usd", 0.0) or 0.0)

    handler = LogCaptureHandler()
    handler.setFormatter(logging.Formatter("%(name)s - %(levelname)s - %(message)s"))
    root_logger = logging.getLogger()
    root_logger.addHandler(handler)

    scraper: AISearchScraper | None = None
    success = False
    confidence = 0.0
    selection_method: str | None = None
    cost_usd = 0.0
    error: str | None = None

    try:
        scraper = AISearchScraper(headless=True)
        result = await scraper.scrape_product(
            sku=test_case.sku,
            product_name=test_case.product_name,
            brand=test_case.brand,
        )
        success = bool(result.success)
        confidence = float(result.confidence or 0.0)
        selection_method = result.selection_method
        cost_usd = float(result.cost_usd or 0.0)
        error = result.error
    except Exception as exc:
        error = str(exc)
    finally:
        root_logger.removeHandler(handler)

    after_total_cost = float(get_ai_metrics_summary().get("total_cost_usd", 0.0) or 0.0)
    raw_telemetry = getattr(scraper, "_telemetry", {}) if scraper is not None else {}
    telemetry: dict[str, object] = {}
    if isinstance(raw_telemetry, Mapping):
        for raw_key, raw_value in cast(Mapping[object, object], raw_telemetry).items():
            telemetry[str(raw_key)] = raw_value
    telemetry_valid, telemetry_url_count = telemetry_is_valid(telemetry)

    telemetry_logged = any("URL telemetry:" in message for message in handler.messages) and any(
        "Job telemetry summary:" in message for message in handler.messages
    )
    two_step_signal = any(
        marker in message
        for message in handler.messages
        for marker in (
            "Using two-step refined results",
            "[Name Consolidator] Inferred name:",
        )
    )

    return LiveTestResult(
        sku=test_case.sku,
        success=success,
        confidence=confidence,
        selection_method=selection_method,
        cost_usd=cost_usd,
        metrics_cost_delta_usd=max(0.0, after_total_cost - before_total_cost),
        telemetry_url_count=telemetry_url_count,
        telemetry_valid=telemetry_valid and telemetry_logged,
        telemetry_logged=telemetry_logged,
        two_step_signal=two_step_signal,
        error=error,
    )


async def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

    env_name = load_runtime_env()
    collector = AIMetricsCollector()
    collector.reset()

    total_cases = len(TEST_CASES)

    if not os.environ.get("OPENAI_API_KEY"):
        print(f"Loaded {env_name}, but OPENAI_API_KEY is missing")
        print(f"Real SKUs [0/{total_cases} pass] | Cost Valid [NO] | Telemetry Valid [NO] | VERDICT: REJECT")
        return 1
    if not os.environ.get("SERPER_API_KEY"):
        print(f"Loaded {env_name}, but SERPER_API_KEY is missing")
        print(f"Real SKUs [0/{total_cases} pass] | Cost Valid [NO] | Telemetry Valid [NO] | VERDICT: REJECT")
        return 1

    print(f"Loaded environment: {env_name}")
    print(f"Two-step enabled: {os.environ.get('AI_SEARCH_ENABLE_TWO_STEP')}")

    results: list[LiveTestResult] = []
    for test_case in TEST_CASES:
        results.append(await run_case(test_case))

    pass_count = sum(1 for result in results if result.success)
    cost_valid = all(result.cost_usd > 0.0 and result.metrics_cost_delta_usd > 0.0 for result in results)
    telemetry_valid = all(result.telemetry_valid for result in results)
    verdict = "APPROVE" if pass_count == len(results) and cost_valid and telemetry_valid else "REJECT"
    cost_status = "YES" if cost_valid else "NO"
    telemetry_status = "YES" if telemetry_valid else "NO"

    for result in results:
        print(
            " | ".join(
                [
                    f"SKU {result.sku}",
                    f"success={result.success}",
                    f"confidence={result.confidence:.2f}",
                    f"selection_method={result.selection_method}",
                    f"cost=${result.cost_usd:.4f}",
                    f"metrics_delta=${result.metrics_cost_delta_usd:.4f}",
                    f"telemetry_urls={result.telemetry_url_count}",
                    f"telemetry_logged={result.telemetry_logged}",
                    f"two_step_signal={result.two_step_signal}",
                    f"error={result.error}",
                ]
            )
        )

    print(f"Real SKUs [{pass_count}/{len(results)} pass] | Cost Valid [{cost_status}] | Telemetry Valid [{telemetry_status}] | VERDICT: {verdict}")

    return 0 if verdict == "APPROVE" else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
