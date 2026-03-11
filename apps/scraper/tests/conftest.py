"""Pytest configuration and fixtures."""

import sys
from pathlib import Path

import pytest


def pytest_configure(config):
    """Configure pytest with required path modifications."""
    project_root = Path(__file__).resolve().parent.parent

    # Add tools directory to path for migration imports
    tools_path = project_root / "tools"
    if str(tools_path) not in sys.path:
        sys.path.insert(0, str(tools_path))

    # Add src directory to path for crawl4ai_engine and other modules
    src_path = project_root / "src"
    if str(src_path) not in sys.path:
        sys.path.insert(0, str(src_path))

    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

# Ensure src is in path for all tests
project_root = Path(__file__).resolve().parent.parent
src_path = project_root / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))
