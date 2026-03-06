"""crawl4ai-based product extraction."""

import json
import logging
import os
from typing import Any, Optional

from scrapers.ai_discovery.extraction import ExtractionUtils
from scrapers.ai_discovery.matching import MatchingUtils
from scrapers.ai_discovery.scoring import SearchScorer
# Using centralized engine
from crawl4ai_engine.engine import Crawl4AIEngine

logger = logging.getLogger(__name__)


class Crawl4AIExtractor:
    """Handles product extraction using crawl4ai."""

    def __init__(self, headless: bool, llm_model: str, scoring: SearchScorer, matching: MatchingUtils):
        self.headless = headless
        self.llm_model = llm_model
        self._scoring = scoring
        self._matching = matching
        self._extraction = ExtractionUtils(scoring)

    async def extract(
        self,
        url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
    ) -> dict[str, Any]:
        """Extract product data using centralized Crawl4AIEngine."""
        try:
            from pydantic import BaseModel, Field
            from crawl4ai.extraction_strategy import LLMExtractionStrategy
            from crawl4ai import LLMConfig

            class ProductData(BaseModel):
                product_name: str = Field(description="The exact product name")
                brand: str = Field(description="The brand name")
                description: str = Field(description="Full product description")
                size_metrics: str = Field(description="Size, weight, volume, or dimensions")
                images: list[str] = Field(description="List of product image URLs")
                categories: list[str] = Field(description="Product types, categories, or tags")

            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                return {"success": False, "error": "OPENAI_API_KEY not set"}

            instruction = self._build_instruction(sku, brand, product_name)

            llm_strategy = LLMExtractionStrategy(
                llm_config=LLMConfig(
                    provider=f"openai/{self.llm_model}",
                    api_token=api_key,
                ),
                schema=ProductData.model_json_schema(),
                extraction_type="schema",
                instruction=instruction,
            )

            # Centralized engine configuration leveraging new features
            engine_config = {
                "browser": {
                    "headless": self.headless,
                    "viewport": {"width": 1920, "height": 1080},
                },
                "crawler": {
                    "magic": True,
                    "simulate_user": True,
                    "remove_overlay_elements": True,
                    "cache_mode": "BYPASS", # Discovery usually wants fresh data
                    "js_code": self._get_scroll_js(),
                    "extraction_strategy": llm_strategy,
                    "timeout": 30000,
                }
            }

            async with Crawl4AIEngine(engine_config) as engine:
                result = await engine.crawl(url)

                if result.get("success") and result.get("extracted_content"):
                    extracted_content = result["extracted_content"]
                    if isinstance(extracted_content, str):
                        raw_content = extracted_content.strip()
                        if raw_content.startswith("[") and '"error"' in raw_content.lower() and "auth" in raw_content.lower():
                            return None  # Signal to use fallback

                    try:
                        data = json.loads(extracted_content)
                        if data and isinstance(data, list):
                            product_data = data[0]
                            product_data["success"] = True
                            product_data["url"] = url

                            required_fields = ["product_name", "brand", "description", "size_metrics", "images", "categories"]
                            filled = sum(1 for f in required_fields if product_data.get(f))
                            product_data["confidence"] = filled / len(required_fields)

                            return product_data
                    except json.JSONDecodeError:
                        return {
                            "success": False,
                            "error": "Could not parse extraction result",
                            "raw_response": extracted_content[:500],
                        }
                
                return {
                    "success": False,
                    "error": result.get("error") or "Extraction failed or returned no content",
                }

        except Exception as e:
            logger.error(f"[AI Discovery] Extraction failed: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    def _build_instruction(self, sku: str, brand: Optional[str], product_name: Optional[str]) -> str:
        """Build the LLM extraction instruction."""
        return f"""Extract structured product data for a single SKU-locked product page.

TARGET CONTEXT
- SKU: {sku}
- Expected Brand (may be null): {brand or "Unknown"}
- Expected Product Name: {product_name or "Unknown"}

CRITICAL EXTRACTION RULES
1) SKU / VARIANT LOCK (FUZZY VALIDATION)
   - Ensure extracted product refers to the same variant as the target SKU context.
   - Match using fuzzy evidence across: SKU text, size/weight, color, flavor, form-factor terms.
   - Do NOT output data for a different variant from carousel/recommendations.

2) BRAND INFERENCE
   - If Expected Brand is Unknown/null, infer brand from the product title, breadcrumb, manufacturer field, or structured data.
   - Return the canonical brand string (not store name).

3) MUST-FILL CHECKLIST BEFORE FINAL OUTPUT
   - product_name: required
   - images: at least 1 required
   - brand, description, size_metrics, categories: strongly preferred
   - If a required field cannot be found, keep searching the same page context (JSON-LD, meta, visible PDP modules) before giving up.

4) SIZE METRICS EXTRACTION
   - Extract size, weight, volume, or dimensions (e.g., "5 lb bag", "12oz bottle", "24-pack")
   - Look in title, product specs, variant selectors, or packaging information

5) CATEGORIES EXTRACTION
   - Extract product types, categories, or tags (e.g., ["Dog Food", "Dry Food", "Grain-Free"])
   - Look in breadcrumbs, category navigation, product tags, or structured data

6) IMAGE PRIORITIZATION
     - images: Extract ALL high-resolution product image URLs from the image carousel, gallery thumbnails, and JSON-LD structured data blocks.
     - Look carefully for `data-src` attributes, `<script type="application/ld+json">`, and elements with classes like `carousel` or `gallery`.
     - Do not just grab the first image. Return absolute URLs only (https://...).
     - Put primary hero image first, then additional product angles, variants, and detail shots.
     - Exclude sprites, icons, logos, and unrelated recommendation images.
     - DO NOT HALLUCINATE OR INVENT URLS. If you cannot find absolute URLs on the current domain, return an empty list.

7) DESCRIPTION QUALITY
   - Extract meaningful product description/spec text for the exact variant, not generic category copy.

OUTPUT QUALITY BAR
- Return the most complete, variant-accurate record possible.
- Do not hallucinate missing values."""

    def _get_scroll_js(self) -> str:
        """Get JavaScript for lazy loading trigger."""
        return """
        async () => {
            window.scrollTo(0, document.body.scrollHeight);
            await new Promise(resolve => setTimeout(resolve, 1000));
            window.scrollTo(0, 0);
            await new Promise(resolve => setTimeout(resolve, 500));
            const carousels = document.querySelectorAll('[class*="carousel"], [class*="gallery"], [data-carousel], [role="carousel"]');
            for (const carousel of carousels) {
                carousel.scrollLeft += 200;
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        """


class FallbackExtractor:
    """Fallback extraction using HTTP and JSON-LD."""

    def __init__(self, scoring: SearchScorer, matching: MatchingUtils):
        self._scoring = scoring
        self._matching = matching
        self._extraction = ExtractionUtils(scoring)

    async def extract(
        self,
        url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
    ) -> dict[str, Any]:
        """Extract using HTTP fetch and JSON-LD parsing."""
        try:
            import httpx

            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                html_text = response.text

            jsonld_result = self._extraction.extract_product_from_html_jsonld(
                html_text=html_text,
                source_url=str(response.url),
                sku=sku,
                product_name=product_name,
                brand=brand,
                matching_utils=self._matching,
            )
            if jsonld_result:
                jsonld_result["url"] = str(response.url)
                return jsonld_result

            # Fallback to meta tags
            import re
            import html as html_module

            title_match = re.search(r"<title[^>]*>(.*?)</title>", html_text, flags=re.IGNORECASE | re.DOTALL)
            title_text = html_module.unescape(title_match.group(1)).strip() if title_match else ""
            og_title = self._extraction.extract_meta_content(html_text, "og:title", property_attr=True) or ""
            og_description = self._extraction.extract_meta_content(html_text, "og:description", property_attr=True) or ""
            og_image = self._extraction.extract_meta_content(html_text, "og:image", property_attr=True) or ""

            images = self._extraction.normalize_images([og_image], str(response.url)) if og_image else []

            candidate_name = og_title or title_text
            if candidate_name and product_name and not self._matching.is_name_match(product_name, candidate_name):
                return {
                    "success": False,
                    "error": "Fallback extraction title does not match expected product",
                }

            if brand and candidate_name and not self._matching.is_brand_match(brand, candidate_name, str(response.url)):
                return {
                    "success": False,
                    "error": "Fallback extraction brand/domain does not match expected context",
                }

            if not candidate_name or not images:
                return {
                    "success": False,
                    "error": "Fallback extraction found no structured product data",
                }

            fallback_description = og_description or title_text
            fallback_size = self._extraction.extract_size_metrics(f"{candidate_name} {fallback_description}")
            confidence = 0.58
            if product_name and self._matching.is_name_match(product_name, candidate_name):
                confidence += 0.1
            if brand and self._matching.is_brand_match(brand, candidate_name, str(response.url)):
                confidence += 0.1
            confidence = min(confidence, 0.78)

            return {
                "success": True,
                "product_name": candidate_name,
                "brand": brand,
                "description": fallback_description,
                "size_metrics": fallback_size,
                "images": images,
                "categories": ["Product"],
                "confidence": confidence,
                "url": str(response.url),
            }

        except Exception as error:
            return {
                "success": False,
                "error": f"Fallback extraction failed: {error}",
            }
