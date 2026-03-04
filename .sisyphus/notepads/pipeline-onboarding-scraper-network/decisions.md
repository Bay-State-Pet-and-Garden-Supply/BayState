## 2026-03-04 Crawl4AI callback integration decisions

- Chose metadata extension via `scrape_jobs.metadata.crawl4ai` instead of DB schema migration for atomic compatibility.
- Chose to compute and store cumulative LLM metrics at callback time for low-cost reads in status endpoints.
- Chose dual-shape ingestion (`results.extraction_strategy` + `results.crawl4ai.extraction_strategy`) to avoid breaking runners in transition.
