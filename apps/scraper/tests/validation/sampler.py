from __future__ import annotations

import json
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TypedDict, TypeAlias, cast

from dotenv import load_dotenv
from supabase import Client, create_client

SeedValue: TypeAlias = int | float | str | bytes | bytearray | None

REPO_ROOT = Path(__file__).resolve().parents[4]
SCRAPER_ROOT = REPO_ROOT / "apps" / "scraper"
WEB_ROOT = REPO_ROOT / "apps" / "web"
HISTORY_PATH = REPO_ROOT / ".sisyphus" / "evidence" / "sampling_history.json"
ENV_FILES = (
    SCRAPER_ROOT / ".env",
    SCRAPER_ROOT / ".env.development",
    WEB_ROOT / ".env.local",
    WEB_ROOT / ".env",
)
CATALOG_SELECT = "sku,name,brand:brands(name),category:categories!products_category_id_fkey(name)"


@dataclass(frozen=True, slots=True)
class ProductSample:
    sku: str
    name: str
    brand: str
    category: str


@dataclass(frozen=True, slots=True)
class SamplingHistoryEntry:
    sku: str
    sampled_date: str
    week_number: int
    year: int


class HistoryRecord(TypedDict):
    sku: str
    sampled_date: str
    week_number: int
    year: int


class HistoryBatch(TypedDict):
    sampled_date: str
    week_number: int
    year: int
    seed: SeedValue
    skus: list[str]


class HistoryPayload(TypedDict):
    history: list[HistoryRecord]
    batches: list[HistoryBatch]


