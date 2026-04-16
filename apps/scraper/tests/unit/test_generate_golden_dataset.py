from __future__ import annotations

import json
from pathlib import Path
from typing import cast

import pytest

from scripts.generate_golden_dataset import (
    DEFAULT_BATCH_RATIONALE,
    SCHEMA_PATH,
    SearchResultFetcher,
    build_query,
    build_schema_document,
    generate_dataset,
    load_products,
    parse_args,
    validate_dataset_payload,
)


class _FakeCacheManager:
    def __init__(self, cached_results: dict[str, list[dict[str, object]]] | None = None, cache_dir: Path | None = None) -> None:
        self._cached_results: dict[str, list[dict[str, object]]] = cached_results or {}
        self.cache_dir: Path = cache_dir or Path("/tmp/fake-cache")

    def get_cached_result(self, query: str) -> tuple[list[dict[str, object]], bool]:
        if query not in self._cached_results:
            return [], False
        return [dict(result) for result in self._cached_results[query]], True


class _FakeSearchClient:
    def __init__(self, search_map: dict[str, tuple[list[dict[str, object]], str | None]]) -> None:
        self._search_map: dict[str, tuple[list[dict[str, object]], str | None]] = search_map
        self.calls: list[str] = []

    async def search(self, query: str) -> tuple[list[dict[str, object]], str | None]:
        self.calls.append(query)
        return self._search_map.get(query, ([], None))


class _FakeCacheWriter:
    def __init__(self) -> None:
        self.writes: list[tuple[str, list[dict[str, object]]]] = []

    def write_cache_entry(self, query: str, results: list[dict[str, object]]) -> Path:
        self.writes.append((query, [dict(result) for result in results]))
        return Path(f"/tmp/{len(self.writes)}.json")


def _sample_product() -> dict[str, object]:
    return {
        "sku": "072705115305",
        "name": "Blue Buffalo Life Protection Formula Adult Dog Food 5lb",
        "brand": "Blue Buffalo",
        "category": "Pet Food > Dog Food > Dry Food",
    }


def _sample_result(url: str = "https://example.com/product") -> dict[str, object]:
    return {
        "url": url,
        "title": "Blue Buffalo Dog Food",
        "description": "Official product page",
        "provider": "serper",
        "result_type": "organic",
    }


def test_load_products_supports_json_and_csv(tmp_path: Path) -> None:
    json_path = tmp_path / "products.json"
    _ = json_path.write_text(json.dumps({"products": [_sample_product()]}), encoding="utf-8")

    csv_path = tmp_path / "products.csv"
    _ = csv_path.write_text(
        "sku,name,brand,category\n072705115305,Blue Buffalo Life Protection Formula Adult Dog Food 5lb,Blue Buffalo,Pet Food > Dog Food > Dry Food\n",
        encoding="utf-8",
    )

    json_products = load_products(json_path)
    csv_products = load_products(csv_path)

    assert json_products[0]["sku"] == "072705115305"
    assert csv_products[0]["brand"] == "Blue Buffalo"


def test_build_query_uses_product_fields() -> None:
    query = build_query(_sample_product())
    assert "072705115305" in query
    assert "Blue Buffalo Life Protection Formula Adult Dog Food 5lb" in query
    assert "Blue Buffalo" in query
    assert "Pet Food > Dog Food > Dry Food" in query


@pytest.mark.asyncio
async def test_search_result_fetcher_uses_cache_before_serper(tmp_path: Path) -> None:
    query = build_query(_sample_product())
    cache_manager = _FakeCacheManager({query: [_sample_result("https://cached.example.com/product")]}, cache_dir=tmp_path)
    search_client = _FakeSearchClient({})
    cache_writer = _FakeCacheWriter()
    fetcher = SearchResultFetcher(
        cache_manager=cache_manager,
        search_client=search_client,
        cache_writer=cache_writer,
        max_calls=1,
    )

    results, from_cache = await fetcher.fetch(query)

    assert from_cache is True
    assert results[0]["url"] == "https://cached.example.com/product"
    assert search_client.calls == []
    assert cache_writer.writes == []


