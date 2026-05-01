# AI Search End-to-End Benchmark

This package contains the end-to-end benchmark for the AI Search scraper pipeline.

Unlike the existing `official_brand` benchmark (which tests URL discovery only), this
benchmark evaluates the **complete pipeline**:

1. **Search** — Does the search provider return relevant results?
2. **URL Selection** — Can we identify an official/retailer product page URL?
3. **Domain Match** — Does the selected URL match expected domains?
4. **Crawl** — Can we fetch the page content?
5. **Extraction** — Can we extract structured product data?
6. **Validation** — Does the extraction pass validation rules?
7. **Data Quality** — How accurate are the extracted fields vs ground truth?

### CI Policy

Fixture mode is the **authoritative correctness gate** for CI.

- All PRs must pass the fixture-mode benchmark before merging.
- Live-mode tests (`@pytest.mark.live`) are **never** run in CI by default.
- Live-mode tests are excluded via `pytest.ini` (`addopts = -m "not live"`).
- Live-mode runs require real API keys (`SERPER_API_KEY`, `OPENAI_API_KEY` or
  `GEMINI_API_KEY`) and are intended for local or gated manual execution only.

## Prerequisites

### Page Fixtures

Fixture mode requires captured page HTML fixtures. The committed dataset
(`fixtures/e2e_dataset.json`) includes 10 entries. Page fixtures must be captured
before running the full extraction benchmark:

```bash
python -m benchmarks.ai_search.capture_page_fixtures \
  --dataset benchmarks/ai_search/fixtures/e2e_dataset.json \
  --output-dir benchmarks/ai_search/fixtures/page_fixtures \
  --max-concurrency 2
```

After capture, `fixtures/page_fixtures/` should contain 10 `.json` files.

If page fixtures are missing, fixture mode will still test URL discovery but
will report `crawl` failures for extraction.

### Search Fixtures

Search fixtures are embedded per-entry in the dataset JSON. No additional
setup is required.

## Run

### Fixture Mode (Deterministic, No API Costs)

Uses cached search fixtures and optional page fixtures. **Cost: $0.00** — no live
search API calls or LLM extraction. Suitable for CI.

```bash
python -m cli.main benchmark ai-search-e2e \
  --dataset benchmarks/ai_search/fixtures/e2e_dataset.json \
  --mode fixture \
  --output-dir reports
```

### Live Mode (Real API Calls, Estimated Costs)

Makes real search API calls and crawls live pages. Costs are estimated:
- **Search**: Serper is $0.00 per query (`DEFAULT_PROVIDER_COST_USD`).
- **Extraction**: Nominal $0.01 per LLM extraction (GPT-4o-mini estimate);
  $0.00 for JSON-LD / meta-tag extraction.

These are _estimates_ intended for tracking trends, not billing accuracy.

```bash
python -m cli.main benchmark ai-search-e2e \
  --dataset benchmarks/ai_search/fixtures/e2e_dataset.json \
  --mode live \
  --output-dir reports \
  --max-concurrency 2
```

### Live Smoke Mode (Manual — Real APIs, 3 SKUs)

Runs a small 3-SKU smoke profile against **live search APIs and real product
pages**. Designed for observability, not CI gates.

**Requirements:**
- `SERPER_API_KEY` environment variable (search provider)
- `OPENAI_API_KEY` or `GEMINI_API_KEY` (LLM extraction)

**Run:**
```bash
export SERPER_API_KEY="your_key"
export OPENAI_API_KEY="your_key"
python -m cli.main benchmark ai-search-e2e --live-smoke
```

The `--live-smoke` flag overrides `--dataset`, `--mode`, and `--max-concurrency`
to use the 3-SKU smoke dataset (`fixtures/live_smoke_dataset.json`) in live mode
with concurrency 1.

**Estimated cost per run:** ~$0.01–0.05 (3 search queries + up to 3 LLM extractions).

**Expected behavior:**
- Results vary between runs (search rankings change, pages update, bot protection triggers).
- Some SKUs may fail due to bot challenges, rate limits, or page structure changes.
- The benchmark logs results but does **not** enforce pass thresholds.
- Review the Markdown report to inspect real-world pipeline behavior.

