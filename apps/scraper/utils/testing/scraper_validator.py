"""Scraper Validator for testing product data quality."""
from __future__ import annotations

from typing import Any

from validation.result_quality import canonicalize_product_payload, sanitize_product_payload

REQUIRED_FIELDS = ("sku", "title")
EXPECTED_FIELDS: dict[str, list[str]] = {
    "amazon": ["sku", "title", "brand", "images", "ratings", "reviews_count"],
    "bradley": ["sku", "title", "brand", "images", "item_number", "manufacturer_part_number"],
    "central_pet": ["sku", "title", "brand", "images", "item_number", "upc"],
    "coastal": ["sku", "title", "brand", "images", "item_number", "upc"],
    "mazuri": ["sku", "title", "brand", "images", "ingredients"],
    "orgill": ["sku", "title", "brand", "images", "upc", "manufacturer_part_number"],
    "petfoodex": ["sku", "title", "brand", "images", "item_number", "upc", "unit_of_measure"],
    "phillips": ["sku", "title", "brand", "images", "item_number", "upc"],
}


class ScraperValidator:
    """Validates scraped product data for quality and completeness."""

    def validate_product_data(
        self,
        products: list[dict[str, Any]],
        scraper_name: str,
    ) -> dict[str, Any]:
        if not products:
            return {
                "errors": ["No products to validate"],
                "warnings": [],
                "score": 0.0,
                "total_products": 0,
                "valid_products": 0,
                "invalid_products": 0,
                "field_coverage": {},
                "data_quality_score": 0.0,
            }

        expected_fields = EXPECTED_FIELDS.get(scraper_name, ["sku", "title", "brand", "images"])
        field_counts = {field: 0 for field in expected_fields}
        errors: list[str] = []
        warnings: list[str] = []
        valid_products = 0

        for index, product in enumerate(products, start=1):
            if not isinstance(product, dict):
                errors.append(f"Product {index}: result is not a dictionary")
                continue

            normalized = canonicalize_product_payload(product)
            sanitized, product_warnings = sanitize_product_payload(normalized)
            product_errors: list[str] = []

            for field in REQUIRED_FIELDS:
                if not normalized.get(field):
                    product_errors.append(f"Missing required field: {field}")

            if sanitized.get("title") and len(str(sanitized["title"])) < 3:
                product_warnings.append("title seems too short")
            if sanitized.get("brand") and len(str(sanitized["brand"])) < 2:
                product_warnings.append("brand seems too short")

            if normalized.get("images") and not sanitized.get("images"):
                product_errors.append("Images failed quality validation")
            if normalized.get("upc") and not sanitized.get("upc"):
                product_errors.append("UPC failed quality validation")
            if normalized.get("item_number") and not sanitized.get("item_number"):
                product_errors.append("item_number failed quality validation")
            if normalized.get("manufacturer_part_number") and not sanitized.get("manufacturer_part_number"):
                product_errors.append("manufacturer_part_number failed quality validation")

            for field in expected_fields:
                value = sanitized.get(field)
                if value not in (None, "", [], {}):
                    field_counts[field] += 1

            if product_errors:
                errors.extend([f"Product {index}: {error}" for error in product_errors])
            else:
                valid_products += 1

            warnings.extend([f"Product {index}: {warning}" for warning in product_warnings])

        total_products = len(products)
        invalid_products = total_products - valid_products
        field_coverage = {
            field: (count / total_products) * 100 for field, count in field_counts.items()
        }
        valid_ratio = valid_products / total_products if total_products else 0.0
        coverage_ratio = (
            sum(field_coverage.values()) / (len(field_coverage) * 100)
            if field_coverage
            else 0.0
        )
        data_quality_score = valid_ratio * 0.7 + coverage_ratio * 0.3

        return {
            "errors": errors,
            "warnings": warnings,
            "score": data_quality_score * 100,
            "total_products": total_products,
            "valid_products": valid_products,
            "invalid_products": invalid_products,
            "field_coverage": field_coverage,
            "data_quality_score": data_quality_score,
        }
