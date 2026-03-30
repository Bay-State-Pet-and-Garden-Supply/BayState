## 2026-03-30
- Added `apps/scraper/tests/test_two_step_refiner.py` with 8 red-phase pytest cases covering trigger logic, circuit breaker behavior, name extraction, A/B validation, budget enforcement, and telemetry.
- Reused the scraper test pattern of wiring a real `SearchClient` to a `ProviderStub` so second-pass queries can be asserted without touching SerpAPI.
- Mocked `NameConsolidator.consolidate_name` with `AsyncMock` and `QueryBuilder.build_search_query` with `MagicMock` so the future implementation contract is explicit.
- `TwoStepSearchRefiner` green-phase logic now treats `max_follow_up_queries` as a circuit-breaker budget gate, aborts cleanly when name consolidation fails, and records second-pass telemetry even when A/B validation keeps the first result.
- BasedPyright stays clean here by normalizing search payloads to `dict[str, object]` and coercing candidate confidence through a dedicated helper instead of calling `float()` directly on raw payload values.
- Cost validation now depends on `SearchClient.search_with_cost(...)`, which returns per-query provider cost without changing existing `search()` callers.
- Two-step refinement cost is now the sum of name consolidation plus the second-pass search request, while `AISearchResult.cost_usd` adds the initial search stage so runner callbacks receive total per-SKU cost.
- Regression coverage now includes `test_cost_tracking_accurate` plus an integration assertion that improved two-step results surface the accumulated cost on the final scraper result.
