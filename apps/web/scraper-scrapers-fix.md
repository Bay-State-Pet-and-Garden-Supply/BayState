# Scraper Scrapers AGENTS.md — Fix Report

**Worker:** scraper-scrapers-fix  
**Time:** 2026-05-10  
**File:** `apps/scraper/scrapers/AGENTS.md`

## Changes Applied

### 1. Handler count
- **Before:** `27 action handlers (async)` in structure header
- **After:** `24 handler files (38 registered actions)`
- **Note:** 25 `.py` files in `actions/handlers/` minus `__init__.py` = 24 handlers; `grep @ActionRegistry.register` returns 38 registrations

### 2. Structure tree — removed phantom `events/` dir
- **Before:** `├── events/                # EventEmitter, WebSocket`
- **After:** Removed. `scrapers/events/` does not exist on disk. EventEmitter lives in `core/events.py`.

### 3. Structure tree — added 8 missing entries
- `ai_search/` — AI search integration
- `cohort/` — Cohort processing
- `product_url_extraction/` — URL extraction
- `providers/` — Provider implementations
- `config_validation.py` — Config validation
- `pricing_loader.py` — Dynamic pricing loader
- `result_collector.py` — Result collection
- `sku_loader.py` — SKU loader

All verified present on disk before writing.

### 4. RELATED section — fixed events reference
- **Before:** `Events: ./events/AGENTS.md` (phantom path)
- **After:** `Events (EventEmitter): ../core/events.py → ../core/AGENTS.md`

## Verification
- Count grep: 38 registrations across 24 handler files ✓
- All 8 added entries verified on disk ✓
- `scrapers/events/` confirmed absent ✓
- `core/events.py` confirmed present ✓
