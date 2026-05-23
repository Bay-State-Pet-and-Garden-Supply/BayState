"""Result builder for approved-source extraction.

Builds valid EnrichmentResultV1 objects for success, partial, auth-required,
no-match, policy-blocked, and generic failure cases.

Every function returns a complete EnrichmentResultV1 with proper provenance,
decision, llm_used, and source_results fields.
"""

from __future__ import annotations

from typing import Any

from scrapers.ai_search.enrichment_models import (
    EnrichmentAttemptSummary,
    EnrichmentConfidence,
    EnrichmentResultSource,
    EnrichmentResultV1,
    EnrichmentValidation,
    EnrichedProductFacts,
    RequestedExtractionMode,
    SourceResultInfo,
    now_iso,
)


def _coerce_evidence_url(evidence_url: str | None) -> str:
    return evidence_url or "approved_source_extraction"


def _build_source_results(
    source_slug: str,
    source_type: str,
    confidence: float,
    evidence_url: str | None,
    matched_fields: list[str] | None = None,
    product: EnrichedProductFacts | None = None,
    source_results: list[SourceResultInfo] | None = None,
) -> list[SourceResultInfo]:
    if source_results:
        return source_results

    return [
        SourceResultInfo(
            sourceSlug=source_slug,
            sourceType=source_type,
            confidence=confidence,
            matchedFields=matched_fields or [],
            evidenceUrl=evidence_url,
            product=product,
        )
    ]


def build_success_result(
    upc: str,
    source_slug: str,
    source_type: str,
    evidence_url: str,
    product_fields: dict[str, Any],
    matched_fields: list[str],
    overall_confidence: float,
    field_confidences: dict[str, float] | None = None,
    llm_used: bool = False,
    warnings: list[str] | None = None,
    sku_match: bool = True,
    requested_extraction_mode: RequestedExtractionMode | None = None,
    source_results: list[SourceResultInfo] | None = None,
) -> EnrichmentResultV1:
    """Build a successful enrichment result with deterministic extraction.

    decision = deterministic_success (or llm_fallback if llm_used=True)
    """
    decision = "llm_fallback" if llm_used else "deterministic_success"

    product = _map_product_fields(product_fields)
    resolved_evidence_url = _coerce_evidence_url(evidence_url)

    return EnrichmentResultV1(
        schema_version="v1",
        upc=upc,
        source=EnrichmentResultSource(
            url=resolved_evidence_url,
            domain=_extract_domain(resolved_evidence_url),
            source_type=source_type,
            source_slug=source_slug,
            evidence="Deterministic extraction matched UPC on approved source",
        ),
        status="success",
        extracted_at=now_iso(),
        mode="mixed",
        requested_extraction_mode=requested_extraction_mode,
        product=product,
        confidence=EnrichmentConfidence(
            overall=overall_confidence,
            fields=field_confidences or {},
        ),
        validation=EnrichmentValidation(
            upc_match=sku_match,
            warnings=warnings or [],
            missing_required=[],
        ),
        attempts=[
            EnrichmentAttemptSummary(
                mode="structured",
                status="success",
            )
        ],
        decision=decision,
        llm_used=llm_used,
        source_results=_build_source_results(
            source_slug=source_slug,
            source_type=source_type,
            confidence=overall_confidence,
            evidence_url=resolved_evidence_url,
            matched_fields=matched_fields,
            product=product,
            source_results=source_results,
        ),
    )


