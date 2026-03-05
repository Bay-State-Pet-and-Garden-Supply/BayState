"""Compatibility wrapper for core.realtime_manager -> infra.realtime_manager"""

from ..core.realtime_manager import *

try:
    from ..core.realtime_manager import __all__ as _core_all
except Exception:
    _core_all = []

__all__ = list(_core_all)
