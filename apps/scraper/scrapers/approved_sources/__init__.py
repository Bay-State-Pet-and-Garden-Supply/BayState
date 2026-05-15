"""Approved Source Extraction package.

This package implements the runner-side of the Approved Source Extraction system:
- types.py — Plan types, extraction result types, failure codes
- policy.py — Domain policy gate enforcing approved sources only
- result_builder.py — Build valid EnrichmentResultV1 objects
- executor.py — Distributor-first + SERP/AI fallback orchestration
- orchestrator.py — Thin wrapper around executor (backward compat)
- adapters/ — Source-specific Crawl4AI adapters
"""

from scrapers.approved_sources.types import (
    ApprovedSourcePlan,
    ApprovedSourcePlanEntry,
    ApprovedSourcePolicy,
    ApprovedSourceLLMPolicy,
    ApprovedSourceBrand,
    ApprovedSourceExtractionResult,
    FailureCode,
    parse_source_plan,
)
from scrapers.approved_sources.policy import (
    normalize_domain,
    is_disallowed_domain,
    is_domain_allowed,
    is_asset_domain_allowed,
    validate_url_allowed,
    validate_asset_url,
    filter_allowed_assets,
)
from scrapers.approved_sources.result_builder import (
    build_success_result,
    build_partial_result,
    build_auth_required_result,
    build_auth_failed_result,
    build_auth_expired_result,
    build_no_match_result,
    build_policy_blocked_result,
    build_failed_result,
)
from scrapers.approved_sources.executor import ApprovedSourceExecutor
from scrapers.approved_sources.orchestrator import ApprovedSourceOrchestrator

__all__ = [
    "ApprovedSourcePlan",
    "ApprovedSourcePlanEntry",
    "ApprovedSourcePolicy",
    "ApprovedSourceLLMPolicy",
    "ApprovedSourceBrand",
    "ApprovedSourceExtractionResult",
    "FailureCode",
    "parse_source_plan",
    "normalize_domain",
    "is_disallowed_domain",
    "is_domain_allowed",
    "is_asset_domain_allowed",
    "validate_url_allowed",
    "validate_asset_url",
    "filter_allowed_assets",
    "build_success_result",
    "build_partial_result",
    "build_auth_required_result",
    "build_no_match_result",
    "build_policy_blocked_result",
    "build_failed_result",
    "ApprovedSourceExecutor",
    "ApprovedSourceOrchestrator",
]
