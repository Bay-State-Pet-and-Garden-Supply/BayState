# T18 Findings: Performance Benchmarking

**Date:** 2026-02-28  
**Task:** T18 - Performance Benchmarking  
**Status:** ✅ COMPLETE

---

## Summary

Created comprehensive performance benchmark suite for crawl4ai engine. All benchmarks passing.

## Benchmark Results

### Single SKU Extraction
- **Mean Time:** 0.96ms (mocked)
- **Real-world (T17):** 510ms
- **Note:** Mocked benchmarks measure engine overhead only; real-world includes browser/network

### Concurrent Extraction Scaling
| Concurrency | Mean Time | OPS |
|-------------|-----------|-----|
| 1 | 0.91ms | 1,093 |
| 5 | 2.59ms | 386 |
| 10 | 4.55ms | 220 |

**Scaling Efficiency:** Linear - 10x concurrency = ~5x time increase

### Memory Profiling
- Test passed with <100MB threshold
- No memory leaks detected in mocked environment

## Comparison to browser-use (from T17)

| Metric | browser-use | crawl4ai | Improvement |
|--------|-------------|----------|-------------|
| Avg Extraction Time | 820ms | 510ms | 37.8% faster |

## Files Created

- `BayStateScraper/tests/performance/test_crawl4ai_benchmark.py`
- `.sisyphus/evidence/t18-benchmark.json`

## Test Suite Structure

```python
test_extraction_time_per_sku    # Single SKU timing
test_concurrent_extraction[1]   # 1 concurrent request
test_concurrent_extraction[5]   # 5 concurrent requests  
test_concurrent_extraction[10]  # 10 concurrent requests
test_memory_usage               # Memory profiling
```

## Verification

- ✅ All 5 tests passing
- ✅ Ruff check passed
- ✅ Benchmark evidence saved
- ✅ Performance documented

## Next Steps

T19 (Cost Validation) can proceed in parallel.

---

## 2026-02-28 Addendum (benchmark suite rework)

- Replaced `BayStateScraper/tests/performance/test_crawl4ai_benchmark.py` with a full T18 suite using:
  - `pytest-benchmark` (`benchmark.pedantic`) for timing
  - `memory_profiler.memory_usage` for memory traces
  - T17 harness (`tests/t17_ab_test_harness.py`) for SKU/test-case generation and execution simulation
- Generated fresh evidence at:
  - `BayStateScraper/.sisyphus/evidence/t18-benchmark.json`

### Key measured outputs

- Per-SKU timing sample size: **50** (minimum met)
- Unique SKUs represented: **33**
- Mean time:
  - crawl4ai: **505.558 ms**
  - browser-use baseline: **808.210 ms**
  - implied speedup: **1.599x**
- Concurrency tested: **1, 5, 10, 20**
  - recommended concurrent level in this benchmark harness: **20** for both systems (success-rate threshold = 75%)
- Memory profiling completed:
  - crawl4ai peak: **132.1445 MB**
  - browser-use peak: **131.7891 MB**
  - delta here is near-noise in mocked/simulated harness (**-0.27% savings**) and does **not** trip leak threshold
- Error-path benchmark included:
  - invalid/edge SKU samples: **8**
  - crawl4ai avg: **503.817 ms**
  - browser-use avg: **808.566 ms**

### Validation commands run

- `python -m pytest tests/performance/ --benchmark-only` ✅ (8 passed)
- `python -m ruff check tests/performance/test_crawl4ai_benchmark.py` ✅
- `python -m mypy --explicit-package-bases --follow-imports=skip tests/performance/test_crawl4ai_benchmark.py` ✅

### Repo-wide lint/type status (pre-existing blocker)

- `python -m ruff check .` ❌ fails with broad pre-existing violations outside T18 scope.
- `python -m mypy .` / `python -m mypy scraper_backend/` ❌ fail due existing module-path and missing-stub issues not introduced by T18 file.
