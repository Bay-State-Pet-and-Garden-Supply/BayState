# URL Extraction Benchmark

Extraction-only benchmark that measures `ProductPageExtractor` quality against known product URLs.

This benchmark tests extraction quality **separately from SERP URL discovery**. It receives pre-discovered product URLs and scores how well the extractor captures name, brand, description, weight, species, food form, flavor, images, categories, and whether it rejects dirty HTML and non-product media.

## Directory layout

```
benchmarks/url_extraction/
├── __init__.py              # Package marker
├── dataset.json             # Legacy/audit benchmark entries
├── gold_dataset.json        # Human-approved gold rows only
├── gold_dataset.candidates.json # AI/tool-drafted rows awaiting review
├── gold_schema.py           # Gold/candidate dataset validator
├── gold_gates.py            # Explicit gold hard-gate evaluator
├── metrics.py               # Pure scoring functions (no I/O, no network)
├── runner.py                # CLI runner (live extraction)
├── report.py                # JSON + Markdown report writer
├── README.md                # This file
└── reports/
    └── latest/              # Generated report output (gitignored)
        ├── extraction-report.json
        ├── extraction-report.md
        └── raw/             # Per-entry raw extraction results
```

## Requirements

- Python 3.12+
- `ProductPageExtractor` and its crawl4ai/scraper dependencies installed
- `dotenv` for `.env` loading
- Network access to target product URLs
- `LLM_API_KEY` environment variable or `.env` file (for LLM extraction fallback)

## Usage

### Live run (against real URLs)

```bash
# From the scraper project root (apps/scraper)
python -m benchmarks.url_extraction.runner \
    --dataset benchmarks/url_extraction/dataset.json \
    --output-dir benchmarks/url_extraction/reports/latest \
    --max-concurrency 2 \
    --fail-under 0.80
```

The runner loads `LLM_API_KEY`, `LLM_MODEL`, and `LLM_BASE_URL` from the project `.env` file (see `.env.example`). CLI flags override env vars:

```bash
python -m benchmarks.url_extraction.runner \
    --dataset benchmarks/url_extraction/dataset.json \
    --llm-model gpt-4o-mini \
    --llm-api-key sk-... \
    --fail-under 0.70
```

### CLI options

| Flag | Default | Description |
|------|---------|-------------|
| `--dataset` | (required) | Path to dataset JSON |
| `--output-dir` | `benchmarks/url_extraction/reports/latest` | Output directory |
| `--max-concurrency` | `2` | Parallel extractions |
| `--fail-under` | None | Fail exit code if pass rate below threshold (0.0-1.0) |
| `--llm-model` | from env | LLM model override |
| `--llm-api-key` | from env | LLM API key override |
| `--llm-base-url` | from env | LLM base URL override |
| `--headless` | `true` | Run browser headless |
| `--verbose` | false | Enable debug logging |

### Offline unit tests

```bash
# These tests do NOT require network, browser, or API keys
python -m pytest tests/unit/benchmarks/test_url_extraction_metrics.py -v
```

## Dataset format

```json
{
  "schema_version": "url-extraction-benchmark-v1",
  "entries": [
    {
      "id": "openfarm-goodgut-chicken-19lb",
      "upc": "683547120150",
      "brand": "Open Farm",
      "product_name": "GoodGut Harvest Chicken Dog Kibble - 19 lb",
      "source_url": "https://openfarmpet.com/products/goodgut-harvest-chicken-dog-kibble",
      "expected": {
        "brand": "Open Farm",
        "name_contains": ["GoodGut", "Harvest Chicken", "Dog Kibble"],
        "description_contains": ["Lifeway", "2 billion CFUs", "humanely-raised chicken"],
        "weight": "19 lb",
        "species": "Dog",
        "food_form": "Dry Food",
        "flavor_contains": ["Chicken"],
        "min_approved_images": 1,
        "max_approved_images": 12,
        "forbidden_image_domains": ["unsplash.com"],
        "forbidden_image_path_hints": ["recycle", "transparency-map", "logo", "footer"]
      },
      "tags": ["dog", "dry-food", "open-farm", "shopify", "variant-page", "pet-food"]
    }
  ]
}
```

## Scoring

Each extraction produces an `ExtractionScore` with:

- **Field scores**: brand (0-1), name (0-1), description (0-1), flavor (0-1)
- **Boolean checks**: weight match, species match, food form match
- **Category sanity**: protein-only values (`Poultry`, `Chicken`, etc.) flagged as hard fails in pet-food context
- **Image quality**: approved count within bounds, duplicate ratio, forbidden domain check, forbidden path check
- **Dirty HTML**: `virtual_list`, `bottomSpacer`, `data-qa=`, `aria-setsize` markers rejected
- **Timing**: extraction duration in ms
- **Telemetry**: token usage when available

Weights:

| Component | Weight |
|-----------|--------|
| Success bonus | 10% |
| Brand score | 15% |
| Name score | 20% |
| Description score | 10% |
| Weight match | 10% |
| Species match | 10% |
| Food form match | 10% |
| Flavor score | 5% |
| Category sanity | 5% |
| Image count bounds | 5% |

Hard fails cap overall score at 0.49.

## Human-reviewed gold workflow

Existing AI-generated benchmark rows are candidate/audit data, not production truth. Human-approved rows live separately in `gold_dataset.json` and use explicit `field_assertions` for accept rows or `reject_assertions` for non-PDP/rejection rows.

Rules:

- `gold_dataset.json` contains only `verification_status: "gold"` rows.
- `gold_dataset.candidates.json` contains AI/tool-drafted rows awaiting review.
- Positive rows use `expected_outcome: "accept"` and must include required `brand` and `product_name` assertions with `evidence_snippet`.
- Negative rows use `expected_outcome: "reject"` and `reject_assertions`.
- Image exact counts should be hard gates only for frozen/snapshot evidence; live smoke should use ranges and warnings.

Validate the schema/gates with:

```bash
python3 -m pytest tests/unit/test_gold_dataset_schema.py tests/unit/test_gold_gates.py -q
```

## Adding legacy audit entries

1. Add a new entry to `dataset.json` with the product URL, UPC, expected values, and tags.
2. Run the benchmark: `python -m benchmarks.url_extraction.runner --dataset benchmarks/url_extraction/dataset.json`
3. Review the generated report.

## Strategy comparison mode

Future: add a `--strategy` flag to compare extraction strategies:

```bash
--strategy jsonld_meta
--strategy platform_parser
--strategy domain_css_schema
--strategy scoped_llm
--strategy raw_llm
```

## Related

- [Hardening plan](../../../docs/plans/serp-discovery-extraction-hardening-plan.md)
- [Implementation plan](../../../docs/plans/url-extraction-implementation-plan.md)
