# Research Agent Extraction Quality Eval

Fixture-backed benchmark for the research-agent extraction stage.

## What it measures

Each entry runs the same extraction stack used by the local pipeline:

- `JsonLdExtractor`
- `MetaExtractor`
- `TextHeuristicExtractor`
- `ProductDomExtractor`
- merged via `CompositeProductFactExtractor`

The benchmark compares the merged extracted facts against curated expectations for:

- title
- description phrases
- categories
- required images
- forbidden images
- image count bounds
- required attributes
- confidence floor

## Run

```bash
cd apps/research-agent
bun run extraction-eval
```

Or with explicit paths:

```bash
cd apps/research-agent
bun run extraction-eval \
  --dataset benchmarks/extraction-quality/fixtures/smoke-dataset.json \
  --output-dir artifacts/evals/extraction-quality/latest
```

## Output

The runner writes:

- `extraction-quality-eval.json`
- `extraction-quality-eval.md`

under the chosen output directory.
