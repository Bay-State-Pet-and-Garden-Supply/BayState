# Research Agent SERP Strategy Eval

Fixture-backed evaluation for the research-agent's staged Serper discovery flow.

## What it measures

Each entry compares the current implementation against curated truth for:

1. **Query shape** — first query must be SKU-only, second query must be `site:<officialDomain> <predictedName>`.
2. **Predicted name** — the name inferred from the SKU SERP must match the curated expected product name.
3. **Official product URL** — the top ranked official-domain candidate must match the curated expected PDP URL.

## Dataset fields

Each dataset entry includes:

- `upc`
- `registerName`
- `brand`
- `officialDomain`
- `expectedPredictedName`
- `expectedProductUrl`
- `searchFixtures[]` — deterministic Serper responses keyed by query

## Run

```bash
cd apps/research-agent
bun run serper-eval
```

Or with an explicit dataset/output path:

```bash
cd apps/research-agent
bun run serper-eval \
  --dataset benchmarks/serper-strategy/fixtures/smoke-dataset.json \
  --output-dir artifacts/evals/serper-strategy/latest
```

## Output

The runner writes:

- `serper-strategy-eval.json`
- `serper-strategy-eval.md`

under the chosen output directory.
