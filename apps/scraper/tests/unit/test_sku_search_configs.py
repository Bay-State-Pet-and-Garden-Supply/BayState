from __future__ import annotations

from pathlib import Path

import yaml


CONFIG_DIR = Path(__file__).resolve().parents[2] / "scrapers" / "configs"


def _load_config(name: str) -> dict[str, object]:
    with open(CONFIG_DIR / f"{name}.yaml", encoding="utf-8") as file:
        return yaml.safe_load(file)


def _find_step(config: dict[str, object], action: str) -> dict[str, object]:
    return next(step for step in config["workflows"] if step.get("action") == action)


def test_petedge_config_uses_exact_sku_search_guard() -> None:
    raw = _load_config("petedge")

    navigate_step = raw["workflows"][0]
    assert navigate_step["params"]["url"] == "https://www.petedge.com/search/?q={sku}"

    conditional_step = _find_step(raw, "conditional")
    assert conditional_step["params"]["selector"] == "a.klevuProductClick:has-text('{sku}')"
    assert raw["test_skus"] == ["DT361 99", "AD2475 17", "BG2101 91"]


def test_gardeners_config_targets_shopify_search_results_and_normalizes_sku() -> None:
    raw = _load_config("gardeners")

    navigate_step = raw["workflows"][0]
    assert navigate_step["params"]["url"] == "https://www.gardeners.com/pages/search-results-page?q={sku}"

    conditional_step = _find_step(raw, "conditional")
    sku_transform = next(
        step for step in conditional_step["params"]["then"]
        if step.get("action") == "transform_value" and step["name"] == "normalize_sku"
    )
    assert sku_transform["params"]["transformations"][0]["pattern"] == "SKU:\\s*([A-Za-z0-9-]+)"


def test_countrymax_config_extracts_upc_from_product_info_values() -> None:
    raw = _load_config("countrymax")

    navigate_step = raw["workflows"][0]
    assert navigate_step["params"]["url"] == "https://www.countrymax.com/search.php?search_query={sku}&section=product"

    upc_selector = next(
        selector for selector in raw["selectors"]
        if selector.get("name") == "UPC"
    )
    assert upc_selector["selector"] == "p.productView-info-name .productView-info-value >> nth=1"
