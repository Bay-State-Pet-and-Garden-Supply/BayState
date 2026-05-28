"""Amazon Adapter for direct headless scraping.

This adapter searches Amazon directly using Crawl4AI, parses the 
search results for the first organic PDP link, and extracts
product details using a modernized Crawl4AI CSS strategy.
"""

from __future__ import annotations

import logging
import urllib.parse
import re
import json
from typing import Any

from bs4 import BeautifulSoup
from crawl4ai import CrawlerRunConfig, CacheMode
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy

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

        # Phase 1: Direct Crawl4AI Search with domcontentloaded
        engine = await get_shared_browser_engine()
        search_url = f"https://www.amazon.com/s?k={upc}"
        
        logger.info("[AmazonAdapter] Searching Amazon for UPC: %s", search_url)
        search_config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            wait_until="domcontentloaded",
            page_timeout=20000,
        )
        
        try:
            crawl_result = await engine.crawler.arun(url=search_url, config=search_config)
        except Exception as e:
            logger.error("[AmazonAdapter] Crawl search threw exception: %s", e)
            return None
            
        if not crawl_result or not crawl_result.success or not crawl_result.html:
            logger.warning("[AmazonAdapter] Crawl failed for search URL: %s", search_url)
            return None

        html = crawl_result.html
        
        # Phase 2: Link Parsing
        soup = BeautifulSoup(html, "html.parser")
        pdp_url = None
        
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if ("/dp/" in href or "/gp/product/" in href) and "/slredirect/" not in href and "customer-reviews" not in href:
                if href.startswith("/"):
                    pdp_url = f"https://www.amazon.com{href}"
                else:
                    pdp_url = href
                    
                parsed = urllib.parse.urlparse(pdp_url)
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
            
        # Phase 3: Extraction using Crawl4AI CSS Strategy
        logger.info("[AmazonAdapter] Crawling and extracting PDP via Crawl4AI CSS strategy: %s", pdp_url)
        
        schema = {
            "name": "amazon_product",
            "baseSelector": "body",
            "fields": [
                {"name": "name", "selector": "#productTitle", "type": "text"},
                {"name": "brand", "selector": "#bylineInfo, #brand", "type": "text"},
                {"name": "image_urls", "selector": "#landingImage, #altImages img", "type": "attribute", "attribute": "src"},
                {"name": "description", "selector": "#productDescription", "type": "text"},
                {"name": "bullets", "selector": "#feature-bullets li span", "type": "text"},
            ]
        }
        
        strategy = JsonCssExtractionStrategy(schema=schema)
        pdp_config = CrawlerRunConfig(
            extraction_strategy=strategy,
            cache_mode=CacheMode.BYPASS,
            wait_until="domcontentloaded",
            page_timeout=25000,
        )
        
        try:
            pdp_result = await engine.crawler.arun(url=pdp_url, config=pdp_config)
            if pdp_result and pdp_result.success and pdp_result.extracted_content:
                extracted_data = json.loads(pdp_result.extracted_content)
                if isinstance(extracted_data, list) and extracted_data:
                    product_data = extracted_data[0]
                elif isinstance(extracted_data, dict):
                    product_data = extracted_data
                else:
                    product_data = {}
                    
                # Post-process extracted fields
                name = product_data.get("name", "").strip()
                raw_brand = product_data.get("brand", "").strip()
                
                # Clean brand
                brand = raw_brand
                if "visit the" in raw_brand.lower():
                    match = re.search(r"(?i)visit the\s+(.+?)\s+store", raw_brand)
                    if match:
                        brand = match.group(1)
                elif "brand:" in raw_brand.lower():
                    match = re.search(r"(?i)brand:\s+(.+)", raw_brand)
                    if match:
                        brand = match.group(1)
                
                # Clean image URLs
                raw_images = product_data.get("image_urls", [])
                if isinstance(raw_images, str):
                    raw_images = [raw_images]
                cleaned_images = []
                for img_url in raw_images:
                    if img_url and isinstance(img_url, str):
                        cleaned = re.sub(r"\._[A-Z0-9_,-]+_\.", "._AC_SL1500_.", img_url)
                        if cleaned not in cleaned_images and "play-button" not in cleaned and "sprite" not in cleaned:
                            cleaned_images.append(cleaned)
                            
                # Merge description and bullets
                desc_parts = []
                desc = product_data.get("description", "")
                if desc:
                    desc_parts.append(desc.strip())
                bullets = product_data.get("bullets", [])
                if isinstance(bullets, list) and bullets:
                    desc_parts.append("\n".join([b.strip() for b in bullets if b.strip()]))
                description = "\n\n".join(desc_parts)
                
                # Build extraction payload for v1 mapping
                extraction_payload = {
                    "success": True,
                    "product": {
                        "name": name,
                        "brand": brand,
                        "description": description,
                        "image_urls": cleaned_images,
                        "upc": upc,
                    },
                    "confidence": 0.95,
                }
                
                logger.info("[AmazonAdapter] Modernized CSS strategy extraction succeeded for UPC: %s", upc)
                
                return build_v1_from_extraction_result(
                    result=extraction_payload,
                    upc=upc,
                    url=pdp_url,
                    domain="www.amazon.com",
                    model="crawl4ai-css",
                    mode="structured",
                    decision="css_extraction",
                    llm_used=False,
                    source_results=[
                        {
                            "sourceSlug": self.source_slug,
                            "sourceType": self.source_type,
                            "confidence": 0.95,
                            "matchedFields": list(extraction_payload["product"].keys()),
                            "evidenceUrl": pdp_url,
                        }
                    ],
                )
        except Exception as exc:
            logger.warning("[AmazonAdapter] CSS extraction failed with error: %s. Falling back to LLM...", exc)

        # Fallback: Original extraction via generic LLM extractor
        if extractor is not None:
            logger.info("[AmazonAdapter] Falling back to generic LLM extractor for: %s", pdp_url)
            extraction_result = await extractor.extract(
                url=pdp_url,
                upc=upc,
                product_name=self._get_product_name(),
                brand=self._get_brand(),
            )
            
            if extraction_result and extraction_result.get("success"):
                raw_confidence = extraction_result.get("confidence", 0.0)
                confidence_val = raw_confidence.get("overall", 0.0) if isinstance(raw_confidence, dict) else float(raw_confidence)
                product_data = extraction_result.get("product", extraction_result)
                matched_keys = list(product_data.keys()) if isinstance(product_data, dict) else []
                
                return build_v1_from_extraction_result(
                    result=extraction_result,
                    upc=upc,
                    url=pdp_url,
                    domain="www.amazon.com",
                    model="deepseek-chat",
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

        logger.warning("[AmazonAdapter] Extraction failed for PDP URL: %s", pdp_url)
        return None