def build_partial_result(
    upc: str,
    source_slug: str,
    source_type: str,
    evidence_url: str,
    product_fields: dict[str, Any],
    matched_fields: list[str],
    overall_confidence: float,
    field_confidences: dict[str, float] | None = None,
    llm_used: bool = False,
    warnings: list[str] | None = None,
    missing_required: list[str] | None = None,
    sku_match: bool = True,
    requested_extraction_mode: RequestedExtractionMode | None = None,
    source_results: list[SourceResultInfo] | None = None,
) -> EnrichmentResultV1:
    """Build a partial enrichment result (some fields found, some missing).

    decision = deterministic_partial (or llm_fallback if llm_used=True)
    """
    decision = "llm_fallback" if llm_used else "deterministic_partial"

    product = _map_product_fields(product_fields)
    resolved_evidence_url = _coerce_evidence_url(evidence_url)

    return EnrichmentResultV1(
        schema_version="v1",
        upc=upc,
        source=EnrichmentResultSource(
            url=resolved_evidence_url,
            domain=_extract_domain(resolved_evidence_url),
            source_type=source_type,
            source_slug=source_slug,
            evidence="Partial extraction on approved source",
        ),
        status="partial",
        extracted_at=now_iso(),
        mode="mixed",
        requested_extraction_mode=requested_extraction_mode,
        product=product,
        confidence=EnrichmentConfidence(
            overall=overall_confidence,
            fields=field_confidences or {},
        ),
        validation=EnrichmentValidation(
            upc_match=sku_match,
            warnings=warnings or [],
            missing_required=missing_required or [],
        ),
        attempts=[
            EnrichmentAttemptSummary(
                mode="structured",
                status="partial",
            )
        ],
        decision=decision,
        llm_used=llm_used,
        source_results=_build_source_results(
            source_slug=source_slug,
            source_type=source_type,
            confidence=overall_confidence,
            evidence_url=resolved_evidence_url,
            matched_fields=matched_fields,
            product=product,
            source_results=source_results,
        ),
    )


def build_auth_required_result(
    upc: str,
    source_slug: str,
    source_type: str = "distributor",
    message: str | None = None,
    evidence_url: str | None = None,
    requested_extraction_mode: RequestedExtractionMode | None = None,
    source_results: list[SourceResultInfo] | None = None,
) -> EnrichmentResultV1:
    """Build a failed result for auth-gated distributors with no usable session.

    Returns a legitimate EnrichmentResultV1 with failed status and AUTH_REQUIRED
    warning, so the runner can still progress to the next source.
    """
    warning = message or f"AUTH_REQUIRED: Authentication required for {source_slug}; no usable session"
    resolved_evidence_url = _coerce_evidence_url(evidence_url)

    return EnrichmentResultV1(
        schema_version="v1",
        upc=upc,
        source=EnrichmentResultSource(
            url=resolved_evidence_url,
            source_type=source_type,
            source_slug=source_slug,
        ),
        status="failed",
        extracted_at=now_iso(),
        mode="mixed",
        requested_extraction_mode=requested_extraction_mode,
        product=EnrichedProductFacts(),
        confidence=EnrichmentConfidence(overall=0.0),
        validation=EnrichmentValidation(
            upc_match=False,
            warnings=[warning],
            missing_required=[],
        ),
        attempts=[
            EnrichmentAttemptSummary(
                mode="structured",
                status="failed",
                error=warning,
            )
        ],
        decision="failed",
        llm_used=False,
        source_results=_build_source_results(
            source_slug=source_slug,
            source_type=source_type,
            confidence=0.0,
            evidence_url=resolved_evidence_url,
            source_results=source_results,
        ),
    )


def build_auth_failed_result(
    upc: str,
    source_slug: str,
    source_type: str = "distributor",
    message: str | None = None,
    evidence_url: str | None = None,
    requested_extraction_mode: RequestedExtractionMode | None = None,
    source_results: list[SourceResultInfo] | None = None,
) -> EnrichmentResultV1:
    """Build a failed result when login fails (wrong credentials).

    Returns a legitimate EnrichmentResultV1 with failed status and
    AUTH_FAILED warning, so the runner can progress to the next source.
    """
    warning = message or f"AUTH_FAILED: Login failed for {source_slug}"
    resolved_evidence_url = _coerce_evidence_url(evidence_url)

    return EnrichmentResultV1(
        schema_version="v1",
        upc=upc,
        source=EnrichmentResultSource(
            url=resolved_evidence_url,
            source_type=source_type,
            source_slug=source_slug,
        ),
        status="failed",
        extracted_at=now_iso(),
        mode="mixed",
        requested_extraction_mode=requested_extraction_mode,
        product=EnrichedProductFacts(),
        confidence=EnrichmentConfidence(overall=0.0),
        validation=EnrichmentValidation(
            upc_match=False,
            warnings=[warning],
            missing_required=[],
        ),
        attempts=[
            EnrichmentAttemptSummary(
                mode="structured",
                status="failed",
                error=warning,
            )
        ],
        decision="failed",
        llm_used=False,
        source_results=_build_source_results(
            source_slug=source_slug,
            source_type=source_type,
            confidence=0.0,
            evidence_url=resolved_evidence_url,
            source_results=source_results,
        ),
    )


