"""Run Prompt v1 Gemini consolidation tests and save evidence artifacts."""

from __future__ import annotations

import json
import sys
import types
from datetime import datetime, timezone
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from typing import Callable, Protocol, TypedDict, cast


SELECTED_GROUP_IDS = [
    "bentley-seeds",
    "acme-pet-food",
    "cherrybrook-treats",
    "outdoor-edge-tools",
    "zone-pet-supplies",
]


class ProductFixture(TypedDict, total=False):
    sku: str
    name: str
    upc: str
    brand: str
    category: str
    price: str


class ProductGroup(TypedDict):
    group_id: str
    group_name: str
    sku_prefix: str
    products: list[ProductFixture]


class ResultLike(Protocol):
    brand: str | None
    category: str | None
    name: str | None
    raw_response: str | None
    response_time_ms: float
    success: bool
    error: str | None


class MetricsLike(Protocol):
    brand_consistency: float
    category_consistency: float
    name_adherence: float
    total_products: int
    successful_calls: int


def result_to_dict(result: ResultLike) -> dict[str, object]:
    return {
        "brand": result.brand,
        "category": result.category,
        "name": result.name,
        "raw_response": result.raw_response,
        "response_time_ms": result.response_time_ms,
        "success": result.success,
        "error": result.error,
    }


def metrics_to_dict(metrics: MetricsLike) -> dict[str, object]:
    return {
        "brand_consistency": metrics.brand_consistency,
        "category_consistency": metrics.category_consistency,
        "name_adherence": metrics.name_adherence,
        "total_products": metrics.total_products,
        "successful_calls": metrics.successful_calls,
    }


def get_repo_root() -> Path:
    return Path(__file__).resolve().parents[5]


def load_test_harness_module() -> types.ModuleType:
    module_path = Path(__file__).resolve().with_name("test_harness.py")
    spec = spec_from_file_location("prompt_v1_test_harness", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load test_harness.py")

    module = module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_selected_groups(fixtures_path: Path) -> list[ProductGroup]:
    fixture_payload = cast(
        dict[str, object], json.loads(fixtures_path.read_text(encoding="utf-8"))
    )
    raw_groups = cast(list[object], fixture_payload["product_groups"])

    groups_by_id: dict[str, ProductGroup] = {}
    for raw_group in raw_groups:
        group = cast(dict[str, object], raw_group)
        product_group: ProductGroup = {
            "group_id": str(group["group_id"]),
            "group_name": str(group["group_name"]),
            "sku_prefix": str(group["sku_prefix"]),
            "products": cast(list[ProductFixture], group["products"]),
        }
        groups_by_id[product_group["group_id"]] = product_group

    return [groups_by_id[group_id] for group_id in SELECTED_GROUP_IDS]


def write_json(file_path: Path, payload: object) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    _ = file_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> int:
    harness_module = load_test_harness_module()
    batch_consolidation_test = cast(
        Callable[[list[ProductFixture], str, str], list[ResultLike]],
        harness_module.batch_consolidation_test,
    )
    calculate_consistency_metrics = cast(
        Callable[[list[ResultLike]], MetricsLike],
        harness_module.calculate_consistency_metrics,
    )

    repo_root = get_repo_root()
    prompt_path = repo_root / ".sisyphus/drafts/prompt-v1-optimized.txt"
    fixtures_path = (
        repo_root
        / "apps/web/lib/consolidation/__tests__/fixtures/test-product-groups.json"
    )
    evidence_root = repo_root / ".sisyphus/evidence/prompt-v1"

    system_prompt = prompt_path.read_text(encoding="utf-8").strip()
    selected_groups = load_selected_groups(fixtures_path)

    metadata: dict[str, object] = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "client_type": "gemini",
        "selected_group_ids": SELECTED_GROUP_IDS,
        "group_count": len(selected_groups),
        "prompt_source": str(prompt_path.relative_to(repo_root)).replace("\\", "/"),
        "prompt_version": "prompt-v1-optimized",
        "rendered_system_prompt": system_prompt,
        "fixtures_source": str(fixtures_path.relative_to(repo_root)).replace("\\", "/"),
    }
    write_json(evidence_root / "test-metadata.json", metadata)

    failures: list[dict[str, str]] = []

    for group in selected_groups:
        group_dir = evidence_root / group["group_id"]
        results: list[ResultLike] = batch_consolidation_test(
            group["products"], system_prompt, "gemini"
        )
        metrics = metrics_to_dict(calculate_consistency_metrics(results))
        metrics["average_response_time_ms"] = round(
            sum(result.response_time_ms for result in results) / len(results), 2
        )
        metrics["error_count"] = sum(1 for result in results if result.error)

        serialized_results: list[dict[str, object]] = []
        for product, result in zip(group["products"], results, strict=True):
            serialized_results.append(
                {
                    "input": product,
                    "result": result_to_dict(result),
                }
            )
            if not result.success:
                failures.append(
                    {
                        "group_id": group["group_id"],
                        "sku": str(product.get("sku", "")),
                        "error": result.error or "",
                    }
                )

        write_json(group_dir / "results.json", serialized_results)
        write_json(group_dir / "metrics.json", metrics)

    if failures:
        print(json.dumps({"status": "failed", "failures": failures}, indent=2))
        return 1

    print(
        json.dumps(
            {
                "status": "ok",
                "evidence_root": str(evidence_root),
                "groups": SELECTED_GROUP_IDS,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
