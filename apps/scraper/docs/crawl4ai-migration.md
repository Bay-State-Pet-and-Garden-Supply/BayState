# Migration Guide: browser-use to Crawl4AI

This guide helps you migrate AI scraper configurations from the deprecated browser-use system to the new Crawl4AI engine.

## Overview

BayStateScraper v0.3.0+ uses **Crawl4AI** instead of browser-use for AI-powered content extraction. Crawl4AI provides:

- **Better performance**: Faster page rendering and extraction
- **Cleaner output**: Markdown format is easier to parse than raw HTML
- **Lower costs**: Reduced token usage with pre-cleaned content
- **Better reliability**: Improved handling of JavaScript-heavy sites

## Quick Migration

### Step 1: Update ai_config

Change from `tool` to `provider`:

**Before (browser-use):**
```yaml
scraper_type: "agentic"
ai_config:
  tool: "browser-use"
  task: "Extract product information"
  llm_model: "gpt-4o-mini"
  max_steps: 10
  confidence_threshold: 0.7
```

**After (Crawl4AI):**
```yaml
scraper_type: "agentic"
ai_config:
  provider: "crawl4ai"
  task: "Extract product information"
  llm_model: "gpt-4o-mini"
  max_steps: 10
  confidence_threshold: 0.7
  extraction_type: "markdown"  # New option
```

### Step 2: Update Environment Variables

**Before:**
```bash
OPENAI_API_KEY=sk-...
BRAVE_API_KEY=bs-...  # Required for ai_search
```

**After:**
```bash
OPENAI_API_KEY=sk-...
# BRAVE_API_KEY is still used for ai_search action
# CRAWL4AI_API_KEY is optional for cloud features
```

### Step 3: Test Your Scraper

1. Run with test SKUs first
2. Compare extraction quality
3. Monitor costs (Crawl4AI is typically cheaper)

## Configuration Changes

### Added Options

| Option | Description |
|--------|-------------|
| `extraction_type` | `"markdown"` (default) or `"html"` |

### Unchanged Options

All these work exactly the same:

- `task` - Natural language extraction task
- `llm_model` - OpenAI model selection
- `max_steps` - Maximum extraction attempts
- `confidence_threshold` - Minimum confidence score
- `use_vision` - Enable GPT-4 Vision
- `headless` - Run browser headless

### Deprecated Options

| Old Option | Status | Replacement |
|------------|--------|-------------|
| `tool` | Deprecated | Use `provider: "crawl4ai"` |

## Workflow Actions

All actions work the same way:

### ai_extract

```yaml
- action: "ai_extract"
  params:
    task: "Extract product details"
    schema:
      name: str
      price: str
    visit_top_n: 1
    confidence_threshold: 0.75
```

**No changes required** - just update `ai_config.provider`.

### ai_search

```yaml
- action: "ai_search"
  params:
    query: "{sku} product"
    max_results: 5
```

**No changes required** - still uses Brave Search API.

### ai_validate

```yaml
- action: "ai_validate"
  params:
    required_fields:
      - name
      - price
    min_confidence: 0.7
```

**No changes required**.

## Cost Comparison

| Operation | browser-use | Crawl4AI |
|-----------|-------------|----------|
| Simple extraction | $0.02-0.05 | $0.005-0.02 |
| Complex page | $0.10-0.25 | $0.05-0.15 |
| Search + Extract | $0.15-0.40 | $0.10-0.25 |

**Typical savings: 30-50%**

## Troubleshooting Migration Issues

### "Provider not found" errors

**Problem:** Config still uses `tool: "browser-use"`

**Solution:**
```yaml
# Change this
ai_config:
  tool: "browser-use"

# To this
ai_config:
  provider: "crawl4ai"
```

### Different extraction results

**Problem:** Crawl4AI returns slightly different data format

**Solution:**
- Check the markdown output format
- Update schema hints if needed
- Adjust confidence_threshold if results differ

### Missing fields

**Problem:** Some fields not extracted

**Solution:**
- Crawl4AI uses markdown format which may structure data differently
- Update task description to be more specific
- Add schema hints for missing fields

### Cost differences

**Problem:** Costs different than expected

**Solution:**
- Crawl4AI is usually cheaper but token usage patterns differ
- Monitor `ctx.results["ai_extract_cost"]` for actual costs
- Adjust `max_steps` if needed

## Example: Complete Migration

**Before (browser-use):**
```yaml
name: "product-extractor"
display_name: "Product Extractor"
base_url: "https://example.com"
scraper_type: "agentic"

ai_config:
  tool: "browser-use"
  task: "Extract product information"
  llm_model: "gpt-4o-mini"
  max_steps: 10
  confidence_threshold: 0.7

workflows:
  - action: "ai_extract"
    params:
      task: "Extract name, price, description"
      schema:
        name: str
        price: str
        description: str

test_skus:
  - "12345"
```

**After (Crawl4AI):**
```yaml
name: "product-extractor"
display_name: "Product Extractor"
base_url: "https://example.com"
scraper_type: "agentic"

ai_config:
  provider: "crawl4ai"
  task: "Extract product information"
  llm_model: "gpt-4o-mini"
  max_steps: 10
  confidence_threshold: 0.7
  extraction_type: "markdown"  # New option

workflows:
  - action: "ai_extract"
    params:
      task: "Extract name, price, description"
      schema:
        name: str
        price: str
        description: str
      extraction_type: "markdown"  # Can also set per-action

test_skus:
  - "12345"
```

## Rollback

If you need to rollback to browser-use temporarily:

1. Code is archived in `scraper_backend/archive/ai_handlers/`
2. Restore the handlers from archive
3. Change `provider: "crawl4ai"` back to `tool: "browser-use"`

**Note:** Browser-use support will be fully removed in v0.4.0.

## Getting Help

- **Full Crawl4AI docs:** See `docs/crawl4ai-guide.md`
- **Example configs:** Check `scrapers/configs/ai-*.yaml`
- **Template:** Use `scrapers/configs/ai-template.yaml`
- **Issues:** Check logs for detailed error messages

## FAQ

### Q: Do I need to change my workflows?

**A:** No, workflows use the same actions (`ai_extract`, `ai_search`, `ai_validate`). Only the `ai_config` section needs updating.

### Q: Will my existing scrapers break?

**A:** Yes, if they use `tool: "browser-use"`. You must update to `provider: "crawl4ai"` for v0.3.0+.

### Q: Is Crawl4AI faster?

**A:** Yes, typically 20-40% faster for most operations.

### Q: Do I need new API keys?

**A:** No, your OpenAI API key works the same. Brave Search API key is still used for `ai_search`.

### Q: What about BRAVE_API_KEY?

**A:** Still required for the `ai_search` action to find product pages.

### Q: Can I use both browser-use and Crawl4AI?

**A:** No, v0.3.0+ only supports Crawl4AI. Browser-use code is archived.

### Q: What's the difference in output format?

**A:** Crawl4AI produces markdown which is cleaner than browser-use's HTML. The LLM can parse it more easily, resulting in better extractions with fewer tokens.

## Timeline

- **v0.2.0**: browser-use was the AI engine
- **v0.3.0**: Migrated to Crawl4AI, browser-use deprecated
- **v0.4.0**: browser-use support will be removed (planned)

Migrate your configs before v0.4.0 to ensure continued operation.
