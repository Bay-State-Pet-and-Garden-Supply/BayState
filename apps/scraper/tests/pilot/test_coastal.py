from __future__ import annotations

from pathlib import Path

import yaml


CONFIG_PATH = Path(__file__).resolve().parents[2] / "scrapers" / "configs" / "coastal.yaml"


def test_coastal_migrated_config_exists() -> None:
    assert CONFIG_PATH.exists()


def test_coastal_migrated_config_schema_and_workflow() -> None:
    with open(CONFIG_PATH, encoding="utf-8") as file:
        raw = yaml.safe_load(file)

    assert raw["name"] == "coastal"
    assert raw["scraper_type"] == "static"

    actions = [step["action"] for step in raw.get("workflows", [])]
    assert "navigate" in actions
    assert "wait_for" in actions
    assert "wait" in actions
    assert "conditional_click" in actions
    assert "conditional_skip" in actions
    assert "extract_single" in actions
    assert "extract" in actions
    assert "process_images" in actions
    assert "check_no_results" in actions


def test_coastal_migrated_config_fields_present() -> None:
    with open(CONFIG_PATH, encoding="utf-8") as file:
        raw = yaml.safe_load(file)

    selector_names = {selector["name"] for selector in raw.get("selectors", [])}
    expected = {
        "Name",
        "Brand",
        "Size",
        "Description",
        "Image URLs",
        "UPC",
        "Item Number",
        "Features",
        "Weight",
        "Dimensions",
    }
    assert expected.issubset(selector_names)
