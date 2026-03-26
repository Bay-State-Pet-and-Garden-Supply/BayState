from __future__ import annotations

from pathlib import Path

from utils.scraping.browser_persistence import (
    build_browser_state_key,
    resolve_browser_state_location,
)


def test_build_browser_state_key_uses_site_name_and_domain() -> None:
    assert (
        build_browser_state_key(
            "Acme Vendor",
            "https://Portal.Example.com/login",
        )
        == "acme-vendor--portal-example-com"
    )


def test_resolve_browser_state_location_uses_default_root(monkeypatch) -> None:
    monkeypatch.delenv("SCRAPER_BROWSER_STATE_DIR", raising=False)
    monkeypatch.delenv("BROWSER_STATE_DIR", raising=False)

    location = resolve_browser_state_location(
        "Acme Vendor",
        "https://portal.example.com/login",
    )

    expected_root = Path(__file__).resolve().parents[2] / ".browser_storage_states"
    assert location.key == "acme-vendor--portal-example-com"
    assert location.storage_state_path == str(expected_root / "acme-vendor--portal-example-com.json")


def test_resolve_browser_state_location_prefers_env_override(
    monkeypatch,
    tmp_path,
) -> None:
    override_root = tmp_path / "states"
    monkeypatch.setenv("SCRAPER_BROWSER_STATE_DIR", str(override_root))

    location = resolve_browser_state_location(
        "Acme Vendor",
        "https://portal.example.com/login",
    )

    assert location.storage_state_path == str(override_root / "acme-vendor--portal-example-com.json")