**When to run:**
- After changing search query construction or source scoring logic.
- After changing extraction prompts or validation rules.
- Before/after deployments to validate real-world behavior.
- Weekly sanity check on pipeline health.

**Why not in CI:**
- Nondeterministic (search rankings drift, pages change).
- Costs real money ($0.01–0.05 per run).
- External API dependencies (rate limits, downtime).
- Flaky failures would block unrelated PRs.

### With Threshold Gates

```bash
python -m cli.main benchmark ai-search-e2e \
  --dataset benchmarks/ai_search/fixtures/e2e_dataset.json \
  --mode fixture \
  --fail-under-end-to-end-rate 0.50 \
  --fail-under-domain-match-rate 0.70 \
  --data-quality-threshold 0.6
```

## Output

The command writes:

- `reports/ai-search-e2e-benchmark.json` — Full structured report
- `reports/ai-search-e2e-benchmark.md` — Human-readable summary

### JSON Report Structure

```json
{
  "schema_version": "ai-search-e2e-benchmark-report-v1",
  "mode": "fixture",
  "benchmark_type": "ai_search_end_to_end",
  "summary": {
    "total_entries": 10,
    "end_to_end_success_rate": 0.6,
    "search_success_rate": 1.0,
    "url_selection_success_rate": 0.9,
    "domain_match_rate": 0.8,
    "crawl_success_rate": 0.85,
    "extraction_success_rate": 0.8,
    "validation_pass_rate": 0.75,
    "data_quality_pass_rate": 0.7,
    "average_brand_score": 0.85,
    "average_name_score": 0.78,
    "average_description_score": 0.65,
    "average_size_metrics_score": 0.72,
    "average_image_score": 0.90,
    "average_categories_score": 0.55,
    "average_overall_quality_score": 0.74,
    "average_total_duration_ms": 4523,
    "p50_total_duration_ms": 3800,
    "p95_total_duration_ms": 12000,
    "total_cost_usd": 0.25,
    "failure_breakdown": {
      "extraction": 2,
      "validation": 1,
      "data_quality": 1
    }
  },
  "entries": [
    {
      "sku": "850012047735",
      "stages": {
        "search_success": true,
        "url_selection_success": true,
        "domain_match": true,
        "crawl_success": true,
        "extraction_success": true,
        "validation_passed": true,
        "data_quality_passed": true,
        "end_to_end_success": true
      },
      "failure_stage": null,
      "failure_reason": null,
      "field_quality": {
        "brand_score": 1.0,
        "name_score": 0.95,
        "description_score": 1.0,
        "size_metrics_score": 1.0,
        "image_score": 1.0,
        "categories_score": 0.67,
        "overall_score": 0.93
      },
      ...
    }
  ]
}
```

## Dataset Schema

Dataset file schema version: `ai-search-e2e-benchmark-dataset-v1`

Required entry fields:

- `sku`
- `product_name`
- `brand`
- `expected_official_domains` (non-empty list)
- `expected_source_url`

Optional fields:

- `source_type` — `"official"` or `"retailer"`
- `category`
- `difficulty`
- `tags`
- `ground_truth` — Field-level expected values
  - `brand`
  - `name`
  - `description_contains` — List of substrings expected in description
  - `size_metrics`
  - `image_required` — Boolean
  - `categories` — List of expected categories
- `search_fixtures` — Per-entry cached search queries and results

## How To Add A New Benchmark Case

1. Add an entry to `fixtures/e2e_dataset.json` with all required fields.
2. Add `search_fixtures` for deterministic fixture mode testing.
3. Optionally capture the page HTML and save to `fixtures/page_fixtures/`.
4. Run the benchmark locally in fixture mode.
5. Review the Markdown report for field quality scores and failure reasons.
6. Raise thresholds over time as confidence improves.

## Capturing Page Fixtures

To capture deterministic page fixtures for offline testing:

```bash
python -m benchmarks.ai_search.capture_page_fixtures \
  --dataset benchmarks/ai_search/fixtures/e2e_dataset.json \
  --output-dir benchmarks/ai_search/fixtures/page_fixtures \
  --max-concurrency 2
```

