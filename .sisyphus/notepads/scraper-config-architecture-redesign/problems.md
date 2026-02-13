# Problems - Scraper Config Architecture Redesign

## [2026-01-22] Session Start

### Unresolved Questions

1. **Dual Config Representations**
   - Question: Should we deprecate `BayStateScraper/core/api_client.py` minimal `ScraperConfig` dataclass?
   - Options:
     a) Deprecate it entirely
     b) Rename it to clarify purpose
     c) Keep as separate DTO for job responses
   - Status: Pending Task 7 investigation

2. **Exact DB Schema**
   - Question: What are the current table/column names for configs?
   - Status: Pending Task 1 discovery

3. **Admin UI Entry Points**
   - Question: Where are the current Admin Panel config editing pages?
   - Status: Pending Task 1 discovery

4. **Runner Config Fetch Path**
   - Question: Which API client does the runner actually use?
   - Options: `BayStateScraper/core/api_client.py` vs `BayStateScraper/scraper_backend/core/api_client.py`
   - Status: Pending Task 2 discovery

---

## To Be Populated During Execution

_Track technical debt and open questions_
