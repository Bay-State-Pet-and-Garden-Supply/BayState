# Scraper Test Suite

## CI Gating Command

Run this from `apps/scraper` before pushing scraper changes:

```bash
python3 -m pytest
```

For the CI-style subset with live login tests skipped:

```bash
CI=true python3 -m pytest
```

## Official Brand Coverage

Key offline tests:

- `tests/unit/test_official_brand_scraper.py` - ProductUrlExtractor extraction and fallback tests (discovery is server-side).
- `tests/integration/test_official_brand_pipeline.py` - In-memory fixture contract tests for official-vs-retailer selection.
- `tests/unit/test_search_scorer_regressions.py` - SearchScorer ranking regressions.
- `tests/unit/test_selection_pipeline.py` - Candidate selection pipeline behavior.
- `tests/unit/test_extraction_validator.py` - Extraction acceptance/rejection rules.
- `tests/unit/test_official_brand_extraction_seed.py` - Shape guard for the curated extraction benchmark seed.

## Benchmark Assets

Legacy `golden_dataset_v*`, golden fixture bridge, and archived benchmark artifacts were removed. New Official Brand benchmark assets live under:

```text
benchmarks/official_brand/
```

Current assets:

- `fixtures/smoke_dataset.json` - deterministic URL-discovery benchmark data.
- `fixtures/search_cache/entries.json` - deterministic search fixtures for discovery.
- `fixtures/extraction_seed.json` - curated real URL/product ground truth seed for the next live Crawl4AI extraction benchmark.

Run the current deterministic discovery benchmark from `apps/scraper`:

```bash
python3 -m cli.main benchmark official-brand
```

The extraction seed is not part of default CI and should only be used by an explicit live benchmark command once implemented.

## Live Tests

Live tests are excluded by default unless they are explicitly enabled. They may require API keys and can incur cost.

```bash
python3 -m pytest -m "live" --run-live
```

Required environment variables depend on the test or benchmark being run, but commonly include:

- `SCRAPER_API_KEY`
- `SERPER_API_KEY`
- an LLM API key such as `LLM_API_KEY`
