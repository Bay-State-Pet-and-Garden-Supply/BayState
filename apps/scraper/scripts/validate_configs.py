from __future__ import annotations

import sys
import traceback
from pathlib import Path
from typing import Dict, List, Tuple, Union

import yaml

# Ensure apps/scraper is on sys.path so 'scrapers' package imports correctly when
# script is executed from repository root or other working directories.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scrapers.models.config import ScraperConfig


CONFIG_DIR = Path(__file__).resolve().parents[1] / "scrapers" / "configs"


def load_yaml(path: Path) -> Union[Dict[str, object], List[object], None]:
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def validate_file(path: Path) -> Tuple[bool, str]:
    try:
        data = load_yaml(path)
    except Exception as e:  # YAML parse errors
        return False, f"YAML parse error: {e}"

    try:
        # If YAML contains multiple docs, validate each
        if isinstance(data, list):
            for doc in data:
                _ = ScraperConfig.model_validate(doc)  # pydantic v2
        else:
            _ = ScraperConfig.model_validate(data)
    except Exception as e:  # pydantic validation error
        return False, str(e)

    return True, ""


def main() -> int:
    cfg_dir = CONFIG_DIR
    if not cfg_dir.exists():
        print(f"Config directory not found: {cfg_dir}")
        return 2

    files = sorted([p for p in cfg_dir.iterdir() if p.suffix in {".yml", ".yaml"}])
    if not files:
        print(f"No YAML files found in {cfg_dir}")
        return 0

    failures: List[Tuple[Path, str]] = []
    for p in files:
        ok, msg = validate_file(p)
        if ok:
            print(f"OK: {p}")
        else:
            print(f"ERROR: {p} -> {msg}")
            failures.append((p, msg))

    if failures:
        print(f"\n{len(failures)} file(s) failed validation.")
        return 1

    print("\nAll config files validated successfully.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise
