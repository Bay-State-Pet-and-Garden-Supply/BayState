# AI Discovery Optimization - Issues

## 2026-02-19: Test Environment Verification

### BLOCKING ISSUES

1. **Missing API Keys** (CRITICAL - blocks baseline testing)
   - `BRAVE_API_KEY`: NOT SET in environment
   - `OPENAI_API_KEY`: NOT SET in environment
   - Location checked: `os.environ` and `BayStateScraper/.env` file
   - The `.env` file has the variables defined but EMPTY:
     ```
     OPENAI_API_KEY=
     BRAVE_API_KEY=
     ```
   - **Impact**: Cannot run baseline test for AI discovery optimization
   - **Resolution required**: User must provide valid API keys

### ENVIRONMENT STATUS

| Component | Status | Notes |
|-----------|--------|-------|
| browser-use package | ✅ INSTALLED | Verified via import test |
| BRAVE_API_KEY | ❌ NOT SET | Must be provided by user |
| OPENAI_API_KEY | ❌ NOT SET | Must be provided by user |
| Brave Search API connectivity | ⚠️ BLOCKED | Requires BRAVE_API_KEY |
| OpenAI API connectivity | ⚠️ BLOCKED | Requires OPENAI_API_KEY |

### REQUIRED ACTION

User must provide:
1. Brave Search API key (sign up at https://brave.com/search/api/)
2. OpenAI API key (from https://platform.openai.com/api-keys)

Once provided, keys should be added to `BayStateScraper/.env` file.
## 2026-02-19: Baseline Test Execution

### FINDINGS
1. **Endless Captcha Loops**: `browser-use` agent frequently gets stuck in endless loops solving CAPTCHAs on DuckDuckGo and Google.
2. **Rate Limits**: The long loops cause `gpt-4o-mini` rate limits to be hit frequently, throwing `429 Too Many Requests`.
3. **API Deprecation**: The `browser-use` package throws `Setting provider is deprecated. Instead, use llm_config=LLMConfig(provider=...)` when executing the script, which caused all extractions to fail when `max_steps` was reduced to `5`.
4. **Access Denied**: Retailers like Lowe's and Home Depot actively block the headless browser.

### MODIFICATIONS
- Set `max_steps=5` on `AIDiscoveryScraper` to prevent runaways.
- Wrapped execution in a `try/except` block to ensure all 10 SKUs process even on failure.

### RESULTS
- Baseline test successfully ran 10 SKUs, but all failed due to the deprecated provider configuration issue in `browser-use`.



## 2026-02-20: Baseline analysis quality issues
- Success criteria in result rows do not reflect field completeness; this can mask poor extraction quality.
- Price extraction lacks normalization/requiredness, causing high miss rate and unusable commercial output.
- Availability extraction is inconsistent and may reflect source/date mismatch without confidence or recency controls.

## 2026-02-20: Tooling limitation during v2 analysis task
- LSP diagnostics for Markdown could not be executed because `remark-language-server` is not installed in this environment.
- Verification was completed via direct file inspection and metric validation instead.
