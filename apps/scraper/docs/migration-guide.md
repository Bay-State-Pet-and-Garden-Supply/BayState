# Migration Guide: Browser-Use to crawl4ai

**Version**: v0.3.0  
**Date**: March 2026  
**Status**: Required for all runners

This guide helps you migrate from the legacy browser-use AI scraping system to the new crawl4ai engine. The migration is straightforward and brings significant improvements in speed, cost, and reliability.

---

## Overview

### What's Changing

| Aspect | Browser-Use (Legacy) | crawl4ai (New) |
|--------|---------------------|----------------|
| **AI Framework** | browser-use agent | crawl4ai async engine |
| **Extraction Modes** | LLM-only | LLM + LLM-Free (hybrid) |
| **Speed** | 15-30s per page | 2-8s per page |
| **Cost** | $0.05-0.15 per page | $0.00-0.03 per page |
| **Anti-Bot** | Basic stealth | Advanced fingerprinting |
| **Configuration** | Complex YAML | Simplified YAML |

### Key Benefits

1. **LLM-Free Extraction**: Most pages extract without AI calls using crawl4ai's smart extraction
2. **Faster Execution**: 3-5x speed improvement on average
3. **Lower Costs**: 60-80% reduction in AI API costs
4. **Better Anti-Detection**: Improved stealth and bot evasion
5. **Simpler Configs**: Reduced YAML complexity

---

## Migration Steps

### Step 1: Update Dependencies

Update your runner installation:

```bash
# Pull latest image
docker pull baystate-scraper:latest

# Or if using git
git pull origin main
pip install -r requirements.txt
```

### Step 2: Update Environment Variables

Replace legacy AI keys with crawl4ai configuration:

```bash
# Remove these (legacy)
# OPENAI_API_KEY=sk-...
# BRAVE_API_KEY=bs-...

# Add these (new)
CRAWL4AI_API_KEY=your_key_here      # Optional: for cloud features
LLM_API_KEY=sk-...                  # Optional: for LLM mode only
```

### Step 3: Update Scraper Configurations

#### Before (Legacy browser-use)

```yaml
name: "product-extractor"
scraper_type: "agentic"

ai_config:
  tool: "browser-use"
  task: "Extract product information"
  max_steps: 10
  confidence_threshold: 0.7
  llm_model: "gpt-4o-mini"
  use_vision: true

workflows:
  - action: "ai_search"
    params:
      query: "{sku} {brand}"
      max_results: 5
  
  - action: "ai_extract"
    params:
      task: "Extract product details"
      visit_top_n: 1
      schema:
        name: str
        price: str
```

#### After (New crawl4ai)

```yaml
name: "product-extractor"
scraper_type: "crawl4ai"          # Changed from "agentic"

crawl4ai_config:
  extraction_mode: "auto"         # auto | llm | llm-free
  llm_model: "gpt-4o-mini"        # Only used in llm mode
  use_vision: false               # Optional
  
  # Anti-bot configuration
  anti_detection:
    enabled: true
    simulate_user: true
    random_delay: true

workflows:
  - action: "crawl4ai_extract"    # Changed from "ai_extract"
    params:
      url: "{base_url}/product/{sku}"
      schema:
        name: "string"
        price: "string"
        brand: "string"
      extraction_mode: "auto"     # Uses LLM-free when possible
```

### Step 4: Update GitHub Actions (if applicable)

If using GitHub Actions runners, update your workflow:

```yaml
# .github/workflows/scrape.yml

jobs:
  scrape:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      
      # Update to new runner
      - name: Run crawl4ai Scraper
        run: |
          python -m scraper_backend.crawl4ai_runner \
            --job-id ${{ github.event.inputs.job_id }}
        env:
          SCRAPER_API_URL: ${{ secrets.SCRAPER_API_URL }}
          SCRAPER_API_KEY: ${{ secrets.SCRAPER_API_KEY }}
          # Remove: OPENAI_API_KEY
          # Remove: BRAVE_API_KEY
```

### Step 5: Test Migration

Run validation tests:

```bash
# Test single SKU
python test_migration.py --sku "TEST-123" --config my-scraper.yaml

# Compare results
python compare_outputs.py --legacy-results old.json --new-results new.json
```

---

## Direct Runner Setup

For users running scrapers directly without GitHub Actions:

### Docker Setup

