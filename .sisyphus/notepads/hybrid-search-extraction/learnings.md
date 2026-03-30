## 2026-03-30
- Added `apps/scraper/tests/test_two_step_refiner.py` with 8 red-phase pytest cases covering trigger logic, circuit breaker behavior, name extraction, A/B validation, budget enforcement, and telemetry.
- Reused the scraper test pattern of wiring a real `SearchClient` to a `ProviderStub` so second-pass queries can be asserted without touching SerpAPI.
- Mocked `NameConsolidator.consolidate_name` with `AsyncMock` and `QueryBuilder.build_search_query` with `MagicMock` so the future implementation contract is explicit.
