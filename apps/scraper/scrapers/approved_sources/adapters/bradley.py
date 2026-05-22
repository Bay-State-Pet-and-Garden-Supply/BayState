"""Bradley Caldwell Distributor Adapter.

Legacy config: legacy-scraper-archive/configs/bradley.yaml
Base URL: https://www.bradleycaldwell.com
Search: /search?term={upc}
Auth: None
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import urljoin

from scrapers.approved_sources.adapters.base import BaseDistributorCrawl4AIAdapter
from scrapers.approved_sources.types import (
    ApprovedSourceExtractionResult,
    FailureCode,
    ApprovedSourcePlanEntry,
    ApprovedSourcePlan,
)

logger = logging.getLogger(__name__)


class BradleyAdapter(BaseDistributorCrawl4AIAdapter):
    """Extract products from Bradley Caldwell (no auth)."""

    adapter_slug = "bradley_crawl4ai"
    source_slug = "bradley"
    source_type = "distributor"
    base_url = "https://www.bradleycaldwell.com"
    search_url_template = "https://www.bradleycaldwell.com/search?term={upc}"
    requires_auth = False

    def __init__(self, entry: ApprovedSourcePlanEntry, plan: ApprovedSourcePlan):
        super().__init__(entry, plan)
        self._product_page_url: str | None = None

    def build_search_url(self, upc: str) -> str:
        """Build the Bradley search URL from a UPC."""
        return self.search_url_template.format(upc=upc)

    async def _post_process_extraction(
        self,
        det_result: ApprovedSourceExtractionResult,
        search_url: str,
        source_policy: Any,
    ) -> ApprovedSourceExtractionResult | None:
        """Navigate to product page to fetch images if missing from search results."""
        if det_result.product.get("image_urls") or not self._product_page_url:
            return None

        try:
            from scrapers.approved_sources.adapters.base import get_shared_browser_engine
            from crawl4ai import CrawlerRunConfig, CacheMode

            engine = await get_shared_browser_engine()
            if not engine:
                logger.warning("[%s] Shared Crawl4AI engine not available for product page images", self.adapter_slug)
                return det_result

            config = CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                page_timeout=30000,
                wait_until="networkidle",
                remove_overlay_elements=True,
            )

            page_result = await engine.crawler.arun(url=self._product_page_url, config=config)

            if page_result and getattr(page_result, "success", False):
                page_html = getattr(page_result, "html", None) or ""
                # Extract images from product page
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(page_html, "html.parser")
                images = []
                for img in soup.select('img[src*="bigcommerce"]'):
                    src = img.get("src", "")
                    if src and "stencil" in src:
                        if src.startswith("//"):
                            src = "https:" + src
                        elif src.startswith("/"):
                            src = urljoin(self.base_url, src)
                        images.append(src)
                if images:
                    from scrapers.approved_sources.policy import filter_allowed_assets
                    det_result.product["image_urls"] = filter_allowed_assets(images, source_policy)
                    if "image_urls" not in det_result.matched_fields:
                        det_result.matched_fields.append("image_urls")
                    logger.info(
                        "[%s] Found %d images from product page: %s",
                        self.adapter_slug, len(images), self._product_page_url,
                    )
        except Exception as e:
            logger.warning("[%s] Product page image fetch failed: %s", self.adapter_slug, e)

        return det_result

    def extract_from_html(
        self, html: str, upc: str, url: str
    ) -> ApprovedSourceExtractionResult:
        """Extract product data from Bradley Caldwell HTML using legacy-inspired selectors.

        Legacy selectors (translated for HTML parsing):
        - Name: main h1
        - Brand: main h1 preceding p a
        - Image URLs: [class*='product-gallery'] img[src*='products/']
        - BCI Item Number, Manufacturer #, UPC, Case Pack, Unit of Measure: dt+dd pairs
        - Dimensions, Ingredients: li containing text
        - Description: main [class*='product-description']
        """
        result = ApprovedSourceExtractionResult(
            source_slug=self.source_slug,
            source_type=self.source_type,
        )

        if not html:
            result.failure_code = FailureCode.EXTRACTION_FAILED
            result.failure_message = "No HTML content to parse"
            return result

        product: dict = {}
        matched: list[str] = []
        warnings: list[str] = []

        try:
            from bs4 import BeautifulSoup
        except ImportError:
            # Fallback: basic string-based extraction
            return self._extract_with_regex(html, upc, url)

        soup = BeautifulSoup(html, "html.parser")

        # --- Name ---
        # main h1 (not "Search results for...")
        name = None
        for h1 in soup.select("main h1"):
            text = h1.get_text(strip=True)
            if "search results" not in text.lower():
                name = text
                break
        if name:
            product["name"] = name
            matched.append("name")

        # --- Brand ---
        # main h1 preceding-sibling::p[1]/a
        brand = None
        main_h1 = soup.select_one("main h1")
        if main_h1:
            prev_p = main_h1.find_previous("p")
            if prev_p:
                brand_link = prev_p.find("a")
                if brand_link:
                    brand = brand_link.get_text(strip=True)
        if brand:
            product["brand"] = brand
            matched.append("brand")

        # --- Image URLs ---
        images = []
        # Find product gallery images
        gallery = soup.select_one("[class*='product-gallery']")
        if gallery:
            for img in gallery.select("img[src*='products/']"):
                src = img.get("src") or img.get("data-src") or ""
                if src:
                    if src.startswith("//"):
                        src = "https:" + src
                    elif src.startswith("/"):
                        src = urljoin(self.base_url, src)
                    images.append(src)
        if images:
            product["image_urls"] = images
            matched.append("image_urls")

        # --- Detail fields (dt+dd pairs) ---
        detail_map = {
            "BCI Item Number": "bci_item_number",
            "Manufacturer #": "manufacturer_number",
            "UPC": "upc",
            "Case Pack": "case_pack",
            "Unit of Measure": "unit_of_measure",
        }
        for dt in soup.select("dt"):
            dt_text = dt.get_text(strip=True)
            if dt_text in detail_map:
                dd = dt.find_next("dd")
                if dd:
                    value = dd.get_text(strip=True)
                    product[detail_map[dt_text]] = value
                    matched.append(detail_map[dt_text])

        # --- Weight ---
        weight_elem = soup.find("li", string=re.compile(r"Weight:", re.I))
        if weight_elem:
            weight = weight_elem.get_text(strip=True)
            product["weight"] = weight
            matched.append("weight")

        # --- Description ---
        desc = None
        for cls in ["product-description", "prose"]:
            desc_elem = soup.select_one(f"main [class*='{cls}']")
            if desc_elem:
                desc = desc_elem.get_text(strip=True)
                break
        if not desc:
            # fallback: main section p
            section = soup.select_one("main section")
            if section:
                desc = section.get_text(strip=True)[:500]
        if desc:
            product["description"] = desc
            matched.append("description")

        # Check if we found enough
        if not product.get("name"):
            # Try BigCommerce headless structure (2025+ site redesign)
            self._extract_bigcommerce_headless(soup, upc, product, matched, warnings)

        if not product.get("name"):
            # Check for no-results message
            no_results = soup.find(
                "h3", string=re.compile(r"Sorry, no results for", re.I)
            )
            if no_results:
                result.success = False
                result.failure_code = FailureCode.NO_MATCH
                result.failure_message = f"No match found for UPC {upc}"
            else:
                result.success = False
                result.failure_code = FailureCode.EXTRACTION_FAILED
                result.failure_message = "Could not extract product name from HTML"
            result.warnings = warnings
            return result

        # Calculate confidence
        required = ["name", "brand"]
        found_required = [f for f in required if f in product]
        confidence = len(found_required) / len(required) if required else 0.5
        # Bonus for more fields
        bonus = min(len(matched) / 8, 0.3)
        confidence = min(confidence + bonus, 1.0)

        result.success = True
        result.product = product
        result.matched_fields = matched
        result.confidence = confidence
        result.warnings = warnings
        return result

    def _extract_bigcommerce_headless(
        self,
        soup: Any,
        upc: str,
        product: dict,
        matched: list[str],
        warnings: list[str],
    ) -> None:
        """Extract from BigCommerce headless/Next.js storefront HTML (2025+ redesign).

        The new site uses Tailwind CSS classes and client-side rendering.
        Product data appears in search results as:
        - Name: link with href like /product-slug-upc -> "E-Z HANG SCALE"
        - Brand: span.block.text-sm ("KERBL")
        - Details: text content with patterns like "BCI#:001135"
        """
        # Find product links that look like product pages
        # BigCommerce headless uses slug-based URLs like /e-z-hang-scale-silver-up-to-55-lb-001135
        # We iterate over all a[href] links, skip non-product links, climb up the DOM tree (max 5 levels),
        # and search if the UPC (UPC or BCI#) is in the container's text or the link's href.
        product_link = None
        product_container = None
        found_card = False

        # Clean UPC for matching
        sku_clean = re.sub(r'[^a-zA-Z0-9]', '', upc.lower())

        for a in soup.select('a[href]'):
            href = a.get('href', '')
            text = a.get_text(strip=True)
            
            # Skip non-product links
            href_lower = href.lower()
            if any(x in href_lower for x in ['/cart', '/checkout', '/account', '/login', '/register', '/wishlist', '/search', '/contact', '/about', '/blog', '/faq']):
                continue
            if href in ['', '#', '/']:
                continue
            if href.startswith(('javascript:', 'mailto:', 'tel:')):
                continue

            # Climb up to 5 levels
            container = a
            for level in range(5):
                if container is None or not hasattr(container, 'get_text'):
                    break
                
                # Stop climbing if we hit high-level generic page containers
                if getattr(container, 'name', None) in ('body', 'html', 'main', 'form'):
                    break

                # Avoid matching list/grid containers that hold multiple products.
                # If this container contains other active product links, stop climbing.
                other_product_links = 0
                for other_a in container.select('a[href]'):
                    other_href = other_a.get('href', '')
                    if other_href == href or other_href == href + '/' or href == other_href + '/':
                        continue
                    other_href_lower = other_href.lower()
                    if any(x in other_href_lower for x in ['/cart', '/checkout', '/account', '/login', '/register', '/wishlist', '/search', '/contact', '/about', '/blog', '/faq']):
                        continue
                    if other_href in ['', '#', '/'] or other_href.startswith(('javascript:', 'mailto:', 'tel:')):
                        continue
                    other_product_links += 1

                if other_product_links > 0:
                    break

                container_text = container.get_text()
                container_text_lower = container_text.lower()
                
                # Check direct substring match
                sku_in_text = upc.lower() in container_text_lower
                sku_in_href = upc.lower() in href_lower
                
                # Check normalized match
                norm_container_text = re.sub(r'[^a-zA-Z0-9]', '', container_text_lower)
                norm_href = re.sub(r'[^a-zA-Z0-9]', '', href_lower)
                
                norm_sku_in_text = sku_clean and (sku_clean in norm_container_text)
                norm_sku_in_href = sku_clean and (sku_clean in norm_href)

                if sku_in_text or sku_in_href or norm_sku_in_text or norm_sku_in_href:
                    # Let's ensure the link has text (potential product title)
                    if len(text) > 3 and "search results" not in text.lower():
                        product_link = a
                        product_container = container
                        found_card = True
                        break
                
                container = container.parent
            if found_card:
                break

        if not product_link or not product_container:
            return

        # Store product page URL for image extraction in post-processing
        self._product_page_url = urljoin(self.base_url, product_link.get('href', ''))

        product["name"] = product_link.get_text(strip=True)
        matched.append("name")

        card_text = product_container.get_text()

        # Extract brand: look for a span near the product name
        # In BigCommerce headless, brand is in a span.block.text-sm
        for span in product_container.select('span[class*="text-sm"]'):
            text = span.get_text(strip=True)
            if text and len(text) < 50 and text != product.get('name'):
                if not any(c.isdigit() for c in text) and ':' not in text:
                    product['brand'] = text
                    matched.append('brand')
                    break

        # Extract detail fields from text content using flexible regex patterns
        # Matching different UPC/BCI# formats and other details (e.g., UPC Code:, BCI#:)
        detail_patterns = {
            r'(?:BCI#|BCI\s*Number|Item\s*#)\s*:\s*(\S+)': 'bci_item_number',
            r'(?:Manufacturer\s*#|MFG\s*#|Model\s*#)\s*:\s*(\S+)': 'manufacturer_number',
            r'(?:UPC\s*Code|UPC)\s*:\s*(\S+)': 'upc',
            r'(?:Size)\s*:\s*([^:\n]+)': 'size',
            r'(?:Type)\s*:\s*(\S+)': 'type',
            r'(?:Case\s*Pack|Pack)\s*:\s*(\S+)': 'case_pack',
        }
        for pattern, field in detail_patterns.items():
            match = re.search(pattern, card_text, re.IGNORECASE)
            if match:
                val = match.group(1).strip().rstrip(',.;')
                product[field] = val
                if field not in matched:
                    matched.append(field)

        # Extract images from the product card area
        images = []
        for img in product_container.select('img[src]'):
            src = img.get('src', '')
            if src and ('bigcommerce' in src or 'products' in src or 'cdn' in src):
                if src.startswith('//'):
                    src = 'https:' + src
                elif src.startswith('/'):
                    src = urljoin(self.base_url, src)
                images.append(src)
        if images:
            product['image_urls'] = images
            if 'image_urls' not in matched:
                matched.append('image_urls')

    def _extract_with_regex(
        self, html: str, upc: str, url: str
    ) -> ApprovedSourceExtractionResult:
        """Fallback regex-based extraction when BeautifulSoup is not available."""
        result = ApprovedSourceExtractionResult(
            source_slug=self.source_slug,
            source_type=self.source_type,
        )

        product: dict = {}
        matched: list[str] = []

        # Try to extract title from <title> tag
        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
        if title_match:
            title = title_match.group(1).strip()
            if "search" not in title.lower():
                product["name"] = title
                matched.append("name")

        # Check for no-results
        if re.search(r"Sorry, no results for", html, re.I):
            result.success = False
            result.failure_code = FailureCode.NO_MATCH
            result.failure_message = f"No match found for UPC {upc}"
            return result

        if not product.get("name"):
            result.success = False
            result.failure_code = FailureCode.EXTRACTION_FAILED
            result.failure_message = "Could not extract product name via regex"
            return result

        # Minimal: try to get images
        img_matches = re.findall(
            r'<img[^>]+src=["\']([^"\']*products/[^"\']+)["\']', html
        )
        if img_matches:
            images = []
            for img_src in img_matches:
                if img_src.startswith("//"):
                    img_src = "https:" + img_src
                elif img_src.startswith("/"):
                    img_src = urljoin(self.base_url, img_src)
                images.append(img_src)
            product["image_urls"] = images
            matched.append("image_urls")

        result.success = True
        result.product = product
        result.matched_fields = matched
        result.confidence = 0.5
        return result

    def normalize_images(self, urls: list[str]) -> list[str]:
        """Apply Bradley image quality replacements.
        From legacy: /small/ -> /large/, _small -> _large, _thumbnail -> _large
        """
        normalized = []
        for url in urls:
            url = re.sub(r"/small/", "/large/", url)
            url = re.sub(r"_small", "_large", url)
            url = re.sub(r"_thumbnail", "_large", url)
            normalized.append(url)
        return normalized
