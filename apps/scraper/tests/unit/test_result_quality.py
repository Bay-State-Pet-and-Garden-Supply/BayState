from __future__ import annotations

from tests.support.scraper_validator import ScraperValidator
from validation.result_quality import sanitize_product_payload


def test_sanitize_product_payload_recovers_petfoodex_upc_from_blob() -> None:
    payload = {
        "sku": "63902399",
        "upc": "HOME\nDOG\nFOOD\nKOHA DOG LIMITED INGREDIENT BLAND DIET SALMON & BROWN RICE 20LBS\nItem #63902399\nUPC#: BAG: 811048023995\nEDLP: $63.00",
        "brand": "Koha",
        "title": "KOHA DOG LIMITED INGREDIENT BLAND DIET SALMON & BROWN RICE 20LBS",
        "images": [
            "https://assets-6c913b8151.cdn.insitecloud.net/ade26ca1a8e4418_lg.png",
        ],
        "item_number": "Item #63902399",
        "unit_of_measure": "/ Bag",
    }

    sanitized, warnings = sanitize_product_payload(payload)

    assert sanitized["upc"] == "811048023995"
    assert sanitized["item_number"] == "63902399"
    assert sanitized["unit_of_measure"] == "Bag"
    assert sanitized["images"] == payload["images"]
    assert any("Normalized upc" in warning for warning in warnings)


def test_scraper_validator_flags_unrecoverable_identifier_blob() -> None:
    validator = ScraperValidator()

    results = validator.validate_product_data(
        [
            {
                "SKU": "bad-sku",
                "Name": "Broken Product",
                "UPC": "HOME\nDOG\nFOOD\nADD TO CART\nPRICE: $60.48",
                "Images": ["https://example.com/product.jpg"],
            }
        ],
        "petfoodex",
    )

    assert results["valid_products"] == 0
    assert any("UPC failed quality validation" in error for error in results["errors"])


def test_scraper_validator_accepts_canonical_payloads() -> None:
    validator = ScraperValidator()

    results = validator.validate_product_data(
        [
            {
                "sku": "63902399",
                "title": "KOHA DOG LIMITED INGREDIENT BLAND DIET SALMON & BROWN RICE 20LBS",
                "brand": "Koha",
                "upc": "811048023995",
                "item_number": "63902399",
                "unit_of_measure": "Bag",
                "images": ["https://assets-6c913b8151.cdn.insitecloud.net/ade26ca1a8e4418_lg.png"],
            }
        ],
        "petfoodex",
    )

    assert results["errors"] == []
    assert results["valid_products"] == 1
    assert results["field_coverage"]["upc"] == 100.0
