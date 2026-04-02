
## Two-Step Search Refinement Documentation

### Date: 2026-03-30

### What Was Created
Created comprehensive README.md documentation for the two-step search refinement feature in `apps/scraper/scrapers/ai_search/README.md`.

### Key Implementation Details Learned

1. **Architecture**: The two-step refiner is integrated into the AISearchScraper class and controlled via environment variables. It uses a separate TwoStepSearchRefiner class that orchestrates the workflow.

2. **Threshold Logic**: The system uses a dual-threshold approach:
   - `secondary_threshold` (default 0.75): Below this triggers second pass
   - `circuit_breaker_threshold` (default 0.85): Above this skips second pass entirely
   - Creates an effective "dead zone" between 0.75-0.85 where refinement may occur

3. **Cost Structure**: Name consolidation uses gpt-4o-mini with ~60 tokens output, costing approximately $0.001-0.003 per triggered refinement.

4. **A/B Validation**: The `confidence_delta` parameter (default 0.1) ensures second pass results are only accepted if they improve confidence by at least this amount.

5. **Integration Points**: The refiner is initialized in AISearchScraper.__init__() when `AI_SEARCH_ENABLE_TWO_STEP=true`, and refinement happens in `_maybe_refine_search_results()` before source selection.

6. **Telemetry**: Rich logging includes trigger rates, confidence comparisons, extracted names, and cost tracking for monitoring.

### Configuration Variables Documented
- AI_SEARCH_ENABLE_TWO_STEP (default: false)
- AI_SEARCH_SECONDARY_THRESHOLD (default: 0.75)
- AI_SEARCH_CIRCUIT_BREAKER_THRESHOLD (default: 0.85)
- AI_SEARCH_CONFIDENCE_DELTA (default: 0.1)
- AI_SEARCH_MAX_FOLLOW_UP_QUERIES (default: 2)

### Documentation Approach
The README follows user requirements with:
- Overview with benefits
- Visual workflow diagram using ASCII art
- Configuration table with examples
- Cost analysis with real numbers
- Multiple code examples (basic, advanced, batch)
- Troubleshooting section
- Telemetry and monitoring guidance
