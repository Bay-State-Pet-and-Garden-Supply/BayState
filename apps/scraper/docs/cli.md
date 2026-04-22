# BayState Runner CLI

**Version**: 0.1.0  
**Last Updated**: April 2026

The BayState Runner CLI (`bsr`) provides local testing and management tools for the distributed scraping system. Use it to test scrapers, visualize cohorts, and benchmark extraction performance without requiring a full deployment.

---

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [Global Options](#global-options)
4. [Commands](#commands)
   - [bsr batch](#bsr-batch)
   - [bsr cohort](#bsr-cohort)
   - [bsr benchmark](#bsr-benchmark)
5. [Runner CLI](#runner-cli)
6. [Configuration](#configuration)
7. [Environment Variables](#environment-variables)
8. [Troubleshooting](#troubleshooting)

---

## Installation

### Prerequisites

- Python 3.10 or higher
- Playwright browsers installed
- Valid BayState API key (for API-connected modes)

### Install from Source

```bash
cd apps/scraper
pip install -r requirements.txt
python -m playwright install chromium
```

### Verify Installation

```bash
python -m cli.main --version
# or
bsr --version
```

---

## Quick Start

Test a scraper locally without an API server:

```bash
# Validate a local config before running it
bsr batch validate --config scrapers/configs/phillips.yaml

# Test built-in SKUs from a local config
bsr batch test --scraper phillips --config scrapers/configs/phillips.yaml

# Test specific SKUs with validation output first
bsr batch test --scraper phillips --config scrapers/configs/phillips.yaml --sku "072705115310" --validate

# Visualize cohort distribution
bsr cohort visualize --products fixtures/sample-products.json
```

---

## Global Options

These options work with any command:

| Option | Description |
|--------|-------------|
| `--version` | Show version information |
| `--help` | Show help message and exit |

---

## Commands

### bsr batch

Test product batches locally.

#### bsr batch validate

Lint and preflight-check a local YAML scraper config without executing it.

```bash
bsr batch validate --config <path> [options]
```

**Required Flags:**

| Flag | Description |
|------|-------------|
| `--config` | Path to YAML scraper configuration file |

**Optional Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `--scraper` | inferred | Optional scraper name used when resolving config path |
| `--strict` | false | Treat validation warnings as errors |

**Examples:**

```bash
# Validate a config and print local runtime preflight details
bsr batch validate --config scrapers/configs/phillips.yaml

# Fail validation on warnings too
bsr batch validate --config scrapers/configs/phillips.yaml --strict
```

#### bsr batch test

Run a local batch test against a scraper configuration.

```bash
bsr batch test --scraper <name> --config <path> [options]
```

**Required Flags:**

| Flag | Description |
|------|-------------|
| `--scraper` | Scraper config name |
| `--config` | Path to YAML scraper configuration file |

**Optional Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `--product-line` | - | Product line label for the batch report |
| `--upc-prefix` | - | Limit the batch to SKUs matching a UPC prefix |
| `--limit` | 10 | Maximum products to test |
| `--sku` | - | Comma-separated list of SKUs to test |
| `--output` | stdout | Output file path for results JSON |
| `--validate` | false | Print config validation and runtime preflight output before execution |
| `--strict-validate` | false | Treat validation warnings as errors |
| `--no-headless` | false | Show browser window for debugging |
| `--debug` | false | Enable debug logging |

**Examples:**

```bash
# Test with config's test_skus
bsr batch test --scraper phillips --config scrapers/configs/phillips.yaml

# Test specific SKUs
bsr batch test --scraper phillips --config scrapers/configs/phillips.yaml --sku "072705115310,072705115327"

# Validate first, then run visible browser mode for login debugging
bsr batch test --scraper phillips --config scrapers/configs/phillips.yaml --validate --no-headless --debug

# Save results to file with visible browser
bsr batch test --scraper phillips --config scrapers/configs/phillips.yaml --sku "072705115310" --no-headless --output results.json
```

**Behavior:**

- Without `--sku`, uses `test_skus` defined in the YAML config
- Login-enabled scrapers are routed through the runner local mode so credential fallback and structured logs match real runner execution
- Results are printed to stdout or saved to the specified output file
- Validation output includes local login runtime preflight details such as runtime credential refs, detected credential sources, and missing refs

---

### bsr cohort

Visualize and manage product cohorts.

#### bsr cohort visualize

Generate visual reports of cohort distribution and statistics.

```bash
bsr cohort visualize --products <path> [options]
```

**Required Flags:**

| Flag | Description |
|------|-------------|
| `--products` | Path to JSON file containing product data |

**Optional Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `--strategy` | upc_prefix | Grouping strategy: `upc_prefix` or `ai_search_family` |
| `--prefix-length` | 8 | UPC prefix length for grouping |
| `--output` | stdout | Output file for visualization data |
| `--format` | table | Output format: `table`, `json`, or `csv` |

**Examples:**

```bash
# Basic cohort visualization
bsr cohort visualize --products fixtures/sample-products.json

# Use AI search family grouping
bsr cohort visualize --products fixtures/sample-products.json --strategy ai_search_family

# Export to JSON
bsr cohort visualize --products fixtures/sample-products.json --format json --output cohorts.json
```

#### bsr cohort analyze

Analyze cohort characteristics and provide recommendations.

```bash
bsr cohort analyze --products <path> [options]
```

**Required Flags:**

| Flag | Description |
|------|-------------|
| `--products` | Path to JSON file containing product data |

**Optional Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `--strategy` | upc_prefix | Grouping strategy to analyze |
| `--min-size` | 2 | Minimum cohort size to include in analysis |

**Examples:**

```bash
# Analyze cohorts
bsr cohort analyze --products fixtures/sample-products.json

# Filter small cohorts
bsr cohort analyze --products fixtures/sample-products.json --min-size 5
```

---

### bsr benchmark

Benchmark extraction strategies.

#### bsr benchmark run

Run performance benchmarks against extraction strategies.

```bash
bsr benchmark run --config <path> [options]
```

**Required Flags:**

| Flag | Description |
|------|-------------|
| `--config` | Path to YAML scraper configuration file |

**Optional Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `--mode` | auto | Extraction mode to benchmark: `auto`, `llm-free`, `llm` |
| `--iterations` | 10 | Number of iterations per test |
| `--output` | stdout | Output file for benchmark results |
| `--compare` | false | Compare all modes side by side |

**Examples:**

```bash
# Benchmark auto mode
bsr benchmark run --config scrapers/configs/phillips.yaml --mode auto

# Compare all extraction modes
bsr benchmark run --config scrapers/configs/phillips.yaml --compare --iterations 20

# Benchmark with specific SKU
bsr benchmark run --config scrapers/configs/phillips.yaml --sku "072705115310" --iterations 5
```

---

## Runner CLI

The runner CLI provides direct access to scraping execution modes. It is primarily used for development and debugging.

### Usage

```bash
python runner.py [options]
```

### Flags

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--job-id` | * | - | Job ID to execute (from API) |
| `--api-url` | * | - | API base URL (or set `SCRAPER_API_URL`) |
| `--runner-name` | - | hostname | Identifier for this runner |
| `--mode` | - | full | Execution mode: `full`, `chunk_worker`, `realtime` |
| `--debug` | - | false | Enable debug logging |
| `--local` | ** | - | Run in local mode (no API required) |
| `--config` | ** | - | Path to local YAML config (requires `--local`) |
| `--sku` | - | - | SKU or comma-separated SKUs (requires `--local`) |
| `--output` | - | stdout | Output file path for results JSON |
| `--no-headless` | - | false | Run browser in visible mode |
| `--validate` | - | false | Validate local YAML config and exit |
| `--strict-validate` | - | false | Treat warnings as errors during local validation |

*Required unless `--local` is set  
**Required when `--local` is set

### Execution Modes

#### full

Complete scraper execution for a specific job. Processes all scrapers for given SKUs.

```bash
python runner.py --mode full --job-id <uuid>
```

#### chunk_worker

Distributed chunk worker mode. Claims chunks from API, processes work, and reports results autonomously.

```bash
python runner.py --mode chunk_worker --runner-name worker-1
```

#### realtime

Event-driven execution using Supabase Realtime. Listens for job creation events and executes immediately.

```bash
python runner.py --mode realtime
```

### Local Mode Examples

```bash
# Test with built-in test SKUs
python runner.py --local --config scrapers/configs/phillips.yaml

# Validate only
python runner.py --local --config scrapers/configs/phillips.yaml --validate

# Test specific SKU with visible browser
python runner.py --local --config scrapers/configs/phillips.yaml --sku "072705115310" --no-headless

# Save results and enable debug logging
python runner.py --local --config scrapers/configs/phillips.yaml --output results.json --debug
```

---

## Configuration

### Local Mode Configuration

When running in local mode, the CLI loads scraper configurations from YAML files.

**Minimal Config:**

```yaml
name: "my-scraper"
scraper_type: "crawl4ai"
base_url: "https://example.com"

crawl4ai_config:
  extraction_mode: "auto"

workflows:
  - action: "crawl4ai_extract"
    params:
      url: "{base_url}/product/{sku}"
      schema:
        name:
          type: "string"
        price:
          type: "number"

test_skus:
  - "SKU-001"
  - "SKU-002"
```

### Credentials in Local Mode

Local mode supports credential loading from:

1. **Runner credential API** via `SCRAPER_API_URL` and `SCRAPER_API_KEY`
2. **Supabase direct lookup** when Supabase env vars and `AI_CREDENTIALS_ENCRYPTION_KEY` are available
3. **Environment Variables**: `{REF}_USERNAME` and `{REF}_PASSWORD`

For login-enabled configs, local validation preflight checks all runtime credential candidates. That includes explicit `credential_refs` and the implicit fallback to the scraper `name`.

**Example:**

```bash
export SCRAPER_API_URL="https://bay-state-app.vercel.app"
export SCRAPER_API_KEY="bsr_your_key_here"

python runner.py --local --config scrapers/configs/phillips.yaml
```

Or with environment credentials:

```bash
export PHILLIPS_USERNAME="myuser"
export PHILLIPS_PASSWORD="mypass"

python runner.py --local --config scrapers/configs/phillips.yaml
```

### Login Debug Workflow

Use validation before runtime for login scrapers:

```bash
bsr batch validate --config scrapers/configs/phillips.yaml
python runner.py --local --config scrapers/configs/phillips.yaml --validate
```

For runtime debugging, prefer runner logs instead of browser automation helpers:

```bash
bsr batch test --scraper phillips --config scrapers/configs/phillips.yaml --validate --debug --no-headless
```

Login failures now include:

- credential refs attempted and resolved credential source
- login step that failed
- auth redirect or still-on-login-page detection
- failure-indicator selector or text matches when configured
- browser request snapshot, current URL, and optional screenshot path from runner diagnostics

---

## Environment Variables

### Required for API Mode

| Variable | Description |
|----------|-------------|
| `SCRAPER_API_URL` | BayStateApp base URL |
| `SCRAPER_API_KEY` | Runner API key (starts with `bsr_`) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `RUNNER_NAME` | hostname | Identifier for this runner |
| `POLL_INTERVAL` | 30 | Seconds between job polls |
| `MAX_JOBS_BEFORE_RESTART` | 100 | Restart for memory hygiene |
| `BSR_SUPABASE_REALTIME_KEY` | - | Service role key for realtime mode |
| `HEADLESS` | true | Run browser headless |
| `EXTRACTION_MODE` | auto | Default extraction mode |
| `LLM_API_KEY` | - | OpenAI API key for LLM mode |
| `CRAWL4AI_CACHE_ENABLED` | true | Enable content caching |
| `LOG_LEVEL` | info | Logging level (debug, info, warning, error) |
| `ENABLE_PANDERA_VALIDATION` | true | Enable data validation |

---

## Troubleshooting

### Common Issues

#### "Config file not found"

**Cause:** Path to YAML config is incorrect  
**Solution:** Verify the file exists at the specified path:

```bash
ls -la scrapers/configs/phillips.yaml
```

#### "No SKUs: pass --sku or define test_skus"

**Cause:** No SKUs specified and config has no `test_skus`  
**Solution:** Add `test_skus` to config or pass `--sku` flag:

```yaml
test_skus:
  - "SKU-001"
  - "SKU-002"
```

#### "Failed to load any credentials"

**Cause:** Credentials not found for the scraper's `credential_refs`  
**Solution:**

1. Set environment variables:
   ```bash
   export VENDOR_USERNAME="user"
   export VENDOR_PASSWORD="pass"
   ```

2. Or configure API access:
   ```bash
   export SCRAPER_API_URL="https://..."
   export SCRAPER_API_KEY="bsr_..."
   ```

3. Re-run validation to confirm the runtime credential refs being checked:
   ```bash
   bsr batch validate --config scrapers/configs/phillips.yaml
   ```

#### "Login failed" with auth redirect or failure indicator details

**Cause:** Credentials were rejected, the site redirected back into an auth flow, or a configured login error selector/text was detected.  
**Solution:**

1. Re-run with validation and debug logs:
   ```bash
   bsr batch test --scraper phillips --config scrapers/configs/phillips.yaml --validate --debug --no-headless
   ```

2. Add `failure_indicators` to the config so login failures report explicit site-specific reasons:
   ```yaml
   login:
     url: https://shop.phillipspet.com/login
     username_field: "#emailField"
     password_field: "#passwordField"
     submit_button: "#send2Dsk"
     success_indicator: "a.doLogout.cc_do_logout"
     failure_indicators:
       selectors:
         - ".login-error"
       texts:
         - "invalid username or password"
   ```

#### Browser timeout errors

**Cause:** Page load taking longer than timeout  
**Solution:** Increase timeout in config:

```yaml
timeout: 60  # seconds
```

Or add wait conditions:

```yaml
workflows:
  - action: "crawl4ai_extract"
    params:
      wait_for:
        selector: ".product-loaded"
        timeout: 10
```

#### Anti-bot detection

**Cause:** Site detecting automated browser  
**Solution:** Enable anti-detection:

```yaml
crawl4ai_config:
  anti_detection:
    enabled: true
    simulate_user: true
    random_delay: true
```

#### High LLM costs in auto mode

**Cause:** Auto mode falling back to LLM for many pages  
**Solution:**

1. Use LLM-free mode for structured pages:
   ```yaml
   crawl4ai_config:
     extraction_mode: "llm-free"
   ```

2. Add CSS selectors to help extraction:
   ```yaml
   schema:
     name:
       type: "string"
       selector: "h1.product-title"
   ```

### Debug Mode

Enable debug logging for detailed output:

```bash
bsr batch test --scraper phillips --config config.yaml --debug
# or
python runner.py --local --config config.yaml --debug
```

### Getting Help

For additional support:

1. Check the [crawl4ai Configuration Guide](crawl4ai-config.md)
2. Review the [Migration Guide](migration-guide.md)
3. See [Architecture Documentation](ARCHITECTURE.md)

---

*Last updated: April 2026*