class ProductSampler:
    def __init__(
        self,
        *,
        seed: SeedValue = None,
        history_path: str | Path = HISTORY_PATH,
    ) -> None:
        self.seed: SeedValue = seed
        self.history_path: Path = Path(history_path)
        self._catalog: list[ProductSample] | None = None
        self._client: Client | None = None
        self._load_environment()

    def load_catalog(self) -> list[ProductSample]:
        if self._catalog is not None:
            return list(self._catalog)

        client = self._get_client()
        page_size = 1000
        start = 0
        products: list[ProductSample] = []

        while True:
            response = client.table("products").select(CATALOG_SELECT).range(start, start + page_size - 1).execute()
            rows = response.data or []
            if not rows:
                break

            for row in rows:
                if not isinstance(row, dict):
                    continue
                sample = self._build_product_sample(cast(dict[str, object], row))
                if sample is not None:
                    products.append(sample)

            if len(rows) < page_size:
                break
            start += page_size

        if not products:
            raise ValueError("No products with SKU data were returned from the catalog")

        self._catalog = sorted(products, key=lambda product: product.sku)
        return list(self._catalog)

    def sample_skus(
        self,
        count: int,
        exclude_recent_weeks: int = 4,
        categories: list[str] | tuple[str, ...] | set[str] | None = None,
    ) -> list[ProductSample]:
        if count <= 0:
            return []

        catalog = self.load_catalog()
        filtered_catalog = self._filter_catalog(catalog, categories)
        excluded_skus = self._recently_sampled_skus(exclude_recent_weeks)
        available_catalog = [product for product in filtered_catalog if product.sku not in excluded_skus]

        if count > len(available_catalog):
            raise ValueError(f"Requested {count} SKUs but only {len(available_catalog)} are available after applying filters")

        rng = random.Random(self.seed)
        selected = rng.sample(available_catalog, count)
        return sorted(selected, key=lambda product: product.sku)

    def get_sample_history(self) -> list[SamplingHistoryEntry]:
        payload = self._read_history_payload()
        return [SamplingHistoryEntry(**entry) for entry in payload["history"]]

    def record_sampled_skus(self, skus: list[ProductSample] | list[str]) -> None:
        if not skus:
            return

        payload = self._read_history_payload()
        now = datetime.now(timezone.utc)
        iso_year, iso_week, _ = now.isocalendar()
        sampled_date = now.isoformat().replace("+00:00", "Z")

        sku_values: list[str] = []
        history_entries = payload["history"]
        for item in skus:
            sku = item.sku if isinstance(item, ProductSample) else str(item).strip()
            if not sku:
                continue
            sku_values.append(sku)
            history_entries.append(
                {
                    "sku": sku,
                    "sampled_date": sampled_date,
                    "week_number": iso_week,
                    "year": iso_year,
                }
            )

        if not sku_values:
            return

        batches = payload["batches"]
        batches.append(
            {
                "sampled_date": sampled_date,
                "week_number": iso_week,
                "year": iso_year,
                "seed": self.seed,
                "skus": sku_values,
            }
        )

        self.history_path.parent.mkdir(parents=True, exist_ok=True)
        _ = self.history_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")

    def _filter_catalog(
        self,
        catalog: list[ProductSample],
        categories: list[str] | tuple[str, ...] | set[str] | None,
    ) -> list[ProductSample]:
        if not categories:
            return list(catalog)

        normalized_categories = {category.strip().lower() for category in categories if category.strip()}
        return [product for product in catalog if product.category.strip().lower() in normalized_categories]

    def _recently_sampled_skus(self, exclude_recent_weeks: int) -> set[str]:
        if exclude_recent_weeks <= 0:
            return set()

        cutoff = datetime.now(timezone.utc) - timedelta(weeks=exclude_recent_weeks)
        recent_skus: set[str] = set()

        for entry in self.get_sample_history():
            sampled_at = self._parse_timestamp(entry.sampled_date)
            if sampled_at is not None and sampled_at >= cutoff:
                recent_skus.add(entry.sku)

        return recent_skus

    def _get_client(self) -> Client:
        if self._client is None:
            url, key = self._get_supabase_credentials()
            self._client = create_client(url, key)
        return self._client

    def _get_supabase_credentials(self) -> tuple[str, str]:
        import os

        url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("BSR_SUPABASE_REALTIME_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

        if not url or not key:
            raise EnvironmentError(
                "Missing Supabase credentials. Expected SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, BSR_SUPABASE_REALTIME_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY."
            )

        return url, key

    def _load_environment(self) -> None:
        for env_file in ENV_FILES:
            if env_file.exists():
                _ = load_dotenv(env_file, override=False)

    def _build_product_sample(self, row: dict[str, object]) -> ProductSample | None:
        sku = self._normalize_value(row.get("sku"))
        name = self._normalize_value(row.get("name"))
        if not sku or not name:
            return None

        brand_name = self._extract_nested_name(row.get("brand"))
        category_name = self._extract_nested_name(row.get("category"))

        return ProductSample(
            sku=sku,
            name=name,
            brand=brand_name,
            category=category_name,
        )

    def _extract_nested_name(self, value: object) -> str:
        if isinstance(value, dict):
            nested_name = cast(dict[str, object], value).get("name")
            return self._normalize_value(nested_name)
        if isinstance(value, list) and value:
            first_item = cast(list[object], value)[0]
            if isinstance(first_item, dict):
                nested_name = cast(dict[str, object], first_item).get("name")
                return self._normalize_value(nested_name)
        return ""

    def _normalize_value(self, value: object) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        return str(value).strip()

    def _read_history_payload(self) -> HistoryPayload:
        if not self.history_path.exists():
            return {"history": [], "batches": []}

        raw_content = self.history_path.read_text().strip()
        if not raw_content:
            return {"history": [], "batches": []}

        loaded_payload = cast(object, json.loads(raw_content))
        if not isinstance(loaded_payload, dict):
            raise ValueError(f"Sampling history must be a JSON object: {self.history_path}")
        payload = cast(dict[str, object], loaded_payload)

        history: list[HistoryRecord] = []
        raw_history = payload.get("history")
        if isinstance(raw_history, list):
            for entry in cast(list[object], raw_history):
                if not isinstance(entry, dict):
                    continue
                raw_entry = cast(dict[str, object], entry)
                sku = str(raw_entry.get("sku", "")).strip()
                sampled_date = str(raw_entry.get("sampled_date", "")).strip()
                week_number = raw_entry.get("week_number")
                year = raw_entry.get("year")
                if not sku or not sampled_date:
                    continue
                if not isinstance(week_number, int) or not isinstance(year, int):
                    continue
                history.append(
                    {
                        "sku": sku,
                        "sampled_date": sampled_date,
                        "week_number": week_number,
                        "year": year,
                    }
                )

        batches: list[HistoryBatch] = []
        raw_batches = payload.get("batches")
        if isinstance(raw_batches, list):
            for batch in cast(list[object], raw_batches):
                if not isinstance(batch, dict):
                    continue
                raw_batch = cast(dict[str, object], batch)
                sampled_date = str(raw_batch.get("sampled_date", "")).strip()
                week_number = raw_batch.get("week_number")
                year = raw_batch.get("year")
                seed = raw_batch.get("seed")
                raw_skus = raw_batch.get("skus")
                if not sampled_date:
                    continue
                if not isinstance(week_number, int) or not isinstance(year, int):
                    continue
                if not isinstance(raw_skus, list):
                    continue
                skus = [str(sku).strip() for sku in cast(list[object], raw_skus) if str(sku).strip()]
                batches.append(
                    {
                        "sampled_date": sampled_date,
                        "week_number": week_number,
                        "year": year,
                        "seed": seed if isinstance(seed, (int, float, str, bytes, bytearray)) else None,
                        "skus": skus,
                    }
                )

        return {"history": history, "batches": batches}

    def _parse_timestamp(self, value: str) -> datetime | None:
        normalized_value = value.strip()
        if not normalized_value:
            return None
        if normalized_value.endswith("Z"):
            normalized_value = normalized_value[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(normalized_value)
        except ValueError:
            return None
        return parsed.astimezone(timezone.utc) if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def sample_skus(
    count: int,
    exclude_recent_weeks: int = 4,
    categories: list[str] | tuple[str, ...] | set[str] | None = None,
    *,
    seed: SeedValue = None,
) -> list[ProductSample]:
    sampler = ProductSampler(seed=seed)
    return sampler.sample_skus(
        count=count,
        exclude_recent_weeks=exclude_recent_weeks,
        categories=categories,
    )


def get_sample_history() -> list[SamplingHistoryEntry]:
    return ProductSampler().get_sample_history()


def record_sampled_skus(skus: list[ProductSample] | list[str], *, seed: SeedValue = None) -> None:
    ProductSampler(seed=seed).record_sampled_skus(skus)
