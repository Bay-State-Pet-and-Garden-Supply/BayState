# Scraper Core AGENTS.md Fix

**File:** `apps/scraper/core/AGENTS.md`

**Issue:** Duplicated RELATED section — two identical blocks listing Parent, Runner, Scrapers references.

**Fix:** Removed the second duplicate block (3 entries: Parent, Runner, Scrapers), keeping the canonical first block (4 entries: Parent, Runner, Scrapers, crawl4ai).

**Validation:** `grep -A 6 "## RELATED"` now shows only a single RELATED section with 4 unique entries.
