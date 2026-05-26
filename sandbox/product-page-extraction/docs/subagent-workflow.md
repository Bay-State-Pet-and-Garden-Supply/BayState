# Subagent Workflow

Keep the parent session as orchestrator. Use one writer at a time and keep all edits under `sandbox/product-page-extraction/**` unless the user explicitly approves promotion.

## Recommended loop

1. `scout`: inspect latest packets and experiment log.
2. `planner`: choose the next small experiment or script improvement.
3. `worker`: implement only sandbox changes.
4. Parallel reviewers:
   - Crawl4AI behavior
   - LM Studio hallucination/safety
   - agent-browser fallback value
   - isolation/no production integration
5. `oracle`: decide whether evidence supports production architecture changes.

## Stop rules

Ask the user before:

- touching `apps/web`, `apps/scraper`, `packages`, root package scripts, or migrations
- adding production credentials
- adding agent-browser as a production runtime dependency
- changing pipeline lifecycle or product draft architecture
