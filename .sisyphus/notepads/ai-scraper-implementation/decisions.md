## 2026-02-19
- Decision: Keep static and agentic execution on the same `WorkflowExecutor` path, only adding scraper-type-aware initialization/routing hooks.
  - Rationale: preserves backward compatibility for all existing static workflows and avoids a disruptive executor split.

- Decision: Reuse executor-managed browser-use Browser in `BaseAIAction.initialize_browser` when `ctx.ai_browser` is present.
  - Rationale: gives agentic workflows a single lifecycle owner (`WorkflowExecutor`) and avoids accidental closure of shared browser resources from individual actions.
