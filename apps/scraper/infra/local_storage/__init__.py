"""Compatibility wrapper package for core.local_storage -> infra.local_storage"""

from ..core.local_storage import *

try:
    from ..core.local_storage import __all__ as _core_all
except Exception:
    _core_all = []

__all__ = list(_core_all)
