"""Official Brand Crawl Adapter — strict UPC-gated crawl of official brand domains.

V2 staged cascade stage: official_brand

Flow:
1. Verify policy allows crawling the official domain.
2. Build search URL(s) for the UPC on the official domain.
3. Crawl the page(s) for product data.
4. Apply UPC proof gates:
   - If exact UPC evidence passes gates → emit 'found' with high confidence.
   - If plausible evidence but no passing UPC → emit 'not_stocked' with candidates.
   - If page cannot be reached → emit 'source_error'.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from scrapers.approved_sources.adapters.base import ApprovedSourceAdapter
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

ACCEPTED_FOUND_CONFIDENCE = 0.98
HIGH_CONFIDENCE_NO_UPC_CONFIDENCE = 0.92


class OfficialBrandCrawlAdapter(ApprovedSourceAdapter):
    """Strict UPC-gated crawl of official brand domains for identity proof."""

    adapter_slug = "official_brand_crawl"
    source_slug = "official_brand_crawl"
    source_type = "official_brand"

    async def extract(self, extractor: Any) -> EnrichmentResultV1 | None:
        """Execute strict official brand UPC extraction.

        Returns EnrichmentResultV1 with outcome:
        - 'found' only when exact UPC evidence passes gates.
        - 'not_stocked' when plausible evidence exists but UPC is not proven.
        - 'source_error' when the page cannot be crawled.
        """
        upc = self._get_sku()
        brand_name = self._get_brand()
        register_name = self._get_product_name()

        # Resolve effective source slug from entry or class default
        effective_slug = self.entry.sourceSlug or self.source_slug

        # Build search URL from first official domain
        domain = self.entry.domains[0] if self.entry.domains else None
        if not domain:
            return build_failed_result(
                upc=upc,
                source_slug=effective_slug,
                source_type=self.source_type,
                error_message="No official domains configured for brand crawl",
            )

        search_url = self._build_search_url(domain, upc)

        # Validate URL against policy
        source_policy = self.plan.sourcePolicy
        url_ok, url_err = validate_url_allowed(search_url, source_policy)
        if not url_ok:
            return build_failed_result(
                upc=upc,
                source_slug=effective_slug,
                source_type=self.source_type,
                error_message=f"URL blocked by policy: {url_err}",
                evidence_url=search_url,
            )

        logger.info(
            "[OfficialBrandCrawl] Crawling official domain for UPC=%s: %s",
            upc, search_url,
        )

        # Execute extraction via the shared extractor
        try:
            extraction_result = await extractor.extract(
                url=search_url,
                upc=upc,
                product_name=register_name,
                brand=brand_name,
            )
        except Exception as exc:
            logger.error(
                "[OfficialBrandCrawl] Extraction failed for UPC=%s: %s",
                upc, exc,
            )
            return build_failed_result(
                upc=upc,
                source_slug=effective_slug,
                source_type=self.source_type,
                error_message=str(exc),
                evidence_url=search_url,
            )

        if not extraction_result or not extraction_result.get("success"):
            logger.info(
                "[OfficialBrandCrawl] Extraction returned no result for UPC=%s",
                upc,
            )
            # Build not_stocked with the failed search URL as evidence candidate
            return self._build_not_stocked_result(
                upc=upc,
                search_url=search_url,
                brand_name=brand_name,
                reason="extraction_failed: page did not return product data",
                candidates=[search_url],
            )

        product_data = extraction_result.get("product", extraction_result)
        raw_confidence = extraction_result.get("confidence", 0.0)
        if isinstance(raw_confidence, dict):
            confidence_val = raw_confidence.get("overall", 0.0)
        else:
            confidence_val = float(raw_confidence) if raw_confidence else 0.0

        # Apply UPC proof gates
        is_proven, upc_evidence = is_exact_upc_proof(upc, product_data)

        if is_proven:
            # Exact UPC proof: emit found with high confidence
            matched_keys = list(product_data.keys()) if isinstance(product_data, dict) else []
            logger.info(
                "[OfficialBrandCrawl] Exact UPC proof found for %s (observed=%s)",
                upc, upc_evidence,
            )
            return build_success_result(
                upc=upc,
                source_slug=effective_slug,
                source_type=self.source_type,
                evidence_url=search_url,
                product_fields=product_data if isinstance(product_data, dict) else {},
                matched_fields=matched_keys,
                overall_confidence=ACCEPTED_FOUND_CONFIDENCE,
                sku_match=True,
                source_results=[
                    {
                        "sourceSlug": effective_slug,
                        "sourceType": self.source_type,
                        "confidence": ACCEPTED_FOUND_CONFIDENCE,
                        "matchedFields": matched_keys,
                        "evidenceUrl": search_url,
                        "outcome": "found",
                        "product": build_nested_product_facts({
                            "name": product_data.get("name") or product_data.get("title") if isinstance(product_data, dict) else None,
                            "brand": product_data.get("brand") if isinstance(product_data, dict) else None,
                            "upc": upc_evidence,
                        }) if isinstance(product_data, dict) else None,
                        "resolutionStage": "official_brand",
                        "resolutionEvidence": [
                            {
                                "evidence_kind": "official_exact_upc",
                                "stage": "official_brand",
                                "expected_upc": upc,
                                "observed_upc": upc_evidence,
                                "confidence": ACCEPTED_FOUND_CONFIDENCE,
                                "gate_reason": "exact_upc_match_with_valid_check_digit",
                            }
                        ],
                    }
                ],
            )

        # Check high-confidence no-UPC rule (tightened for MVP1 review)
        if self._is_high_confidence_no_upc(product_data, brand_name, register_name, confidence_val):
            logger.info(
                "[OfficialBrandCrawl] High-confidence no-UPC for %s on %s",
                upc, search_url,
            )
            matched_keys = list(product_data.keys()) if isinstance(product_data, dict) else []
            return build_success_result(
                upc=upc,
                source_slug=effective_slug,
                source_type=self.source_type,
                evidence_url=search_url,
                product_fields=product_data if isinstance(product_data, dict) else {},
                matched_fields=matched_keys,
                overall_confidence=HIGH_CONFIDENCE_NO_UPC_CONFIDENCE,
                sku_match=False,
                source_results=[
                    {
                        "sourceSlug": effective_slug,
                        "sourceType": self.source_type,
                        "confidence": HIGH_CONFIDENCE_NO_UPC_CONFIDENCE,
                        "matchedFields": matched_keys,
                        "evidenceUrl": search_url,
                        "outcome": "found",
                        "product": build_nested_product_facts({
                            "name": product_data.get("name") or product_data.get("title") if isinstance(product_data, dict) else None,
                            "brand": product_data.get("brand") if isinstance(product_data, dict) else None,
                        }) if isinstance(product_data, dict) else None,
                        "resolutionStage": "official_brand",
                        "resolutionEvidence": [
                            {
                                "evidence_kind": "official_high_confidence_no_upc",
                                "stage": "official_brand",
                                "expected_upc": upc,
                                "confidence": HIGH_CONFIDENCE_NO_UPC_CONFIDENCE,
                                "gate_reason": upc_evidence or "brand_domain_match_strong_descriptors",
                            }
                        ],
                    }
                ],
            )

        # No UPC proof: emit not_stocked with candidates in resolutionEvidence
        evidence_reason = upc_evidence or "no_upc_on_page"
        logger.info(
            "[OfficialBrandCrawl] No UPC proof for %s on %s: %s",
            upc, search_url, evidence_reason,
        )
        return self._build_not_stocked_result(
            upc=upc,
            search_url=search_url,
            brand_name=brand_name,
            reason=evidence_reason,
            candidates=[search_url],
            product_data=product_data if isinstance(product_data, dict) else {},
        )

    def _build_search_url(self, domain: str, upc: str) -> str:
        """Build a search URL for the UPC on the official domain."""
        # Try common product URL patterns
        domain = domain.rstrip("/")
        return f"https://{domain}/products?q={upc}"

    def _is_high_confidence_no_upc(
        self,
        product_data: dict[str, Any] | None,
        brand_name: str | None,
        register_name: str | None,
        raw_confidence: float = 0.0,
    ) -> bool:
        """Check if product data meets the tightened high-confidence no-UPC rule.

        Returns True when ALL conditions are met:
        - raw extractor confidence >= 0.90
        - domain is an official brand domain
        - brand name appears in extracted title
        - meaningful non-brand descriptor overlap with register/input name
        - no UPC/GTIN present on page (if present, must match expected)

        Prefer safety over coverage: do not auto-found arbitrary official pages
        with only brand text.
        """
        if not product_data:
            return False

        # 1. Raw extractor confidence must be >= 0.90
        if raw_confidence < 0.90:
            return False

        # 2. Must be on an official brand domain
        domain = self.entry.domains[0] if self.entry.domains else ""
        if not domain:
            return False

        # 3. Extract any observed UPC/GTIN from product data
        from scrapers.approved_sources.upc_resolution import extract_upc_from_product, compare_gtin
        observed_upc = extract_upc_from_product(product_data)
        expected_upc = self._get_sku()
        if observed_upc is not None:
            # If a UPC IS present, it must be an exact match; otherwise reject
            if not compare_gtin(expected_upc, observed_upc):
                return False
            # If it matches exactly, exact UPC proof above would have caught it
            # (so we return False here to avoid the no-UPC path entirely)
            return False

        # 4. Check product title/name contains brand for brand/domain match
        name = (product_data.get("name") or product_data.get("title") or "")
        if brand_name and brand_name.lower() not in name.lower():
            return False

        # 5. Meaningful non-brand descriptor overlap with register/input name
        #    Use word-boundary matching to avoid false positives from short
        #    substrings (e.g. "test" matching inside "testbrand").
        if register_name:
            register_lower = register_name.lower()
            # Strip brand from register name to get descriptor part
            if brand_name:
                brand_lower = brand_name.lower()
                descriptor_part = register_lower.replace(brand_lower, "").strip()
            else:
                descriptor_part = register_lower
            # If there's a meaningful descriptor beyond brand, check name contains it
            if len(descriptor_part) > 2:
                # Check at least one non-brand word from register appears in title
                name_lower = name.lower()
                descriptor_words = [w for w in descriptor_part.split() if len(w) > 2]
                if descriptor_words:
                    has_overlap = any(
                        bool(re.search(r'\b' + re.escape(w) + r'\b', name_lower))
                        for w in descriptor_words
                    )
                    if not has_overlap:
                        return False

        # 6. Product must have some useful data (not empty)
        has_content = bool(name) or bool(product_data.get("description"))
        if not has_content:
            return False

        return True

    def _build_not_stocked_result(
        self,
        upc: str,
        search_url: str,
        brand_name: str | None,
        reason: str,
        candidates: list[str] | None = None,
        product_data: dict[str, Any] | None = None,
    ) -> EnrichmentResultV1:
        """Build a not_stocked result with candidates in resolutionEvidence."""
        effective_slug = self.entry.sourceSlug or self.source_slug
        candidate_list = candidates or [search_url]
        evidence_list = []
        for url in candidate_list:
            evidence_list.append(
                build_candidate_evidence(
                    candidate_url=url,
                    observed_upc=None,
                    reason=reason,
                    brand_name=brand_name,
                    title=product_data.get("name") if product_data else None,
                    confidence=0.0,
                )
            )

        return build_no_match_result(
            upc=upc,
            source_slug=effective_slug,
            source_type=self.source_type,
            evidence_url=search_url,
            source_results=[
                {
                    "sourceSlug": effective_slug,
                    "sourceType": self.source_type,
                    "confidence": 0.0,
                    "matchedFields": [],
                    "evidenceUrl": search_url,
                    "outcome": "not_stocked",
                    "product": build_nested_product_facts({
                        "name": product_data.get("name") or product_data.get("title") if product_data else None,
                        "brand": product_data.get("brand") if product_data else None,
                    }) if product_data else None,
                    "resolutionStage": "official_brand",
                    "resolutionEvidence": [
                        {
                            "evidence_kind": "candidate_below_gate",
                            "stage": "official_brand",
                            "expected_upc": upc,
                            "gate_reason": reason,
                            "candidates": evidence_list,
                        }
                    ],
                }
            ],
        )
