"""Compatibility wrapper for core.events -> infra.events"""

from ..core.events import *

try:
    from ..core.events import __all__ as _core_all
except Exception:
    _core_all = []

__all__ = list(_core_all)
