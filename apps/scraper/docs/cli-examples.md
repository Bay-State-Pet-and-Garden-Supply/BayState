# BayState Runner CLI - Usage Examples

**Version**: 0.1.0  
**Last Updated**: April 2026

This guide provides practical examples for common CLI tasks. All examples assume you are in the `apps/scraper` directory.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Local Testing Examples](#local-testing-examples)
3. [Batch Testing Examples](#batch-testing-examples)
4. [Cohort Management Examples](#cohort-management-examples)
5. [Benchmarking Examples](#benchmarking-examples)
6. [Configuration Examples](#configuration-examples)
7. [Advanced Scenarios](#advanced-scenarios)

---

## Getting Started

### Verify CLI Installation

```bash
# Check version
python -m cli.main --version
# Output: bsr, version 0.1.0

# Show help
python -m cli.main --help
```

### Set Up Environment

```bash
# For local-only testing (no API)
export LOG_LEVEL=info

# For API-connected testing
export SCRAPER_API_URL="https://bay-state-app.vercel.app"
export SCRAPER_API_KEY="bsr_your_key_here"
```

---

## Local Testing Examples

### Example 1: Test with Config's Test SKUs

Test a scraper using the `test_skus` defined in the YAML config:

```yaml
# scrapers/configs/example.yaml
name: "example-scraper"
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
  - "SKU-003"
```

Run the test:

```bash
bsr batch test --config scrapers/configs/example.yaml --local
```

**Output:**
```json
{
  "job_id": "local_20260408_143022",
  "status": "completed",
  "results": [
    {
      "sku": "SKU-001",
      "success": true,
      "data": {
        "name": "Product One",
        "price": 29.99
      }
    },
    {
      "sku": "SKU-002",
      "success": true,
      "data": {
        "name": "Product Two",
        "price": 39.99
      }
    }
  ]
}
```

---

### Example 2: Test Specific SKUs

Override the config's test_skus with specific SKUs:

```bash
bsr batch test \
  --config scrapers/configs/phillips.yaml \
  --sku "072705115310" \
  --local
```

Test multiple SKUs:

```bash
bsr batch test \
  --config scrapers/configs/phillips.yaml \
  --sku "072705115310,072705115327,072705115334" \
  --local
```

---

### Example 3: Debug with Visible Browser

See what the browser is doing (useful for debugging selectors):

```bash
bsr batch test \
  --config scrapers/configs/phillips.yaml \
  --sku "072705115310" \
  --no-headless \
  --local
```

---

### Example 4: Save Results to File

Save extraction results for further analysis:

```bash
bsr batch test \
  --config scrapers/configs/phillips.yaml \
  --sku "072705115310" \
  --local \
  --output results.json

# View results
cat results.json | jq .
```

---

### Example 5: Debug Logging

Get detailed logs for troubleshooting:

```bash
bsr batch test \
  --config scrapers/configs/phillips.yaml \
  --sku "072705115310" \
  --local \
  --debug
```

**Sample debug output:**
```
[DEBUG] Loading config: scrapers/configs/phillips.yaml
[DEBUG] Parsed 3 test_skus from config
[DEBUG] Starting browser in headless mode
[DEBUG] Navigating to: https://phillips.com/product/072705115310
[DEBUG] Extracting fields: name, price, upc
[DEBUG] Extraction completed in 2.3s
[DEBUG] Validation passed for SKU 072705115310
```

---

## Batch Testing Examples

### Example 6: Test Multiple Configs

Test several scraper configurations in sequence:

```bash
#!/bin/bash

CONFIGS=(
  "scrapers/configs/phillips.yaml"
  "scrapers/configs/mazuri.yaml"
  "scrapers/configs/kaytee.yaml"
)

for config in "${CONFIGS[@]}"; do
  echo "Testing: $config"
  bsr batch test --config "$config" --local --output "results/$(basename $config .json).json"
done
```

---

### Example 7: Batch Test with Credentials

Test a scraper that requires login credentials:

```bash
# Method 1: Environment variables
export PHILLIPS_USERNAME="myuser"
export PHILLIPS_PASSWORD="mypass"

bsr batch test \
  --config scrapers/configs/phillips.yaml \
  --local

# Method 2: With API credentials (fetches from coordinator)
export SCRAPER_API_URL="https://bay-state-app.vercel.app"
export SCRAPER_API_KEY="bsr_your_key"

bsr batch test \
  --config scrapers/configs/phillips.yaml \
  --local
```

---

## Cohort Management Examples

### Example 8: Visualize Cohort Distribution

View how products are grouped by UPC prefix:

```bash
bsr cohort visualize \
  --products fixtures/sample-products.json \
  --format table
```

**Output:**
```
Cohort Key    | Products | Common Brand     | Common Category
--------------|----------|------------------|------------------
01234567      | 4        | Blue Buffalo     | Pet Food > Dog
99887766      | 2        | Solid Gold       | Pet Food > Cat
12345678      | 2        | Greenies         | Pet Treats
```

---

### Example 9: Export Cohorts to JSON

Export cohort data for use in other tools:

```bash
bsr cohort visualize \
  --products fixtures/sample-products.json \
  --format json \
  --output cohorts.json

# View structure
cat cohorts.json | jq '.cohorts | keys'
```

---

### Example 10: AI Search Family Grouping

Group products by AI search family (brand + product family):

```bash
bsr cohort visualize \
  --products fixtures/sample-products.json \
  --strategy ai_search_family \
  --format table
```

**Output:**
```
Cohort Key                  | Products | Description
----------------------------|----------|----------------------------------
blue-buffalo::life-protect  | 4        | Blue Buffalo Life Protection
solid-gold::holistick       | 2        | Solid Gold Holistick
greenies::dental-treats     | 2        | Greenies Dental Treats
```

---

### Example 11: Analyze Cohort Characteristics

Get detailed analysis of cohorts:

```bash
bsr cohort analyze \
  --products fixtures/sample-products.json \
  --min-size 3
```

**Output:**
```
Cohort Analysis Report
======================

Cohort: 01234567 (4 products)
- Brand: Blue Buffalo
- Categories: Pet Food > Dog Food > Dry Food
- Price range: $24.99 - $79.99
- Average price: $49.99
- Recommendation: Good candidate for batch processing

Cohort: 99887766 (2 products)
- Brand: Solid Gold
- Categories: Pet Food > Cat Food > Dry Food
- Price range: $19.99 - $29.99
- Note: Small cohort, consider merging
```

---

## Benchmarking Examples

### Example 12: Benchmark Single Mode

Test extraction performance for a specific mode:

```bash
bsr benchmark run \
  --config scrapers/configs/phillips.yaml \
  --mode llm-free \
  --iterations 10
```

**Output:**
```
Benchmark Results: llm-free mode
================================
Iterations: 10
Average time: 2.3s
Success rate: 100%
Cost: $0.00
Cache hit rate: 80%
```

---

### Example 13: Compare All Extraction Modes

Compare performance across auto, llm-free, and llm modes:

```bash
bsr benchmark run \
  --config scrapers/configs/phillips.yaml \
  --compare \
  --iterations 10 \
  --output benchmark-results.json
```

**Output:**
```
Mode Comparison
===============

llm-free:
  Average: 2.1s
  Success: 100%
  Cost: $0.00

auto:
  Average: 3.4s
  Success: 95%
  Cost: $0.02

llm:
  Average: 8.7s
  Success: 98%
  Cost: $0.15

Recommendation: Use llm-free for this scraper
```

---

### Example 14: Benchmark Specific SKU

Benchmark with a specific product:

```bash
bsr benchmark run \
  --config scrapers/configs/phillips.yaml \
  --sku "072705115310" \
  --mode auto \
  --iterations 5
```

---

## Configuration Examples

### Example 15: Minimal Working Config

The smallest possible scraper configuration:

```yaml
name: "minimal"
scraper_type: "crawl4ai"
base_url: "https://example.com"

crawl4ai_config:
  extraction_mode: "auto"

workflows:
  - action: "crawl4ai_extract"
    params:
      url: "{base_url}/p/{sku}"
      schema:
        name:
          type: "string"
        price:
          type: "number"

test_skus:
  - "TEST-001"
```

Test it:

```bash
bsr batch test --config minimal.yaml --local
```

---

### Example 16: Config with Anti-Detection

For sites with bot protection:

```yaml
name: "protected-site"
scraper_type: "crawl4ai"
base_url: "https://protected-example.com"

crawl4ai_config:
  extraction_mode: "auto"
  anti_detection:
    enabled: true
    simulate_user: true
    random_delay: true
    fingerprint_rotation: true
    tls_fingerprint: "chrome_120"
  
  rate_limit:
    requests_per_minute: 10

workflows:
  - action: "crawl4ai_navigate"
    params:
      url: "{base_url}"
      wait_until: "networkidle"
  
  - action: "crawl4ai_wait"
    params:
      duration: 3
  
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
```

---

### Example 17: Config with CSS Selectors

Help extraction with specific selectors:

```yaml
name: "selector-guided"
scraper_type: "crawl4ai"
base_url: "https://example.com"

crawl4ai_config:
  extraction_mode: "llm-free"  # Can use llm-free with good selectors

workflows:
  - action: "crawl4ai_extract"
    params:
      url: "{base_url}/product/{sku}"
      schema:
        name:
          type: "string"
          selector: "h1.product-title"
          fallback_selectors:
            - "h1"
            - "[data-testid='product-name']"
        
        price:
          type: "number"
          selector: ".price-current"
          transform: "parse_price"
        
        brand:
          type: "string"
          selector: ".brand-name"

test_skus:
  - "SKU-001"
```

---

## Advanced Scenarios

### Example 18: Full Pipeline Test

Test an entire scraping pipeline:

```bash
#!/bin/bash
set -e

CONFIG="scrapers/configs/phillips.yaml"
OUTPUT_DIR="test-results/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUTPUT_DIR"

echo "=== Step 1: Test with test_skus ==="
bsr batch test \
  --config "$CONFIG" \
  --local \
  --output "$OUTPUT_DIR/batch-test.json"

echo "=== Step 2: Visualize cohorts ==="
bsr cohort visualize \
  --products "$OUTPUT_DIR/batch-test.json" \
  --format json \
  --output "$OUTPUT_DIR/cohorts.json"

echo "=== Step 3: Benchmark extraction ==="
bsr benchmark run \
  --config "$CONFIG" \
  --compare \
  --iterations 5 \
  --output "$OUTPUT_DIR/benchmark.json"

echo "=== Results saved to $OUTPUT_DIR ==="
```

---

### Example 19: CI/CD Integration

Use in continuous integration:

```yaml
# .github/workflows/test-scrapers.yml
name: Test Scrapers

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          python -m playwright install chromium
      
      - name: Test scraper configs
        run: |
          for config in scrapers/configs/*.yaml; do
            echo "Testing $config"
            bsr batch test --config "$config" --local || exit 1
          done
```

---

### Example 20: Performance Profiling

Profile scraper performance over time:

```bash
#!/bin/bash

CONFIG="scrapers/configs/phillips.yaml"
ITERATIONS=20
LOG_FILE="performance.log"

echo "Starting performance test at $(date)" > "$LOG_FILE"

for i in $(seq 1 $ITERATIONS); do
  echo "Run $i/$ITERATIONS"
  
  # Time the execution
  start_time=$(date +%s.%N)
  
  bsr batch test \
    --config "$CONFIG" \
    --sku "072705115310" \
    --local \
    --output "temp-result.json" \
    2>&1 | grep -E "(time|duration|success)" >> "$LOG_FILE"
  
  end_time=$(date +%s.%N)
  elapsed=$(echo "$end_time - $start_time" | bc)
  
  echo "Total time: ${elapsed}s" >> "$LOG_FILE"
done

echo "Performance test complete. Results in $LOG_FILE"
```

---

### Example 21: Using Runner CLI Directly

Direct runner CLI usage for advanced scenarios:

```bash
# Full mode with specific job
python runner.py \
  --mode full \
  --job-id "job-uuid-here" \
  --api-url "https://bay-state-app.vercel.app" \
  --runner-name "test-runner"

# Realtime mode (listens for jobs)
python runner.py \
  --mode realtime \
  --api-url "https://bay-state-app.vercel.app" \
  --runner-name "realtime-worker-1"

# Chunk worker mode
python runner.py \
  --mode chunk_worker \
  --api-url "https://bay-state-app.vercel.app" \
  --runner-name "chunk-worker-1"
```

---

### Example 22: Testing with Proxy

Test scraper through a proxy:

```yaml
# config-with-proxy.yaml
name: "proxied-scraper"
scraper_type: "crawl4ai"
base_url: "https://example.com"

proxy_config:
  proxy_url: "http://proxy.example.com:8080"
  proxy_username: "user"
  proxy_password: "pass"
  rotation_strategy: "off"

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
```

Run test:

```bash
bsr batch test --config config-with-proxy.yaml --local
```

---

### Example 23: Handling JavaScript-Heavy Sites

For sites requiring JavaScript execution:

```yaml
name: "js-heavy-site"
scraper_type: "crawl4ai"
base_url: "https://spa-example.com"

crawl4ai_config:
  extraction_mode: "auto"
  anti_detection:
    enabled: true

workflows:
  - action: "crawl4ai_navigate"
    params:
      url: "{base_url}/product/{sku}"
      wait_until: "networkidle"
  
  - action: "crawl4ai_wait"
    params:
      selector: ".product-loaded"
      timeout: 10
  
  - action: "crawl4ai_extract"
    params:
      schema:
        name:
          type: "string"
        price:
          type: "number"
        description:
          type: "string"

test_skus:
  - "SPA-001"
```

Run with visible browser to debug:

```bash
bsr batch test \
  --config js-heavy-site.yaml \
  --sku "SPA-001" \
  --no-headless \
  --local
```

---

### Example 24: Multi-Step Extraction

Extract data from multiple page sections:

```yaml
name: "multi-step"
scraper_type: "crawl4ai"
base_url: "https://example.com"

crawl4ai_config:
  extraction_mode: "auto"

workflows:
  # Step 1: Navigate to product
  - action: "crawl4ai_navigate"
    params:
      url: "{base_url}/product/{sku}"
      wait_until: "networkidle"
  
  # Step 2: Extract basic info
  - action: "crawl4ai_extract"
    name: "basic_info"
    params:
      schema:
        name:
          type: "string"
        price:
          type: "number"
  
  # Step 3: Click to specifications tab
  - action: "crawl4ai_click"
    params:
      selector: "a[href='#specifications']"
      wait_for_navigation: false
  
  # Step 4: Wait for tab content
  - action: "crawl4ai_wait"
    params:
      selector: "#specifications .content"
      timeout: 5
  
  # Step 5: Extract specifications
  - action: "crawl4ai_extract"
    name: "specifications"
    params:
      schema:
        weight:
          type: "string"
        dimensions:
          type: "string"
        material:
          type: "string"

test_skus:
  - "MULTI-001"
```

---

## Troubleshooting Examples

### Example 25: Debug Extraction Issues

When extraction returns empty data:

```bash
# Step 1: Test with debug logging
bsr batch test \
  --config scrapers/configs/problematic.yaml \
  --sku "SKU-001" \
  --local \
  --debug 2>&1 | tee debug.log

# Step 2: View page source manually
# Add this to your workflow temporarily:
# - action: "crawl4ai_extract"
#   params:
#     schema:
#       _html:
#         type: "string"

# Step 3: Test with visible browser
bsr batch test \
  --config scrapers/configs/problematic.yaml \
  --sku "SKU-001" \
  --no-headless \
  --local
```

---

### Example 26: Validate Config Before Testing

Catch config errors early:

```bash
# Test YAML syntax
python -c "import yaml; yaml.safe_load(open('scrapers/configs/test.yaml'))"

# Test config loading
python -c "
from scrapers.parser.yaml_parser import ScraperConfigParser
parser = ScraperConfigParser()
config = parser.load_from_file('scrapers/configs/test.yaml')
print(f'Config loaded: {config.name}')
print(f'Test SKUs: {config.test_skus}')
"
```

---

*Last updated: April 2026*
