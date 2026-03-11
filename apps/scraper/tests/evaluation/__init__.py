"""Evaluation module for AI scraper testing framework.

This module provides types and utilities for evaluating AI extraction
results against ground truth data.
"""

from tests.evaluation.types import (
    EvaluationResult,
    FieldComparison,
    GroundTruthProduct,
    MatchType,
    SizeMetrics,
)

__all__ = [
    "EvaluationResult",
    "FieldComparison",
    "GroundTruthProduct",
    "MatchType",
    "SizeMetrics",
]
