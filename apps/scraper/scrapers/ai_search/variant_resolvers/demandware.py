import json
import httpx
import logging
from typing import Optional
from urllib.parse import urljoin
from scrapers.ai_search.variant_resolvers.base import BaseVariantResolver

logger = logging.getLogger("scrapers.ai_search.variant_resolvers.demandware")

class DemandwareVariantResolver(BaseVariantResolver):
    """Deterministic variant resolver for Demandware/Salesforce Commerce Cloud storefronts."""

    @staticmethod
    def _http_headers() -> dict[str, str]:
        return {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "Accept-Language": "en-US,en;q=0.9",
        }

    async def resolve(
        self,
        *,
        url: str,
        upc: str,
        product_name: Optional[str],
        brand: Optional[str],
        html: str,
    ) -> tuple[str, Optional[str], Optional[str], str]:
        if not self.scoring or not self.extraction or not self.matching:
            return url, None, None, "ambiguous"

        if not self.scoring.is_product_line_page(url):
            return url, None, None, "ambiguous"

        domain = self.scoring.domain_from_url(url)
        if self.scoring.classify_source_domain(domain, brand) != "official":
            return url, None, None, "ambiguous"

        variant_candidates = self.extraction.extract_demandware_variant_candidates(
            html_text=html,
            source_url=url,
            expected_name=product_name,
        )
        if not variant_candidates:
            return url, None, None, "family_page_default"

        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
            for candidate in variant_candidates[:4]:
                candidate_url = str(candidate.get("url") or "").strip()
                if not candidate_url:
                    continue

                try:
                    response = await client.get(candidate_url, headers=self._http_headers())
                    response.raise_for_status()
                    payload = response.json()
                except Exception as exc:
                    logger.info("[AI Search] Demandware variant lookup failed for %s: %s", candidate_url, str(exc))
                    continue

                selected_variant_id = self.extraction.selected_demandware_variant_id(payload)
                if upc and upc not in selected_variant_id and upc not in json.dumps(payload).lower():
                    variant_text = str(candidate.get("variant_text") or "")
                    if self.matching.has_conflicting_variant_tokens(product_name, variant_text):
                        continue
                    if not self.matching.has_variant_token_overlap(product_name, variant_text):
                        continue

                payload_text = json.dumps(payload)
                selected_product_url = ""
                if isinstance(payload, dict):
                    selected_product_url = str((payload.get("product") or {}).get("selectedProductUrl") or "").strip()
                resolved_url = urljoin(url, selected_product_url) if selected_product_url else url
                logger.info("[AI Search] Resolved official family page variant via Demandware endpoint: %s -> %s", url, resolved_url)
                return resolved_url, payload_text, payload_text, "exact_variant"

        return url, None, None, "family_page_default"
