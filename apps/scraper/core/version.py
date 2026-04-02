from __future__ import annotations

import os

DEFAULT_RUNNER_RELEASE_CHANNEL = "latest"
UNKNOWN_RUNNER_BUILD_ID = "unknown"
UNKNOWN_RUNNER_BUILD_SHA = "unknown"


def _read_env(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None


def get_runner_release_channel() -> str:
    return _read_env("BAYSTATE_RUNNER_RELEASE_CHANNEL") or DEFAULT_RUNNER_RELEASE_CHANNEL


def get_runner_build_id() -> str:
    return _read_env("BAYSTATE_RUNNER_BUILD_ID") or UNKNOWN_RUNNER_BUILD_ID


def get_runner_build_sha() -> str:
    return _read_env("BAYSTATE_RUNNER_BUILD_SHA") or UNKNOWN_RUNNER_BUILD_SHA
