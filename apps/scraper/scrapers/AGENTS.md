# SCRAPERS MODULE

**Scope:** Scraping domain - actions, workflows, execution engine, events

## STRUCTURE
```
scrapers/
├── actions/               # 27 action handlers (async)
│   ├── handlers/          # navigate, click, extract, ai_extract, ...
│   ├── base.py            # BaseAction
│   └── registry.py        # ActionRegistry
├── executor/              # Workflow execution (decomposed)
│   ├── workflow_executor.py, browser_manager.py, selector_resolver.py
│   ├── step_executor.py, debug_capture.py, normalization.py
├── events/                # EventEmitter, WebSocket
├── configs/               # Deprecated - API is runtime source
├── context.py             # ScraperContext Protocol
├── models/                # Pydantic models
└── parser/                # YAML config parsing
```

## KEY CONCEPTS

**ScraperContext Protocol:** Interface between actions and executor. Actions receive `self.ctx`.

**Action Registration:**
```python
@ActionRegistry.register("navigate")
class NavigateAction(BaseAction):
    async def execute(self, params):
        await self.ctx.browser.page.goto(params["url"])
```

**Adding Actions:**
1. Create `{name}.py` in `actions/handlers/`
2. Inherit `BaseAction`, use `@ActionRegistry.register("{name}")`
3. Access via `self.ctx`

## ANTI-PATTERNS
- **NO** selenium references
- **NO** sync browser operations
- **NO** direct DB access
- **NO** hardcoded site logic
- **NO** bypassing EventEmitter

## RELATED
- Parent: `../AGENTS.md`
- Actions: `./actions/AGENTS.md`
- Executor: `./executor/AGENTS.md`
- Events: `./events/AGENTS.md`
- crawl4ai: `../src/crawl4ai_engine/AGENTS.md`

## TESTING
Action tests: `tests/test_action_registry.py`
Executor tests: `tests/test_workflow_executor.py`
