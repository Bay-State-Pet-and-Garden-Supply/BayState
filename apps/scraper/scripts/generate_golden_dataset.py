#!/usr/bin/env python3
"""Generate a golden dataset for AI Search benchmarking."""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import sys
from collections.abc import Callable, Sequence
from datetime import datetime
from pathlib import Path
from typing import ClassVar, Literal, Protocol, cast

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scrapers.ai_search.cache_manager import CacheManager
from scrapers.ai_search.fixture_search_client import FixtureSearchClient
from scrapers.providers.serper import SerperSearchClient

DATASET_VERSION = "1.0"
DEFAULT_MAX_CALLS = 100
DEFAULT_BATCH_RATIONALE = "Batch mode accepted the top-ranked search result as ground truth."
SCHEMA_PATH = ROOT / "data" / "golden_dataset_schema.json"

AnnotationMode = Literal["batch", "interactive"]
Difficulty = Literal["easy", "medium", "hard"]
InputFn = Callable[[str], str]
OutputFn = Callable[[str], None]
DEFAULT_DIFFICULTY: Difficulty = "easy"


class DatasetArgs(argparse.Namespace):
    """Typed argparse namespace for the CLI."""

    products: Path = Path()
    output: Path = Path()
    batch: bool = False
    interactive: bool = False
    max_calls: int = DEFAULT_MAX_CALLS
    annotator: str = ""
    source: str | None = None
    cache_dir: Path | None = None


class CacheManagerProtocol(Protocol):
    """Protocol for cache lookups used by dataset generation."""

    @property
    def cache_dir(self) -> Path: ...

    def get_cached_result(self, query: str) -> tuple[list[dict[str, object]], bool]: ...


class SearchClientProtocol(Protocol):
    """Protocol for search clients used by dataset generation."""

    async def search(self, query: str) -> tuple[list[dict[str, object]], str | None]: ...


class CacheWriterProtocol(Protocol):
    """Protocol for cache writers used by dataset generation."""

    def write_cache_entry(self, query: str, results: list[dict[str, object]]) -> Path: ...


