from __future__ import annotations

from pathlib import Path

import yaml


CONFIG_PATH = Path(__file__).resolve().parents[2] / "scrapers" / "configs" / "mazuri.yaml"


def test_mazuri_migrated_config_exists() -> None:
    assert CONFIG_PATH.exists()


def test_mazuri_migrated_config_schema_and_workflow() -> None:
    with open(CONFIG_PATH, encoding="utf-8") as file:
        raw = yaml.safe_load(file)

    assert raw["name"] == "mazuri"
    assert raw["scraper_type"] == "static"

    actions = [step["action"] for step in raw.get("workflows", [])]
    assert "navigate" in actions
    assert "wait_for" in actions
    assert "wait" in actions
    assert "click" in actions
    assert "extract" in actions
    assert "process_images" in actions
    assert "transform_value" in actions
    assert "check_no_results" in actions


def test_mazuri_migrated_config_fields_present() -> None:
    with open(CONFIG_PATH, encoding="utf-8") as file:
        raw = yaml.safe_load(file)

    selector_names = {selector["name"] for selector in raw.get("selectors", [])}
    expected = {
        "Name",
        "Brand",
        "Description",
        "Image URLs",
        "Weight",
        "Ingredients",
        "Size Options",
        "UPC",
    }
    assert expected.issubset(selector_names)
