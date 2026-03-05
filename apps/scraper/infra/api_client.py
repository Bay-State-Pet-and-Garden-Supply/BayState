"""Compatibility wrapper for core.api_client -> infra.api_client"""

from ..core.api_client import *

try:
    from ..core.api_client import __all__ as _core_all
except Exception:
    _core_all = []

__all__ = list(_core_all)
