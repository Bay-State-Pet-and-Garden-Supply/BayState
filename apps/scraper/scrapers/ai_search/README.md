# Two-Step Search Refinement

## Overview

Two-step search refinement is an advanced AI-powered technique that improves product discovery accuracy when initial search results have low confidence. It works by analyzing the initial search results, extracting a canonical product name using an LLM, then performing a second search with the refined query.

This feature is particularly useful for products with abbreviated or ambiguous names where the initial search might not return high-confidence results. By extracting the full canonical name from search snippets and re-querying, the system can often find better product pages.

### Key Benefits

- **Improved accuracy**: Second-pass searches often yield higher-confidence results for ambiguous products
- **Handles abbreviations**: Automatically expands abbreviated names (e.g., "ADVNTG" → "Advantage", "LRG" → "Large")
- **Intelligent triggering**: Only runs when first-pass confidence is below configurable thresholds
- **Cost protection**: Circuit breaker prevents unnecessary second searches when first pass is already good
- **A/B validation**: Ensures second pass only accepted if confidence improves by minimum delta

## How It Works

The two-step refinement follows this workflow:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TWO-STEP SEARCH WORKFLOW                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. FIRST PASS SEARCH                                               │
│     ├── Search by SKU: "12345 ADVNTG CAT FOOD LRG"                  │
│     ├── Collect search results                                      │
│     └── Estimate confidence score (e.g., 0.65)                      │
│                                                                     │
│  2. TRIGGER CHECK                                                   │
│     ├── Is confidence < secondary_threshold (0.75)?     YES ✓       │
│     ├── Is confidence < circuit_breaker (0.85)?         YES ✓       │
│     └── Trigger second pass                                         │
│                                                                     │
│  3. NAME CONSOLIDATION (LLM)                                        │
│     ├── Send search snippets to NameConsolidator                    │
│     ├── LLM extracts canonical name from context                    │
│     └── Output: "Advantage Large Breed Cat Food"                    │
│                                                                     │
│  4. SECOND PASS SEARCH                                              │
│     ├── Search by refined query: "Advantage Large Breed Cat Food"   │
│     ├── Collect new search results                                  │
│     └── Score candidates (e.g., 0.88 confidence)                    │
│                                                                     │
│  5. RESULT SELECTION                                                │
│     ├── Compare first pass (0.65) vs second pass (0.88)             │
│     ├── Is improvement >= confidence_delta (0.1)?       YES ✓       │
│     └── Use second pass result                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Detailed Flow

1. **First Pass**: Initial search by SKU/product name generates raw search results and a confidence estimate

2. **Trigger Evaluation**: The system checks if a second pass should run:
   - Confidence must be below `secondary_threshold` (default: 0.75)
   - Confidence must be below `circuit_breaker_threshold` (default: 0.85)
   - Maximum follow-up queries budget not exceeded

3. **Name Consolidation**: If triggered, the `NameConsolidator` LLM analyzes search snippets to extract the canonical product name

4. **Second Pass**: A new search executes with the refined product name

5. **Result Selection**: The best candidate from the second pass is selected only if:
   - The confidence improved by at least `confidence_delta` (default: 0.1)
   - The result is different from the first pass (new URL or significantly better confidence)

## Configuration

Two-step refinement is disabled by default. Enable and configure it using these environment variables:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `AI_SEARCH_ENABLE_TWO_STEP` | boolean | `false` | Master switch to enable two-step refinement |
| `AI_SEARCH_SECONDARY_THRESHOLD` | float | `0.75` | Confidence threshold below which second pass triggers |
| `AI_SEARCH_CIRCUIT_BREAKER_THRESHOLD` | float | `0.85` | Confidence threshold above which second pass is skipped (already good enough) |
| `AI_SEARCH_CONFIDENCE_DELTA` | float | `0.1` | Minimum confidence improvement required to accept second pass result |
| `AI_SEARCH_MAX_FOLLOW_UP_QUERIES` | integer | `2` | Maximum number of follow-up queries allowed per product |

### Configuration Examples

**Conservative (minimize costs):**
```bash
AI_SEARCH_ENABLE_TWO_STEP=true
AI_SEARCH_SECONDARY_THRESHOLD=0.65
AI_SEARCH_CIRCUIT_BREAKER_THRESHOLD=0.90
AI_SEARCH_CONFIDENCE_DELTA=0.15
```

**Aggressive (maximize accuracy):**
```bash
AI_SEARCH_ENABLE_TWO_STEP=true
AI_SEARCH_SECONDARY_THRESHOLD=0.80
AI_SEARCH_CIRCUIT_BREAKER_THRESHOLD=0.85
AI_SEARCH_CONFIDENCE_DELTA=0.05
```

**Balanced (recommended):**
```bash
AI_SEARCH_ENABLE_TWO_STEP=true
AI_SEARCH_SECONDARY_THRESHOLD=0.75
AI_SEARCH_CIRCUIT_BREAKER_THRESHOLD=0.85
AI_SEARCH_CONFIDENCE_DELTA=0.10
```

### Threshold Behavior