To capture only specific SKUs:

```bash
python -m benchmarks.ai_search.capture_page_fixtures \
  --dataset benchmarks/ai_search/fixtures/e2e_dataset.json \
  --output-dir benchmarks/ai_search/fixtures/page_fixtures \
  --skus 850012047735 072318200618
```

When page fixtures exist, the benchmark runner uses `extract_from_fixture()`
instead of live crawling, making extraction fully deterministic.

### Fixture Mode Without Page Fixtures

If you run in fixture mode without captured page fixtures, the benchmark will:
- Use cached search fixtures for URL discovery (deterministic)
- Skip live crawling and report a clear `crawl` failure for each missing page fixture

This is useful for testing discovery independently, but to measure extraction
quality you must capture page fixtures first.

## Comparison With Existing Benchmarks

| Benchmark | Scope | Network | Stages Measured |
|-----------|-------|---------|-----------------|
| `official-brand` (existing) | URL discovery only | Fixture | Search, URL selection |
| `ai-search-e2e` (this) | Full pipeline | Fixture or Live | Search, URL selection, Crawl, Extraction, Validation, Data Quality |

## Troubleshooting

### "All entries fail at crawl stage"

Page fixtures are missing. Run the capture script:
```bash
python -m benchmarks.ai_search.capture_page_fixtures \
  --dataset benchmarks/ai_search/fixtures/e2e_dataset.json \
  --output-dir benchmarks/ai_search/fixtures/page_fixtures \
  --max-concurrency 2
```

If specific URLs fail repeatedly (bot protection, dead links), you may need
to substitute them in the dataset or run in `--mode live`.

### "Search fixtures not found" / URL discovery fails

Verify that each dataset entry has `search_fixtures` with matching queries.
The shared `--search-fixtures` file is a fallback but per-entry fixtures are
preferred.

### "Domain match rate is 0%"

Check that `expected_official_domains` in the dataset matches the domains
that `identify_official_url()` actually discovers. The scraper normalizes
domains (removes `www.`, protocol, path) before comparing.

### High extraction success but low data quality

This means data is being extracted but doesn't match ground truth well.
Review `field_quality` scores in the report to identify weak fields:
- Low `size_metrics_score` → extraction prompt needs size/weight guidance
- Low `categories_score` → category inference logic needs refinement
- Low `description_score` → description substring expectations may be too strict

## Current Benchmark Status

With the committed dataset and captured page fixtures, fixture mode typically
produces results similar to:

| Metric | Typical Value |
|--------|---------------|
| End-to-end success rate | ~50% |
| Domain match rate | 100% |
| Extraction success rate | ~90% |
| Average brand score | 1.00 |
| Average name score | ~0.90 |
| Average overall quality | ~0.71 |

**Known weak areas:**
- **Size metrics** (score ~0.22) — extraction often misses or misreports size/weight
- **Categories** (score ~0.04) — category inference needs significant improvement
- **Description** (score ~0.67) — some expected substrings are not found

These metrics provide a baseline for measuring improvement over time.

## Environment Variables

| Variable | Required For | Description |
|----------|--------------|-------------|
| `SERPER_API_KEY` | Live mode | Serper search API key for live search queries. |
| `OPENAI_API_KEY` | Live mode (optional) | OpenAI API key for LLM extraction (GPT-4o-mini). |
| `GEMINI_API_KEY` | Live mode (optional) | Gemini API key for LLM extraction (fallback). |

**Never commit API keys to the repository.** Use `.env` files, shell exports, or
secret management tools locally. The benchmark reads these directly from
`os.environ` — it does not read `.env` files automatically.

## Key Metrics

- **End-to-end success rate** — Overall pipeline success (the primary metric)
- **Domain match rate** — URL selection accuracy
- **Extraction success rate** — Structured data extraction rate
- **Field quality scores** — Per-field accuracy vs ground truth
- **Failure breakdown** — Where failures occur (search, URL selection, crawl, extraction, validation, data quality)

These metrics provide actionable evidence for refining:
- Search query construction
- Source scoring and URL selection
- Crawl behavior and timeouts
- Extraction prompts and strategies
- Validation rules and thresholds
- Fallback logic
