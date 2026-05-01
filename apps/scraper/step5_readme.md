# Step 5: Update README — Complete

## Changes Made

**File:** `benchmarks/ai_search/README.md`

### 1. CI Policy subsection
- Inserted after the pipeline description (section "7. Data Quality"), before "## Prerequisites"
- Documents that fixture mode is the authoritative CI gate
- States that live-mode tests are excluded via `pytest.ini` and never run in CI
- Notes that live-mode runs require API keys and are manual-only

### 2. Live Smoke Mode subsection
- Inserted under "## Run" after the existing "### Live Mode" block, before "### With Threshold Gates"
- Documents requirements (`SERPER_API_KEY`, `OPENAI_API_KEY`/`GEMINI_API_KEY`)
- Shows the `--live-smoke` CLI command
- States estimated cost (~$0.01–0.05 per run)
- Documents expected behavior (varying results, no pass thresholds)
- Lists when to run and why not in CI

### 3. Environment Variables section
- Inserted before "## Key Metrics"
- Table with `SERPER_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`
- Explicit warning to never commit API keys

## Acceptance Criteria Verified

| Criterion | Status |
|-----------|--------|
| README documents fixture mode as CI baseline | ✅ CI Policy subsection |
| README documents how to run live smoke mode | ✅ Live Smoke Mode subsection |
| README documents required env vars | ✅ Environment Variables table |
| README documents expected costs and instability | ✅ Estimated cost + expected behavior notes |
| No API keys in the README | ✅ Verified — only env var names |
| All existing content preserved | ✅ Verified by reading full file |
| All tests pass | ✅ 48/48 passing |

## Verification

```bash
python -m pytest tests/unit/test_ai_search_e2e_dataset.py tests/unit/test_ai_search_e2e_metrics.py tests/unit/test_ai_search_e2e_runner.py tests/unit/test_ai_search_e2e_report.py tests/cli/test_ai_search_e2e_benchmark_command.py -v --tb=short
```

Result: 48 passed in 0.75s
