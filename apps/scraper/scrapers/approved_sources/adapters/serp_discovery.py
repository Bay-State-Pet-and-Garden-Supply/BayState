"""SERP Discovery Adapter for autonomous SERP/AI fallback.

Flow:
1. Phase 1: UPC Discovery - Search for raw UPC via Serper API.
2. Phase 2: LLM Name Consolidation - Use LLM to reconcile register name with UPC search results.
3. Phase 3: Brand Site Search - Search site:domain <consolidated_name> via Serper API.
   Pick URL via LLM from top candidates.
4. Phase 3b: Open Web Fallback - If brand site search returns nothing, search <consolidated_name> on open web.
   Pick URL via LLM from top candidates (excluding disallowed domains).
5. Phase 4: Extraction - Extract from selected URL via ProductPageExtractor.
"""

from __future__ import annotations

import json
import logging
import os
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
    normalize_domain,
)
from scrapers.providers.factory import create_llm_provider
from scrapers.utils.url_utils import canonicalize_result_url

logger = logging.getLogger(__name__)


class SerpDiscoveryAdapter(ApprovedSourceAdapter):
    """Autonomous SERP/AI product discovery and extraction adapter."""

    adapter_slug = "serp_discovery"
    source_slug = "serp_discovery"
    source_type = "official_brand"

    def __init__(self, entry: Any, plan: Any):
        super().__init__(entry, plan)
        self._llm_used_in_discovery = False

    async def extract(self, extractor: Any) -> EnrichmentResultV1 | None:
        """Execute autonomous discovery and extraction.

        Returns EnrichmentResultV1 on success/partial, or None if no
        approved candidate was found (caller should fail closed).
        """
        upc = self.plan.upc
        register_name = self.plan.input.get("name") if self.plan.input else None
        brand_name = self.plan.brand.name if self.plan.brand else None
        brand_domain = self.entry.domains[0] if self.entry.domains else None

        # Fallback to brand slug if domain is not provided
        if not brand_domain and self.plan.brand:
            brand_domain = f"{self.plan.brand.slug}.com"

        # 1. Resolve URL via SERP + LLM discovery
        url = await self._resolve_approved_url(upc, register_name, brand_name, brand_domain)
        if not url:
            logger.info(
                "[SerpDiscoveryAdapter] No approved URL found for UPC=%s", upc
            )
            return None

        # 2. Validate resolved URL against policy
        source_policy = self.plan.sourcePolicy
        from scrapers.approved_sources.policy import validate_url_allowed

        url_ok, url_err = validate_url_allowed(url, source_policy)
        if not url_ok:
            logger.warning(
                "[SerpDiscoveryAdapter] Resolved URL blocked: %s - %s", url, url_err
            )
            return None

        logger.info(
            "[SerpDiscoveryAdapter] Extracting from approved URL: %s", url
        )

        # 3. Execute extraction
        # Pass register_name as the fallback product name to search/validate on the page
        extraction_result = await extractor.extract(
            url=url,
            upc=upc,
            product_name=register_name,
            brand=brand_name,
        )

        if not extraction_result or not extraction_result.get("success"):
            logger.warning(
                "[SerpDiscoveryAdapter] Extraction failed for URL: %s", url
            )
            return None

        # 4. Determine if LLM was used in extraction
        raw_confidence = extraction_result.get("confidence", 0.0)
        if isinstance(raw_confidence, dict):
            llm_used_in_extraction = extraction_result.get("extraction_strategy") == "llm"
        else:
            llm_used_in_extraction = False

        llm_used = llm_used_in_extraction or self._llm_used_in_discovery
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
            upc=upc,
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

    async def _resolve_approved_url(
        self,
        upc: str,
        register_name: str | None,
        brand_name: str | None,
        brand_domain: str | None,
    ) -> str | None:
        """Execute Phase 1-3 to find the best approved URL."""
        # Phase 1: UPC Discovery (Global search for UPC/UPC)
        sku_serp_results = await self._phase1_sku_discovery(upc)

        # Check for immediate official domain match in Phase 1 results
        if brand_domain and sku_serp_results:
            normalized_brand = normalize_domain(brand_domain)
            for r in sku_serp_results:
                url = r.get("url", "")
                if normalize_domain(url) == normalized_brand:
                    # Deterministic skip of collections/search pages even in Phase 1
                    url_lower = url.lower()
                    if "/collections/" not in url_lower and "/search" not in url_lower:
                        logger.info(
                            "[SerpDiscoveryAdapter] Phase 1: Found direct official domain match for UPC=%s: %s",
                            upc,
                            url,
                        )
                        return url

        # Phase 2: LLM Name Consolidation
        # We run this even if Phase 1 found nothing, to clean up register abbreviations
        consolidated_name = register_name
        if register_name:
            try:
                consolidated_name = await self._phase2_consolidate_name(
                    upc=upc,
                    register_name=register_name,
                    brand_name=brand_name,
                    serp_results=sku_serp_results or [],
                )
            except Exception as e:
                logger.warning(
                    "[SerpDiscoveryAdapter] LLM name consolidation failed: %s. Using register name.",
                    e,
                )

        logger.info(
            "[SerpDiscoveryAdapter] Consolidated product name: '%s'",
            consolidated_name,
        )

        # Phase 3: Brand Site Search + LLM URL Selection
        selected_url = None
        if brand_domain and consolidated_name:
            normalized_domain_str = normalize_domain(brand_domain)
            selected_url = await self._phase3_brand_site_search(
                upc=upc,
                brand_name=brand_name,
                brand_domain=normalized_domain_str,
                consolidated_name=consolidated_name,
            )

        # Phase 3b: Open Web Fallback
        if not selected_url and consolidated_name:
            logger.info(
                "[SerpDiscoveryAdapter] Brand site search returned no URL. Trying Open Web fallback..."
            )
            selected_url = await self._phase3b_open_web_fallback(
                upc=upc,
                brand_name=brand_name,
                consolidated_name=consolidated_name,
            )

        return selected_url

    def _get_llm_provider(self) -> Any | None:
        """Create an LLM provider using available credentials."""
        if not hasattr(self, "ai_credentials") or not self.ai_credentials:
            try:
                return create_llm_provider()
            except ValueError:
                return None

        provider_slug = self.ai_credentials.get("llm_provider")
        api_key = self.ai_credentials.get("llm_api_key")
        if not api_key:
            if provider_slug == "deepseek":
                api_key = self.ai_credentials.get("deepseek_api_key")
            elif provider_slug == "openai":
                api_key = self.ai_credentials.get("openai_api_key")

        if not api_key:
            api_key = os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")

        return create_llm_provider(
            model=self.ai_credentials.get("llm_model"),
            base_url=self.ai_credentials.get("llm_base_url"),
            api_key=api_key,
        )

    def _get_search_client(self, max_results: int = 10) -> SearchClient:
        """Create SearchClient with credentials."""
        api_key = None
        if hasattr(self, "ai_credentials") and isinstance(self.ai_credentials, dict):
            api_key = self.ai_credentials.get("serper_api_key") or self.ai_credentials.get("serpapi_api_key")
        return SearchClient(max_results=max_results, api_key=api_key)

    async def _phase1_sku_discovery(self, upc: str) -> list[dict[str, Any]]:
        """Search for UPC/UPC on the web to identify product metadata."""
        if not upc:
            return []

        client = self._get_search_client(max_results=10)
        search_query = f'"{upc}"'
        logger.info(
            "[SerpDiscoveryAdapter] Phase 1: UPC discovery search query: '%s'",
            search_query,
        )
        results, error = await client.search(search_query)
        if error:
            logger.error(
                "[SerpDiscoveryAdapter] UPC discovery search failed: %s", error
            )
            return []

        # Filter out disallowed domains and deduplicate by canonical URL
        allowed_results = []
        seen_urls = set()
        source_policy = getattr(self.plan, "sourcePolicy", None)
        disallowed_domains = getattr(source_policy, "disallowedDomains", None) if source_policy else None

        for r in results:
            url = r.get("url", "")
            if not url:
                continue

            canonical_url = canonicalize_result_url(url)
            if canonical_url in seen_urls:
                continue
            seen_urls.add(canonical_url)

            domain = normalize_domain(canonical_url)
            is_blocked = is_disallowed_domain(domain) or (disallowed_domains and is_disallowed_domain(domain, disallowed_domains))
            if is_blocked:
                logger.debug(
                    "[SerpDiscoveryAdapter] Skipping disallowed domain in UPC discovery: %s", canonical_url
                )
                continue

            r_copy = dict(r)
            r_copy["url"] = canonical_url
            allowed_results.append(r_copy)

        return allowed_results

    async def _phase2_consolidate_name(
        self,
        upc: str,
        register_name: str,
        brand_name: str | None,
        serp_results: list[dict[str, Any]],
    ) -> str:
        """Consolidate the register name with search engine evidence using an LLM."""
        llm = self._get_llm_provider()
        if not llm:
            logger.warning(
                "[SerpDiscoveryAdapter] No LLM provider found for name consolidation. Returning register name."
            )
            return register_name

        serp_evidence = ""
        if serp_results:
            for i, r in enumerate(serp_results[:5]):
                title = r.get("title", "")
                desc = r.get("description", "")
                url = r.get("url", "")
                serp_evidence += f"[{i+1}] Title: {title}\n    Description: {desc}\n    URL: {url}\n\n"
        else:
            serp_evidence = "(No search results found for this UPC. Please clean up the register name based on your general knowledge.)\n"

        system_prompt = (
            "You are an expert product data consolidator. Your goal is to determine the full, correct, non-abbreviated "
            "product name by reconciling a potentially cryptic or abbreviated register name with search engine evidence. "
            "Respond ONLY with the requested JSON schema, containing the 'consolidated_name'."
        )

        user_prompt = f"""Target UPC/UPC: {upc}
Register Product Name (abbreviated/raw): {register_name}
Brand Name: {brand_name or 'Unknown'}

Search Engine Results for UPC {upc}:
{serp_evidence}

Instructions:
1. Examine the search results to see if they identify the specific product matching this UPC/UPC.
2. The register name often contains abbreviations (e.g. 'CHKN' for 'Chicken', 'SUPP' for 'Supplement', '3.5LB' for '3.5 lb', 'HOL ES' for 'Holes', 'BEA N' for 'Bean').
3. Reconcile the register name's structure (especially weights, sizes, flavors, and formulas) with the names found in search results.
4. Output the full, correct, clean product name. Do not include the brand name at the start of the product name unless it is commonly part of the trademarked name, but do prioritize correct spelling and formatting (e.g. 'Open Farm Good Gut Daily Supplement Chicken Recipe 3.5 lb' instead of 'OPEN FARM GOOD GUT C HKN 3.5LB').
5. If the search results are completely unrelated or do not mention the product, try to de-abbreviate and format the register name as best as you can.

Return JSON in this format:
{{
  "consolidated_name": "Full Proper Product Name"
}}
"""
        schema = {
            "type": "object",
            "properties": {
                "consolidated_name": {"type": "string"}
            },
            "required": ["consolidated_name"],
        }

        try:
            response = await llm.generate_text(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.0,
                response_schema=schema,
            )
            self._llm_used_in_discovery = True
            
            # Robust JSON parsing to handle markdown blocks
            raw_text = response.text.strip()
            if raw_text.startswith("```json"):
                raw_text = raw_text[7:-3].strip()
            elif raw_text.startswith("```"):
                raw_text = raw_text[3:-3].strip()
                
            data = json.loads(raw_text)
            name = data.get("consolidated_name", "").strip()
            if name:
                return name
        except Exception as e:
            logger.warning(
                "[SerpDiscoveryAdapter] LLM name consolidation failed: %s. Using register name.",
                e,
            )

        return register_name

    async def _phase3_brand_site_search(
        self,
        upc: str,
        brand_name: str | None,
        brand_domain: str,
        consolidated_name: str,
    ) -> str | None:
        """Search the brand's official domain for the product."""
        domain = brand_domain.replace("https://", "").replace("http://", "").split("/")[0]
        query = f"site:{domain} {consolidated_name}"
        logger.info(
            "[SerpDiscoveryAdapter] Phase 3: Brand site search query: '%s'",
            query,
        )

        client = self._get_search_client(max_results=10)
        results, error = await client.search(query)
        if error:
            logger.error(
                "[SerpDiscoveryAdapter] Brand site search failed: %s", error
            )
            return None

        if not results:
            logger.info(
                "[SerpDiscoveryAdapter] Brand site search returned no results for query: '%s'",
                query,
            )
            return None

        # Deduplicate and canonicalize URLs
        seen_urls = set()
        deduped_results = []
        for r in results:
            url = r.get("url", "")
            if not url:
                continue
            canonical_url = canonicalize_result_url(url)
            if canonical_url in seen_urls:
                continue
            seen_urls.add(canonical_url)
            
            r_copy = dict(r)
            r_copy["url"] = canonical_url
            deduped_results.append(r_copy)

        candidates = self._score_candidates(deduped_results, upc, consolidated_name, brand_domain)
        if not candidates:
            return None

        return await self._llm_select_url(
            upc=upc,
            consolidated_name=consolidated_name,
            brand_name=brand_name,
            brand_domain=brand_domain,
            candidates=candidates,
        )

    async def _phase3b_open_web_fallback(
        self,
        upc: str,
        brand_name: str | None,
        consolidated_name: str,
    ) -> str | None:
        """Search the open web as a fallback for the product."""
        query = consolidated_name
        logger.info(
            "[SerpDiscoveryAdapter] Phase 3b: Open web search query: '%s'",
            query,
        )

        client = self._get_search_client(max_results=10)
        results, error = await client.search(query)
        if error:
            logger.error(
                "[SerpDiscoveryAdapter] Open web search failed: %s", error
            )
            return None

        if not results:
            logger.info(
                "[SerpDiscoveryAdapter] Open web search returned no results for query: '%s'",
                query,
            )
            return None

        # Filter out disallowed domains and deduplicate by canonical URL
        allowed_results = []
        seen_urls = set()
        source_policy = self.plan.sourcePolicy
        disallowed_domains = getattr(source_policy, "disallowedDomains", None) if source_policy else None

        for r in results:
            url = r.get("url", "")
            if not url:
                continue

            canonical_url = canonicalize_result_url(url)
            if canonical_url in seen_urls:
                continue
            seen_urls.add(canonical_url)

            domain = normalize_domain(canonical_url)
            is_blocked = is_disallowed_domain(domain) or (disallowed_domains and is_disallowed_domain(domain, disallowed_domains))
            if is_blocked:
                logger.debug(
                    "[SerpDiscoveryAdapter] Skipping disallowed domain: %s", canonical_url
                )
                continue

            r_copy = dict(r)
            r_copy["url"] = canonical_url
            allowed_results.append(r_copy)

        candidates = self._score_candidates(allowed_results, upc, consolidated_name, None)
        if not candidates:
            return None

        return await self._llm_select_url(
            upc=upc,
            consolidated_name=consolidated_name,
            brand_name=brand_name,
            brand_domain=None,
            candidates=candidates,
        )

    def _score_candidates(
        self,
        results: list[dict[str, Any]],
        upc: str,
        name: str,
        brand_domain: str | None,
    ) -> list[dict[str, Any]]:
        """Score candidates deterministically and shortlist top candidates."""
        scored = []
        for r in results:
            url = r.get("url", "")
            if not url:
                continue

            score = 0.0
            title = (r.get("title", "") or "").lower()
            url_lower = url.lower()
            desc = (r.get("description", "") or "").lower()
            sku_lower = upc.lower()

            # UPC match (strongest signal)
            if sku_lower in title:
                score += 0.4
            elif sku_lower in url_lower:
                score += 0.3
            elif sku_lower in desc:
                score += 0.2

            # Token overlap with consolidated name
            name_parts = name.lower().split()
            name_matches = sum(1 for part in name_parts if part in title or part in desc)
            if name_parts:
                score += min(name_matches / len(name_parts), 1.0) * 0.3

            # Organic vs ad
            result_type = r.get("result_type", "")
            if not result_type or result_type == "organic":
                score += 0.1

            # Domain match bonus
            if brand_domain:
                bd_norm = normalize_domain(brand_domain)
                url_domain = normalize_domain(url)
                if url_domain == bd_norm or url_domain.endswith("." + bd_norm):
                    score += 0.2

            # Deterministic Collection Penalty
            # Penalize URLs that look like collection/category pages
            collection_markers = ["/collections/", "/category/", "/categories/", "/brand/", "/product-category/"]
            product_markers = ["/products/", "/product/", "/p/"]
            
            is_collection = any(marker in url_lower for marker in collection_markers)
            has_product_marker = any(marker in url_lower for marker in product_markers)
            
            # If it's a collection URL and DOES NOT have a product marker, heavily penalize it.
            # (Note: Shopify URLs like /collections/x/products/y are okay as they are specific to a product in context)
            if is_collection and not has_product_marker:
                score -= 0.5
                logger.debug("[SerpDiscoveryAdapter] Penalized collection URL: %s", url)

            scored.append((score, r))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scored[:5]]

    async def _llm_select_url(
        self,
        upc: str,
        consolidated_name: str,
        brand_name: str | None,
        brand_domain: str | None,
        candidates: list[dict[str, Any]],
    ) -> str | None:
        """Select the best matching product page URL from the candidates using an LLM."""
        llm = self._get_llm_provider()
        if not llm:
            if candidates:
                top_url = candidates[0].get("url")
                logger.info(
                    "[SerpDiscoveryAdapter] No LLM provider. Returning top candidate URL: %s",
                    top_url,
                )
                return top_url
            return None

        candidates_evidence = ""
        for i, c in enumerate(candidates):
            title = c.get("title", "")
            desc = c.get("description", "")
            url = c.get("url", "")
            candidates_evidence += f"[{i+1}] Title: {title}\n    Description: {desc}\n    URL: {url}\n\n"

        system_prompt = (
            "You are an expert product webpage selector. Your goal is to analyze search results and select the best URL "
            "that is a product page (rather than a collection page, a category page, a blog post, or a homepage) "
            "for the target product. Respond ONLY with the requested JSON schema."
        )

        user_prompt = f"""Target Product Name: {consolidated_name}
Target UPC/UPC: {upc}
Brand Name: {brand_name or 'Unknown'}
Brand Domain: {brand_domain or 'Unknown'}

Candidate URLs:
{candidates_evidence}

Instructions:
1. Review the candidate search results.
2. Select the single candidate URL that is the best product detail page match for '{consolidated_name}'.
3. Avoid selecting index/collection/category pages (e.g. URLs ending in /collections, /categories, /brand, or the homepage itself).
4. If a URL contains the UPC/UPC, that is a strong indicator of a match.
5. If none of the candidates match this product or are all generic/unrelated, return null for the 'selected_url'.

Return JSON in this format:
{{
  "selected_url": "https://example.com/product-url",
  "explanation": "Why this URL was selected"
}}
"""
        schema = {
            "type": "object",
            "properties": {
                "selected_url": {"type": ["string", "null"]},
                "explanation": {"type": "string"}
            },
            "required": ["selected_url", "explanation"],
        }

        try:
            response = await llm.generate_text(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.0,
                response_schema=schema,
            )
            self._llm_used_in_discovery = True
            data = json.loads(response.text)
            selected_url = data.get("selected_url")
            explanation = data.get("explanation", "")
            logger.info(
                "[SerpDiscoveryAdapter] LLM selection explanation: %s",
                explanation,
            )
            if selected_url:
                return selected_url
        except Exception as e:
            logger.warning(
                "[SerpDiscoveryAdapter] Failed to select URL via LLM: %s. Falling back to top candidate.",
                e,
            )

        # Fallback to top scored candidate
        if candidates:
            return candidates[0].get("url")

        return None
