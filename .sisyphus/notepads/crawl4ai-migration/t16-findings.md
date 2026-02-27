# T16: Monitoring Dashboard Updates - Findings

## Task Overview
Update BayStateApp monitoring to track crawl4ai metrics including LLM vs LLM-Free extraction ratio, crawl4ai-specific errors, cost tracking, and anti-bot effectiveness metrics.

## Changes Made

### 1. Updated Callback Contract (`lib/scraper-callback/contract.ts`)
Added new fields to `ScraperResultsSchema` and `ChunkResultsSchema`:
- `extraction_strategy`: enum ['llm', 'css', 'xpath']
- `llm_cost`: number (cost for LLM operations)
- `total_cost`: number (total job cost)
- `anti_bot_success_rate`: number (0-1, anti-bot detection success rate)
- `crawl4ai_errors`: array of { error_type, message, count }

### 2. Updated Callback Route (`app/api/admin/scraping/callback/route.ts`)
Added logic to store crawl4ai metrics in the `scrape_jobs` table when a job completes:
- Extracts metrics from callback payload
- Stores in job record for later querying

### 3. Created API Endpoint (`app/api/admin/scrapers/crawl4ai-metrics/route.ts`)
New endpoint that provides:
- **Summary Stats**: Total jobs, extraction ratios, cost breakdown, anti-bot rates
- **Daily Breakdown**: Day-by-day metrics for trend analysis
- **Error Aggregation**: Count of errors by type

### 4. Created Dashboard Component (`components/admin/scraping/Crawl4AIDashboard.tsx`)
New React component displaying:
- **Extraction Strategy Distribution**: Pie chart showing LLM vs CSS vs XPath
- **Daily Trends**: Stacked bar chart showing extraction types over time
- **Cost Breakdown**: LLM cost vs total cost, average costs per job
- **Error Summary**: Top errors encountered
- **Anti-Bot Success Rate**: Average success rate across jobs

### 5. Updated Main Dashboard (`components/admin/scrapers/ScraperDashboardClient.tsx`)
Added the new Crawl4AIDashboard component to the main scraper dashboard.

## Data Flow
1. Scraper runner completes job → sends callback with metrics
2. Callback route validates and stores metrics in scrape_jobs
3. Dashboard component fetches metrics via API endpoint
4. Metrics displayed in charts and cards

## Metrics Tracked
| Metric | Description | Type |
|--------|-------------|------|
| `extraction_strategy` | How data was extracted (llm/css/xpath) | enum |
| `llm_cost` | Cost for LLM operations | number |
| `total_cost` | Total job cost | number |
| `anti_bot_success_rate` | Anti-bot detection success (0-1) | number |
| `crawl4ai_errors` | Array of error types with counts | array |

## Notes
- Dashboard gracefully handles missing data (shows "No data available")
- API uses metadata JSONB as fallback if new columns don't exist
- in Cost tracking is USD (crawl4ai uses OpenAI API pricing)
- Error aggregation groups by error_type for trend analysis

## Future Enhancements
- Add database migration to add columns to scrape_jobs table for better indexing
- Add alerts for high error rates or cost thresholds
- Add comparison with previous period
- Add drill-down to individual job details
