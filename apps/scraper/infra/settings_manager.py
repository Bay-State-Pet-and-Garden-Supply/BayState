"""Compatibility wrapper for core.settings_manager -> infra.settings_manager"""

from ..core.settings_manager import *

try:
    from ..core.settings_manager import __all__ as _core_all
except Exception:
    _core_all = []

__all__ = list(_core_all)
