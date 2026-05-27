"""Amazon Adapter for direct headless scraping.

This adapter searches Amazon directly using Crawl4AI, parses the 
search results for the first organic PDP link, and then delegates
the actual product extraction to the ProductPageExtractor.
"""

from __future__ import annotations

import logging
import urllib.parse
from typing import Any

from bs4 import BeautifulSoup

from scrapers.approved_sources.adapters.base import ApprovedSourceAdapter, get_shared_browser_engine
from scrapers.ai_search.enrichment_models import (
    EnrichmentResultV1,
    build_v1_from_extraction_result,
)

logger = logging.getLogger(__name__)

class AmazonAdapter(ApprovedSourceAdapter):
    """Amazon search and extraction adapter."""

    adapter_slug = "amazon"
    source_slug = "amazon"
    source_type = "marketplace"

    async def extract(self, extractor: Any) -> EnrichmentResultV1 | None:
        upc = self._get_sku()
        if not upc:
            logger.warning("[AmazonAdapter] No UPC provided for extraction.")
            return None

        # Phase 1: Direct Crawl4AI Search
        engine = await get_shared_browser_engine()
        search_url = f"https://www.amazon.com/s?k={upc}"
        
        logger.info("[AmazonAdapter] Searching Amazon for UPC: %s", search_url)
        crawl_result = await engine.crawl(search_url)
        
        if not crawl_result or not crawl_result.get("success") or not crawl_result.get("html"):
            logger.warning("[AmazonAdapter] Crawl failed for search URL: %s", search_url)
            return None

        html = crawl_result["html"]
        
        # Phase 2: Link Parsing
        soup = BeautifulSoup(html, "html.parser")
        pdp_url = None
        
        # Amazon search results usually have links like /dp/B0... or /gp/product/
        # We want to avoid sponsored links (which often have /slredirect/ or a-spacing-micro ad tags)
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if ("/dp/" in href or "/gp/product/" in href) and "/slredirect/" not in href and "customer-reviews" not in href:
                # Reconstruct full URL if relative
                if href.startswith("/"):
                    pdp_url = f"https://www.amazon.com{href}"
                else:
                    pdp_url = href
                    
                # Clean URL up to the ASIN (remove tracking parameters)
                parsed = urllib.parse.urlparse(pdp_url)
                # Typically /dp/ASIN/ref=... we want to strip the /ref= part
                path_parts = parsed.path.split('/')
                clean_path = []
                for part in path_parts:
                    if part.startswith("ref="):
                        break
                    clean_path.append(part)
                
                clean_pdp_url = f"https://www.amazon.com{'/'.join(clean_path)}"
                logger.info("[AmazonAdapter] Found organic PDP URL: %s", clean_pdp_url)
                pdp_url = clean_pdp_url
                break
                
        if not pdp_url:
            logger.warning("[AmazonAdapter] No valid PDP URL found in search results for UPC: %s. (Possible bot block)", upc)
            return None
            
        # Phase 3: Extraction via generic LLM extractor
        logger.info("[AmazonAdapter] Extracting product data from: %s", pdp_url)
        extraction_result = await extractor.extract(
            url=pdp_url,
            upc=upc,
            product_name=self._get_product_name(),
            brand=self._get_brand(),
        )
        
        if not extraction_result or not extraction_result.get("success"):
            logger.warning("[AmazonAdapter] Extraction failed for PDP URL: %s", pdp_url)
            return None
            
        # Determine confidence
        raw_confidence = extraction_result.get("confidence", 0.0)
        confidence_val = raw_confidence.get("overall", 0.0) if isinstance(raw_confidence, dict) else float(raw_confidence)
        
        product_data = extraction_result.get("product", extraction_result)
        matched_keys = list(product_data.keys()) if isinstance(product_data, dict) else []

        result = build_v1_from_extraction_result(
            result=extraction_result,
            upc=upc,
            url=pdp_url,
            domain="www.amazon.com",
            model="deepseek-chat", # default fallback
            mode="mixed",
            decision="llm_extraction",
            llm_used=True,
            source_results=[
                {
                    "sourceSlug": self.source_slug,
                    "sourceType": self.source_type,
                    "confidence": confidence_val,
                    "matchedFields": matched_keys,
                    "evidenceUrl": pdp_url,
                }
            ],
        )

        return result
