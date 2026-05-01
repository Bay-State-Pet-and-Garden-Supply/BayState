# Implementation Plan: Gated Live-Mode Smoke Test for AI Search E2E Benchmark

## Goal
Add a small, explicitly-gated live-mode smoke test profile to the AI Search E2E benchmark. This provides observability into real-world API/network behavior without becoming a CI gate. Fixture mode remains the authoritative correctness baseline.

---

## Step 1: Formalize Fixture Mode as the CI Baseline

### 1.1 Verify pytest.ini already excludes live tests
**File:** `pytest.ini`
**Current state:**
```ini
[pytest]
addopts = --verbose -m "not live"
markers =
    live: marks tests that require live external APIs (search, LLM, etc.)
```
**Action:** Confirm `-m "not live"` is present. No change needed if already there.
**Acceptance:** `python -m pytest --collect-only` does not collect `@pytest.mark.live` tests by default.

### 1.2 Add CI documentation to README
**File:** `benchmarks/ai_search/README.md`
**Changes:** Insert a new "CI Policy" subsection under "Run":
```markdown
### CI Policy

Fixture mode is the **authoritative correctness gate** for CI.

- All PRs must pass the fixture-mode benchmark.
- Live-mode tests are **never** run in CI by default.
- Live-mode tests are marked `@pytest.mark.live` and excluded via `pytest.ini`.
```
**Acceptance:** A new developer reading the README understands fixture mode is the CI baseline.

---

## Step 2: Create a Live Smoke Dataset

### 2.1 Create `live_smoke_dataset.json`
**File:** `benchmarks/ai_search/fixtures/live_smoke_dataset.json` (new)

**Content:** Extract 3 entries from the existing `e2e_dataset.json` that cover different scenarios:

| SKU | Brand | Source Type | Difficulty | Why Included |
|-----|-------|-------------|------------|--------------|
| `072318200618` | FirstMate | official | easy | Well-known brand, likely stable URL |
| `045663976866` | Four Paws | official | easy | Different category (cat litter vs cat food) |
| `032247886598` | Scotts | official | easy | Garden category, different domain pattern |

**Schema:** Same as `e2e_dataset.json` (`ai-search-e2e-benchmark-dataset-v1`) but **omit `search_fixtures`** — live mode must hit real search APIs.

**Required fields per entry:**
- `sku`
- `product_name`
- `brand`
- `expected_official_domains`
- `expected_source_url`
- `source_type`
- `ground_truth` (keep for quality scoring)

**Action:** Copy 3 entries from `e2e_dataset.json`, strip `search_fixtures` arrays, write to new file.
**Acceptance:** `load_dataset(Path("fixtures/live_smoke_dataset.json"))` returns 3 entries with `search_fixtures=None`.

---

## Step 3: Add the Gated Live Smoke Test

### 3.1 Create `tests/integration/test_ai_search_e2e_live.py`
**File:** `tests/integration/test_ai_search_e2e_live.py` (new)

**Requirements:**
- Marked with `@pytest.mark.live`
- Skips unless `SERPER_API_KEY` env var is present
- Warns (but does not skip) if no LLM API key is present
- Runs benchmark in `--mode live` with `--max-concurrency 1`
- Uses `live_smoke_dataset.json`
- Does NOT assert hard thresholds
- Validates pipeline runs and produces report artifacts

**Pseudocode:**
```python
import os
from pathlib import Path
import pytest
from benchmarks.ai_search.runner import run_ai_search_e2e_benchmark

pytestmark = pytest.mark.live

@pytest.mark.asyncio
async def test_live_smoke_runs_and_produces_report(tmp_path: Path) -> None:
    serper_key = os.getenv("SERPER_API_KEY")
    if not serper_key:
        pytest.skip("SERPER_API_KEY not set — live search unavailable")

    openai_key = os.getenv("OPENAI_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not openai_key and not gemini_key:
        pytest.skip("No LLM API key (OPENAI_API_KEY or GEMINI_API_KEY) — extraction unavailable")

    dataset = Path("benchmarks/ai_search/fixtures/live_smoke_dataset.json")
    output_dir = tmp_path / "reports"

    report, json_path, md_path, _passed = await run_ai_search_e2e_benchmark(
        dataset_path=dataset,
        output_dir=output_dir,
        mode="live",
        page_fixtures_dir=None,  # force live crawl
        headless=True,
        max_concurrency=1,
        fail_under_end_to_end_rate=None,  # no threshold gate
        data_quality_threshold=0.0,  # don't fail on quality
    )

    assert json_path.exists()
    assert md_path.exists()
    assert report["benchmark_type"] == "ai_search_end_to_end"
    assert report["mode"] == "live"
    assert report["summary"]["total_entries"] == 3

    # Log results for human review (structured logging per AGENTS.md)
    import logging
    logger = logging.getLogger(__name__)
    summary = report["summary"]
    logger.info(
        "Live smoke complete: e2e=%.0f%%, domain=%.0f%%, extract=%.0f%%, crawl=%.0f%%",
        summary["end_to_end_success_rate"] * 100,
        summary["domain_match_rate"] * 100,
        summary["extraction_success_rate"] * 100,
        summary["crawl_success_rate"] * 100,
    )
```

**Acceptance:**
- Test is skipped when `SERPER_API_KEY` is absent
- Test runs and produces JSON + Markdown reports when env vars are present
- No hard assertions on success rates

### 3.2 Verify pytest exclusion works
**Action:** Run `python -m pytest tests/integration/test_ai_search_e2e_live.py --collect-only`
**Acceptance:** Test is collected but skipped (or not collected if `-m "not live"` is active).

