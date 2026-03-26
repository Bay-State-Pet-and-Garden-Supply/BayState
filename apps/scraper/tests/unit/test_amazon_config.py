from __future__ import annotations

from pathlib import Path

import yaml


CONFIG_PATH = Path(__file__).resolve().parents[2] / "scrapers" / "configs" / "amazon.yaml"


def _load_config() -> dict[str, object]:
    with open(CONFIG_PATH, encoding="utf-8") as file:
        return yaml.safe_load(file)


def test_amazon_config_prefers_landing_image_and_skips_duplicate_first_thumbnail() -> None:
    raw = _load_config()

    selector_entry = next(
        selector
        for selector in raw.get("selectors", [])
        if selector.get("name") == "Image URLs"
    )
    assert selector_entry["selector"] == "#landingImage, #altImages li.imageThumbnail:not(:first-child) img"

    extract_step = next(
        step
        for step in raw.get("workflows", [])
        if step.get("action") == "extract_and_transform"
    )
    image_field = next(
        field
        for field in extract_step["params"]["fields"]
        if field.get("name") == "Images"
    )

    assert image_field["selector"] == "#landingImage, #altImages li.imageThumbnail:not(:first-child) img"
