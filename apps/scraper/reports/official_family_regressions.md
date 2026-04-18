# AI Search Benchmark Report

## Execution Metadata

- Generated: 2026-04-18T17:49:45.827902+00:00
- Dataset: `data\golden_dataset_official_family_regressions.json`
- Mode: `heuristic`
- Duration: 50.615 ms
- Cache Dir: `C:\Users\thoma\OneDrive\Desktop\scripts\BayState\apps\scraper\data\benchmark_cache`
- LLM Config: `openai/gpt-4o-mini`

## Summary Metrics

| Metric | Value |
| --- | --- |
| Total Examples | 3 |
| Matched Examples | 3 |
| Accuracy (Exact Match %) | 100.000 |
| Mean Reciprocal Rank | 1.000000 |
| Precision@1 | 1.000000 |
| Recall@1 | 1.000000 |
| Accuracy 95% CI | 100.000% - 100.000% |
| Average Duration (ms) | 16.872 |
| Error Count | 0 |


- Total Serper Cost: $0.000000
- Total LLM Selection Cost: $0.000000
- Total Cost: $0.000000
- Cost per Success: $0.000000
- Serper API Calls: 0

## Category Breakdown

| Group | Samples | Accuracy % | MRR | Precision@1 | Recall@1 | Avg Time (ms) | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Mulch | 3 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 15.354 | 0 |

## Category Analysis

- Underperforming threshold: < 70.000% exact-match accuracy
- Underperforming categories: None

| Category | Samples | Accuracy % | Status | Trend vs Baseline | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Mulch | 3 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Mulch and reuse its strongest source signals in adjac… |

## Category Comparison Visualization

```text
Status Category          Accuracy Bar            Accuracy Trend
------ ---------------- -------------------- -------- ----------------
✅ Mulch            ████████████████████  100.0% (3/3) No baseline
```

## Difficulty Breakdown

| Group | Samples | Accuracy % | MRR | Precision@1 | Recall@1 | Avg Time (ms) | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| hard | 1 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 7.491 | 0 |
| medium | 2 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 19.285 | 0 |

## Per-Example Results

| # | Query | Expected | Actual | Score | Rank | Time (ms) | Match |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 032247884594 Scotts NatureScapes Color Enhanced… | https://scottsmiraclegro.com/en-us/brands/scotts/produc… | https://scottsmiraclegro.com/en-us/brands/scotts/produc… | 20.000 | 1 | 28.561 | ✅ |
| 1 | 032247884594 Scotts Miracle-Gro NatureScapes Si… | https://scottsmiraclegro.com/en-us/brands/scotts/produc… | https://scottsmiraclegro.com/en-us/brands/scotts/produc… | 22.000 | 1 | 10.009 | ✅ |
| 2 | 032247884594 Scotts Nature Scapes Sierra Red 1.… | https://scottsmiraclegro.com/en-us/brands/scotts/produc… | https://scottsmiraclegro.com/en-us/brands/scotts/produc… | 20.000 | 1 | 7.491 | ✅ |
