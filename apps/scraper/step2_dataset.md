# Step 2: Live Smoke Dataset — Complete

**File created:** `benchmarks/ai_search/fixtures/live_smoke_dataset.json`

## Verification Results

| Property | Value |
|----------|-------|
| Total entries | 3 |
| SKUs | `072318200618` (FirstMate), `045663976866` (Four Paws), `032247886598` (Scotts) |
| Brands | FirstMate, Four Paws, Scotts |
| Categories | Cat Food Dry, Cat Litter Accessories, Garden > Mulch |
| Difficulty | All 3: easy |
| Source type | All 3: official |
| `search_fixtures` present | All 3: **False** (correctly stripped) |
| `ground_truth` present | All 3: **True** (preserved) |
| Schema version | `ai-search-e2e-benchmark-dataset-v1` |
| `load_dataset()` parses | ✅ Yes |

## What Was Done
- Read existing `e2e_dataset.json` (10 entries)
- Extracted 3 entries from different categories
- Removed `search_fixtures` arrays entirely from each entry
- Preserved all other fields including `ground_truth`
- Wrote to `benchmarks/ai_search/fixtures/live_smoke_dataset.json`
- Verified with `load_dataset()` and raw JSON inspection
