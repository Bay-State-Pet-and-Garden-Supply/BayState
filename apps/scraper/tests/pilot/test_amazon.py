from __future__ import annotations

from pathlib import Path

import yaml


CONFIG_PATH = Path(__file__).resolve().parents[2] / "scrapers" / "configs" / "amazon.yaml"
STATIC_CONFIG_PATH = CONFIG_PATH


def test_amazon_migrated_config_exists() -> None:
    assert CONFIG_PATH.exists()


def test_amazon_migrated_config_schema_and_workflow() -> None:
    with open(CONFIG_PATH, encoding="utf-8") as file:
        raw = yaml.safe_load(file)

    assert raw["name"] == "amazon"
    assert raw["scraper_type"] == "static"

    actions = [step["action"] for step in raw.get("workflows", [])]
    assert "navigate" in actions
    assert "wait" in actions
    assert "wait_for" in actions
    assert "conditional_click" in actions
    assert "conditional" in actions
    assert "extract_and_transform" in actions
    assert "process_images" in actions
    assert "check_no_results" in actions


def test_amazon_migrated_config_fields_present() -> None:
    with open(CONFIG_PATH, encoding="utf-8") as file:
        raw = yaml.safe_load(file)

    selector_names = {selector["name"] for selector in raw.get("selectors", [])}
    expected = {
        "Name",
        "Brand",
        "Description",
        "Image URLs",
        "Weight",
        "Features",
        "Dimensions",
        "Ingredients",
    }
    assert expected.issubset(selector_names)


def test_amazon_migrated_config_uses_runtime_search_query_placeholder() -> None:
    with open(STATIC_CONFIG_PATH, encoding="utf-8") as file:
        raw = yaml.safe_load(file)

    navigate_steps = [
        step for step in raw.get("workflows", [])
        if step.get("action") == "navigate"
    ]

    assert navigate_steps
    navigate_url = navigate_steps[0]["params"]["url"]

    assert "{{sku}}" in navigate_url
    assert "{search_query_encoded}" not in navigate_url