```bash
# Create new runner container
docker run -d \
  --name baystate-crawl4ai-runner \
  -e SCRAPER_API_URL=https://app.baystatepet.com \
  -e SCRAPER_API_KEY=bsr_your_key \
  -e RUNNER_NAME=my-runner \
  -e SCRAPER_BROWSER_STATE_DIR=/app/.browser_storage_states \
  -v baystate-crawl4ai-browser-state:/app/.browser_storage_states \
  baystate-scraper:crawl4ai
```

### Local Python Setup

```bash
# Install crawl4ai
pip install crawl4ai>=0.4.0

# Run daemon
python daemon.py --engine crawl4ai

# Or run single job
python -m src.crawl4ai_engine.engine --job-id <uuid>
```

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| RAM | 2 GB | 4 GB |
| CPU | 2 cores | 4 cores |
| Disk | 5 GB | 10 GB |
| Python | 3.10 | 3.12 |

---

## Troubleshooting

### Common Issues

#### Issue 1: "Extraction mode not supported"

**Symptom**: Error message about unsupported extraction mode

**Cause**: Using legacy extraction mode names

**Solution**:
```yaml
# Wrong
crawl4ai_config:
  extraction_mode: "ai_extract"    # Invalid

# Correct
crawl4ai_config:
  extraction_mode: "auto"          # Valid: auto, llm, llm-free
```

#### Issue 2: "Schema validation failed"

**Symptom**: Extraction returns empty or partial data

**Cause**: Schema format changed from Python types to JSON Schema

**Solution**:
```yaml
# Wrong (legacy)
schema:
  name: str
  price: float
  tags: list

# Correct (new)
schema:
  name:
    type: "string"
  price:
    type: "number"
  tags:
    type: "array"
    items:
      type: "string"
```

#### Issue 3: "Anti-bot detection triggered"

**Symptom**: Pages block requests or show CAPTCHA

**Cause**: Legacy anti-detection insufficient

**Solution**:
```yaml
crawl4ai_config:
  anti_detection:
    enabled: true
    simulate_user: true       # Human-like behavior
    random_delay: true        # Random delays between actions
    fingerprint_rotation: true # Rotate browser fingerprints
```

#### Issue 4: "High LLM costs"

**Symptom**: Unexpected API charges

**Cause**: Using `llm` mode instead of `auto` or `llm-free`

**Solution**:
```yaml
crawl4ai_config:
  extraction_mode: "auto"     # Only uses LLM when needed
  # OR
  extraction_mode: "llm-free" # Never uses LLM (fastest, free)
```

#### Issue 5: "Slow extraction speeds"

**Symptom**: Extraction taking longer than expected

**Diagnostics**:
```bash
# Check extraction mode distribution
python -m src.crawl4ai_engine.metrics --report

# Expected output:
# LLM-Free extractions: 85%
# LLM extractions: 15%
# Average time: 3.2s
```

**Solution**:
If LLM usage is high, verify schema is compatible with LLM-free extraction:
```yaml
# LLM-free compatible schema
crawl4ai_config:
  extraction_mode: "llm-free"
  schema:
    name:
      type: "string"
      selector: "h1.product-title"  # CSS selector helps
```

---

## FAQ

### General Questions

**Q1: Do I need to rewrite all my scraper configs?**

A: No. Most configs need only minor changes:
- Change `scraper_type: "agentic"` to `scraper_type: "crawl4ai"`
- Update action names from `ai_extract` to `crawl4ai_extract`
- Simplify `ai_config` to `crawl4ai_config`

**Q2: Will my existing data be affected?**

A: No. All scraped data remains intact. Only the extraction engine changes.

**Q3: Can I run both systems in parallel?**

A: Yes, temporarily. Set `scraper_type: "agentic"` for legacy and `scraper_type: "crawl4ai"` for new configs during transition.

**Q4: What happens to my API costs?**

A: Most users see 60-80% cost reduction because crawl4ai uses LLM-free extraction by default.

**Q5: How do I know if migration succeeded?**

A: Check the runner logs for:
```
INFO: crawl4ai engine initialized
INFO: Extraction mode: auto (llm-free: 85%, llm: 15%)
INFO: Average extraction time: 3.2s
```

### Technical Questions

**Q6: What's the difference between extraction modes?**

A:
- `llm-free`: Uses DOM parsing, no AI calls (fastest, free)
- `llm`: Always uses AI extraction (most accurate, costs money)
- `auto`: Tries LLM-free first, falls back to LLM if needed (balanced)

**Q7: Can I customize the anti-detection settings?**

