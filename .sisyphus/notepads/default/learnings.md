## Proxy Documentation Task - March 2026

### What was done
Added comprehensive proxy configuration documentation to `apps/scraper/docs/crawl4ai-config.md`.

### Content added
- **Configuration Options table**: Documented all ProxyConfig fields from config.py
- **Rotation Strategies**: Documented `off`, `per_request`, and `per_site` with use cases from proxy_rotator.py
- **Provider Examples**:
  - Bright Data format and common ports
  - Oxylabs format and common ports
  - Multiple proxy rotation example
  - Separate credentials example
- **Troubleshooting section**: Connection errors, auth failures, rotation issues

### Key observations
- The ProxyConfig model in config.py has a nested class definition (appears twice) which is unusual
- proxy_rotator.py uses thread-safe implementation with health tracking (failure cooldown)
- Existing docs had a minimal proxy section under Advanced Configuration, replaced with dedicated section

### Verification
All checks passed:
- proxy_config section exists
- Bright Data example exists
- Oxylabs example exists
- All rotation strategies documented
- Troubleshooting section exists