The relationship between thresholds works as follows:

- **Confidence < secondary_threshold**: Second pass triggers
- **secondary_threshold <= Confidence < circuit_breaker**: Second pass triggers
- **Confidence >= circuit_breaker**: Second pass skipped (circuit breaker)

This creates a "dead zone" between the two thresholds where refinement may occur, depending on other factors like query budget.

## When to Enable

Two-step refinement is most beneficial in these scenarios:

### Recommended Use Cases

1. **Abbreviated Product Names**
   - Product catalogs use abbreviations ("ADVNTG", "FRNTLN", "LRG")
   - Initial searches return generic or mismatched results
   - Full names exist in search result snippets

2. **Low First-Pass Confidence**
   - Many products scoring 0.6-0.75 on initial search
   - Results are aggregator sites rather than manufacturer pages
   - Brand information is missing or ambiguous

3. **Diverse Product Catalog**
   - Mix of well-known and obscure brands
   - Products with complex naming conventions
   - New SKUs without established search presence

### When NOT to Enable

1. **Well-Named Products**
   - Products already have clear, searchable names
   - First-pass confidence consistently above 0.85

2. **Cost-Conscious Operations**
   - Budget constraints make 2x cost increase unacceptable
   - Products are low-margin or low-priority

3. **Fast Turnaround Required**
   - Additional LLM call adds latency (500-1500ms)
   - Real-time operations where speed matters more than accuracy

## Cost Implications

Two-step refinement increases costs because it performs an additional LLM call during the name consolidation phase.

### Cost Breakdown

| Component | Approximate Cost | Notes |
|-----------|-----------------|-------|
| First Pass Search | $0.00-0.01 | Search API (SerpAPI, Brave, etc.) |
| Name Consolidation | $0.001-0.003 | LLM call to extract canonical name |
| Second Pass Search | $0.00-0.01 | Additional search API call |
| **Total with Two-Step** | **$0.001-0.023** | When triggered |
| Total without Two-Step | $0.00-0.01 | Standard single pass |

### Expected Cost Increase

- **When triggered**: ~2x cost increase due to additional LLM call and second search
- **Trigger rate**: Depends on threshold configuration and product catalog
  - With threshold 0.75: ~20-40% of searches may trigger
  - With threshold 0.65: ~10-20% of searches may trigger
- **Net impact**: Typically 10-20% total cost increase for full catalog

### Cost Optimization Tips

1. **Tune thresholds**: Higher `secondary_threshold` = fewer triggers = lower cost
2. **Use circuit breaker**: Keep `circuit_breaker_threshold` high to skip already-good results
3. **Increase confidence delta**: Higher delta means fewer second-pass results accepted
4. **Monitor telemetry**: Track `two_step_triggered` rate to optimize

## Code Example

### Basic Usage

```python
import asyncio
from scrapers.ai_search.scraper import AISearchScraper

async def main():
    # Enable two-step refinement via environment or constructor
    import os
    os.environ["AI_SEARCH_ENABLE_TWO_STEP"] = "true"
    
    # Create scraper with two-step enabled
    scraper = AISearchScraper(
        headless=True,
        confidence_threshold=0.7,
        llm_model="gpt-4o-mini",
    )
    
    # Scrape a product with abbreviated name
    result = await scraper.scrape_product(
        sku="12345",
        product_name="ADVNTG CAT LRG",
        brand="Advantage",
        category="Pet Food"
    )
    
    if result.success:
        print(f"Found: {result.product_name}")
        print(f"URL: {result.url}")
        print(f"Confidence: {result.confidence}")
    else:
        print(f"Failed: {result.error}")

asyncio.run(main())
```

### Advanced: Direct Refiner Usage

```python
import asyncio
from scrapers.ai_search.two_step_refiner import TwoStepSearchRefiner
from scrapers.ai_search.search import SearchClient
from scrapers.ai_search.query_builder import QueryBuilder
from scrapers.ai_search.name_consolidator import NameConsolidator
from scrapers.ai_search.models import AISearchResult

async def refine_search():
    # Initialize components
    search_client = SearchClient(max_results=15)
    query_builder = QueryBuilder()
    name_consolidator = NameConsolidator(model="gpt-4o-mini")
    
    # Configure thresholds
    config = {
        "confidence_threshold_low": 0.75,
        "confidence_threshold_high": 0.85,
        "min_improvement_delta": 0.1,
        "max_follow_up_queries": 1,
    }
    
    # Create refiner
    refiner = TwoStepSearchRefiner(
        search_client=search_client,
        query_builder=query_builder,
        config=config,
        name_consolidator=name_consolidator,
    )
    
    # Initial result from first pass
    initial_result = AISearchResult(
        success=True,
        sku="12345",
        product_name="ADVNTG CAT LRG",
        brand="Advantage",
        url="https://example.com/product/12345",
        confidence=0.65,
    )
    
    # First pass search results (raw)
    first_pass_results = [
        {"title": "Advantage Large Cat Food", "url": "...", "description": "..."},
        # ... more results
    ]
    
    # Attempt refinement
    refinement = await refiner.refine(
        initial_result=initial_result,
        first_pass_results=first_pass_results,
        first_pass_confidence=0.65,
    )
    
    if refinement.two_step_triggered:
        print(f"Two-step triggered: {refinement.two_step_triggered}")
        print(f"Product name extracted: {refinement.product_name_extracted}")
        print(f"First pass confidence: {refinement.first_pass_confidence}")
        print(f"Second pass confidence: {refinement.second_pass_confidence}")
        print(f"Improvement: {refinement.two_step_improved}")
        print(f"Cost: ${refinement.cost_usd:.4f}")
    else:
        print("Two-step not triggered (confidence too high or disabled)")

asyncio.run(refine_search())
```

