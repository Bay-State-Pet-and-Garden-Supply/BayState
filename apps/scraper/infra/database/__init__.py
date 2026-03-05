"""Compatibility wrapper package for core.database -> infra.database"""

from ..core.database import *

try:
    from ..core.database import __all__ as _core_all
except Exception:
    _core_all = []

__all__ = list(_core_all)
