"""SERP Candidate Discovery Adapter — strict UPC-gated SERP/open-web discovery.

V2 staged cascade stage: serp

This is a thin wrapper around the existing SerpDiscoveryAdapter that:
1. Delegates URL discovery to SerpDiscoveryAdapter's methods.
2. Applies UPC proof gates to determine 'found' vs 'not_stocked'.
3. Only emits 'found' when exact UPC evidence passes gates.
4. Emits 'not_stocked' with resolutionEvidence candidates otherwise.

This avoids invasive edits to the large serp_discovery.py while adding
strict UPC gating for the V2 cascade.
"""

from __future__ import annotations

import logging
from typing import Any

from scrapers.approved_sources.adapters.base import ApprovedSourceAdapter
from scrapers.approved_sources.adapters.serp_discovery import SerpDiscoveryAdapter
from scrapers.approved_sources.upc_resolution import (
    is_exact_upc_proof,
    build_candidate_evidence,
)
from scrapers.approved_sources.result_builder import (
    build_failed_result,
    build_no_match_result,
    build_success_result,
)
from scrapers.approved_sources.policy import validate_url_allowed
from scrapers.ai_search.enrichment_models import (
    EnrichmentResultV1,
    build_nested_product_facts,
)

logger = logging.getLogger(__name__)

SERP_FOUND_CONFIDENCE = 0.88
SERP_CANDIDATE_CONFIDENCE = 0.0


