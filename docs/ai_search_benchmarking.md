# AI Search Benchmarking System

## Overview
The AI Search Benchmarking System is a zero-cost, statistically rigorous framework for evaluating and fine-tuning the product search and prompt extraction processes in Bay State Pet & Garden Supply's pipeline.

By testing against a cached Golden Dataset, we can rapidly iterate on finding better domains and prompts without incurring Serper API costs.

## Components
- **Golden Dataset**: `data/golden_dataset_v1.json` - 50 hand-verified product source URLs.
- **Fixture Search Client**: Cache-based zero-cost serper substitute.
- **A/B Test CLI**: `scripts/ab_test_prompts.py` to compare different run strategies side by side.
- **Comparison Engine**: `scripts/compare_benchmarks.py` using paired t-tests for statistical significance (p < 0.05).
- **Automated CI Workflow**: `.github/workflows/ai-search-benchmark.yml` running tests automatically on PRs.

## Usage Examples and Tutorials

### 1. Generating Baseline Benchmark
Run a baseline test against the golden dataset using the heuristic mode:

```bash
cd apps/scraper
python scripts/benchmark_ai_search.py \
    --dataset data/golden_dataset_v1.json \
    --output reports/baseline.json \
    --mode heuristic
```

### 2. Running an A/B Strategy Comparison
Create a JSON or YAML config for "Strategy B" (e.g. `configs/llm_strategy.yml`) with a different prompt, model, or scraper parameter. Then run the comparison:

```bash
python scripts/ab_test_prompts.py \
    --dataset data/golden_dataset_v1.json \
    --strategy-a file:reports/baseline.json \
    --strategy-b file:configs/llm_strategy.yml \
    --output reports/ab_comparison.json
```

### 3. Reviewing Benchmark Regressions
You can review the benchmark output, specifically the `differing_examples` block, to understand where Strategy B succeeded while Strategy A failed (or vice-versa). 

```json
{
  "recommendation": {
    "choice": "B",
    "reasons": [
      "B is significantly better than A (p=0.015).",
      "Win rate: A=80%, B=92%"
    ]
  }
}
```

## Troubleshooting Guide

### Issue: "ValueError: Missing cache data for normalized query hash '...'"
* **Cause**: You are using `FixtureSearchClient` for a new query that is not cached.
* **Resolution**: The benchmark dataset ensures cache hits. If you changed the golden dataset configuration or added new products, you need to first use the real Serper client to fetch the new results and save them to `.cache/ai_search/`.

### Issue: GitHub Action PR Benchmark is failing on regressions
* **Cause**: The PR head significantly lowered the benchmarking score against the base branch (p < 0.05 on the paired t-test).
* **Resolution**: Re-tune your Search Prompts or Scraped Extractors. Check the `comparison.md` comment on the PR to see the regressed examples and correct the model output.

### Issue: Execution seems hung inside "scripts/benchmark_ai_search.py"
* **Cause**: The scraper engine's asynchronous workers might be deadlocking on heavily rate-limited mock APIs or you are hitting the local resource limits.
* **Resolution**: Lower `--concurrency` flag on the script to 1 or 2, and turn on `--verbose` logging to see where it gets stuck.
