T2 - Event system usage findings (append from evidence)

- core/events.py is the structured, canonical event bus for runtime/tracker/telemetry. Used by runner, runtime, executor, API server, and validated by v2 tests.
- scrapers/events is a lightweight Test Lab event subsystem for websocket-based live debugging and test utilities; primarily referenced by tests and handlers under apps/scraper/scrapers/events.
- Keep both systems. Treat core.events as canonical for production, and leave scrapers.events as a complementary Test Lab subsystem. Consider an adapter layer later if consolidation is desired.

Evidence file: .sisyphus/evidence/t2-event-system-usage.txt

Next actions: verify exact import lines per-file (already collected) and consider migration adapter if team agrees.