class SerpCandidateDiscoveryAdapter(ApprovedSourceAdapter):
    """Strict UPC-gated SERP/open-web candidate discovery.

    Emits 'found' only when exact UPC evidence is present on a crawled page
    and brand/title gates pass. Without exact UPC, emits 'not_stocked' with
    candidate URLs in resolutionEvidence.
    """

    adapter_slug = "serp_candidate_discovery"
    source_slug = "serp_candidate_discovery"
    source_type = "official_brand"

    def __init__(self, entry: Any, plan: Any):
        super().__init__(entry, plan)
        # Delegate discovery to a SerpDiscoveryAdapter instance
        self._serp_adapter = SerpDiscoveryAdapter(entry, plan)

    async def extract(self, extractor: Any) -> EnrichmentResultV1 | None:
        """Execute strict SERP candidate discovery with UPC gating.

        Returns:
            'found' with exact UPC evidence, or
            'not_stocked' with candidates, or
            None if no candidates found at all.
        """
        upc = self._get_sku()
        brand_name = self._get_brand()
        register_name = self._get_product_name()
        brand_domain = self.entry.domains[0] if self.entry.domains else None

        # Resolve effective source slug from entry or class default
        effective_slug = self.entry.sourceSlug or self.source_slug

        # Fallback to brand slug if no domain
        if not brand_domain and self.plan.brand:
            brand_domain = f"{self.plan.brand.slug}.com"

        # Propagate ai_credentials to nested SerpDiscoveryAdapter
        if hasattr(self, "ai_credentials") and self.ai_credentials is not None:
            self._serp_adapter.ai_credentials = self.ai_credentials

        # Delegate to SerpDiscoveryAdapter for URL discovery
        # This uses the existing serp_discovery methods: phase1, phase2, phase3, phase3b
        resolved_url = await self._serp_adapter._resolve_approved_url(
            upc=upc,
            register_name=register_name,
            brand_name=brand_name,
            brand_domain=brand_domain,
        )

        if not resolved_url:
            logger.info(
                "[SerpCandidateDiscovery] No candidate URL found for UPC=%s",
                upc,
            )
            return None

        # Validate resolved URL against policy
        source_policy = self.plan.sourcePolicy
        url_ok, url_err = validate_url_allowed(resolved_url, source_policy)
        if not url_ok:
            logger.warning(
                "[SerpCandidateDiscovery] Resolved URL blocked: %s - %s",
                resolved_url, url_err,
            )
            return None

        # Extract from the resolved URL
        target_product_name = getattr(self._serp_adapter, "_last_consolidated_name", None) or register_name

        try:
            extraction_result = await extractor.extract(
                url=resolved_url,
                upc=upc,
                product_name=target_product_name,
                brand=brand_name,
            )
        except Exception as exc:
            logger.error(
                "[SerpCandidateDiscovery] Extraction failed for UPC=%s: %s",
                upc, exc,
            )
            return build_failed_result(
                upc=upc,
                source_slug=effective_slug,
                source_type=self.source_type,
                error_message=str(exc),
                evidence_url=resolved_url,
            )

        if not extraction_result or not extraction_result.get("success"):
            logger.info(
                "[SerpCandidateDiscovery] Extraction returned no result for UPC=%s at %s",
                upc, resolved_url,
            )
            return self._build_candidate_result(
                upc=upc,
                candidate_url=resolved_url,
                brand_name=brand_name,
                reason="extraction_failed",
                effective_slug=effective_slug,
            )

        product_data = extraction_result.get("product", extraction_result)

        # Apply UPC proof gates
        is_proven, upc_evidence = is_exact_upc_proof(upc, product_data)

        if is_proven:
            # Exact UPC proof: emit found
            matched_keys = list(product_data.keys()) if isinstance(product_data, dict) else []
            logger.info(
                "[SerpCandidateDiscovery] Exact UPC proof from SERP for %s (observed=%s)",
                upc, upc_evidence,
            )
            return build_success_result(
                upc=upc,
                source_slug=effective_slug,
                source_type=self.source_type,
                evidence_url=resolved_url,
                product_fields=product_data if isinstance(product_data, dict) else {},
                matched_fields=matched_keys,
                overall_confidence=SERP_FOUND_CONFIDENCE,
                sku_match=True,
                source_results=[
                    {
                        "sourceSlug": effective_slug,
                        "sourceType": self.source_type,
                        "confidence": SERP_FOUND_CONFIDENCE,
                        "matchedFields": matched_keys,
                        "evidenceUrl": resolved_url,
                        "outcome": "found",
                        "product": build_nested_product_facts({
                            "name": product_data.get("name") or product_data.get("title") if isinstance(product_data, dict) else None,
                            "brand": product_data.get("brand") if isinstance(product_data, dict) else None,
                            "upc": upc_evidence,
                        }) if isinstance(product_data, dict) else None,
                        "resolutionStage": "serp",
                        "resolutionEvidence": [
                            {
                                "evidence_kind": "serp_exact_upc",
                                "stage": "serp",
                                "expected_upc": upc,
                                "observed_upc": upc_evidence,
                                "confidence": SERP_FOUND_CONFIDENCE,
                                "gate_reason": "exact_upc_match_on_crawled_page",
                            }
                        ],
                    }
                ],
            )

        # No UPC proof: emit not_stocked with candidate evidence
        evidence_reason = upc_evidence or "no_exact_upc_evidence_on_page"
        logger.info(
            "[SerpCandidateDiscovery] No UPC proof for %s at %s: %s",
            upc, resolved_url, evidence_reason,
        )
        return self._build_candidate_result(
            upc=upc,
            candidate_url=resolved_url,
            brand_name=brand_name,
            reason=evidence_reason,
            effective_slug=effective_slug,
        )

    def _build_candidate_result(
        self,
        upc: str,
        candidate_url: str,
        brand_name: str | None,
        reason: str,
        effective_slug: str | None = None,
    ) -> EnrichmentResultV1:
        """Build a not_stocked result with SERP candidate evidence."""
        slug = effective_slug or self.entry.sourceSlug or self.source_slug
        candidate = build_candidate_evidence(
            candidate_url=candidate_url,
            observed_upc=None,
            reason=reason,
            brand_name=brand_name,
            confidence=SERP_CANDIDATE_CONFIDENCE,
        )

        return build_no_match_result(
            upc=upc,
            source_slug=slug,
            source_type=self.source_type,
            evidence_url=candidate_url,
            source_results=[
                {
                    "sourceSlug": slug,
                    "sourceType": self.source_type,
                    "confidence": SERP_CANDIDATE_CONFIDENCE,
                    "matchedFields": [],
                    "evidenceUrl": candidate_url,
                    "outcome": "not_stocked",
                    "resolutionStage": "serp",
                    "resolutionEvidence": [
                        {
                            "evidence_kind": "serp_candidate_below_gate",
                            "stage": "serp",
                            "expected_upc": upc,
                            "gate_reason": reason,
                            "candidates": [candidate],
                        }
                    ],
                }
            ],
        )
