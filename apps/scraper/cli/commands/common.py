"""Shared helpers for local scraper CLI commands."""

from __future__ import annotations

from collections.abc import Sequence
import json
import os
from pathlib import Path

import click

from scrapers.models.config import ScraperConfig
from scrapers.parser.yaml_parser import ScraperConfigParser


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def config_directory() -> Path:
    return project_root() / "scrapers" / "configs"


def slugify(value: str) -> str:
    sanitized = [character.lower() if character.isalnum() else "-" for character in value.strip()]
    collapsed = "".join(sanitized).strip("-")
    while "--" in collapsed:
        collapsed = collapsed.replace("--", "-")
    return collapsed or "scraper-run"


def resolve_config_path(scraper: str, config: str | None = None) -> Path:
    if config:
        candidate = Path(config).expanduser()
        if not candidate.exists():
            raise click.ClickException(f"Config file not found: {candidate}")
        return candidate.resolve()

    candidates = [
        config_directory() / f"{scraper}.yaml",
        config_directory() / f"{scraper.replace('_', '-')}.yaml",
        config_directory() / f"{scraper.replace('-', '_')}.yaml",
    ]

    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()

    raise click.ClickException(f"Could not find a local config for scraper '{scraper}'. Pass --config or add scrapers/configs/{scraper}.yaml")


def discover_config_paths(
    *,
    scrapers: Sequence[str] | None = None,
    config_paths: Sequence[Path] | None = None,
) -> list[Path]:
    resolved: list[Path] = []
    seen: set[Path] = set()

    if config_paths:
        for config_path in config_paths:
            candidate = Path(config_path).expanduser()
            if not candidate.exists():
                raise click.ClickException(f"Config file not found: {candidate}")
            candidate = candidate.resolve()
            if candidate not in seen:
                seen.add(candidate)
                resolved.append(candidate)

    if scrapers:
        for scraper in scrapers:
            candidate = resolve_config_path(scraper)
            if candidate not in seen:
                seen.add(candidate)
                resolved.append(candidate)

    if not resolved and not scrapers and not config_paths:
        for candidate in sorted(config_directory().glob("*.yaml")):
            candidate = candidate.resolve()
            if candidate not in seen:
                seen.add(candidate)
                resolved.append(candidate)

    return resolved


def load_scraper_config(config_path: Path) -> ScraperConfig:
    os.environ["USE_YAML_CONFIGS"] = "true"
    parser = ScraperConfigParser()

    try:
        return parser.load_from_file(config_path)
    except Exception as exc:
        raise click.ClickException(f"Failed to load scraper config from {config_path}: {exc}") from exc


def normalize_sku_list(skus: Sequence[object] | None) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []

    for raw_sku in skus or []:
        sku = str(raw_sku).strip()
        if not sku or sku in seen:
            continue
        seen.add(sku)
        normalized.append(sku)

    return normalized


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    _ = path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