### Batch Processing with Telemetry

```python
import asyncio
from scrapers.ai_search.scraper import AISearchScraper

async def process_batch():
    scraper = AISearchScraper(
        headless=True,
        confidence_threshold=0.7,
    )
    
    items = [
        {"sku": "12345", "product_name": "ADVNTG CAT LRG", "brand": "Advantage"},
        {"sku": "67890", "product_name": "FRNTLN DOG SML", "brand": "Frontline"},
        {"sku": "11111", "product_name": "CLR CHL 5G", "brand": "ClearChoice"},
    ]
    
    results = await scraper.scrape_products_batch(
        items=items,
        max_concurrency=4,
    )
    
    for item, result in zip(items, results):
        print(f"\nSKU: {item['sku']}")
        print(f"  Success: {result.success}")
        print(f"  Confidence: {result.confidence}")
        print(f"  Method: {result.selection_method}")  # "two-step-search" or "first-pass-search"

asyncio.run(process_batch())
```

## Telemetry

Two-step refinement captures detailed telemetry for monitoring and optimization.

### Logged Metrics

The following metrics are recorded during operation:

| Metric | Type | Description |
|--------|------|-------------|
| `two_step_triggered` | boolean | Whether second pass was attempted |
| `two_step_improved` | boolean | Whether second pass improved confidence sufficiently |
| `first_pass_confidence` | float | Confidence score from initial search (0.0-1.0) |
| `second_pass_confidence` | float | Confidence score from refined search (0.0-1.0) |
| `product_name_extracted` | string | The canonical name extracted by LLM |
| `cost_usd` | float | Cost of name consolidation LLM call |

### Log Output Example

```
[Name Consolidator] Inferred name: 'Advantage Large Breed Cat Food' from abbreviation 'ADVNTG CAT LRG' (Cost: $0.0012)
[AI Search] Using two-step refined results for SKU 12345 (0.65 -> 0.88)
```

### Job-Level Summary

At job completion, a telemetry summary is logged:

```json
{
  "sku": "12345",
  "total_urls": 5,
  "successful": 1,
  "failed": 4,
  "llm_heuristic_agreement_rate": 0.8,
  "by_stage": {
    "source_selected": 5,
    "fetch_attempt": 5,
    "fetch_ok": 3,
    "fetch_fail": 2,
    "extraction": 3,
    "validation": 3,
    "validation_pass": 1,
    "validation_fail": 2
  }
}
```

### Monitoring Recommendations

1. **Track trigger rate**: Monitor what percentage of searches trigger two-step
2. **Measure improvement rate**: Of triggered searches, what percentage show improvement
3. **Average cost per refinement**: Track LLM costs to optimize thresholds
4. **Confidence distribution**: Compare first-pass vs second-pass confidence scores

### Prometheus Metrics

If Prometheus monitoring is enabled, two-step refinement contributes to:

- `ai_search_refinement_triggered_total`: Counter of triggered refinements
- `ai_search_refinement_improved_total`: Counter of successful improvements
- `ai_search_refinement_cost_usd`: Histogram of refinement costs
- `ai_search_confidence_score`: Gauge of confidence scores (labeled by pass)

## Troubleshooting

### Two-step never triggers

1. Check `AI_SEARCH_ENABLE_TWO_STEP=true` is set
2. Verify products have confidence below `secondary_threshold`
3. Check that products are below `circuit_breaker_threshold`
4. Review logs for "Two-step refinement skipped" messages

### Low improvement rate

1. Lower `confidence_delta` to accept smaller improvements
2. Check that product names are actually abbreviated/ambiguous
3. Verify NameConsolidator is extracting good names from snippets

### High costs

1. Raise `secondary_threshold` to trigger less frequently
2. Raise `circuit_breaker_threshold` to skip more good first passes
3. Raise `confidence_delta` to require larger improvements
4. Reduce `AI_SEARCH_MAX_FOLLOW_UP_QUERIES`

### Name consolidation failures

1. Check OPENAI_API_KEY is configured
2. Verify search snippets contain useful product information
3. Review NameConsolidator logs for error messages

## Related Documentation

- [AI Search Scraper](scraper.py) - Main scraper implementation
- [Name Consolidator](name_consolidator.py) - LLM-based name extraction
- [Two-Step Refiner](two_step_refiner.py) - Core refinement logic
- [AI Search Models](models.py) - Data models and types
