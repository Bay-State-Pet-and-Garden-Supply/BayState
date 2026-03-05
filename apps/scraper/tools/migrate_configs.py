#!/usr/bin/env python3

from __future__ import annotations


DEPRECATION_MESSAGE = "tools/migrate_configs.py is deprecated. Migration from local YAML configs is complete and BayStateScraper runs API-only configs."


class ConfigNormalizer:
    def __init__(self, *_args: object, **_kwargs: object) -> None:
        raise RuntimeError(DEPRECATION_MESSAGE)


class MigrationResult:
    def __init__(self, *_args: object, **_kwargs: object) -> None:
        raise RuntimeError(DEPRECATION_MESSAGE)


def run_migration(*_args: object, **_kwargs: object) -> None:
    raise RuntimeError(DEPRECATION_MESSAGE)


def main() -> None:
    raise RuntimeError(DEPRECATION_MESSAGE)


if __name__ == "__main__":
    main()
