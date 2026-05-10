# Scraper Root AGENTS.md — Fix Report

## Changes Made

### Disk Cleanup
- **Deleted** `apps/scraper/actions/` — stale empty directory (only `__pycache__` and empty `handlers/`). Real handlers live at `scrapers/actions/handlers/`.
- **Deleted** `apps/scraper/engine/` — stale empty directory (only `__pycache__`).

### Structure Tree Updates (apps/scraper/AGENTS.md)

**Added under `scrapers/`:**
| Entry | Description |
|-------|-------------|
| `cohort/` | Cohort processing |
| `product_url_extraction/` | URL extraction |
| `config_validation.py` | Config validation |
| `pricing_loader.py` | Dynamic pricing loader |
| `result_collector.py` | Result collection |
| `sku_loader.py` | SKU loader |

**Added root-level entries:**
| Entry | Description |
|-------|-------------|
| `validation/` | Validation utilities |
| `reports/` | Performance/test reports |
| `data/` | Test fixtures, sample data |
| `prompts/` | AI prompts |

**Items already present in tree (no change needed):** `ai_search/`, `configs/`, `executor/`, `models/`, `parser/`, `providers/`, `tests/`, `utils/`, `runtime.py` (under scrapers); `api/`, `core/`, `tests/`, `utils/`, `config/`, `runner/`, `cli/`, `scripts/`, `tools/`, `benchmarks/`, `docs/`, `daemon.py`, `runner.py`, config files (root).

### Items Verified Correct (no change needed)
- Action handler count (24) — matches actual file count
- Architecture description — coordinator-runner pattern accurate
- Test mode documentation — matches actual runner behavior
- CLI commands — `python runner.py --local` canonical path, descriptions match code
- Anti-patterns — all 10 anti-patterns match current conventions
- Subproject references — all 4 AGENTS.md cross-references are valid

## Validation
- Empty directories confirmed deleted on disk
- Structure tree entries verified against actual filesystem
- All prose sections outside structure tree left untouched (verified accurate)
