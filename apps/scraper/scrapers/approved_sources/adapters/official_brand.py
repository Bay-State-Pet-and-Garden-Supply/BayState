"""Official Brand Adapter for autonomous SERP/AI fallback.

Runs when no selected distributor succeeds and llmPolicy.enabled.
Searches for the product on official brand domains using Serper,
validates results against source policy, and auto-selects the best
approved URL. Never extracts from unapproved domains.

Flow:
1. Collect approved domains from plan (brand official + entry domains)
2. Build search query: SKU + product name, site-constrained
3. Search via SearchClient (Serper)
4. Filter results: exclude disallowed domains, prefer official/preferred
5. Auto-select best approved candidate (≥ 0.75-0.8 confidence)
6. If no approved candidate found → fail closed, no extraction
7. Crawl via extractor on approved URL
8. Return EnrichmentResultV1 with llm_used flag
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlparse

from scrapers.approved_sources.adapters.base import ApprovedSourceAdapter
from scrapers.ai_search.enrichment_models import (
    EnrichmentResultV1,
    build_v1_from_extraction_result,
)
from scrapers.ai_search.search import SearchClient
from scrapers.approved_sources.policy import (
    is_disallowed_domain,
    is_domain_allowed,
    normalize_domain,
)

logger = logging.getLogger(__name__)


class OfficialBrandAdapter(ApprovedSourceAdapter):
    """Autonomous SERP/AI official brand fallback adapter.

    Searches approved domains for the product, validates candidates
    against policy, and auto-selects the best match. Does NOT require
    manual URL review.
    """

    adapter_slug = "crawl4ai_direct"
    source_slug = "official_brand"
    source_type = "official_brand"

    async def extract(self, extractor: Any) -> EnrichmentResultV1 | None:
        """Execute autonomous SERP fallback extraction.

        Returns EnrichmentResultV1 on success/partial, or None if no
        approved candidate was found (caller should fail closed).
        """
        from scrapers.approved_sources.result_builder import (
            build_failed_result,
            build_policy_blocked_result,
        )

        sku = self.plan.sku
        product_name = self.plan.input.get("name") if self.plan.input else None
        brand_name = self.plan.brand.name if self.plan.brand else None
        source_policy = self.plan.sourcePolicy

        # 1. Resolve URL via SERP search
        url = await self._resolve_approved_url()
        if not url:
            logger.info(
                "[OfficialBrandAdapter] No approved URL found for SKU=%s", sku
            )
            return None

        # 2. Validate resolved URL against policy
        from scrapers.approved_sources.policy import validate_url_allowed

        url_ok, url_err = validate_url_allowed(url, source_policy)
        if not url_ok:
            logger.warning(
                "[OfficialBrandAdapter] Resolved URL blocked: %s - %s", url, url_err
            )
            return None

        logger.info(
            "[OfficialBrandAdapter] Extracting from approved URL: %s", url
        )

        # 3. Execute extraction
        extraction_result = await extractor.extract(
            url=url,
            sku=sku,
            product_name=product_name,
            brand=brand_name,
        )

        if not extraction_result or not extraction_result.get("success"):
            logger.warning(
                "[OfficialBrandAdapter] Extraction failed for URL: %s", url
            )
            return None

        # 4. Determine if LLM was used
        # Determine LLM usage from result
        raw_confidence = extraction_result.get("confidence", 0.0)
        if isinstance(raw_confidence, dict):
            llm_used = extraction_result.get("extraction_strategy") == "llm"
        else:
            llm_used = False  # ProductPageExtractor doesn't report strategy

        # 5. Build v1 result with decision metadata
        decision = "llm_fallback" if llm_used else "deterministic_success"

        # Safely extract confidence value
        if isinstance(raw_confidence, dict):
            confidence_val = raw_confidence.get("overall", 0.0)
        else:
            confidence_val = float(raw_confidence) if raw_confidence else 0.0

        # Build matched fields from result product data
        product_data = extraction_result.get("product", extraction_result)
        matched_keys = list(product_data.keys()) if isinstance(product_data, dict) else []

        result = build_v1_from_extraction_result(
            result=extraction_result,
            sku=sku,
            url=url,
            domain=urlparse(url).hostname,
            model="deepseek-chat",
            mode="mixed",
            decision=decision,
            llm_used=llm_used,
            source_results=[
                {
                    "sourceSlug": self.source_slug,
                    "sourceType": self.source_type,
                    "confidence": confidence_val,
                    "matchedFields": matched_keys,
                    "evidenceUrl": url,
                }
            ],
        )

        return result

    async def _resolve_approved_url(self) -> str | None:
        """Search for and select the best approved URL using SERP.

        1. Collect approved domains from plan
        2. Search with site-constrained queries
        3. Filter against policy
        4. Auto-select best candidate
        """
        sku = self.plan.sku
        product_name = self.plan.input.get("name") if self.plan.input else ""
        search_mode = self.entry.searchMode

        # Collect approved domains
        approved_domains = list(self.entry.domains)
        if self.plan.brand and not approved_domains:
            # Fallback: try brand domains from brand info
            pass

        if not approved_domains:
            logger.info(
                "[OfficialBrandAdapter] No approved domains for SKU=%s", sku
            )
            return None

        if search_mode == "direct_url":
            return self.plan.input.get("url") or (
                self.entry.domains[0] if self.entry.domains else None
            )

        if search_mode == "domain_search":
            return await self._search_approved_domains(
                sku, product_name, approved_domains
            )

        if search_mode == "sku_search":
            return await self._search_sku_only(
                sku, approved_domains
            )

        return None

    async def _search_approved_domains(
        self,
        sku: str,
        product_name: str,
        approved_domains: list[str],
    ) -> str | None:
        """Search across approved domains using site-constrained queries."""
        source_policy = self.plan.sourcePolicy

        # Build query: SKU + product name, site-constrained to approved domains
        query_parts = [sku]
        if product_name:
            query_parts.append(product_name)

        site_constraint = " OR ".join(
            [f"site:{d}" for d in approved_domains]
        )
        full_query = f"{' '.join(query_parts)} ({site_constraint})"

        logger.info(
            "[OfficialBrandAdapter] Searching approved domains: %s", full_query
        )

        client = SearchClient(max_results=10)
        results, error = await client.search(full_query)

        if not results:
            logger.info(
                "[OfficialBrandAdapter] No search results for: %s", full_query
            )
            return None

        # Filter and rank results
        candidates = []
        for r in results:
            url = r.get("url", "")
            if not url:
                continue
            domain = normalize_domain(url)

            # Reject disallowed domains
            if is_disallowed_domain(domain, source_policy.disallowedDomains):
                logger.debug("[OfficialBrandAdapter] Skipping disallowed: %s", url)
                continue

            # Must be in approved domains
            if not is_domain_allowed(domain, source_policy):
                logger.debug(
                    "[OfficialBrandAdapter] Skipping unapproved domain: %s", url
                )
                continue

            # Score candidate
            score = self._score_candidate(url, r, sku, product_name)
            candidates.append((score, url, domain))

        if not candidates:
            logger.info(
                "[OfficialBrandAdapter] No approved candidates for SKU=%s", sku
            )
            return None

        # Sort by score descending
        candidates.sort(key=lambda x: x[0], reverse=True)
        best_score, best_url, best_domain = candidates[0]

        # Threshold: must be ≥ 0.75
        if best_score < 0.75:
            logger.info(
                "[OfficialBrandAdapter] Best candidate score %0.2f below 0.75 "
                "threshold for SKU=%s", best_score, sku
            )
            return None

        logger.info(
            "[OfficialBrandAdapter] Selected URL: %s (score=%.2f, domain=%s)",
            best_url, best_score, best_domain
        )
        return best_url

    async def _search_sku_only(
        self, sku: str, approved_domains: list[str]
    ) -> str | None:
        """Search by SKU only, site-constrained to approved domains."""
        site_constraint = " OR ".join(
            [f"site:{d}" for d in approved_domains]
        )
        query = f"{sku} ({site_constraint})"

        client = SearchClient(max_results=5)
        results, error = await client.search(query)

        if not results:
            return None

        source_policy = self.plan.sourcePolicy

        for r in results:
            url = r.get("url", "")
            if not url:
                continue
            domain = normalize_domain(url)

            if is_disallowed_domain(domain, source_policy.disallowedDomains):
                continue
            if not is_domain_allowed(domain, source_policy):
                continue

            # SKU in title/URL is strong signal
            title = (r.get("title", "") or "").lower()
            url_lower = url.lower()
            if sku.lower() in title or sku.lower() in url_lower:
                return url

        # Return first approved result even without SKU match
        for r in results:
            url = r.get("url", "")
            if not url:
                continue
            domain = normalize_domain(url)
            if is_domain_allowed(domain, source_policy):
                return url

        return None

    def _score_candidate(
        self,
        url: str,
        result: dict[str, Any],
        sku: str,
        product_name: str | None,
    ) -> float:
        """Score a SERP candidate for how well it matches the target product.

        Returns 0.0 to 1.0 score based on:
        - SKU match in URL or title (0.4)
        - Product name match in title (0.3)
        - Domain is preferred/premium (0.2)
        - Result is organic (not ad) (0.1)
        """
        score = 0.0
        title = (result.get("title", "") or "").lower()
        url_lower = url.lower()
        desc = (result.get("description", "") or "").lower()

        # SKU match (strongest signal)
        sku_lower = sku.lower()
        if sku_lower in title:
            score += 0.4
        elif sku_lower in url_lower:
            score += 0.3
        elif sku_lower in desc:
            score += 0.2

        # Product name match
        if product_name:
            name_parts = product_name.lower().split()
            name_matches = sum(1 for part in name_parts if part in title)
            score += min(name_matches / max(len(name_parts), 1), 1.0) * 0.3

        # Organic vs ad/sponsored
        result_type = result.get("result_type", "")
        if not result_type or result_type == "organic":
            score += 0.1

        # Preferred domain bonus
        if self.plan.brand:
            brand_domain = normalize_domain(f"{self.plan.brand.slug}.com")
            url_domain = normalize_domain(url)
            if url_domain == brand_domain or url_domain.endswith("." + brand_domain):
                score += 0.2

        return min(score, 1.0)