@pytest.mark.asyncio
async def test_generate_dataset_batch_mode_selects_top_result_and_writes_output(tmp_path: Path) -> None:
    products_path = tmp_path / "products.json"
    output_path = tmp_path / "dataset.json"
    _ = products_path.write_text(json.dumps([_sample_product()]), encoding="utf-8")

    query = build_query(_sample_product())
    search_client = _FakeSearchClient({query: ([_sample_result(), _sample_result("https://example.com/other")], None)})
    cache_writer = _FakeCacheWriter()
    output_lines: list[str] = []

    dataset = await generate_dataset(
        products_path=products_path,
        output_path=output_path,
        max_calls=5,
        interactive=False,
        annotator="qa-bot",
        source="fixture-products",
        cache_manager=_FakeCacheManager(cache_dir=tmp_path),
        cache_writer=cache_writer,
        search_client=search_client,
        output_fn=output_lines.append,
    )

    saved = cast(dict[str, object], json.loads(output_path.read_text(encoding="utf-8")))
    provenance = cast(dict[str, object], saved["provenance"])
    entries = cast(list[dict[str, object]], saved["entries"])

    assert dataset == saved
    assert saved["version"] == "1.0"
    assert provenance["annotator"] == "qa-bot"
    assert provenance["source"] == "fixture-products"
    assert provenance["serper_calls_used"] == 1
    assert entries == [
        {
            "query": query,
            "expected_source_url": "https://example.com/product",
            "category": "Pet Food > Dog Food > Dry Food",
            "difficulty": "easy",
            "rationale": DEFAULT_BATCH_RATIONALE,
        }
    ]
    assert cache_writer.writes[0][0] == query
    assert any("Recorded https://example.com/product" in line for line in output_lines)


@pytest.mark.asyncio
async def test_generate_dataset_interactive_mode_prompts_for_selection(tmp_path: Path) -> None:
    products_path = tmp_path / "products.json"
    output_path = tmp_path / "interactive-dataset.json"
    _ = products_path.write_text(json.dumps([_sample_product()]), encoding="utf-8")

    query = build_query(_sample_product())
    search_client = _FakeSearchClient(
        {
            query: (
                [
                    _sample_result("https://example.com/first"),
                    _sample_result("https://example.com/second"),
                ],
                None,
            )
        }
    )
    prompts = iter(["2", "Custom Category", "hard", "Second result was the retailer PDP."])
    output_lines: list[str] = []

    dataset = await generate_dataset(
        products_path=products_path,
        output_path=output_path,
        max_calls=5,
        interactive=True,
        annotator="reviewer",
        source="interactive-fixture",
        cache_manager=_FakeCacheManager(cache_dir=tmp_path),
        cache_writer=_FakeCacheWriter(),
        search_client=search_client,
        input_fn=lambda _: next(prompts),
        output_fn=output_lines.append,
    )

    entries = cast(list[dict[str, object]], dataset["entries"])
    assert entries == [
        {
            "query": query,
            "expected_source_url": "https://example.com/second",
            "category": "Custom Category",
            "difficulty": "hard",
            "rationale": "Second result was the retailer PDP.",
        }
    ]
    assert any("[2] Blue Buffalo Dog Food" in line for line in output_lines)
    assert any("Search results:" in line for line in output_lines)


def test_validate_dataset_payload_uses_committed_schema() -> None:
    payload = {
        "version": "1.0",
        "created_at": "2026-04-16T12:00:00",
        "provenance": {
            "annotator": "qa-bot",
            "source": "fixtures.json",
            "mode": "batch",
            "product_count": 1,
            "max_calls": 5,
            "serper_calls_used": 1,
        },
        "entries": [
            {
                "query": build_query(_sample_product()),
                "expected_source_url": "https://example.com/product",
                "category": "Pet Food > Dog Food > Dry Food",
                "difficulty": "easy",
                "rationale": DEFAULT_BATCH_RATIONALE,
            }
        ],
    }

    validated = validate_dataset_payload(payload)
    schema = cast(dict[str, object], json.loads(SCHEMA_PATH.read_text(encoding="utf-8")))
    entries = cast(list[dict[str, object]], validated["entries"])

    assert entries[0]["expected_source_url"] == "https://example.com/product"
    assert schema == build_schema_document()


def test_parse_args_enforces_serper_budget() -> None:
    with pytest.raises(SystemExit):
        _ = parse_args(["--products", "products.json", "--output", "dataset.json", "--max-calls", "101"])
