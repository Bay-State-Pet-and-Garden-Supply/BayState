Steps 2 and 4 are complete. Here's a summary of what was accomplished:

## Completed ✓

### Step 2: Live Smoke Dataset
- **Created:** `benchmarks/ai_search/fixtures/live_smoke_dataset.json`
- **3 entries:** FirstMate (072318200618), Four Paws (045663976866), Scotts (032247886598)
- **No `search_fixtures`** — forces real search API calls
- Same schema as `e2e_dataset.json`, all ground truth preserved

### Step 4: `--live-smoke` CLI Flag
- **Modified:** `cli/commands/ai_search_benchmark.py`
- Added `--live-smoke` flag that overrides:
  - `dataset` → `live_smoke_dataset.json`
  - `mode` → `"live"`
  - `max_concurrency` → `1`
- Checks `SERPER_API_KEY` — fails with clear error if missing
- Checks `OPENAI_API_KEY` or `GEMINI_API_KEY` — fails with clear error if both missing
- Existing commands unchanged

### Verification
```
$ python -m cli.main benchmark ai-search-e2e --help    # shows --live-smoke
$ python -m cli.main benchmark ai-search-e2e --live-smoke  # Error: SERPER_API_KEY...
$ # Fixture mode still works
```

### Remaining (Steps 1, 3, 5)
- Step 3: Create `tests/integration/test_ai_search_e2e_live.py` with `@pytest.mark.live` gated test
- Step 5: Update README with live mode docs, env vars table, CI policy
- Step 1: Add CI Policy section to README (can merge with Step 5)