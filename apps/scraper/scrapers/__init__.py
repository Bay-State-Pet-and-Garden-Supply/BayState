from __future__ import annotations

# Phase 10: executor moved to legacy/ — enrichment path replaces static scraping

def __getattr__(name: str):
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

__all__: list[str] = []
