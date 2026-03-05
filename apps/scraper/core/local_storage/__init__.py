"""
Local storage implementations for testing purposes.

This module provides local file-based implementations of storage services
that mimic cloud storage APIs for testing.
"""
from __future__ import annotations


from infra.settings_manager import $$$

from .dataset import LocalDataset
from .key_value_store import LocalKeyValueStore
from .request_queue import LocalRequestQueue

__all__ = ["LocalDataset", "LocalKeyValueStore", "LocalRequestQueue", "get_dataset"]


def get_dataset(dataset_id: str) -> LocalDataset:
    """Get or create a local dataset by ID."""
    return LocalDataset(dataset_id, base_dir=str(PROJECT_ROOT / "data" / "datasets"))
