from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from scrapers.parser.yaml_parser import ScraperConfigParser


CONFIG_DIR = Path(__file__).resolve().parents[2] / "scrapers" / "configs"
TARGET_SCRAPERS = ("orgill", "phillips", "petfoodex")


def _load_config(slug: str):
    parser = ScraperConfigParser()
    config_path = CONFIG_DIR / f"{slug}.yaml"
    with config_path.open("r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle)
    return parser.load_from_dict(payload)


def _wait_for_steps(config):
    return [step for step in config.workflows if step.action == "wait_for"]


@pytest.mark.parametrize("slug", TARGET_SCRAPERS)
def test_login_scraper_configs_parse_successfully(slug: str) -> None:
    config = _load_config(slug)

    assert config.name == slug
    assert config.login is not None
    assert config.credential_refs


def test_orgill_wait_for_selectors_do_not_false_pass_on_body() -> None:
    config = _load_config("orgill")
    search_wait = _wait_for_steps(config)[0]
    selectors = search_wait.params["selector"]

    assert isinstance(selectors, list)
    assert "body" not in selectors


def test_petfoodex_wait_for_selectors_do_not_include_body() -> None:
    config = _load_config("petfoodex")
    product_wait = _wait_for_steps(config)[0]
    selectors = product_wait.params["selector"]

    assert isinstance(selectors, list)
    assert "body" not in selectors


def test_petfoodex_avoids_fixed_sleep_steps_in_search_flow() -> None:
    config = _load_config("petfoodex")

    assert [step.action for step in config.workflows].count("wait") == 0


@pytest.mark.parametrize(
    ("slug", "minimum_timeout"),
    [
        ("orgill", 10),
        ("phillips", 10),
        ("petfoodex", 10),
    ],
)
def test_login_scraper_primary_waits_allow_more_than_five_seconds(slug: str, minimum_timeout: int) -> None:
    config = _load_config(slug)
    primary_wait = _wait_for_steps(config)[0]

    assert primary_wait.params["timeout"] >= minimum_timeout


def test_orgill_ordering_specifications_wait_is_extended() -> None:
    config = _load_config("orgill")
    order_spec_wait = _wait_for_steps(config)[1]

    assert order_spec_wait.params["selector"] == "#orderSpecificationDiv"
    assert order_spec_wait.params["timeout"] >= 10
