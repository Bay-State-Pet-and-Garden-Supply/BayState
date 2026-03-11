"""Type definitions for AI scraper evaluation module."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class MatchType(Enum):
    """Type of match used for field comparison."""

    EXACT = "exact"
    FUZZY = "fuzzy"
    PARTIAL = "partial"
    NONE = "none"


@dataclass
class FieldComparison:
    """Comparison result for a single extracted field against ground truth."""

    field_name: str
    expected: Any
    actual: Any
    match_score: float  # 0.0 to 1.0
    match_type: MatchType

    def __post_init__(self):
        if not 0.0 <= self.match_score <= 1.0:
            raise ValueError("match_score must be between 0.0 and 1.0")


@dataclass
class SizeMetrics:
    """Size measurements for a product."""

    weight_oz: float | None = None
    length_in: float | None = None
    width_in: float | None = None
    height_in: float | None = None


@dataclass
class GroundTruthProduct:
    """Ground truth data for a product used in evaluation."""

    sku: str
    brand: str
    name: str
    description: str
    size_metrics: SizeMetrics | None = None
    images: list[str] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    price: float | None = None


@dataclass
class EvaluationResult:
    """Result of evaluating an AI extraction against ground truth."""

    sku: str
    success: bool
    field_comparisons: list[FieldComparison]
    accuracy: float  # Overall accuracy score 0.0 to 1.0
    cost: float  # Cost in USD
    timestamp: datetime = field(default_factory=datetime.utcnow)
    error_message: str | None = None
    extraction_time_ms: float | None = None

    def __post_init__(self):
        if not 0.0 <= self.accuracy <= 1.0:
            raise ValueError("accuracy must be between 0.0 and 1.0")

    @property
    def passed(self) -> bool:
        """Check if evaluation passed threshold."""
        return self.success and self.accuracy >= 0.8

    def get_field_score(self, field_name: str) -> float | None:
        """Get match score for a specific field."""
        for fc in self.field_comparisons:
            if fc.field_name == field_name:
                return fc.match_score
        return None
