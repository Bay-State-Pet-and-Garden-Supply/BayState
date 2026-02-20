# Task 1.3: Add Discovery cost caps and validation

## Context
Add cost cap functionality to prevent runaway API spending on Discovery jobs. This extends the work done in Task 1.1.

## Implementation Notes
- File: `BayStateApp/lib/pipeline-scraping.ts`
- Add `maxDiscoveryCostUsd?: number` to ScrapeOptions interface
- Validate: must be ≤ 10.00 (maximum allowed)
- Default: 5.00 USD when not specified
- Store in job config for runner to read
- Reject job creation if cost cap > 10.00

## References
- Task 1.1 already modified this file - build on that work
- Runner-side cost tracking exists in `BayStateScraper/scrapers/ai_cost_tracker.py`

## Acceptance Criteria
- [ ] maxDiscoveryCostUsd validated at job creation (reject if > 10.00)
- [ ] Stored in job config column
- [ ] Default value 5.00 USD applied when not specified

## QA Notes
- Test with scrapeProducts() call with cost cap > 10.00 - should reject
- Test without cost cap - should use default 5.00
- Test with valid cost cap - should accept and store in config
