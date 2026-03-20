# Specification: Scraper Performance Fixes

## Overview
This track focuses on addressing widespread performance degradation in Playwright scrapers, including timeouts, resource leaks, and low success rates (currently ~70%). The objective is to transform the scraper into a resilient, intelligent system that handles transient failures while maintaining optimal performance.

## Functional Requirements
- **Tiered Timeout Strategy**: Implement critical (30s), important (10s), optional (5s), and fallback (2s) timeout tiers with progressive escalation.
- **Resource Cleanup Guarantees**: Use context managers (`ManagedBrowser`) to ensure browser instances and contexts are closed correctly even on failure.
- **Intelligent Retry Policies**: Restore default `SCRAPER_MAX_RETRIES` to 3 and implement per-failure-type policies (Network: 3, Element Missing: 2, Access Denied: 0).
- **Fallback Selector System**: Add `fallback_selectors` support in YAML configs to allow the resolver to try alternative selectors if the primary fails.
- **Request Interception**: Block images, CSS, fonts, and analytics/tracking to improve page load speed and reduce resource usage.
- **Tracing & Observability**: Implement a tracing collection system for failed scrapes and a dashboard for monitoring selector health and timeout rates.
- **App Integration**: Integrate the observability dashboard into the existing BayStateApp admin panel for real-time monitoring.

## Non-Functional Requirements
- **Target Metrics (Aspirational)**: Success rate > 92%, Timeout reduction > 83%, 20% improvement in average scrape time.
- **Stability**: Zero resource leaks during a 24-hour stress test.
- **Compatibility**: No breaking changes to existing YAML configurations (fallbacks are optional).

## Acceptance Criteria
- [ ] Tiered timeout system implemented and verified with unit tests.
- [ ] `ManagedBrowser` context manager handles cleanup in 100% of tested failure modes.
- [ ] Retry policies apply correctly based on exception type.
- [ ] Fallback selectors work as expected when primary selectors fail.
- [ ] Scraper dashboard API provides health metrics to BayStateApp admin UI.
- [ ] 24-hour stress test confirms stable memory and resource usage.

## Out of Scope
- Redesigning the entire scraper backend architecture beyond the identified performance fixes.
- Modifying supplier-specific logic unrelated to selector brittle-ness.
- Implementing new supplier scrapers.
