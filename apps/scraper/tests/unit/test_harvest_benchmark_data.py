from __future__ import annotations

from scripts.harvest_benchmark_data import BenchmarkProduct, _extract_pipeline_product


def test_extract_pipeline_product_prefers_consolidated_name_and_brand() -> None:
    row = {
        "sku": "072318100222",
        "input": {
            "name": "RAW NAME",
            "brand": "Raw Brand",
            "product_on_pages": ["Input Category"],
        },
        "consolidated": {
            "name": "LID Grain-Free Ocean Fish 5 lb.",
            "brand": "Natural Balance",
            "product_on_pages": ["Dog Food Dry", "Dog Food Shop All"],
        },
    }

    product = _extract_pipeline_product(row)

    assert product == BenchmarkProduct(
        sku="072318100222",
        name="LID Grain-Free Ocean Fish 5 lb.",
        brand="Natural Balance",
        category="Dog Food Dry",
        difficulty="medium",
        source="pipeline",
    )


def test_extract_pipeline_product_falls_back_to_input_payload() -> None:
    row = {
        "sku": "051178005557",
        "input": {
            "name": "LV SEED ORGANIC BEAN BLUE LAKE HEIRLOOM",
            "category": "Seeds",
        },
        "consolidated": None,
    }

    product = _extract_pipeline_product(row)

    assert product == BenchmarkProduct(
        sku="051178005557",
        name="LV SEED ORGANIC BEAN BLUE LAKE HEIRLOOM",
        brand=None,
        category="Seeds",
        difficulty="medium",
        source="pipeline",
    )


def test_extract_pipeline_product_handles_json_string_payloads() -> None:
    row = {
        "sku": "4059433816098",
        "input": '{"name": "Fallback Name", "brand": "Fallback Brand"}',
        "consolidated": '{"name": "Clydesdale Gelding Toy Figurine", "brand": "Schleich", "product_on_pages": ["Barn Supplies Shop All"]}',
    }

    product = _extract_pipeline_product(row)

    assert product == BenchmarkProduct(
        sku="4059433816098",
        name="Clydesdale Gelding Toy Figurine",
        brand="Schleich",
        category="Barn Supplies Shop All",
        difficulty="medium",
        source="pipeline",
    )


def test_extract_pipeline_product_returns_none_without_sku_or_name() -> None:
    assert _extract_pipeline_product({"sku": "", "input": {"name": "Name"}}) is None
    assert _extract_pipeline_product({"sku": "123", "input": {}}) is None
