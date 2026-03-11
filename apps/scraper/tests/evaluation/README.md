# AI Scraper Evaluation Module

This module provides the evaluation harness for comparing AI extraction results against ground truth data.

## Purpose

The evaluation module enables systematic testing of AI-powered web scraping by:

- Comparing extracted product data against known ground truth
- Computing accuracy scores for each field
- Tracking costs and performance metrics
- Generating pass/fail reports for quality assurance

## Installation

The module is part of the scraper tests package. Ensure your Python path includes the scraper directory:

```bash
export PYTHONPATH="${PYTHONPATH}:$(pwd)/apps/scraper"
```

## Key Classes

### EvaluationResult

Represents the complete evaluation of a single SKU extraction.

```python
from tests.evaluation import EvaluationResult

result = EvaluationResult(
    sku="SKU-123",
    success=True,
    field_comparisons=[...],
    accuracy=0.92,
    cost=0.015,
    extraction_time_ms=2500.0
)

if result.passed:
    print(f"SKU {result.sku} passed with {result.accuracy:.1%} accuracy")
```

**Properties:**
- `sku`: Product SKU evaluated
- `success`: Whether extraction completed without errors
- `field_comparisons`: List of per-field comparison results
- `accuracy`: Overall accuracy score (0.0 to 1.0)
- `cost`: API cost in USD
- `timestamp`: When evaluation ran
- `passed`: Boolean indicating if accuracy >= 80%

### FieldComparison

Comparison result for a single extracted field.

```python
from tests.evaluation import FieldComparison, MatchType

comparison = FieldComparison(
    field_name="brand",
    expected="Blue Buffalo",
    actual="Blue Buffalo",
    match_score=1.0,
    match_type=MatchType.EXACT
)
```

### GroundTruthProduct

Ground truth data for a product.

```python
from tests.evaluation import GroundTruthProduct, SizeMetrics

product = GroundTruthProduct(
    sku="SKU-456",
    brand="Purina",
    name="Purina Dog Food",
    description="Premium dog food for adult dogs",
    size_metrics=SizeMetrics(weight_oz=32.0, length_in=10.0, width_in=6.0, height_in=4.0),
    images=["https://example.com/img1.jpg"],
    categories=["Pet Supplies", "Dog Food"],
    price=29.99
)
```

## Usage

### Running Evaluations

```python
from tests.evaluation import EvaluationResult, GroundTruthProduct

# Load ground truth
ground_truth = GroundTruthProduct(...)

# Extract data (placeholder - integrate with actual AI extractor)
extracted_data = extract_product("SKU-123")

# Compare
result = evaluate_sku(ground_truth, extracted_data)
print(f"Accuracy: {result.accuracy:.1%}")
```

### Integration with pytest

```python
import pytest
from tests.evaluation import EvaluationResult, GroundTruthProduct

def test_product_extraction():
    ground_truth = GroundTruthProduct(...)
    result = evaluate_sku(ground_truth, extracted)
    assert result.passed, f"Failed: {result.error_message}"
```

## Structure

```
tests/evaluation/
├── __init__.py    # Exports
├── types.py       # Dataclasses
└── README.md      # This file
```

## Notes

- This is the evaluation structure only (Phase 2, Task 2.1)
- Evaluation logic will be implemented in subsequent tasks
- Ground truth fixtures are managed separately
