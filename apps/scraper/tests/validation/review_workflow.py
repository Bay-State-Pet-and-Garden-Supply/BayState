from __future__ import annotations

import csv
import json
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import cast


REVIEW_COLUMNS = [
    "sku",
    "product_name",
    "source_url",
    "extracted_name",
    "extracted_brand",
    "extracted_price",
    "extracted_images",
    "name_correct",
    "brand_correct",
    "price_correct",
    "images_correct",
    "notes",
    "reviewer_name",
    "review_date",
]

CHECKBOX_FIELDS = ["name_correct", "brand_correct", "price_correct", "images_correct"]
REQUIRED_IMPORT_FIELDS = REVIEW_COLUMNS.copy()


@dataclass(frozen=True)
class ReviewedResult:
    sku: str
    product_name: str
    source_url: str
    extracted_name: str
    extracted_brand: str
    extracted_price: str
    extracted_images: list[str]
    name_correct: bool | None
    brand_correct: bool | None
    price_correct: bool | None
    images_correct: bool | None
    notes: str
    reviewer_name: str
    review_date: str


def _stringify(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _coerce_mapping(value: object) -> dict[str, object]:
    if isinstance(value, Mapping):
        mapping_value = cast(Mapping[object, object], value)
        coerced: dict[str, object] = {}
        for key, mapped_value in mapping_value.items():
            coerced[str(key)] = mapped_value
        return coerced
    if hasattr(value, "__dict__"):
        return cast(dict[str, object], dict(vars(value)))
    return {}


def _coerce_images(value: object) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        images: list[str] = []
        for item in cast(list[object], value):
            rendered = _stringify(item)
            if rendered:
                images.append(rendered)
        return images
    if isinstance(value, tuple):
        images = []
        for item in cast(tuple[object, ...], value):
            rendered = _stringify(item)
            if rendered:
                images.append(rendered)
        return images
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        try:
            parsed = cast(object, json.loads(stripped))
        except json.JSONDecodeError:
            return [part.strip() for part in stripped.split("|") if part.strip()]
        if isinstance(parsed, list):
            images = []
            for item in cast(list[object], parsed):
                rendered = _stringify(item)
                if rendered:
                    images.append(rendered)
            return images
        return [stripped]
    return [_stringify(value)]


def _serialize_images(value: object) -> str:
    return json.dumps(_coerce_images(value))


def _parse_checkbox(value: str, field_name: str, row_number: int) -> bool | None:
    normalized = value.strip().upper()
    if normalized == "":
        return None
    if normalized == "TRUE":
        return True
    if normalized == "FALSE":
        return False
    raise ValueError(f"Invalid checkbox value for {field_name} on row {row_number}: {value!r}. Expected TRUE, FALSE, or blank.")


def _validate_review_date(value: str, row_number: int) -> str:
    cleaned = value.strip()
    if not cleaned:
        return ""
    try:
        _ = datetime.fromisoformat(cleaned)
    except ValueError:
        try:
            _ = date.fromisoformat(cleaned)
        except ValueError as exc:
            raise ValueError(f"Invalid review_date on row {row_number}: {value!r}. Use ISO date or datetime.") from exc
    return cleaned


def _build_template_row(validation_result: object) -> dict[str, str]:
    payload = _coerce_mapping(validation_result)
    extracted = _coerce_mapping(payload.get("extracted_data"))

    return {
        "sku": _stringify(payload.get("sku")),
        "product_name": _stringify(payload.get("product_name") or payload.get("name") or extracted.get("product_name") or extracted.get("name")),
        "source_url": _stringify(payload.get("source_url") or payload.get("url") or extracted.get("source_url")),
        "extracted_name": _stringify(extracted.get("name") or payload.get("extracted_name") or payload.get("name")),
        "extracted_brand": _stringify(extracted.get("brand") or payload.get("extracted_brand") or payload.get("brand")),
        "extracted_price": _stringify(extracted.get("price") or payload.get("extracted_price") or payload.get("price")),
        "extracted_images": _serialize_images(extracted.get("images") or payload.get("extracted_images") or payload.get("images")),
        "name_correct": "",
        "brand_correct": "",
        "price_correct": "",
        "images_correct": "",
        "notes": "",
        "reviewer_name": "",
        "review_date": "",
    }


class ReviewWorkflow:
    def __init__(self) -> None:
        self.reviewed_results: list[ReviewedResult] = []

    def create_review_template(
        self,
        validation_results: list[object],
        output_path: str | Path,
    ) -> Path:
        template_path = Path(output_path)
        template_path.parent.mkdir(parents=True, exist_ok=True)

        with template_path.open("w", newline="", encoding="utf-8") as csv_file:
            writer = csv.DictWriter(csv_file, fieldnames=REVIEW_COLUMNS)
            writer.writeheader()
            for result in validation_results:
                writer.writerow(_build_template_row(result))

        return template_path

    def import_reviewed_results(self, csv_path: str | Path) -> list[ReviewedResult]:
        review_path = Path(csv_path)
        with review_path.open("r", newline="", encoding="utf-8") as csv_file:
            reader = csv.DictReader(csv_file)
            if reader.fieldnames is None:
                raise ValueError("Reviewed CSV is missing a header row")

            missing_fields = [field for field in REQUIRED_IMPORT_FIELDS if field not in reader.fieldnames]
            if missing_fields:
                raise ValueError(f"Reviewed CSV missing required fields: {', '.join(missing_fields)}")

            imported_results: list[ReviewedResult] = []
            for row_number, row in enumerate(reader, start=2):
                imported_results.append(
                    ReviewedResult(
                        sku=row["sku"].strip(),
                        product_name=row["product_name"].strip(),
                        source_url=row["source_url"].strip(),
                        extracted_name=row["extracted_name"].strip(),
                        extracted_brand=row["extracted_brand"].strip(),
                        extracted_price=row["extracted_price"].strip(),
                        extracted_images=_coerce_images(row["extracted_images"]),
                        name_correct=_parse_checkbox(row["name_correct"], "name_correct", row_number),
                        brand_correct=_parse_checkbox(row["brand_correct"], "brand_correct", row_number),
                        price_correct=_parse_checkbox(row["price_correct"], "price_correct", row_number),
                        images_correct=_parse_checkbox(row["images_correct"], "images_correct", row_number),
                        notes=row["notes"].strip(),
                        reviewer_name=row["reviewer_name"].strip(),
                        review_date=_validate_review_date(row["review_date"], row_number),
                    )
                )

        self.reviewed_results = imported_results
        return imported_results

    def get_review_statistics(self) -> dict[str, object]:
        total_reviews = len(self.reviewed_results)
        if total_reviews == 0:
            return {
                "total_reviews": 0,
                "completed_reviews": 0,
                "completion_rate": 0.0,
                "field_review_rates": {field: 0.0 for field in CHECKBOX_FIELDS},
                "reviewers": [],
                "reviews_with_notes": 0,
            }

        completed_reviews = 0
        field_counts = {field: 0 for field in CHECKBOX_FIELDS}
        reviewers: set[str] = set()
        reviews_with_notes = 0

        for review in self.reviewed_results:
            review_payload = asdict(review)
            reviewed_any_field = False

            for field in CHECKBOX_FIELDS:
                if review_payload[field] is not None:
                    field_counts[field] += 1
                    reviewed_any_field = True

            if review.notes:
                reviews_with_notes += 1
            if review.reviewer_name:
                reviewers.add(review.reviewer_name)
            if review.reviewer_name and review.review_date and reviewed_any_field:
                completed_reviews += 1

        return {
            "total_reviews": total_reviews,
            "completed_reviews": completed_reviews,
            "completion_rate": round(completed_reviews / total_reviews, 4),
            "field_review_rates": {field: round(count / total_reviews, 4) for field, count in field_counts.items()},
            "reviewers": sorted(reviewers),
            "reviews_with_notes": reviews_with_notes,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
