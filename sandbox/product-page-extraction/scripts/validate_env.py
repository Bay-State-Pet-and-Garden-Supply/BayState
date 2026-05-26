#!/usr/bin/env python3
"""Validate the local sandbox runtime without touching production services."""

from __future__ import annotations

import argparse
import importlib.util
import os
import shutil
import subprocess
import sys
from pathlib import Path

from common import get_output_dir, load_dotenv
from lmstudio_extract import ping_lmstudio

FORBIDDEN_ENV = ["SCRAPER_API_URL", "SCRAPER_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]


def status(ok: bool, label: str, detail: str = "") -> None:
    mark = "OK" if ok else "WARN"
    print(f"[{mark}] {label}{': ' + detail if detail else ''}")


def module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def main() -> None:
    parser = argparse.ArgumentParser(description="Check sandbox dependencies and safety boundaries.")
    parser.add_argument("--check-lmstudio", action="store_true")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero on optional warnings.")
    args = parser.parse_args()
    load_dotenv()

    warnings = 0
    py_ok = sys.version_info >= (3, 10)
    status(py_ok, "python", sys.version.split()[0])
    warnings += 0 if py_ok else 1

    for mod in ["crawl4ai", "playwright", "bs4", "yaml", "jsonschema"]:
        ok = module_available(mod)
        status(ok, f"import {mod}")
        warnings += 0 if ok else 1

    agent_browser = shutil.which(os.environ.get("AGENT_BROWSER_BIN", "agent-browser"))
    status(bool(agent_browser), "agent-browser CLI", agent_browser or "not installed; optional")

    outputs = get_output_dir()
    outputs.mkdir(parents=True, exist_ok=True)
    test_file = outputs / ".write-test"
    try:
        test_file.write_text("ok")
        test_file.unlink()
        status(True, "output directory writable", str(outputs))
    except OSError as exc:
        status(False, "output directory writable", repr(exc))
        warnings += 1

    for key in FORBIDDEN_ENV:
        value = os.environ.get(key)
        ok = not value
        status(ok, f"forbidden env empty: {key}")
        warnings += 0 if ok else 1

    try:
        proc = subprocess.run([sys.executable, "-m", "playwright", "--version"], text=True, capture_output=True, timeout=15)
        status(proc.returncode == 0, "playwright CLI", (proc.stdout or proc.stderr).strip())
    except Exception as exc:  # noqa: BLE001
        status(False, "playwright CLI", repr(exc))
        warnings += 1

    if args.check_lmstudio or os.environ.get("C4AI_LLM_MODE") in {"auto", "required"}:
        ping = ping_lmstudio()
        status(bool(ping.get("available")), "LM Studio /v1/models", "available" if ping.get("available") else ping.get("error", "unavailable"))
        if not ping.get("available") and os.environ.get("C4AI_LLM_MODE") == "required":
            warnings += 1
    else:
        status(True, "LM Studio", "skipped (C4AI_LLM_MODE=off)")

    if warnings and args.strict:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
