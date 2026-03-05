#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
from pathlib import Path


MB = 1024 * 1024
MAX_MEMORY_LIMIT_SENTINEL = 1 << 60
PROC_DIR = Path("/proc")
CGROUP_V2_DIR = Path("/sys/fs/cgroup")
CGROUP_V1_DIR = Path("/sys/fs/cgroup/memory")
DAEMON_CMD_FRAGMENT = "daemon.py"


def _read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return None


def _read_int(path: Path) -> int | None:
    text = _read_text(path)
    if text in (None, "", "max"):
        return None

    try:
        return int(text)
    except ValueError:
        return None


def _parse_float_env(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None:
        return default

    try:
        return float(raw)
    except ValueError:
        return default


def _normalize_cgroup_limit(limit_bytes: int | None) -> int | None:
    if limit_bytes is None:
        return None
    if limit_bytes <= 0:
        return None
    if limit_bytes >= MAX_MEMORY_LIMIT_SENTINEL:
        return None
    return limit_bytes


def _get_cgroup_memory_stats() -> tuple[int | None, int | None]:
    used_v2 = _read_int(CGROUP_V2_DIR / "memory.current")
    limit_v2_text = _read_text(CGROUP_V2_DIR / "memory.max")
    if used_v2 is not None and limit_v2_text is not None:
        limit_v2 = None
        if limit_v2_text != "max":
            try:
                limit_v2 = int(limit_v2_text)
            except ValueError:
                limit_v2 = None
        return used_v2, _normalize_cgroup_limit(limit_v2)

    used_v1 = _read_int(CGROUP_V1_DIR / "memory.usage_in_bytes")
    limit_v1 = _read_int(CGROUP_V1_DIR / "memory.limit_in_bytes")
    return used_v1, _normalize_cgroup_limit(limit_v1)


def _find_daemon_pid() -> int | None:
    current_pid = os.getpid()

    try:
        proc_entries = list(PROC_DIR.iterdir())
    except OSError:
        return None

    for entry in proc_entries:
        if not entry.name.isdigit():
            continue

        pid = int(entry.name)
        if pid == current_pid:
            continue

        cmdline_path = entry / "cmdline"
        try:
            raw = cmdline_path.read_bytes()
        except OSError:
            continue

        if not raw:
            continue

        cmdline = raw.replace(b"\x00", b" ").decode("utf-8", errors="ignore")
        if DAEMON_CMD_FRAGMENT in cmdline:
            return pid

    return None


def _read_process_state(pid: int) -> str | None:
    status_text = _read_text(PROC_DIR / str(pid) / "status")
    if status_text is None:
        return None

    for line in status_text.splitlines():
        if line.startswith("State:"):
            parts = line.split()
            if len(parts) >= 2:
                return parts[1]

    return None


def _read_process_rss_bytes(pid: int) -> int | None:
    status_text = _read_text(PROC_DIR / str(pid) / "status")
    if status_text is None:
        return None

    for line in status_text.splitlines():
        if line.startswith("VmRSS:"):
            parts = line.split()
            if len(parts) >= 2 and parts[1].isdigit():
                return int(parts[1]) * 1024

    return None


def _check_memory_usage() -> tuple[bool, str]:
    max_percent = _parse_float_env("HEALTHCHECK_MAX_MEMORY_PERCENT", 90.0)
    max_mb = _parse_float_env("HEALTHCHECK_MAX_MEMORY_MB", 0.0)

    used_bytes, limit_bytes = _get_cgroup_memory_stats()

    if used_bytes is not None:
        used_mb = used_bytes / MB

        if max_mb > 0 and used_mb > max_mb:
            return False, f"memory usage {used_mb:.1f}MB exceeds {max_mb:.1f}MB"

        if limit_bytes is not None:
            usage_percent = (used_bytes / limit_bytes) * 100
            if usage_percent >= max_percent:
                return False, f"memory usage {usage_percent:.1f}% exceeds {max_percent:.1f}%"
            return True, f"memory {used_mb:.1f}MB ({usage_percent:.1f}% of limit)"

        return True, f"memory {used_mb:.1f}MB (no cgroup limit detected)"

    daemon_pid = _find_daemon_pid()
    if daemon_pid is None:
        return False, "memory check fallback failed: daemon process not found"

    rss_bytes = _read_process_rss_bytes(daemon_pid)
    if rss_bytes is None:
        return False, "memory check fallback failed: daemon RSS unavailable"

    rss_mb = rss_bytes / MB
    if max_mb > 0 and rss_mb > max_mb:
        return False, f"daemon RSS {rss_mb:.1f}MB exceeds {max_mb:.1f}MB"

    return True, f"daemon RSS {rss_mb:.1f}MB (cgroup metrics unavailable)"


def _check_crawler_responsive() -> tuple[bool, str]:
    daemon_pid = _find_daemon_pid()
    if daemon_pid is None:
        return False, "crawler daemon process not found"

    state_code = _read_process_state(daemon_pid)
    if state_code is None:
        return False, f"unable to read crawler process state for pid {daemon_pid}"

    if state_code in {"Z", "X"}:
        return False, f"crawler process pid {daemon_pid} in terminal state {state_code}"

    if state_code == "D":
        return False, f"crawler process pid {daemon_pid} in uninterruptible sleep (possible deadlock)"

    return True, f"crawler process pid {daemon_pid} state={state_code}"


def main() -> int:
    checks = [
        ("memory", _check_memory_usage),
        ("crawler", _check_crawler_responsive),
    ]

    failures: list[str] = []
    messages: list[str] = []

    for name, check_fn in checks:
        is_ok, message = check_fn()
        messages.append(f"{name}: {message}")
        if not is_ok:
            failures.append(f"{name}: {message}")

    if failures:
        print("UNHEALTHY - " + " | ".join(failures), file=sys.stderr)
        return 1

    print("HEALTHY - " + " | ".join(messages))
    return 0


if __name__ == "__main__":
    sys.exit(main())
