"""Main AI Discovery Scraper implementation."""

import asyncio
import importlib
import json
import logging
import os
from typing import Any, Optional

from scrapers.ai_cost_tracker import AICostTracker
from scrapers.ai_metrics import record_ai_extraction
from scrapers.ai_discovery.models import DiscoveryResult
from scrapers.ai_discovery.scoring import SearchScorer
from scrapers.ai_discovery.matching import MatchingUtils
from scrapers.ai_discovery.extraction import ExtractionUtils
from scrapers.ai_discovery.search import BraveSearchClient
from scrapers.ai_discovery.query_builder import QueryBuilder
from scrapers.ai_discovery.validation import ExtractionValidator

logger = logging.getLogger(__name__)


class AIDiscoveryScraper:
    """AI-powered discovery scraper for universal product extraction.

    This scraper doesn't require pre-configured site definitions. Instead, it:
    1. Searches for the product using Brave Search API
    2. Uses AI to identify the most likely manufacturer/official product page
    3. Navigates to that page and extracts structured data
    4. Returns results in a standardized format
    """

    def __init__(
        self,
        headless: bool = True,
        max_search_results: int = 5,
        max_steps: int = 15,
        confidence_threshold: float = 0.7,
        llm_model: str = "gpt-4o-mini",
    ):
        """Initialize the AI discovery scraper.

        Args:
            headless: Whether to run browser in headless mode
            max_search_results: Number of search results to analyze
            max_steps: Maximum browser actions per extraction
            confidence_threshold: Minimum confidence score to accept result
            llm_model: LLM model to use for AI extraction
        """
        self.headless = headless
        self.max_search_results = max_search_results
        self.max_steps = max_steps
        self.confidence_threshold = confidence_threshold
        self.llm_model = llm_model
        self.use_ai_source_selection = os.getenv("AI_DISCOVERY_USE_LLM_SOURCE_RANKING", "false").lower() == "true"
        self._cost_tracker = AICostTracker()
        self._browser: Any = None
        self._llm: Any = None

        # Initialize submodules
        self._scoring = SearchScorer()
        self._matching = MatchingUtils()
        self._extraction = ExtractionUtils(self._scoring)
        self._search_client = BraveSearchClient(max_results=max_search_results)
        self._query_builder = QueryBuilder()
        self._validator = ExtractionValidator(confidence_threshold)

    async def scrape_products_batch(
        self,
        items: list[dict[str, Any]],
        max_concurrency: int = 4,
    ) -> list[DiscoveryResult]:
        """Scrape multiple products in batch."""
        semaphore = asyncio.Semaphore(max(1, max_concurrency))

        async def _run_one(item: dict[str, Any]) -> DiscoveryResult:
            async with semaphore:
                sku = str(item.get("sku", "")).strip()
                if not sku:
                    return DiscoveryResult(success=False, sku="", error="Missing sku")
                return await self.scrape_product(
                    sku=sku,
                    product_name=item.get("product_name"),
                    brand=item.get("brand"),
                    category=item.get("category"),
                )

        return await asyncio.gather(*[_run_one(item) for item in items])

    async def scrape_product(
        self,
        sku: str,
        product_name: Optional[str] = None,
        brand: Optional[str] = None,
        category: Optional[str] = None,
    ) -> DiscoveryResult:
        """Scrape a product using AI discovery.

        Args:
            sku: Product SKU or identifier
            product_name: Product name (optional, helps search)
            brand: Product brand (optional, helps identify manufacturer site)
            category: Product category (optional)

        Returns:
            DiscoveryResult with extracted data
        """
        try:
            # Step 1: Build search query
            search_query = self._query_builder.build_search_query(sku, product_name, brand, category)
            logger.info(f"[AI Discovery] Searching for: {search_query}")

            # Step 2: Search for product pages
            search_results: list[dict[str, Any]] = []
            search_error: Optional[str] = None
            best_score_seen = float("-inf")
            for query_variant in self._query_builder.build_query_variants(
                sku=sku,
                product_name=product_name,
                brand=brand,
                category=category,
            ):
                raw_results, raw_error = await self._search_client.search(query_variant)
                prepared_results = self._scoring.prepare_search_results(raw_results, sku, brand, product_name, category)
                if prepared_results:
                    top_score = self._scoring.score_search_result(
                        result=prepared_results[0],
                        sku=sku,
                        brand=brand,
                        product_name=product_name,
                        category=category,
                    )
                    if top_score > best_score_seen:
                        best_score_seen = top_score
                        search_results = prepared_results
                        search_error = None
                    if top_score >= 8.0:
                        break
                search_error = raw_error

            if not search_results:
                error_msg = search_error or "No search results found"
                return DiscoveryResult(success=False, sku=sku, error=error_msg)

            # Step 3-5: Try extracting from each source with fallback
            max_attempts = 3
            extraction_result: Optional[dict[str, Any]] = None
            accepted_result: Optional[dict[str, Any]] = None
            last_rejection_reason: Optional[str] = None
            target_url = None
            tried_urls: set[str] = set()

            for attempt in range(max_attempts):
                if attempt == 0:
                    target_url = self._scoring.pick_strong_candidate_url(
                        search_results=search_results,
                        sku=sku,
                        brand=brand,
                        product_name=product_name,
                        category=category,
                    )
                    if not target_url:
                        if self.use_ai_source_selection:
                            target_url = await self._identify_best_source(search_results, sku, brand, product_name)
                        else:
                            target_url = self._heuristic_source_selection(search_results, brand)
                else:
                    target_url = str(search_results[0].get("url") or "")

                if not target_url or target_url in tried_urls:
                    if attempt < max_attempts - 1:
                        search_results = [r for r in search_results if r.get("url") != target_url]
                        continue
                    return DiscoveryResult(success=False, sku=sku, error="Could not identify suitable product page")

                logger.info(f"[AI Discovery] Selected source (attempt {attempt + 1}): {target_url}")

                selected_result = next((result for result in search_results if result.get("url") == target_url), None)
                if selected_result and self._scoring.is_low_quality_result(selected_result):
                    last_rejection_reason = "Selected source appears to be a non-product/review/aggregator page"
                    logger.info(f"[AI Discovery] Attempt {attempt + 1} rejected source before extraction: {target_url} ({last_rejection_reason})")
                    search_results = [r for r in search_results if r.get("url") != target_url]
                    if not search_results:
                        logger.warning("[AI Discovery] No more search results to try")
                        break
                    continue

                tried_urls.add(target_url)

                # Step 4: Extract product data from the selected page
                extraction_result = await self._extract_product_data(target_url, sku, product_name, brand)

                is_acceptable, rejection_reason = self._validator.validate_extraction_match(
                    extraction_result=extraction_result,
                    sku=sku,
                    product_name=product_name,
                    brand=brand,
                    source_url=target_url,
                )
                if is_acceptable:
                    accepted_result = extraction_result
                    break

                last_rejection_reason = rejection_reason
                logger.info(f"[AI Discovery] Attempt {attempt + 1} rejected extracted data from {target_url}: {rejection_reason}. Trying next source...")

                # Remove tried URL from results and try next
                search_results = [r for r in search_results if r.get("url") != target_url]
                if not search_results:
                    logger.warning("[AI Discovery] No more search results to try")
                    break

            if not accepted_result:
                if extraction_result and extraction_result.get("error"):
                    error_msg = str(extraction_result.get("error"))
                elif last_rejection_reason:
                    error_msg = f"All extraction attempts rejected: {last_rejection_reason}"
                else:
                    error_msg = "All extraction attempts failed"
                return DiscoveryResult(success=False, sku=sku, error=error_msg)

            # Step 5: Record metrics
            cost_summary = self._cost_tracker.get_cost_summary()
            record_ai_extraction(
                scraper_name=f"ai_discovery_{brand or 'unknown'}",
                success=bool(accepted_result.get("success", False)),
                cost_usd=cost_summary.get("total_cost_usd", 0),
                duration_seconds=0.0,
                anti_bot_detected=bool(accepted_result.get("anti_bot_detected", False)),
            )

            # Build result
            if accepted_result.get("success"):
                return DiscoveryResult(
                    success=True,
                    sku=sku,
                    product_name=accepted_result.get("product_name") or product_name,
                    brand=accepted_result.get("brand") or brand,
                    description=accepted_result.get("description"),
                    size_metrics=accepted_result.get("size_metrics"),
                    images=accepted_result.get("images", []),
                    categories=accepted_result.get("categories", []),
                    url=target_url,
                    source_website=str(__import__("urllib.parse", fromlist=["urlparse"]).urlparse(target_url).netloc),
                    confidence=float(accepted_result.get("confidence", 0) or 0),
                    cost_usd=cost_summary.get("total_cost_usd", 0),
                )
            else:
                return DiscoveryResult(
                    success=False,
                    sku=sku,
                    error=str(accepted_result.get("error", "Extraction failed")),
                    cost_usd=cost_summary.get("total_cost_usd", 0),
                )

        except Exception as e:
            logger.error(f"[AI Discovery] Error scraping {sku}: {e}")
            return DiscoveryResult(success=False, sku=sku, error=str(e))

    async def _identify_best_source(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        brand: Optional[str],
        product_name: Optional[str],
    ) -> Optional[str]:
        """Use AI to identify the best product page from search results."""
        try:
            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                logger.error("OPENAI_API_KEY not set")
                return self._heuristic_source_selection(search_results, brand)

            browser_llm_module = __import__("browser_use.llm", fromlist=["ChatOpenAI"])
            ChatOpenAI = getattr(browser_llm_module, "ChatOpenAI")

            llm = ChatOpenAI(
                model=self.llm_model,
                api_key=api_key,
                temperature=0,
            )

            results_text = "\n\n".join(
                [
                    f"{i + 1}. URL: {r['url']}\nTitle: {r['title']}\nDescription: {r['description']}"
                    for i, r in enumerate(search_results[: self.max_search_results])
                ]
            )

            prompt = f"""You are ranking search results to select the single best product page for structured extraction.

INPUT PRODUCT CONTEXT
- SKU: {sku or "Unknown"}
- Brand (may be null): {brand or "Unknown"}
- Product Name: {product_name or "Unknown"}

SEARCH RESULTS
{results_text}

INSTRUCTIONS
1) Infer the likely canonical brand when Brand is Unknown by using Product Name tokens and search result titles/descriptions.
2) Score each result using this weighted rubric (0-100 total):
   - Domain authority & source tier (0-45)
      - 45: official manufacturer / official brand domain for inferred brand
     - 30: major trusted retailer PDP (Home Depot, Lowe's, Walmart, Target, Chewy, Tractor Supply, Ace)
     - 10: marketplace / affiliate / review / aggregator pages
   - SKU/variant relevance (0-30)
     - Explicit SKU match or exact variant tokens (size/color/form) in title/snippet/url
   - Content quality signals (0-25)
     - Strong signals: explicit price mention, stock/availability hint, product detail depth, image-rich PDP indicators
     - Penalize thin pages, category pages, blog/review pages, comparison pages, or "best X" roundups

REQUIRED DECISION POLICY
- Prefer manufacturer page if it is plausibly the exact SKU/variant.
- If no viable manufacturer result exists, choose best major retailer PDP.
- NEVER select category pages, listicles, review roundups, or social/video pages when any PDP is available.
- A valid candidate should usually include product-level URL patterns (/product, /products, /p/) or explicit PDP cues in title/snippet.
- If all results are low quality or likely non-PDP, return 0.

OUTPUT FORMAT (STRICT)
- Return ONLY one integer from 1 to {len(search_results[: self.max_search_results])} for the best result.
- Return 0 only if none are suitable product pages."""

            import re

            response = await llm.ainvoke(prompt)
            response_text = response.content if hasattr(response, "content") else str(response)

            try:
                match = re.search(r"-?\d+", response_text)
                selection = int(match.group(0)) if match else 0
                if 1 <= selection <= len(search_results):
                    return search_results[selection - 1]["url"]
            except ValueError:
                logger.warning(f"[AI Discovery] Could not parse AI selection: {response_text}")

            return self._heuristic_source_selection(search_results, brand)

        except Exception as e:
            logger.error(f"[AI Discovery] Source identification failed: {e}")
            return self._heuristic_source_selection(search_results, brand)

    def _heuristic_source_selection(
        self,
        search_results: list[dict[str, Any]],
        brand: Optional[str],
    ) -> Optional[str]:
        """Fallback heuristic to select best source without AI."""
        if not search_results:
            return None

        scored = sorted(
            search_results,
            key=lambda result: self._scoring.score_search_result(result, "", brand, None, None),
            reverse=True,
        )

        for result in scored:
            if not self._scoring.is_low_quality_result(result):
                return str(result.get("url") or "")

        return str(scored[0].get("url") or "")

    async def _extract_product_data(
        self,
        url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
    ) -> dict[str, Any]:
        """Extract product data from the selected URL using crawl4ai."""
        try:
            from pydantic import BaseModel, Field

            try:
                crawl4ai_module = importlib.import_module("crawl4ai")
                extraction_module = importlib.import_module("crawl4ai.extraction_strategy")
            except ModuleNotFoundError:
                return await self._extract_product_data_fallback(
                    url=url,
                    sku=sku,
                    product_name=product_name,
                    brand=brand,
                )

            AsyncWebCrawler = getattr(crawl4ai_module, "AsyncWebCrawler")
            BrowserConfig = getattr(crawl4ai_module, "BrowserConfig")
            CrawlerRunConfig = getattr(crawl4ai_module, "CrawlerRunConfig")
            CacheMode = getattr(crawl4ai_module, "CacheMode")
            LLMConfig = getattr(crawl4ai_module, "LLMConfig")
            LLMExtractionStrategy = getattr(extraction_module, "LLMExtractionStrategy")

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

            browser_config = BrowserConfig(
                headless=self.headless,
                viewport={"width": 1920, "height": 1080},
            )

            instruction = self._build_extraction_instruction(sku, brand, product_name)

            llm_strategy = LLMExtractionStrategy(
                llm_config=LLMConfig(
                    provider=f"openai/{self.llm_model}",
                    api_token=api_key,
                ),
                schema=ProductData.model_json_schema(),
                extraction_type="schema",
                instruction=instruction,
            )

            scroll_js = self._get_scroll_javascript()

            crawl_config = CrawlerRunConfig(
                extraction_strategy=llm_strategy,
                cache_mode=CacheMode.BYPASS,
                js_code=scroll_js,
                delay_before_return_html=2.0,
                word_count_threshold=1,
            )

            async with AsyncWebCrawler(config=browser_config) as crawler:
                result = await crawler.arun(url=url, config=crawl_config)

                if result.success and result.extracted_content:
                    if isinstance(result.extracted_content, str):
                        raw_content = result.extracted_content.strip()
                        if raw_content.startswith("[") and '"error"' in raw_content.lower() and "auth" in raw_content.lower():
                            return await self._extract_product_data_fallback(
                                url=url,
                                sku=sku,
                                product_name=product_name,
                                brand=brand,
                            )

                    try:
                        data = json.loads(result.extracted_content)
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
                            "raw_response": result.extracted_content[:500],
                        }
                return {
                    "success": False,
                    "error": result.error_message or "Extraction failed or returned no content",
                }

        except Exception as e:
            logger.error(f"[AI Discovery] Extraction failed: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    def _build_extraction_instruction(self, sku: str, brand: Optional[str], product_name: Optional[str]) -> str:
        """Build the LLM extraction instruction prompt."""
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
   - If a required field cannot be found, keep searching the same page context before giving up.

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

    def _get_scroll_javascript(self) -> str:
        """Get JavaScript for scrolling to trigger lazy loading."""
        return """
        async () => {
            // Scroll down to bottom to trigger lazy loading
            window.scrollTo(0, document.body.scrollHeight);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Scroll back up
            window.scrollTo(0, 0);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Try to find and interact with carousel elements
            const carousels = document.querySelectorAll('[class*="carousel"], [class*="gallery"], [data-carousel], [role="carousel"]');
            for (const carousel of carousels) {
                carousel.scrollLeft += 200;
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        """

    async def _extract_product_data_fallback(
        self,
        url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
    ) -> dict[str, Any]:
        """Fallback extraction using HTTP fetch and JSON-LD parsing."""
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


# Convenience function for direct usage
async def scrape_product(sku: str, product_name: Optional[str] = None, brand: Optional[str] = None, **kwargs) -> DiscoveryResult:
    """Scrape a product using AI discovery.

    Convenience function that creates a scraper instance and runs extraction.
    """
    scraper = AIDiscoveryScraper(**kwargs)
    return await scraper.scrape_product(sku, product_name, brand)