def build_auth_expired_result(
    upc: str,
    source_slug: str,
    source_type: str = "distributor",
    message: str | None = None,
    evidence_url: str | None = None,
    requested_extraction_mode: RequestedExtractionMode | None = None,
    source_results: list[SourceResultInfo] | None = None,
) -> EnrichmentResultV1:
    """Build a failed result when an existing session has expired.

    Returns a legitimate EnrichmentResultV1 with failed status and
    AUTH_EXPIRED warning, so the runner can progress to the next source.
    """
    warning = message or f"AUTH_EXPIRED: Session expired for {source_slug}; re-login required"
    resolved_evidence_url = _coerce_evidence_url(evidence_url)

    return EnrichmentResultV1(
        schema_version="v1",
        upc=upc,
        source=EnrichmentResultSource(
            url=resolved_evidence_url,
            source_type=source_type,
            source_slug=source_slug,
        ),
        status="failed",
        extracted_at=now_iso(),
        mode="mixed",
        requested_extraction_mode=requested_extraction_mode,
        product=EnrichedProductFacts(),
        confidence=EnrichmentConfidence(overall=0.0),
        validation=EnrichmentValidation(
            upc_match=False,
            warnings=[warning],
            missing_required=[],
        ),
        attempts=[
            EnrichmentAttemptSummary(
                mode="structured",
                status="failed",
                error=warning,
            )
        ],
        decision="failed",
        llm_used=False,
        source_results=_build_source_results(
            source_slug=source_slug,
            source_type=source_type,
            confidence=0.0,
            evidence_url=resolved_evidence_url,
            source_results=source_results,
        ),
    )


def build_no_match_result(
    upc: str,
    source_slug: str,
    source_type: str = "distributor",
    evidence_url: str | None = None,
    requested_extraction_mode: RequestedExtractionMode | None = None,
    source_results: list[SourceResultInfo] | None = None,
) -> EnrichmentResultV1:
    """Build a failed result when a source returned no matching product."""
    resolved_evidence_url = _coerce_evidence_url(evidence_url)
    return EnrichmentResultV1(
        schema_version="v1",
        upc=upc,
        source=EnrichmentResultSource(
            url=resolved_evidence_url,
            source_type=source_type,
            source_slug=source_slug,
        ),
        status="failed",
        extracted_at=now_iso(),
        mode="mixed",
        requested_extraction_mode=requested_extraction_mode,
        product=EnrichedProductFacts(),
        confidence=EnrichmentConfidence(overall=0.0),
        validation=EnrichmentValidation(
            upc_match=False,
            warnings=[f"No match found for UPC {upc} on {source_slug}"],
            missing_required=["sku_match"],
        ),
        attempts=[
            EnrichmentAttemptSummary(
                mode="structured",
                status="failed",
                error=f"No product match for UPC {upc}",
            )
        ],
        decision="failed",
        llm_used=False,
        source_results=_build_source_results(
            source_slug=source_slug,
            source_type=source_type,
            confidence=0.0,
            evidence_url=resolved_evidence_url,
            source_results=source_results,
        ),
    )


