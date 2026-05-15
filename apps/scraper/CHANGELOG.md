# Changelog

All notable changes to BayStateScraper will be documented in this file.

## [Unreleased]

## [0.3.0] - 2026-05-15
### Added
- **crawl4ai v0.3.0 Engine** - High-performance extraction engine (3-5x faster).
- **Enrichment Path** - AI-only extraction pipeline replacing legacy static scraping.
- **Phase 10 Migration** - Deactivation of static scraping in favor of enrichment/AI-only extraction.
- **Local CLI** - New `bsr` CLI for local cohort testing and benchmarking.
- **Official Brand Scraper** - Isolated pipeline for direct-from-manufacturer ingestion.

### Deprecated
- **Static Scraping** - Selector-based scraping is now a secondary fallback or deactivated.
- **Legacy Actions/Executor** - Moved toward crawl4ai-native execution.

### Deprecated
- **GitHub Actions Runner** - The `.github/workflows/scrape.yml` workflow has been deprecated. Use the polling daemon instead (see [Runner Setup Guide](../BayStateApp/docs/runner-setup.md)).

### Removed
- `.github/workflows/scrape.yml` - GitHub Actions-based scraper runner (replaced by polling daemon)

### Migration Guide

To migrate from the GitHub Actions runner to the polling daemon:

1. Get your runner API key from **Admin Panel → Scraper Network → Runner Accounts**
2. Run the bootstrap script:
   ```bash
   curl -sSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayState/refs/heads/master/apps/scraper/get.sh | bash
   ```
3. Enter your API URL and API key when prompted
4. The runner will start automatically and begin polling for jobs

For detailed instructions, see [Runner Setup Guide](../BayStateApp/docs/runner-setup.md).

---

## [0.2.0] - 2026-02-19

### Added
- **Supabase Realtime v2** - Real-time job dispatch and presence tracking
- **Structured JSON Logging** - Centralized logging with job context
- **Polling Daemon Mode** - Simplified architecture for reliability
- **Test Lab Events** - Real-time event system for testing
- **Enhanced Installation** - Guided setup with realtime key configuration
- **AI-Powered Extraction** - Agentic browser control for universal product discovery
  - Universal Extraction: No CSS selectors required
  - Official Source Identification: Uses Brave Search + LLM
  - Cost Tracking: Built-in budget enforcement
  - Smart Fallback: Automatic fallback to static scraping

### Changed
- Updated architecture to use polling daemon as primary method
- Improved error handling and retry logic

---

## [0.1.0] - 2025-XX-XX

### Added
- Initial release
- GitHub Actions-based runner
- YAML-defined scraper workflows
- Playwright-based browser automation
