# Progress

## Status
In Progress

## Tasks

- [x] Fix `amazon.py`: return `build_no_match_result` when product genuinely not on Amazon (worker 2)
- [ ] Fix `executor.py`: ignore Amazon errors in SERP cascade check
- [ ] Review both fixes

## Files Changed

- `apps/scraper/scrapers/approved_sources/adapters/amazon.py` — When `found_no_results` is true (genuine no-match, not bot block), return `build_no_match_result` instead of `None`.

## Notes
