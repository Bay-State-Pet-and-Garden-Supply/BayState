from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse


_BROWSER_STATE_ROOT_ENV_VARS = (
    "SCRAPER_BROWSER_STATE_DIR",
    "BROWSER_STATE_DIR",
)


@dataclass(frozen=True)
class BrowserStateLocation:
    key: str
    storage_state_path: str


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return slug.strip("-") or "default"


def build_browser_state_key(site_name: str, base_url: str | None = None) -> str:
    site_key = _slugify(site_name)
    if not base_url:
        return site_key

    parsed = urlparse(base_url.strip())
    domain_source = parsed.netloc or parsed.path or base_url
    domain_key = _slugify(domain_source)

    if domain_key == site_key:
        return site_key

    return f"{site_key}--{domain_key}"


def get_browser_state_root() -> Path:
    for env_var in _BROWSER_STATE_ROOT_ENV_VARS:
        override = os.getenv(env_var)
        if override:
            return Path(override).expanduser()

    return Path(__file__).resolve().parents[2] / ".browser_storage_states"


def resolve_browser_state_location(
    site_name: str,
    base_url: str | None = None,
) -> BrowserStateLocation:
    key = build_browser_state_key(site_name, base_url)
    storage_state_path = get_browser_state_root() / f"{key}.json"
    return BrowserStateLocation(
        key=key,
        storage_state_path=str(storage_state_path),
    )