def build_policy_blocked_result(
    upc: str,
    source_slug: str,
    blocked_url: str,
    reason: str = "Domain is not allowed by source policy",
    requested_extraction_mode: RequestedExtractionMode | None = None,
    source_results: list[SourceResultInfo] | None = None,
) -> EnrichmentResultV1:
    """Build a failed result when a URL is blocked by the domain policy."""
    return EnrichmentResultV1(
        schema_version="v1",
        upc=upc,
        source=EnrichmentResultSource(
            url=blocked_url,
            source_type="distributor",
            source_slug=source_slug,
        ),
        status="failed",
        extracted_at=now_iso(),
        mode="mixed",
        requested_extraction_mode=requested_extraction_mode,
        product=EnrichedProductFacts(),
        confidence=EnrichmentConfidence(overall=0.0),
        validation=EnrichmentValidation(
            upc_match=False,
            warnings=[reason],
            missing_required=[],
        ),
        attempts=[
            EnrichmentAttemptSummary(
                mode="structured",
                status="failed",
                error=reason,
            )
        ],
        decision="failed",
        llm_used=False,
        source_results=_build_source_results(
            source_slug=source_slug,
            source_type="distributor",
            confidence=0.0,
            evidence_url=blocked_url,
            source_results=source_results,
        ),
    )


def build_failed_result(
    upc: str,
    source_slug: str | None = None,
    source_type: str = "distributor",
    error_message: str = "All approved source extraction attempts failed",
    evidence_url: str | None = None,
    requested_extraction_mode: RequestedExtractionMode | None = None,
    source_results: list[SourceResultInfo] | None = None,
) -> EnrichmentResultV1:
    """Build a generic failed enrichment result.

    Used when all sources failed (no match, auth required, etc.).

    The web callback contract requires ``source.url`` to be non-empty even for
    failed results, so fall back to the approved-source sentinel when we do not
    have a concrete evidence URL.
    """
    resolved_evidence_url = _coerce_evidence_url(evidence_url)
    return EnrichmentResultV1(
        schema_version="v1",
        upc=upc,
        source=EnrichmentResultSource(
            url=resolved_evidence_url,
            source_type=source_type,
            source_slug=source_slug or "",
        ),
        status="failed",
        extracted_at=now_iso(),
        mode="mixed",
        requested_extraction_mode=requested_extraction_mode,
        product=EnrichedProductFacts(),
        confidence=EnrichmentConfidence(overall=0.0),
        validation=EnrichmentValidation(
            upc_match=False,
            warnings=[error_message],
        ),
        attempts=[
            EnrichmentAttemptSummary(
                mode="mixed",
                status="failed",
                error=error_message,
            )
        ],
        decision="failed",
        llm_used=False,
        source_results=source_results or [],
    )


# =============================================================================
# Internal helpers
# =============================================================================


def _map_product_fields(fields: dict[str, Any]) -> EnrichedProductFacts:
    """Map a dict of product fields into EnrichedProductFacts.

    Accepts both camelCase (from internal adapters) and snake_case keys.
    """
    return EnrichedProductFacts(
        name=fields.get("name") or fields.get("title"),
        brand=fields.get("brand"),
        description=fields.get("description"),
        category=fields.get("category"),
        upc=fields.get("upc"),
        weight=fields.get("weight"),
        dimensions=fields.get("dimensions"),
        shipping_weight=fields.get("shipping_weight"),
        image_urls=fields.get("image_urls", fields.get("images", [])),
        ingredients=fields.get("ingredients"),
        features=fields.get("features", []),
        pet_type=fields.get("pet_type"),
        life_stage=fields.get("life_stage"),
        pet_size=fields.get("pet_size"),
        food_form=fields.get("food_form"),
        flavor=fields.get("flavor"),
        special_diet=fields.get("special_diet", []),
        health_feature=fields.get("health_feature", []),
        packaging_type=fields.get("packaging_type"),
        size=fields.get("size"),
        color=fields.get("color"),
        guaranteed_analysis=fields.get("guaranteed_analysis"),
        npk_ratio=fields.get("npk_ratio"),
        unit_value=fields.get("unit_value"),
        unit_type=fields.get("unit_type"),
    )


def _extract_domain(url: str) -> str | None:
    """Extract a clean domain from a URL."""
    if not url:
        return None
    try:
        from urllib.parse import urlparse

        parsed = urlparse(url)
        return parsed.hostname or None
    except Exception:
        return None
