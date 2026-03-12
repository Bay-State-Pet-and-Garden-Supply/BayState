# Specification: crawl4ai_upgrade_20260312

## Overview
This track aims to upgrade the `Crawl4AIEngine` and `Crawl4AIExtractor` in the `BayStateScraper` to leverage advanced features in crawl4ai (v0.4+). These improvements will focus on three key areas: anti-bot resilience, LLM token efficiency (cost reduction), and robust error handling through a built-in escalation chain.

## Functional Requirements

### 1. Advanced Anti-Bot Features
- **Stealth Mode:** Enable `enable_stealth=True` in `BrowserConfig` to activate `playwright-stealth`.
- **Persistent Context:** Implement domain-specific session persistence using `use_persistent_context`. This will store cookies and local storage across runs for the same supplier domain.
- **User Simulation:** Ensure `magic=True` and `simulate_user=True` are correctly configured in `CrawlerRunConfig`.

### 2. LLM Extraction Efficiency
- **Content Pruning:** Integrate `PruningContentFilter` as a global default for all AI extraction strategies to strip noise (headers, footers, etc.) before markdown generation.
- **Input Optimization:** Set `input_format="fit_markdown"` in `LLMExtractionStrategy` to provide the most relevant content to the LLM.
- **Parametric Tuning:** Support configuration for `chunk_token_threshold` and `overlap_rate` to optimize extraction for large product pages.

### 3. Built-in Escalation & Fallback
- **Immediate Escalation:** Configure `CrawlerRunConfig` to trigger the escalation chain immediately upon encountering 403 (Forbidden) or 429 (Too Many Requests) errors.
- **Built-in Fallback:** Migrate the current `FallbackExtractor` (httpx-based) into crawl4ai's `fallback_fetch_function`. This ensures a seamless transition when browser-based crawling fails.
- **Proxy Rotation:** Prepare `Crawl4AIEngine` to accept a `proxy_config` list for automatic rotation during the escalation phase.

## Non-Functional Requirements
- **Cost Efficiency:** Target a >20% reduction in average token usage per extraction through aggressive pruning and "fit_markdown".
- **Reliability:** Improve success rates for highly-protected suppliers like Animal Supply and PetEdge.

## Acceptance Criteria
- [ ] `Crawl4AIEngine` correctly initializes with `enable_stealth` and domain-specific persistent contexts.
- [ ] AI extraction successfully uses `PruningContentFilter` and `fit_markdown`.
- [ ] When a 403 error occurs, the built-in `fallback_fetch_function` is automatically triggered and returns results.
- [ ] Telemetry logs reflect the use of these new features (e.g., "escalation_triggered", "tokens_saved_via_pruning").

## Out of Scope
- Integration with paid third-party scraping APIs (ScraperAPI, etc.) is reserved for a future track.
- Support for Firefox/Webkit browser rotation (Diversity) is not part of this initial upgrade.
