# Legacy Benchmarks

This directory contains the **deprecated** legacy benchmark suite for crawl4ai vs legacy scraper comparison.

## Status

**DEPRECATED** — These benchmarks use fixtures and fake URLs. They are retained for reference only and will be removed in a future release.

## Replacement

Use the **unified benchmark suite** at `tests/benchmarks/unified/` for all new benchmark work. The unified suite provides:

- Real URL validation and testing
- Multi-mode extraction benchmarks (LLM-free, LLM, auto)
- Better result aggregation and reporting
- Proper integration with the crawl4ai engine

## Files

| File | Description |
|------|-------------|
| `benchmark_runner.py` | Main benchmark runner (deprecated) |
| `test_benchmark_crawl4ai.py` | Pytest benchmark tests (deprecated) |
| `utils.py` | Timer and MemoryProfiler utilities (deprecated) |
| `conftest.py` | Pytest fixtures (deprecated) |

## Running

```bash
# Legacy benchmarks (deprecated)
pytest tests/benchmarks/legacy/ -v -m benchmark

# Unified benchmarks (recommended)
pytest tests/benchmarks/unified/ -v
```

## Migration Guide

- `Timer` → `tests.benchmarks.unified.base.Timer` (same interface)
- `MemoryProfiler` → `tests.benchmarks.unified.base.MemoryProfiler` (same interface)
- `BenchmarkRunner` → `tests.benchmarks.unified.base.BenchmarkSuite` (new interface)
- `BenchmarkConfig` → `tests.benchmarks.unified.base.BenchmarkConfig` (new fields)