class DatasetEntry(BaseModel):
    """A single golden dataset annotation."""

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    query: str = Field(min_length=1)
    expected_source_url: str = Field(min_length=1, json_schema_extra={"format": "uri"})
    category: str = Field(min_length=1)
    difficulty: Difficulty
    rationale: str = Field(min_length=1)

    @field_validator("expected_source_url")
    @classmethod
    def validate_expected_source_url(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized.startswith(("http://", "https://")):
            raise ValueError("expected_source_url must be an absolute http(s) URL")
        return normalized


class DatasetProvenance(BaseModel):
    """Metadata describing how the dataset was generated."""

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    annotator: str = Field(min_length=1)
    source: str = Field(min_length=1)
    mode: AnnotationMode
    product_count: int = Field(ge=0)
    max_calls: int = Field(ge=1, le=DEFAULT_MAX_CALLS)
    serper_calls_used: int = Field(ge=0, le=DEFAULT_MAX_CALLS)


class GoldenDataset(BaseModel):
    """Validated golden dataset payload."""

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    version: str = Field(min_length=1)
    created_at: datetime
    provenance: DatasetProvenance
    entries: list[DatasetEntry]


def build_schema_document() -> dict[str, object]:
    """Build the JSON schema for the golden dataset."""
    schema = cast(dict[str, object], GoldenDataset.model_json_schema())
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["$id"] = "https://baystate.internal/schemas/golden_dataset_schema.json"
    return schema


def load_schema_document(schema_path: Path = SCHEMA_PATH) -> dict[str, object]:
    """Load the committed JSON schema from disk."""
    with open(schema_path, encoding="utf-8") as handle:
        loaded = cast(object, json.load(handle))
    if not isinstance(loaded, dict):
        raise ValueError(f"Schema file must contain a JSON object: {schema_path}")
    return cast(dict[str, object], loaded)


def validate_dataset_payload(payload: object, schema_path: Path = SCHEMA_PATH) -> dict[str, object]:
    """Validate the dataset payload against the committed schema model."""
    committed_schema = load_schema_document(schema_path)
    generated_schema = build_schema_document()
    if committed_schema != generated_schema:
        raise ValueError(f"Committed schema is out of sync with the generator model: {schema_path}")

    validated = GoldenDataset.model_validate(payload)
    return validated.model_dump(mode="json")


def parse_args(argv: Sequence[str] | None = None) -> DatasetArgs:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(description="Generate a golden dataset for AI Search benchmarking")
    _ = parser.add_argument("--products", type=Path, required=True, help="Path to a CSV or JSON product file")
    _ = parser.add_argument("--output", type=Path, required=True, help="Path to the output dataset JSON file")
    _ = parser.add_argument(
        "--batch",
        action="store_true",
        help="Use the top-ranked search result as ground truth (default when --interactive is omitted)",
    )
    _ = parser.add_argument("--interactive", action="store_true", help="Prompt for manual URL selection")
    _ = parser.add_argument(
        "--max-calls",
        type=int,
        default=DEFAULT_MAX_CALLS,
        help=f"Maximum uncached Serper API calls to allow (1-{DEFAULT_MAX_CALLS})",
    )
    _ = parser.add_argument("--annotator", default=_default_annotator(), help="Annotator name for provenance metadata")
    _ = parser.add_argument(
        "--source",
        default=None,
        help="Source label for provenance metadata (defaults to the input file path)",
    )
    _ = parser.add_argument(
        "--cache-dir",
        type=Path,
        default=None,
        help="Optional cache directory override for AI search results",
    )

    args = cast(DatasetArgs, parser.parse_args(argv))
    if args.batch and args.interactive:
        parser.error("Choose either --batch or --interactive, not both")
    if args.max_calls < 1 or args.max_calls > DEFAULT_MAX_CALLS:
        parser.error(f"--max-calls must be between 1 and {DEFAULT_MAX_CALLS}")
    return args


def _default_annotator() -> str:
    """Return a best-effort annotator default."""
    return os.getenv("USER") or os.getenv("USERNAME") or "unknown"


def load_products(products_path: Path) -> list[dict[str, object]]:
    """Load products from a CSV or JSON file."""
    if not products_path.exists():
        raise FileNotFoundError(f"Products file not found: {products_path}")

    suffix = products_path.suffix.lower()
    if suffix == ".csv":
        return _load_products_from_csv(products_path)
    if suffix == ".json":
        return _load_products_from_json(products_path)
    raise ValueError(f"Unsupported product file format: {products_path.suffix}")


def _load_products_from_csv(products_path: Path) -> list[dict[str, object]]:
    with open(products_path, encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return [dict(row) for row in reader]


def _load_products_from_json(products_path: Path) -> list[dict[str, object]]:
    with open(products_path, encoding="utf-8") as handle:
        payload = cast(object, json.load(handle))

    if isinstance(payload, list):
        records = cast(list[object], payload)
    elif isinstance(payload, dict):
        payload_dict = cast(dict[str, object], payload)
        products = payload_dict.get("products")
        if not isinstance(products, list):
            raise ValueError("JSON product files must contain either a list or a top-level 'products' list")
        records = cast(list[object], products)
    else:
        raise ValueError("JSON product files must contain either a list or a top-level 'products' list")

    normalized: list[dict[str, object]] = []
    for item in records:
        if not isinstance(item, dict):
            raise ValueError("Each product entry must be a JSON object")
        item_dict = cast(dict[object, object], item)
        normalized.append({str(key): value for key, value in item_dict.items()})
    return normalized


def _get_first_value(product: dict[str, object], *keys: str) -> str:
    for key in keys:
        value = product.get(key)
        if value is None:
            continue
        if isinstance(value, list):
            items = cast(list[object], value)
            joined = " > ".join(str(item).strip() for item in items if str(item).strip())
            if joined:
                return joined
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def build_query(product: dict[str, object]) -> str:
    """Generate a search query from product fields."""
    candidates = [
        _get_first_value(product, "sku", "SKU"),
        _get_first_value(product, "name", "product_name", "title"),
        _get_first_value(product, "brand", "Brand", "manufacturer"),
        _get_first_value(product, "category", "categories", "department"),
    ]
    parts: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        normalized = " ".join(candidate.split())
        if not normalized:
            continue
        dedupe_key = normalized.casefold()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        parts.append(normalized)

    if not parts:
        raise ValueError("Unable to build a query from product data")
    return " ".join(parts)


def derive_category(product: dict[str, object]) -> str:
    """Derive the category stored in the dataset entry."""
    return _get_first_value(product, "category", "categories", "department") or "unknown"


def derive_default_difficulty(result_rank: int) -> Difficulty:
    """Infer a reasonable default difficulty from the selected rank."""
    if result_rank <= 1:
        return "easy"
    if result_rank <= 3:
        return "medium"
    return "hard"


class SearchResultFetcher:
    """Fetch results using cache first, then Serper within the call budget."""

    def __init__(
        self,
        *,
        cache_manager: CacheManagerProtocol,
        search_client: SearchClientProtocol,
        cache_writer: CacheWriterProtocol,
        max_calls: int,
    ) -> None:
        self._cache_manager: CacheManagerProtocol = cache_manager
        self._search_client: SearchClientProtocol = search_client
        self._cache_writer: CacheWriterProtocol = cache_writer
        self._max_calls: int = max_calls
        self._serper_calls_used: int = 0

    @property
    def serper_calls_used(self) -> int:
        return self._serper_calls_used

    async def fetch(self, query: str) -> tuple[list[dict[str, object]], bool]:
        cached_results, found = self._cache_manager.get_cached_result(query)
        if found:
            return [dict(result) for result in cached_results], True

        if self._serper_calls_used >= self._max_calls:
            raise RuntimeError(f"Refusing to exceed the configured Serper API budget of {self._max_calls} calls")

        results, error = await self._search_client.search(query)
        if error:
            raise RuntimeError(f"Search failed for query {query!r}: {error}")

        self._serper_calls_used += 1
        serializable_results = [dict(result) for result in results]
        _ = self._cache_writer.write_cache_entry(query, serializable_results)
        return serializable_results, False


def _display_results(query: str, product: dict[str, object], results: Sequence[dict[str, object]], output_fn: OutputFn) -> None:
    product_name = _get_first_value(product, "name", "product_name", "title") or "Unnamed product"
    output_fn("")
    output_fn(f"Product: {product_name}")
    output_fn(f"Query: {query}")
    output_fn("Search results:")
    for index, result in enumerate(results, start=1):
        title = str(result.get("title") or "Untitled result")
        url = str(result.get("url") or "")
        description = str(result.get("description") or "")
        output_fn(f"  [{index}] {title}")
        output_fn(f"      URL: {url}")
        if description:
            output_fn(f"      Snippet: {description}")


def _prompt_selection(results_count: int, input_fn: InputFn, output_fn: OutputFn) -> int | None:
    while True:
        raw = input_fn("Select the best result number (or 's' to skip): ").strip().lower()
        if raw == "s":
            return None
        if raw.isdigit():
            value = int(raw)
            if 1 <= value <= results_count:
                return value - 1
        output_fn(f"Enter a number between 1 and {results_count}, or 's' to skip.")


def _prompt_with_default(prompt: str, default: str, input_fn: InputFn) -> str:
    response = input_fn(f"{prompt} [{default}]: ").strip()
    return response or default


def _prompt_difficulty(default: Difficulty, input_fn: InputFn, output_fn: OutputFn) -> Difficulty:
    while True:
        candidate = _prompt_with_default("Difficulty (easy/medium/hard)", default, input_fn).lower()
        if candidate in {"easy", "medium", "hard"}:
            return cast(Difficulty, candidate)
        output_fn("Difficulty must be one of: easy, medium, hard.")


def _build_batch_entry(query: str, product: dict[str, object], results: Sequence[dict[str, object]]) -> DatasetEntry:
    selected = results[0]
    return DatasetEntry(
        query=query,
        expected_source_url=str(selected.get("url") or ""),
        category=derive_category(product),
        difficulty=DEFAULT_DIFFICULTY,
        rationale=DEFAULT_BATCH_RATIONALE,
    )


def _build_interactive_entry(
    *,
    query: str,
    product: dict[str, object],
    results: Sequence[dict[str, object]],
    input_fn: InputFn,
    output_fn: OutputFn,
) -> DatasetEntry | None:
    if not results:
        output_fn("No search results were returned; skipping annotation.")
        return None

    _display_results(query, product, results, output_fn)
    selected_index = _prompt_selection(len(results), input_fn, output_fn)
    if selected_index is None:
        return None

    selected = results[selected_index]
    default_category = derive_category(product)
    default_difficulty = derive_default_difficulty(selected_index + 1)
    default_rationale = f"Interactive annotation selected result #{selected_index + 1} as the best match."

    category = _prompt_with_default("Category", default_category, input_fn)
    difficulty = _prompt_difficulty(default_difficulty, input_fn, output_fn)
    rationale = _prompt_with_default("Rationale", default_rationale, input_fn)

    return DatasetEntry(
        query=query,
        expected_source_url=str(selected.get("url") or ""),
        category=category,
        difficulty=difficulty,
        rationale=rationale,
    )


async def generate_dataset(
    *,
    products_path: Path,
    output_path: Path,
    max_calls: int,
    interactive: bool,
    annotator: str,
    source: str,
    cache_dir: Path | None = None,
    search_client: SearchClientProtocol | None = None,
    cache_manager: CacheManagerProtocol | None = None,
    cache_writer: CacheWriterProtocol | None = None,
    input_fn: InputFn = input,
    output_fn: OutputFn = print,
) -> dict[str, object]:
    """Generate and persist a golden dataset."""
    products = load_products(products_path)
    mode: AnnotationMode = "interactive" if interactive else "batch"

    manager = cache_manager or CacheManager(cache_dir=cache_dir)
    writer = cache_writer or FixtureSearchClient(cache_dir=manager.cache_dir)
    client = search_client or SerperSearchClient()
    fetcher = SearchResultFetcher(
        cache_manager=manager,
        search_client=client,
        cache_writer=writer,
        max_calls=max_calls,
    )

    output_fn(f"Loaded {len(products)} products from {products_path}")
    entries: list[DatasetEntry] = []
    for index, product in enumerate(products, start=1):
        query = build_query(product)
        results, from_cache = await fetcher.fetch(query)
        source_label = "cache" if from_cache else "serper"
        output_fn(f"[{index}/{len(products)}] {query} ({source_label}, {len(results)} results)")

        entry = (
            _build_interactive_entry(
                query=query,
                product=product,
                results=results,
                input_fn=input_fn,
                output_fn=output_fn,
            )
            if interactive
            else (_build_batch_entry(query, product, results) if results else None)
        )

        if entry is None:
            output_fn(f"Skipped product {index}; no ground truth annotation recorded.")
            continue

        entries.append(entry)
        output_fn(f"Recorded {entry.expected_source_url}")

    payload: dict[str, object] = {
        "version": DATASET_VERSION,
        "created_at": datetime.now(),
        "provenance": {
            "annotator": annotator.strip() or _default_annotator(),
            "source": source,
            "mode": mode,
            "product_count": len(products),
            "max_calls": max_calls,
            "serper_calls_used": fetcher.serper_calls_used,
        },
        "entries": [entry.model_dump(mode="json") for entry in entries],
    }
    validated_payload = validate_dataset_payload(payload)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(validated_payload, handle, indent=2)
        _ = handle.write("\n")

    output_fn(f"Wrote {len(entries)} dataset entries to {output_path}")
    return validated_payload


async def run_cli(args: argparse.Namespace) -> dict[str, object]:
    """Run the CLI using parsed arguments."""
    typed_args = cast(DatasetArgs, args)
    source = typed_args.source or str(typed_args.products)
    return await generate_dataset(
        products_path=typed_args.products,
        output_path=typed_args.output,
        max_calls=typed_args.max_calls,
        interactive=typed_args.interactive,
        annotator=typed_args.annotator,
        source=source,
        cache_dir=typed_args.cache_dir,
    )


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point."""
    try:
        args = parse_args(argv)
        _ = asyncio.run(run_cli(args))
    except (FileNotFoundError, OSError, RuntimeError, ValidationError, ValueError, json.JSONDecodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
