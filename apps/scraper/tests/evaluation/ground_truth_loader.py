"""Ground truth data loader for evaluation module.

Loads ground truth products from JSON fixture file for evaluating
AI scraper extraction accuracy.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from tests.evaluation.types import GroundTruthProduct, SizeMetrics


# Path to ground truth fixtures relative to this file
FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"
GROUND_TRUTH_FILE = FIXTURES_DIR / "test_skus_ground_truth.json"

# Required fields that must be present in each ground truth product
REQUIRED_FIELDS = {"sku", "brand", "name"}


def _parse_size_metrics(size_str: str | None) -> SizeMetrics | None:
    """Parse size metrics string into SizeMetrics dataclass.

    Handles formats like:
    - "1.5 cu ft" -> volume
    - "8 lb" -> weight
    - "25 Quart" -> volume
    - "5,000 sq ft capacity" -> coverage area
    - "" or None -> None

    Args:
        size_str: Size string from ground truth

    Returns:
        SizeMetrics object or None if parsing fails
    """
    if not size_str:
        return None

    size_str = size_str.strip()
    if not size_str:
        return None

    # Try to parse weight (e.g., "8 lb", "4 lb")
    weight_match = re.search(r"([\d.]+)\s*lb", size_str, re.IGNORECASE)
    if weight_match:
        return SizeMetrics(weight_oz=float(weight_match.group(1)) * 16)

    # Try to parse cubic feet (e.g., "1.5 cu ft")
    cuft_match = re.search(r"([\d.]+)\s*cu\s*ft", size_str, re.IGNORECASE)
    if cuft_match:
        # Store as length for lack of better field
        return SizeMetrics(length_in=float(cuft_match.group(1)) * 12)

    # Try to parse quarts (e.g., "25 Quart")
    quart_match = re.search(r"([\d.]+)\s*quart", size_str, re.IGNORECASE)
    if quart_match:
        # 1 quart ≈ 0.0333 cubic feet ≈ 5.76 inches
        return SizeMetrics(length_in=float(quart_match.group(1)) * 5.76)

    # Try to parse square feet (e.g., "5,000 sq ft")
    sqft_match = re.search(r"([\d,]+)\s*sq\s*ft", size_str, re.IGNORECASE)
    if sqft_match:
        sqft_val = sqft_match.group(1).replace(",", "")
        return SizeMetrics(length_in=float(sqft_val))

    # Could not parse - return None
    return None


def _validate_product(product: dict[str, Any]) -> list[str]:
    """Validate that a product has all required fields.

    Args:
        product: Product dictionary from JSON

    Returns:
        List of missing required fields (empty if valid)
    """
    missing = []
    for field in REQUIRED_FIELDS:
        if field not in product or not product[field]:
            missing.append(field)
    return missing


def load_ground_truth() -> list[GroundTruthProduct]:
    """Load all ground truth products from JSON file.

    Returns:
        List of GroundTruthProduct objects

    Raises:
        FileNotFoundError: If ground truth file doesn't exist
        ValueError: If required fields are missing from any product
    """
    if not GROUND_TRUTH_FILE.exists():
        raise FileNotFoundError(f"Ground truth file not found: {GROUND_TRUTH_FILE}")

    with open(GROUND_TRUTH_FILE) as f:
        data = json.load(f)

    products = []
    errors = []

    for idx, product in enumerate(data):
        # Validate required fields
        missing = _validate_product(product)
        if missing:
            errors.append(f"Product at index {idx} (SKU: {product.get('sku', 'UNKNOWN')}) missing fields: {missing}")
            continue

        # Parse size metrics
        size_metrics = _parse_size_metrics(product.get("size_metrics"))

        # Build GroundTruthProduct
        gt_product = GroundTruthProduct(
            sku=product["sku"],
            brand=product["brand"],
            name=product["name"],
            description=product.get("description", ""),
            size_metrics=size_metrics,
            images=product.get("images", []),
            categories=product.get("categories", []),
            price=product.get("price"),  # May be None
        )
        products.append(gt_product)

    if errors:
        raise ValueError("Ground truth validation failed:\n" + "\n".join(errors))

    return products


def get_ground_truth(sku: str) -> GroundTruthProduct | None:
    """Get a single ground truth product by SKU.

    Args:
        sku: Product SKU to look up

    Returns:
        GroundTruthProduct if found, None otherwise
    """
    products = load_ground_truth()
    for product in products:
        if product.sku == sku:
            return product
    return None


def get_all_skus() -> list[str]:
    """Get list of all ground truth SKUs.

    Returns:
        List of SKU strings
    """
    products = load_ground_truth()
    return [p.sku for p in products]


# Allow direct execution for testing
if __name__ == "__main__":
    products = load_ground_truth()
    print(f"Loaded {len(products)} ground truth products")

    # Test SKU lookup
    test_sku = "032247886598"
    product = get_ground_truth(test_sku)
    if product:
        print(f"Found product: {product.name}")
    else:
        print(f"Product not found: {test_sku}")

    # List all SKUs
    print(f"All SKUs: {get_all_skus()}")
