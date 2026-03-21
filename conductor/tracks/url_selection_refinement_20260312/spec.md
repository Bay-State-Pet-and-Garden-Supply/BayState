# Specification: url_selection_refinement_20260312

## Overview
This track aims to improve the accuracy of the AI Scraper's URL selection process. By expanding the list of trusted suppliers and introducing an LLM-powered pre-ranking step, the scraper will more reliably identify official product pages, reducing navigation to irrelevant or low-quality sites.

## Functional Requirements

### 1. Expanded Trusted Retailers
- Update `SearchScorer.TRUSTED_RETAILERS` in `apps/scraper/scrapers/ai_search/scoring.py` to include a wider range of pet and garden suppliers.
- **Added Domains:** `petedge.com`, `animalsupply.com`, `phillipspet.com`, `frontiercoop.com`, `chewy.com`, and other major e-commerce platforms relevant to the business.

### 2. LLM-Powered Pre-Ranking (Source Selection)
- Implement a new `LLMSourceSelector` component that uses `gpt-4o-mini` to analyze search result snippets.
- **Workflow Change:**
    1.  Fetch results from Brave Search API.
    2.  Pass all candidate URLs and snippets (max 5) to the LLM.
    3.  LLM identifies the most likely official product page for the given SKU/Brand/Product Name.
- **Integration:** The LLM's selection will **override** the heuristic score. If the LLM identifies a clear winner, that URL is prioritized for crawling.

### 3. Telemetry Enhancements
- Log which URL was selected by the LLM vs. which would have been chosen by heuristics.
- Track "LLM Selection Accuracy" (e.g., did the LLM-selected URL pass validation?).

## Non-Functional Requirements
- **Performance:** Pre-ranking should add no more than 1-2 seconds to the discovery phase.
- **Cost:** Use `gpt-4o-mini` to keep pre-ranking costs negligible.

## Acceptance Criteria
- [ ] `TRUSTED_RETAILERS` list updated and verified in code.
- [ ] `AISearchScraper` successfully uses the LLM to select a source URL.
- [ ] Logs confirm the LLM override logic is working as expected.
- [ ] Unit tests verify the new ranking integration.

## Out of Scope
- Replacing Brave Search API with manual agent browsing (postponed for later evaluation).
- Modifying the core extraction strategies (LLM/JSON-CSS).
