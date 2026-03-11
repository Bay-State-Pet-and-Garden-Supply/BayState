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
from tests.evaluation.report_generator import EvaluationReport, generate_evaluation_report

__all__ = [
    "EvaluationResult",
    "EvaluationReport",
    "FieldComparison",
    "GroundTruthProduct",
    "MatchType",
    "SizeMetrics",
    "generate_evaluation_report",
]
