from __future__ import annotations

from .base import BaseAction


class ActionRegistry:
    """Registry for managing available workflow actions."""

    _actions: dict[str, type[BaseAction]] = {}
    _registry: dict[str, type[BaseAction]] = _actions

    @classmethod
    def register(cls, name: str):
        """Decorator to register an action class."""

        def decorator(action_class: type[BaseAction]):
            cls._actions[name.lower()] = action_class
            return action_class

        return decorator

    @classmethod
    def get_action_class(cls, name: str) -> type[BaseAction] | None:
        """Get an action class by name."""
        return cls._actions.get(name.lower())

    @classmethod
    def get_registered_actions(cls) -> dict[str, type[BaseAction]]:
        """Get all registered actions."""
        return cls._actions.copy()

    @classmethod
    def auto_discover_actions(cls) -> None:
        """Auto-discover and register actions from the handlers directory."""
        import importlib
        import pkgutil
        from pathlib import Path

        # Get the handlers package path
        # Support both old location (scrapers.actions.handlers) and new location (actions.handlers)
        handlers_path = Path(__file__).parent / "handlers"
        if not handlers_path.exists():
            # fallback to new location
            handlers_path = Path(__file__).parent.parent / "actions" / "handlers"

        # Import all modules in the handlers directory
        for _, module_name, _ in pkgutil.iter_modules([str(handlers_path)]):
            try:
                # Try importing from the old package path first, fall back to new package path
                try:
                    _ = importlib.import_module(f"scrapers.actions.handlers.{module_name}")
                except ImportError:
                    _ = importlib.import_module(f"actions.handlers.{module_name}")
                # The decorators will register the actions automatically
            except ImportError as e:
                # Log but don't fail - some handlers might have dependencies
                import logging

                logger = logging.getLogger(__name__)
                logger.debug(f"Could not import handler {module_name}: {e}")

        # Log registered actions
        import logging

        logger = logging.getLogger(__name__)
        registered_count = len(cls._actions)
        logger.info(f"Auto-discovered {registered_count} actions: {list(cls._actions.keys())}")


try:
    ActionRegistry.auto_discover_actions()
except Exception:
    pass
