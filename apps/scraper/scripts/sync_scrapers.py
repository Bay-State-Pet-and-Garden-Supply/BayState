from __future__ import annotations


DEPRECATION_MESSAGE = "scripts/sync_scrapers.py is deprecated. BayStateScraper is API-config-only and no longer syncs local YAML configs."


def sync_scrapers() -> None:
    raise RuntimeError(DEPRECATION_MESSAGE)


if __name__ == "__main__":
    raise RuntimeError(DEPRECATION_MESSAGE)
