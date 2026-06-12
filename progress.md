# Progress

## Status
In Progress

## Done
- [x] P0: Fix Orgill image backslash — 3 files changed, backslash→forward-slash, +2 unit tests
- [x] P0: Base adapter global backslash safety net — `base.py` normalize_images()
- [x] P1: Fix Central Pet weight/features/dimensions extraction — 8→14 fields (live verified)
- [x] P2: Fix result builder `product_number` → `item_number` mapping (reverted — useless for final product)
- [x] P2: Central Pet cleanup — removed `product_number` from consolidation output (distributor-internal SKU)
- [x] P2: Fix UPC facet mapping — kept, good for LLM context
- [x] Updated live test UPCs for Orgill (stale fixture UPC replaced)
- [x] Updated Central Pet fixture expected_fields to include `weight`

## Remaining
- [ ] Verify live re-test for Central Pet (14 fields) and Orgill (backslash fixed)

## Files Changed

### Orgill backslash fix
- `apps/scraper/scrapers/approved_sources/adapters/orgill.py` — backslash→slash in normalize_images()
- `apps/scraper/scrapers/approved_sources/adapters/base.py` — global backslash safety net
- `apps/scraper/tests/unit/test_approved_sources_adapter_fixtures.py` — +2 orgill/backslash tests

### Central Pet extraction
- `apps/scraper/scrapers/approved_sources/adapters/central_pet.py` — fixed weight li selector, added accordion features/dimensions parsing, added sell/pallet qty
- `apps/scraper/benchmarks/approved_sources/fixtures/distributor_extraction_fixtures.json` — added `weight` to expected_fields

### Central Pet cleanup (consolidation-relevant only)
- `apps/scraper/scrapers/approved_sources/adapters/central_pet.py` — product_number used internally for matching, stripped from output
- `apps/scraper/benchmarks/approved_sources/fixtures/distributor_extraction_fixtures.json` — verified `weight` is extracted

### Result builder (enrichment_models.py)
- `apps/scraper/scrapers/ai_search/enrichment_models.py` — product_number→item_number mapping removed (was reverted); UPC facet kept
- `apps/scraper/tests/unit/test_enrichment_models.py` — updated
- `apps/scraper/tests/unit/test_approved_sources_result_builder.py` — updated

### Live test UPCs
- `apps/scraper/tests/live/test_all_adapters_live.py` — Orgill UPC updated
- `apps/scraper/tests/live/run_adapter_test.py` — Orgill UPC updated

## Notes
- Consolidation pipeline does NOT use distributor-internal SKUs for the final product
- UPC is preserved — it's in RELEVANT_FIELDS for LLM context
- `product_number` stripped from Central Pet output but still used internally for identifier matching
