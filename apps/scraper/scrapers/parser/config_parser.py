from __future__ import annotations

import yaml

from scrapers.models.config import ScraperConfig


def parse_config(yaml_content: str) -> ScraperConfig:
    payload = yaml.safe_load(yaml_content) or {}
    return ScraperConfig(**payload)
