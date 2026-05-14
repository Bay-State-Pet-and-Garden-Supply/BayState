"""Approved Source Extraction package.

This package implements the runner-side of the Approved Source Extraction system:
- types.py — Pydantic/dataclass models for source plans from the coordinator
- policy.py — Domain policy gate enforcing approved sources only
- orchestrator.py — Distributor-first extraction orchestration
- adapters/ — Source-specific Crawl4AI adapters (official brand, distributor)
"""
