# EXECUTOR MODULE

**Scope:** Workflow execution engine - decomposed from god class

## STRUCTURE
```
executor/
├── workflow_executor.py   # Main orchestrator (~589 lines)
├── browser_manager.py     # Browser lifecycle
├── selector_resolver.py   # Element finding and extraction
├── step_executor.py       # Step execution with retry logic
├── debug_capture.py       # Debug artifact capture
└── normalization.py       # Result normalization
```

## MODULES

**workflow_executor.py:** Loads API config, manages browser lifecycle, executes steps, handles errors.
**browser_manager.py:** Initialize/quit Playwright, navigation, HTTP status, page state.
**selector_resolver.py:** `find_element_safe()`, `find_elements_safe()`, CSS/XPath support.
**step_executor.py:** Execute steps with exponential backoff, circuit breaker, error classification.
**debug_capture.py:** Screenshots, page source, console logs, network requests on failure.
**normalization.py:** Price formatting, unit standardization, text cleanup, image URL processing.

## ARCHITECTURE

Decomposed from single 797-line god class:
- `WorkflowExecutor` (589 lines) - Orchestration only
- `BrowserManager` - Browser lifecycle
- `SelectorResolver` - Element finding
- `StepExecutor` - Step execution
- `debug_capture` - Debug artifacts
- `normalization` - Result transformation

## USAGE
```python
from scrapers.executor.workflow_executor import WorkflowExecutor
from core.api_client import ScraperAPIClient

client = ScraperAPIClient()
config = client.get_published_config("amazon")
executor = WorkflowExecutor(config)
results = await executor.run(["sku123"])
```

## CONVENTIONS
- **Async only**: All operations are async
- **Context protocol**: Uses ScraperContext for loose coupling
- **Event emission**: Emits events via EventEmitter
- **Error handling**: Uses WorkflowExecutionError hierarchy

## ANTI-PATTERNS
- **NO** direct browser access (use BrowserManager)
- **NO** sync operations
- **NO** direct DB access
- **NO** bypassing StepExecutor for retry logic
