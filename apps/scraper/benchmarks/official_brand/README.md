# Official Brand Benchmark

This benchmark validates Official Brand URL discovery in deterministic fixture mode.

It exercises `OfficialBrandScraper.identify_official_url(...)` only (discovery-only),
using cached search fixtures and no live API calls.

## Run

From `apps/scraper`:

```bash
python3 -m cli.main benchmark official-brand
```

With explicit paths and threshold gate:

```bash
python3 -m cli.main benchmark official-brand \
  --dataset benchmarks/official_brand/fixtures/smoke_dataset.json \
  --search-fixtures benchmarks/official_brand/fixtures/search_cache/entries.json \
  --output-dir reports \
  --fail-under-domain-match-rate 0.90
```

## Output

The command writes:

- `official-brand-benchmark.json`
- `official-brand-benchmark.md`

By default these are written under `reports/`.

## Dataset Schema

Dataset file schema version must be:

- `official-brand-benchmark-dataset-v1`

Required entry fields:

- `sku`
- `product_name`
- `expected_official_domains` (non-empty list)

Optional fields:

- `brand`
- `preferred_domains`
- `expected_url`
- `category`
- `difficulty`
- `tags`

Example:

```json
{
  "schema_version": "official-brand-benchmark-dataset-v1",
  "entries": [
    {
      "sku": "032247761215",
      "brand": "Scotts",
      "product_name": "Scotts Turf Builder EdgeGuard Mini Broadcast Spreader",
      "expected_official_domains": ["scotts.com"],
      "preferred_domains": ["scotts.com"],
      "expected_url": "https://www.scotts.com/en-us/products/spreaders/turf-builder-edgeguard-mini-broadcast-spreader",
      "category": "lawn-garden",
      "difficulty": "easy",
      "tags": ["smoke", "official-domain"]
    }
  ]
}
```

## Search Fixture Format

Search fixture entries are a list of query/result payloads that are written into
`FixtureSearchClient` cache files during benchmark startup.

Example:

```json
{
  "schema_version": "official-brand-search-fixtures-v1",
  "entries": [
    {
      "query": "site:scotts.com 032247761215",
      "results": [
        {
          "url": "https://www.scotts.com/en-us/products/spreaders/turf-builder-edgeguard-mini-broadcast-spreader",
          "title": "Scotts Turf Builder EdgeGuard Mini Broadcast Spreader",
          "description": "Official Scotts product page",
          "provider": "fixture",
          "result_type": "organic"
        }
      ]
    }
  ]
}
```

## How To Add A New Benchmark Case

1. Add an entry to your dataset JSON with expected official domains.
2. Add matching query fixtures for the expected search queries.
3. Run the benchmark command locally.
4. Review JSON report for `domain_match` and failure reasons.
5. Raise `--fail-under-domain-match-rate` over time as confidence improves.

## Current Scope

- Discovery-only (official URL identification)
- Fixture-only (deterministic, no network)

Future extensions can add live mode and extraction metrics in separate commands.
