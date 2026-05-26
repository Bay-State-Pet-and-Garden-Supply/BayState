# Product Page Extraction Sandbox

Fully isolated local sandbox for evaluating official product-page discovery/extraction with Crawl4AI, LM Studio/Gemma, and agent-browser.

## Boundaries

This sandbox must not integrate with production code yet:

- no `apps/web` changes
- no scraper daemon/runner changes
- no Supabase access
- no coordinator callbacks
- no production YAML publication
- no real `SCRAPER_API_URL` / `SCRAPER_API_KEY` usage
- no root `package.json` or Turbo wiring

Generated evidence belongs under gitignored `outputs/` or `agent-browser-runs/`.

## Setup

```bash
cd sandbox/product-page-extraction
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
cp .env.example .env
python scripts/validate_env.py
```

If using `uv`:

```bash
uv venv sandbox/product-page-extraction/.venv --python 3.12
source sandbox/product-page-extraction/.venv/bin/activate
uv pip install -r sandbox/product-page-extraction/requirements.txt
python -m playwright install chromium
```

## LM Studio / Gemma

1. Start LM Studio.
2. Load Gemma.
3. Developer tab → Start Server.
4. Inspect model ids:

```bash
curl http://localhost:1234/v1/models
```

5. Set `LMSTUDIO_MODEL` in `.env`.

Default LLM mode is off. Enable with:

```bash
C4AI_LLM_MODE=auto python scripts/validate_env.py --check-lmstudio
```

## Known URL extraction

```bash
python scripts/extract_product_page.py \
  --url https://frommfamily.com/ \
  --brand Fromm \
  --name "Fromm demo product" \
  --upc 072705113446
```

Output:

```text
outputs/<run-id>/packet.json
outputs/<run-id>/packet.md
outputs/<run-id>/page.md
outputs/<run-id>/jsonld.json
```

## Sitemap discovery

```bash
python scripts/discover_from_sitemap.py \
  --site-config configs/site.sample.yaml \
  --site-key fromm-example \
  --brand Fromm \
  --name "Duck Liver 12 oz" \
  --upc 072705113446
```

## One-product orchestration

Known URL:

```bash
python scripts/run_packet.py \
  --url https://frommfamily.com/ \
  --brand Fromm \
  --name "Fromm demo product" \
  --upc 072705113446 \
  --llm off
```

Discovery mode:

```bash
python scripts/run_packet.py \
  --site-config configs/site.sample.yaml \
  --site-key fromm-example \
  --brand Fromm \
  --name "Duck Liver 12 oz" \
  --upc 072705113446
```

## Fixture runner

```bash
python scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --dry-run
python scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --fixture-id fromm-homepage-smoke --no-llm
```

## agent-browser fallback

```bash
bash scripts/agent_browser_capture.sh "https://frommfamily.com/" fromm-smoke agent-browser-runs
```

Compare a packet and rendered capture:

```bash
python scripts/compare_results.py \
  --packet outputs/<run-id>/packet.json \
  --agent-browser agent-browser-runs/<run-id>/dom-extract.json \
  --out outputs/<run-id>/comparison.json
```

## Benchmark Round 2

Validate the benchmark fixtures:

```bash
python scripts/run_fixture.py --fixture fixtures/products.round2.jsonl --dry-run
```

Run a fixture with LLM and agent-browser fallback:

```bash
python scripts/run_fixture.py --fixture fixtures/products.round2.jsonl --fixture-id r2-spa-collection-03 --agent-browser-fallback
```

Run the full benchmark (15+ fixtures, may take 30+ minutes):

```bash
python scripts/run_fixture.py --fixture fixtures/products.round2.jsonl --agent-browser-fallback
```

## Rendered Image Pass

Crawl4AI now includes a rendered DOM media pass (scroll + image extraction from rendered HTML).
Disable with `--no-rendered` if you want to compare with the default behavior.

Raw image volume is diagnostic only. The product field `images` is strict: it contains only selected images for the desired product's carousel/gallery/card. All page images are preserved under `extraction.media.all_page_images`; selected product images are under `extraction.media.selected_product_images`; rejected noise is under `extraction.media.rejected_images`.

## Page Classification

Pages are classified as `pdp`, `collection`, `category`, `brand_home`, `blog_support`, or `unknown`.
`accept` requires `page_type == "pdp"` plus strong product evidence.

## Per-Field Scoring

Packet `validation.field_scores` scores each field independently:
name, brand, species, size, upc, description, ingredients, images, page_type.
Fixture summary includes field scores and aggregate statistics. Image scoring reports expected carousel images, selected images, true/false positives/negatives, precision, recall, and pass/fail.

## Validation

```bash
python -m compileall scripts
python scripts/validate_env.py
python scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --dry-run
python scripts/run_fixture.py --fixture fixtures/products.round2.jsonl --dry-run
python scripts/run_packet.py --site-config configs/site.sample.yaml --site-key fromm-example --brand Fromm --name "Duck Liver 12 oz" --upc 072705113446 --dry-run
python scripts/validate_packet.py outputs/<run-id>/packet.json
```

## Promotion rule

Before anything moves into the real app, ask oracle to review the evidence. The expected production direction remains pipeline-native: `products_ingestion` + approved-source official resolver + existing review UI.
