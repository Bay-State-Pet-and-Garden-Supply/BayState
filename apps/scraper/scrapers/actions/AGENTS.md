# ACTIONS MODULE

**Scope:** Workflow action system - 24 handler files (39 registered actions)

## STRUCTURE
```
actions/
├── handlers/              # 24 handler implementations (all async)
│   ├── navigate.py, click.py, extract.py, extract_transform.py
│   ├── input.py, login.py, verify.py
│   ├── wait.py, wait_for.py, wait_for_hidden.py
│   ├── conditional.py, validation.py, combine.py, script.py
│   ├── browser.py, image.py, table.py, json.py
│   ├── sponsored.py, weight.py, transform.py
│   └── ocr.py, set_proxy.py, anti_detection.py
├── base.py                # BaseAction abstract class
└── registry.py            # ActionRegistry with auto-discovery
```

## BASE ACTION
```python
from scrapers.actions.base import BaseAction
from scrapers.actions.registry import ActionRegistry

@ActionRegistry.register("my_action")
class MyAction(BaseAction):
    async def execute(self, params: dict[str, Any]) -> Any:
        # Access via self.ctx (browser, results, config)
        pass
```

## HANDLER CATEGORIES
- **Navigation:** `navigate`, `click`, `wait`, `wait_for`, `wait_for_hidden`
- **Extraction:** `extract`, `extract_and_transform` (in `extract_transform.py`), `transform_value` (in `transform.py`), `table`, `json`, `image`
- **Input & Auth:** `input`, `login`, `verify`
- **Flow Control:** `conditional`, `conditional_skip` (in `validation.py`), `combine`, `script`
- **Utilities:** `browser`, `sponsored`, `weight`, `anti_detection`, `validation`, `ocr`, `set_proxy`

## CONVENTIONS
- **All async**: Every handler uses `async def execute()`
- **Context access**: Use `self.ctx` for browser, results, config
- **Error handling**: Raise `WorkflowExecutionError` for failures
- **Logging**: Use module logger with context

## ANTI-PATTERNS
- **NO** sync I/O operations
- **NO** direct DB access
- **NO** hardcoded selectors (use YAML params)
- **NO** bypassing ActionRegistry
