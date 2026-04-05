# ACTIONS MODULE

**Scope:** Workflow action system - 27 handler implementations

## STRUCTURE
```
actions/
├── handlers/              # 27 action implementations (all async)
│   ├── navigate.py, click.py, extract.py, extract_and_transform.py
│   ├── input.py, login.py, verify.py
│   ├── wait.py, wait_for.py, wait_for_hidden.py
│   ├── conditional.py, conditional_skip.py, combine.py, script.py
│   ├── browser.py, image.py, table.py, json.py
│   ├── sponsored.py, weight.py, transform_value.py
│   └── ai_base.py, ai_extract.py, ai_search.py, ai_validate.py, anti_detection.py
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
- **Extraction:** `extract`, `extract_and_transform`, `transform_value`, `table`, `json`, `image`
- **AI-Powered:** `ai_base`, `ai_extract`, `ai_search`, `ai_validate`
- **Input & Auth:** `input`, `login`, `verify`
- **Flow Control:** `conditional`, `conditional_skip`, `combine`, `script`
- **Utilities:** `browser`, `sponsored`, `weight`, `anti_detection`, `validation`

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
