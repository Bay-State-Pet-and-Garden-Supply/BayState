from __future__ import annotations

from pathlib import Path

import yaml

from scrapers.parser.yaml_parser import ScraperConfigParser


CONFIG_PATH = Path(__file__).resolve().parents[2] / "scrapers" / "configs" / "crawl4ai" / "amazon.yaml"


def test_amazon_migrated_config_exists() -> None:
    assert CONFIG_PATH.exists()


def test_amazon_migrated_config_schema_and_workflow() -> None:
    parser = ScraperConfigParser()
    config = parser.load_from_file(CONFIG_PATH)

    assert config.name == "amazon"
    assert config.scraper_type == "static"

    actions = [step.action for step in config.workflows]
    assert "navigate" in actions
    assert "wait_for" in actions
    assert "click" in actions
    assert "extract" in actions
    assert "check_no_results" in actions


def test_amazon_migrated_config_fields_present() -> None:
    with open(CONFIG_PATH, encoding="utf-8") as file:
        raw = yaml.safe_load(file)

    selector_names = {selector["name"] for selector in raw.get("selectors", [])}
    expected = {
        "name",
        "brand",
        "price",
        "description",
        "images",
        "availability",
        "asin",
        "weight",
    }
    assert expected.issubset(selector_names)