---

## Step 4: Add CLI Support for Manual Live Runs

### 4.1 Add `--live-smoke` flag to benchmark CLI
**File:** `cli/commands/ai_search_benchmark.py`

**Changes:** Add an option:
```python
@click.option(
    "--live-smoke",
    is_flag=True,
    default=False,
    help="Run a small 3-SKU live smoke test (requires SERPER_API_KEY env var).",
)
```

When `--live-smoke` is passed:
- Override `--dataset` to `benchmarks/ai_search/fixtures/live_smoke_dataset.json`
- Override `--mode` to `"live"`
- Override `--max-concurrency` to `1`
- Check `SERPER_API_KEY` env var; abort with clear error if missing
- Check `OPENAI_API_KEY` or `GEMINI_API_KEY`; warn if missing but continue

**Acceptance:**
```bash
python -m cli.main benchmark ai-search-e2e --live-smoke
# Without SERPER_API_KEY:
# Error: SERPER_API_KEY environment variable is required for live mode.
```

### 4.2 Alternatively: create a standalone script
If modifying the CLI feels too complex, create:
**File:** `scripts/run_live_smoke.py` (new)

```python
#!/usr/bin/env python3
"""Manual live smoke test runner. Not for CI."""
import asyncio
import os
import sys
from pathlib import Path
from benchmarks.ai_search.runner import run_ai_search_e2e_benchmark

async def main():
    if not os.getenv("SERPER_API_KEY"):
        print("Error: SERPER_API_KEY environment variable is required.", file=sys.stderr)
        sys.exit(1)
    # ... run benchmark

if __name__ == "__main__":
    asyncio.run(main())
```

**Decision point:** Prefer CLI flag (4.1) for consistency with existing `bsr benchmark` workflow. Fall back to script (4.2) if CLI changes are too invasive.

---

## Step 5: Document Live Mode

### 5.1 Update README with live mode section
**File:** `benchmarks/ai_search/README.md`

**Changes:** Add after "Fixture Mode" section:

```markdown
### Live Smoke Mode (Real APIs — Manual Only)

Runs the benchmark against **live search APIs and real product pages**.
This is for observability only — not for CI gates.

**Requirements:**
- `SERPER_API_KEY` environment variable (search provider)
- `OPENAI_API_KEY` or `GEMINI_API_KEY` (LLM extraction)

**Run the 3-SKU smoke profile:**
```bash
export SERPER_API_KEY="your_key"
export OPENAI_API_KEY="your_key"
python -m cli.main benchmark ai-search-e2e --live-smoke
```

**Estimated cost per run:** ~$0.01–0.05 (3 search queries + up to 3 LLM extractions).

**Expected behavior:**
- Results will vary between runs (search rankings change, pages change)
- Some SKUs may fail due to bot protection or page changes
- The benchmark logs results but does not enforce pass thresholds
- Review the Markdown report to see real-world pipeline behavior

**When to run:**
- After changing search query construction
- After changing extraction prompts
- Before/after deployments to validate real-world behavior
- Weekly sanity check

**Why not in CI:**
- Nondeterministic (search rankings drift)
- Costs real money
- External API dependencies (rate limits, downtime)
- Flaky failures that block unrelated PRs
```

### 5.2 Add env var documentation
**File:** `benchmarks/ai_search/README.md`

Add an "Environment Variables" subsection:
```markdown
## Environment Variables

| Variable | Required For | Description |
|----------|--------------|-------------|
| `SERPER_API_KEY` | Live mode | Serper search API key |
| `OPENAI_API_KEY` | Live mode (optional) | OpenAI API key for LLM extraction |
| `GEMINI_API_KEY` | Live mode (optional) | Gemini API key for LLM extraction fallback |

Never commit API keys. Use `.env` files or shell exports locally.
```

---

## Files to Modify / Create

| File | Action | Purpose |
|------|--------|---------|
| `benchmarks/ai_search/fixtures/live_smoke_dataset.json` | **Create** | 3-entry dataset without search fixtures |
| `tests/integration/test_ai_search_e2e_live.py` | **Create** | Gated live smoke test |
| `cli/commands/ai_search_benchmark.py` | **Modify** | Add `--live-smoke` flag |
| `benchmarks/ai_search/README.md` | **Modify** | CI policy, live mode docs, env vars |
| `pytest.ini` | **Verify only** | Confirm `-m "not live"` is present |

---

## Dependencies

- Step 2 (dataset) must complete before Step 3 (test uses the dataset)
- Step 3 and Step 4 are independent
- Step 5 (docs) depends on Steps 2–4 being finalized

---

## Risks

| Risk | Mitigation |
|------|------------|
| Live test accidentally runs in CI | `pytest.ini` already excludes `@pytest.mark.live`; verify in CI config |
| API key leaked in test output | Never print keys; use env vars only; no key in error messages |
| Live test is too expensive | Cap at 3 SKUs, concurrency=1, no retries |
| Live test is too flaky to be useful | No threshold assertions; purely observational logging |
| LLM key missing but search works | Warn and skip extraction, or skip entire test |

---

## Acceptance Criteria (Overall)

1. `python -m pytest` (default) does NOT run live tests
2. `python -m pytest -m live` runs live tests when `SERPER_API_KEY` is set
3. `python -m pytest -m live` skips when `SERPER_API_KEY` is absent
4. `python -m cli.main benchmark ai-search-e2e --live-smoke` runs 3 SKUs in live mode
5. Live smoke produces JSON + Markdown reports
6. README documents: CI policy, live mode requirements, expected costs, env vars
7. No API keys committed to the repo