A: Yes. See `crawl4ai_config.anti_detection` section:
```yaml
anti_detection:
  enabled: true
  user_agent_rotation: true
  viewport_rotation: true
  tls_fingerprint: "chrome_120"
```

**Q8: How do I debug extraction failures?**

A: Enable debug mode:
```yaml
crawl4ai_config:
  debug: true
  save_screenshots: true
  save_html: true
```

**Q9: What sites work best with LLM-free mode?**

A: Sites with clean HTML structure:
- E-commerce product pages
- Blog articles
- Documentation sites
- Structured data (JSON-LD, microdata)

**Q10: When should I use LLM mode?**

A: Use LLM mode for:
- Complex comparison tables
- Unstructured product descriptions
- Pages requiring semantic understanding
- PDF or image-based content

**Q11: How does the fallback chain work?**

A:
```
1. Try LLM-free extraction
   ↓ (if fails or confidence low)
2. Try LLM extraction
   ↓ (if fails or cost exceeds limit)
3. Use static selectors (if defined)
   ↓ (if all fail)
4. Queue for manual review
```

**Q12: Can I migrate gradually?**

A: Yes. Migrate scrapers one at a time:
```bash
# Test with one scraper
python migrate_scraper.py --config scraper1.yaml --dry-run

# Apply migration
python migrate_scraper.py --config scraper1.yaml --apply
```

**Q13: What about rate limits?**

A: crawl4ai has built-in rate limiting:
```yaml
crawl4ai_config:
  rate_limit:
    requests_per_minute: 30
    burst_size: 5
```

**Q14: How do I handle authentication?**

A: Authentication is unchanged. Use the same API key system:
```bash
SCRAPER_API_KEY=bsr_your_key_here
```

**Q15: Where can I get help?**

A:
- Documentation: `docs/crawl4ai-config.md`
- Issues: GitHub Issues with `crawl4ai` label
- Support: support@baystatepet.com

---

## Rollback Instructions

If you need to revert to the legacy browser-use system:

### Immediate Rollback (Emergency)

```bash
# Stop crawl4ai runner
docker stop baystate-crawl4ai-runner

# Start legacy runner
docker run -d \
  --name baystate-legacy-runner \
  -e SCRAPER_API_URL=$SCRAPER_API_URL \
  -e SCRAPER_API_KEY=$SCRAPER_API_KEY \
  -e SCRAPER_BROWSER_STATE_DIR=/app/.browser_storage_states \
  -v baystate-legacy-browser-state:/app/.browser_storage_states \
  baystate-scraper:v0.2.0
```

### Config Rollback

Revert scraper configurations:

```yaml
# Change back to legacy
name: "product-extractor"
scraper_type: "agentic"           # Revert from "crawl4ai"

ai_config:                        # Revert to ai_config
  tool: "browser-use"
  task: "Extract product information"
  max_steps: 10
  confidence_threshold: 0.7
  llm_model: "gpt-4o-mini"

workflows:
  - action: "ai_extract"          # Revert from "crawl4ai_extract"
    params:
      task: "Extract product details"
```

### Database Rollback

No database changes required. The products_ingestion table schema is unchanged.

### Verification

After rollback, verify:
```bash
# Check runner version
docker logs baystate-legacy-runner | grep "version"

# Should show: v0.2.0 (browser-use)
```

---

## Migration Checklist

Use this checklist to ensure complete migration:

- [ ] Updated all scraper configs from `agentic` to `crawl4ai`
- [ ] Changed action names from `ai_extract` to `crawl4ai_extract`
- [ ] Updated schema format to JSON Schema
- [ ] Configured anti_detection settings
- [ ] Set appropriate extraction_mode (auto recommended)
- [ ] Tested with sample SKUs
- [ ] Verified cost reduction
- [ ] Monitored extraction speed improvements
- [ ] Updated documentation links
- [ ] Briefed team on new system
- [ ] Scheduled legacy system deprecation

---

## Timeline

| Phase | Date | Action |
|-------|------|--------|
| **Phase 1** | Now | Begin migration testing |
| **Phase 2** | +2 weeks | Migrate 50% of scrapers |
| **Phase 3** | +4 weeks | Complete migration |
| **Phase 4** | +6 weeks | Legacy system deprecated |

---

## Support

For migration assistance:

- **Documentation**: `docs/crawl4ai-config.md`
- **Migration Tool**: `scripts/migrate_to_crawl4ai.py`
- **Support Email**: support@baystatepet.com
- **Slack**: #crawl4ai-migration

---

*Last updated: March 2026*
