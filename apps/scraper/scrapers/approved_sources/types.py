"""Approved Source Plan types matching the coordinator-side TypeScript contracts.

These dataclasses/Pydantic models mirror the TypeScript ApprovedSourcePlan
and related types defined in apps/web/lib/approved-sources/types.ts.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


@dataclass
class ApprovedSourcePlanEntry:
    """Single entry in a source plan priority list."""

    sourceType: str  # "official_brand" | "distributor" | "internal" | "licensed_feed"
    sourceSlug: str
    displayName: str
    domains: list[str] = field(default_factory=list)
    assetDomains: list[str] = field(default_factory=list)
    adapterSlug: str = "crawl4ai_direct"
    requiresAuth: bool = False
    credentialRef: str | None = None
    searchMode: str = "domain_search"  # "sku_search" | "domain_search" | "direct_url" | "feed_lookup"
    allowedFields: list[str] = field(default_factory=list)
    priority: int = 100
    runFirst: bool = False


@dataclass
class ApprovedSourcePolicy:
    """Domain policy that the runner must enforce."""

    allowedDomains: list[str] = field(default_factory=list)
    allowedAssetDomains: list[str] = field(default_factory=list)
    disallowedDomains: list[str] = field(default_factory=list)
    approvedSourcesOnly: bool = True


@dataclass
class ApprovedSourceLLMPolicy:
    """LLM fallback policy."""

    enabled: bool = True
    onlyAfterDeterministicFailure: bool = True
    approvedSourcesOnly: bool = True


@dataclass
class ApprovedSourceBrand:
    """Brand info included in the source plan."""

    id: str
    name: str
    slug: str


@dataclass
class ApprovedSourcePlan:
    """Per-SKU source plan sent from the coordinator to the runner."""

    schemaVersion: str = "v1"
    sku: str = ""
    input: dict[str, Any] = field(default_factory=lambda: {"name": None, "price": None})
    brand: ApprovedSourceBrand | None = None
    selectedDistributorSlug: str | None = None
    priority: list[ApprovedSourcePlanEntry] = field(default_factory=list)
    sourcePolicy: ApprovedSourcePolicy = field(default_factory=ApprovedSourcePolicy)
    llmPolicy: ApprovedSourceLLMPolicy = field(default_factory=ApprovedSourceLLMPolicy)


# =============================================================================
# Failure codes for approved-source extraction
# =============================================================================


class FailureCode(str, Enum):
    """Well-known failure reasons for source-level extraction attempts."""

    AUTH_REQUIRED = "AUTH_REQUIRED"
    AUTH_EXPIRED = "AUTH_EXPIRED"
    POLICY_BLOCKED = "POLICY_BLOCKED"
    NO_MATCH = "NO_MATCH"
    EXTRACTION_FAILED = "EXTRACTION_FAILED"
    UNKNOWN = "UNKNOWN"


# =============================================================================
# Adapter extraction result types
# =============================================================================


@dataclass
class ApprovedSourceExtractionResult:
    """Result from a single adapter extraction attempt.

    This is an intermediate result type used internally by adapters.
    The final EnrichmentResultV1 is built by result_builder.py.
    """

    success: bool = False
    source_slug: str = ""
    source_type: str = "distributor"
    evidence_url: str | None = None
    product: dict[str, Any] = field(default_factory=dict)
    matched_fields: list[str] = field(default_factory=list)
    confidence: float = 0.0
    failure_code: FailureCode | None = None
    failure_message: str | None = None
    warnings: list[str] = field(default_factory=list)
    auth_required: bool = False


@dataclass
class AdapterSearchInput:
    """Structured input passed to adapters for searching."""

    sku: str
    name: str | None = None
    brand: str | None = None
    price: float | None = None


# =============================================================================
# Parsing helpers
# =============================================================================

DISALLOWED_DOMAINS: list[str] = [
    "amazon.com",
    "amzn.to",
    "chewy.com",
    "walmart.com",
    "petco.com",
    "petsmart.com",
    "ebay.com",
    "etsy.com",
    "google.com",
    "googleapis.com",
    "googlesyndication.com",
    "youtube.com",
    "target.com",
    "instacart.com",
    "shopify.com",
    "blogspot.com",
    "wordpress.com",
    "medium.com",
]


def parse_source_plan_entry(raw: dict[str, Any]) -> ApprovedSourcePlanEntry:
    """Parse a raw dict into an ApprovedSourcePlanEntry."""
    return ApprovedSourcePlanEntry(
        sourceType=raw.get("sourceType", "official_brand"),
        sourceSlug=raw.get("sourceSlug", ""),
        displayName=raw.get("displayName", ""),
        domains=list(raw.get("domains", [])),
        assetDomains=list(raw.get("assetDomains", [])),
        adapterSlug=raw.get("adapterSlug", "crawl4ai_direct"),
        requiresAuth=bool(raw.get("requiresAuth", False)),
        credentialRef=raw.get("credentialRef"),
        searchMode=raw.get("searchMode", "domain_search"),
        allowedFields=list(raw.get("allowedFields", [])),
        priority=int(raw.get("priority", 100)),
        runFirst=bool(raw.get("runFirst", False)),
    )


def parse_source_policy(raw: dict[str, Any]) -> ApprovedSourcePolicy:
    """Parse a raw dict into an ApprovedSourcePolicy."""
    return ApprovedSourcePolicy(
        allowedDomains=list(raw.get("allowedDomains", [])),
        allowedAssetDomains=list(raw.get("allowedAssetDomains", [])),
        disallowedDomains=list(raw.get("disallowedDomains", DISALLOWED_DOMAINS)),
        approvedSourcesOnly=bool(raw.get("approvedSourcesOnly", True)),
    )


def parse_llm_policy(raw: dict[str, Any]) -> ApprovedSourceLLMPolicy:
    """Parse a raw dict into an ApprovedSourceLLMPolicy."""
    return ApprovedSourceLLMPolicy(
        enabled=bool(raw.get("enabled", True)),
        onlyAfterDeterministicFailure=bool(raw.get("onlyAfterDeterministicFailure", True)),
        approvedSourcesOnly=bool(raw.get("approvedSourcesOnly", True)),
    )


def parse_source_plan(raw: dict[str, Any]) -> ApprovedSourcePlan:
    """Parse a raw dict (from coordinator JSON) into an ApprovedSourcePlan."""
    brand_raw = raw.get("brand")
    brand: ApprovedSourceBrand | None = None
    if brand_raw and isinstance(brand_raw, dict):
        brand = ApprovedSourceBrand(
            id=str(brand_raw.get("id", "")),
            name=str(brand_raw.get("name", "")),
            slug=str(brand_raw.get("slug", "")),
        )

    priority: list[ApprovedSourcePlanEntry] = []
    for entry_raw in raw.get("priority", []):
        if isinstance(entry_raw, dict):
            priority.append(parse_source_plan_entry(entry_raw))

    return ApprovedSourcePlan(
        schemaVersion=raw.get("schemaVersion", "v1"),
        sku=raw.get("sku", ""),
        input=dict(raw.get("input", {})),
        brand=brand,
        selectedDistributorSlug=raw.get("selectedDistributorSlug"),
        priority=priority,
        sourcePolicy=parse_source_policy(raw.get("sourcePolicy", {})),
        llmPolicy=parse_llm_policy(raw.get("llmPolicy", {})),
    )
