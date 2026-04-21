"""
ProductScraper Core Module
Provides core functionality for scraping, data processing, and platform integration.
"""

from __future__ import annotations


from .failure_classifier import FailureClassifier, FailureContext, FailureType

__all__ = [
    "FailureClassifier",
    "FailureContext",
    "FailureType",
]
