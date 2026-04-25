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
from tests.evaluation.ground_truth_validator import (
    FieldError,
    FixtureValidationResult,
    validate_entry,
    validate_fixture,
    load_and_validate_fixture,
)

__all__ = [
    "EvaluationResult",
    "EvaluationReport",
    "FieldError",
    "FieldComparison",
    "FixtureValidationResult",
    "GroundTruthProduct",
    "MatchType",
    "SizeMetrics",
    "generate_evaluation_report",
    "load_and_validate_fixture",
    "validate_entry",
    "validate_fixture",
]
