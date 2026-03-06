from __future__ import annotations

from scrapers.actions.base import BaseAction

import importlib
import pkgutil
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class ActionRegistry:
    _actions: dict[str, type[BaseAction]] = {}

    @classmethod
    def register(cls, name: str):
        def decorator(action_class: type[BaseAction]):
            cls._actions[name.lower()] = action_class
            return action_class

        return decorator

    @classmethod
    def get_action_class(cls, name: str) -> type[BaseAction] | None:
        return cls._actions.get(name.lower())

    @classmethod
    def get_registered_actions(cls) -> dict[str, type[BaseAction]]:
        return cls._actions.copy()

    @classmethod
    def auto_discover_actions(cls) -> None:
        # Discover handlers under actions.handlers
        handlers_path = Path(__file__).parent / "handlers"
        if not handlers_path.exists():
            return

        for _, module_name, _ in pkgutil.iter_modules([str(handlers_path)]):
            try:
                importlib.import_module(f"actions.handlers.{module_name}")
            except Exception as e:
                logger.debug(f"Could not import handler {module_name}: {e}")


try:
    ActionRegistry.auto_discover_actions()
except Exception:
    pass
