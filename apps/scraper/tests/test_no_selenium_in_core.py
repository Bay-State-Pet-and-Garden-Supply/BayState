"""Test: Zero Selenium references in core anti-detection files and browser utils.

Asserts:
1. Zero `selenium` imports in utils/scraping/playwright_browser.py
2. Zero `selenium` (lowercase) references in any non-test Python file
"""

from __future__ import annotations

import re
from pathlib import Path

SCRAPER_ROOT = Path(__file__).resolve().parent.parent


def _scan_file(filepath: Path, pattern: str, skip_comments: bool = False) -> list[tuple[int, str]]:
    """Scan a file for a regex pattern. Returns (line_number, line_text) matches."""
    if not filepath.exists():
        return []
    matches: list[tuple[int, str]] = []
    for i, line in enumerate(filepath.read_text(encoding="utf-8", errors="ignore").splitlines(), start=1):
        if skip_comments and line.lstrip().startswith("#"):
            continue
        if re.search(pattern, line):
            matches.append((i, line.strip()))
    return matches


class TestPlaywrightBrowserNoSelenium:
    """Verify playwright_browser.py has zero Selenium artifacts."""

    FILE = SCRAPER_ROOT / "utils" / "scraping" / "playwright_browser.py"

    def test_no_selenium_references(self) -> None:
        """No selenium references (imports, comments) should exist."""
        if not self.FILE.exists():
            return
        # Case-insensitive check to catch both 'selenium' and 'Selenium'
        matches = _scan_file(self.FILE, r"(?i)selenium")
        assert matches == [], f"Found {len(matches)} selenium reference(s) in playwright_browser.py:\n" + "\n".join(f"  L{ln}: {txt}" for ln, txt in matches)

    def test_no_get_standard_chrome_options(self) -> None:
        """No reference to get_standard_chrome_options should exist."""
        if not self.FILE.exists():
            return
        matches = _scan_file(self.FILE, r"get_standard_chrome_options")
        assert matches == [], f"Found {len(matches)} get_standard_chrome_options reference(s) in playwright_browser.py:\n" + "\n".join(
            f"  L{ln}: {txt}" for ln, txt in matches
        )


class TestCodebaseNoSelenium:
    """Verify zero selenium (lowercase) references across entire codebase (non-test files)."""

    def test_zero_selenium_grep_in_non_test_files(self) -> None:
        """grep -rn 'selenium' --include='*.py' | grep -v test_ should return 0 matches."""
        matches: list[tuple[str, int, str]] = []
        for py_file in sorted(SCRAPER_ROOT.rglob("*.py")):
            # Skip test files and __pycache__
            path_parts = set(py_file.parts)
            if "test_" in py_file.name or "__pycache__" in path_parts or "venv" in path_parts or ".venv" in path_parts or "site-packages" in path_parts:
                continue
            for i, line in enumerate(py_file.read_text(encoding="utf-8", errors="ignore").splitlines(), start=1):
                if "selenium" in line:
                    rel = py_file.relative_to(SCRAPER_ROOT)
                    matches.append((str(rel), i, line.strip()))

        assert matches == [], f"Found {len(matches)} 'selenium' reference(s) in non-test files:\n" + "\n".join(f"  {f}:{ln}: {txt}" for f, ln, txt in matches)
