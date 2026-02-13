# Scraper Studio

Scraper Studio is a comprehensive environment within the BayState Admin Portal designed for the development, testing, and monitoring of web scrapers. It provides a centralized interface for managing scraper configurations, executing test runs, and analyzing scraper health and performance.

## Key Features

- **Configuration Management**: Create and update scraper configurations with version control. Manage settings like base URLs, login credentials, and workflow steps.
- **Testing Interface**: Trigger test runs for specific configurations using real or test SKUs. Monitor test progress and view detailed results, including step-by-step traces.
- **Health Dashboard**: Visualize scraper performance over time with aggregated metrics. Track success rates, average durations, and common failure points.
- **Selector Validation**: Monitor the health of individual CSS selectors and receive alerts when selectors start failing, facilitating proactive maintenance.
- **Test SKU Overrides**: Define custom SKUs for testing, including specific edge cases and fake SKUs to ensure robust error handling.
- **Historical Analysis**: Review the history of all test runs to identify trends and regressions in scraper performance.

## Getting Started

To access Scraper Studio, navigate to the Admin Portal and select **Scrapers > Studio** from the sidebar.

### Managing Configurations
1. Go to the **Configs** tab.
2. Select a configuration to view its current settings and version history.
3. Use the **Config Editor** to modify workflows or update selectors.

### Running Tests
1. Go to the **Testing** tab (or the testing section within a specific configuration).
2. Choose the SKUs you want to test or use the default test SKUs.
3. Click **Start Test Run**.
4. Monitor progress in the **History** tab.

### Monitoring Health
1. Go to the **Health** tab to view the global Scraper Studio Health Dashboard.
2. Analyze success/failure trends and performance metrics across all active scrapers.

## Architecture

Scraper Studio follows a **Coordinator-Runner Pattern**:
- **BayStateApp (Coordinator)**: Manages configurations, schedules jobs, and provides the UI for analysis.
- **BayStateScraper (Runner)**: Executes the actual scraping workflows and reports results back via secure webhooks.

Communication between the App and Scrapers is handled through the `/api/admin/scraping/callback` endpoint, which uses `X-API-Key` authentication and HMAC-signed payloads for security.
