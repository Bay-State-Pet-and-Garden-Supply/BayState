"""Search result scoring and filtering logic."""

import re
from typing import Any, Optional
from urllib.parse import urlparse

from scrapers.ai_search.matching import MatchingUtils


class SearchScorer:
    """Handles scoring and filtering of search results."""

    # High-quality large retailers that are generally safe fallback PDP sources.
    MAJOR_RETAILERS = {
        "amazon.com",
        "walmart.com",
        "target.com",
        "chewy.com",
        "petco.com",
        "petsmart.com",
        "tractorsupply.com",
        "homedepot.com",
        "lowes.com",
        "acehardware.com",
        "costco.com",
    }

    # Smaller or specialty retailers/distributors that can still be useful, but
    # should rank behind official sites and the major retailers above.
    SECONDARY_RETAILERS = {
        "berings.com",
        "farmstore.com",
        "hugglepets.co.uk",
        "mickeyspetsupplies.com",
        "rachelspetsupply.com",
        "animalproductsshop.com",
        "petedge.com",
        "animalsupply.com",
        "phillipspet.com",
        "frontiercoop.com",
        "petsuppliesplus.com",
        "bradleycaldwell.com",
        "petswarehouse.com",
    }

    MARKETPLACES = {
        "ebay.com",
    }

    TRUSTED_RETAILERS = MAJOR_RETAILERS | SECONDARY_RETAILERS

    # Blocked domains (social media, aggregators, barcode-lookup, SEO-spam)
    BLOCKED_DOMAINS = {
        # Social media
        "reddit.com",
        "pinterest.com",
        "youtube.com",
        "facebook.com",
        "instagram.com",
        "tiktok.com",
        "medium.com",
        "quora.com",
        # Barcode / UPC lookup databases
        "upcitemdb.com",
        "barcodelookup.com",
        "upcdatabase.org",
        "buycott.com",
        "barcode-list.com",
        "digit-eyes.com",
        "upcindex.com",
        "go-upc.com",
        "upcscavenger.com",
        "eandata.com",
        "upccodesearch.com",
        "upc-search.org",
        "barcodesinc.com",
        # Price comparison / aggregators
        "pricerunner.com",
        "pricegrabber.com",
        "shopzilla.com",
        "shopping.google.com",
        "nextag.com",
        "bizrate.com",
        # Coupon / cashback SEO
        "retailmenot.com",
        "coupons.com",
        "slickdeals.net",
        # Google infrastructure
        "vertexaisearch.cloud.google.com",
    }

    # Low quality phrases to penalize. These are matched as words/phrases rather than
    # raw substrings so legitimate PDPs like "...ideal-for..." do not trip the "deal" filter.
    LOW_QUALITY_PATTERNS = [
        r"\breview\b",
        r"\bbest\b",
        r"\btop 10\b",
        r"\bcomparison\b",
        r"\bvs\b",
        r"\breddit\b",
        r"\bpinterest\b",
        r"\byoutube\b",
        r"\bfacebook\b",
        r"\binstagram\b",
        r"\btiktok\b",
        r"\baffiliate\b",
        r"\bcoupon\b",
        r"\bdeal(?:s)?\b",
        r"\bblog\b",
        r"\bforum\b",
        r"\bgift guide\b",
        r"\bbuying guide\b",
        r"\btop picks\b",
        r"\bbest toys\b",
        r"\bbest dog toys\b",
        r"\bupc database\b",
        r"\bbarcode search\b",
        r"\bgtin search\b",
        r"\bproduct lookup\b",
        # Store-locator / "where to buy" pages
        r"\bwhere to buy\b",
        r"\bfind a store\b",
        r"\bstore locator\b",
        r"\bfind a retailer\b",
        r"\bfind a dealer\b",
        # Roundup / listicle patterns
        r"\b\d+ best\b",
        r"\bpicks for \d{4}\b",
    ]
    GROUNDED_EXPLANATION_MARKERS = (
        "the search for ",
        "did not return any direct results",
        "while it is not currently appearing in the indexed results",
        "however, the upc",
        "however, the product",
    )

    LOW_QUALITY_URL_FRAGMENTS = [
        "category/",
        "/collections/",
        "/blocked?url=",
    ]

    # Category-like URL patterns
    CATEGORY_PATTERNS = [
        "/collections/",
        "/category/",
        "/categories/",
        "/shop/",
        "/search",
        "/products?",
        "/collections?",
        "/product-line/",
        "/product-lines/",
        "/product-range/",
        "/our-products/",
        "/all-products/",
        "/store-locator",
        "/where-to-buy",
        "/find-a-store",
        "/find-a-retailer",
    ]

    # Title/snippet phrases that suggest a multi-product listing page
    # rather than a single product detail page.
    MULTI_PRODUCT_INDICATORS = [
        r"\bshop all\b",
        r"\bbrowse\b",
        r"\bcollection\b",
        r"\ball products\b",
        r"\bour range\b",
        r"\bvarieties\b",
        r"\bview all\b",
        r"\bexplore our\b",
        r"\bfind a retailer\b",
        r"\bwhere to buy\b",
        r"\bavailable at\b",
        r"\bbuy from\b",
    ]

    def __init__(self):
        self._matching = MatchingUtils()

    def domain_from_url(self, value: str) -> str:
        """Extract domain from URL."""
        domain = str(urlparse(value).netloc or "").lower().strip()
        if domain.startswith("www."):
            domain = domain[4:]
        return domain

    @staticmethod
    def _domain_matches_candidates(domain: str, candidates: set[str] | list[str]) -> bool:
        return any(domain == candidate or domain.endswith(f".{candidate}") for candidate in candidates)

    def is_trusted_retailer(self, domain: str) -> bool:
        """Check if domain is a trusted retailer."""
        return self._domain_matches_candidates(domain, self.TRUSTED_RETAILERS)

    def is_major_retailer(self, domain: str) -> bool:
        """Check if domain is a major retailer."""
        return self._domain_matches_candidates(domain, self.MAJOR_RETAILERS)

    def is_secondary_retailer(self, domain: str) -> bool:
        """Check if domain is a secondary retailer."""
        return self._domain_matches_candidates(domain, self.SECONDARY_RETAILERS)

    def is_marketplace(self, domain: str) -> bool:
        """Check if domain is a marketplace listing source."""
        return self._domain_matches_candidates(domain, self.MARKETPLACES)

    def is_brand_domain(self, domain: str, brand: Optional[str]) -> bool:
        """Check if domain matches the brand."""
        brand_normalized = self._matching.normalize_token_text(brand)
        domain_normalized = self._matching.normalize_token_text(domain)
        if not brand_normalized or not domain_normalized:
            return False
        return brand_normalized in domain_normalized

    def classify_source_domain(self, domain: str, brand: Optional[str]) -> str:
        """Classify a source domain for ranking and validation."""
        if domain and self.is_brand_domain(domain, brand):
            return "official"
        if domain and self.is_major_retailer(domain):
            return "major_retailer"
        if domain and self.is_secondary_retailer(domain):
            return "secondary_retailer"
        if domain and self.is_marketplace(domain):
            return "marketplace"
        return "unknown"

    def is_category_like_url(self, url: str) -> bool:
        """Check if URL looks like a category page."""
        lowered = url.lower()
        if any(pattern in lowered for pattern in self.CATEGORY_PATTERNS):
            return True
        # Detect brand-site product-line pages: /products/{category}/{slug}
        # These have 3+ path segments under /products/ and typically list
        # multiple items rather than a single buyable product.
        if self.is_product_line_page(url):
            return True
        return False

    def is_product_line_page(self, url: str) -> bool:
        """Detect product-line pages on brand sites.

        Brand sites often use URLs like:
          brand.com/products/cat-litter/go-natural-pea-husk
          brand.com/our-products/flea-tick
          brand.com/brands/product-family
        These are marketing pages for a product line, listing variants
        and linking to retailers, not a single purchasable PDP.
        """
        try:
            parsed = urlparse(url)
            domain = self.domain_from_url(url)

            # Trusted retailers use these URL patterns legitimately
            if self.is_trusted_retailer(domain):
                return False

            path = parsed.path.rstrip("/").lower()
            segments = [s for s in path.split("/") if s]
            if not segments:
                return False

            # Pattern: /products/{category}/{line-name} (3+ segments, first is 'products')
            if len(segments) >= 3 and segments[0] == "products":
                return True

            # Pattern: /our-products/{category} or /product-range/{family}
            product_range_roots = {"our-products", "product-range", "product-lines", "product-line"}
            if len(segments) >= 2 and segments[0] in product_range_roots:
                return True

            # Pattern: /brands/{brand-name}/{product-family}
            if len(segments) >= 3 and segments[0] == "brands":
                return True
        except Exception:
            pass
        return False

    def _has_multi_product_indicators(self, text: str) -> bool:
        """Check if text contains phrases suggesting a multi-product listing."""
        lowered = text.lower()
        return any(re.search(pattern, lowered) for pattern in self.MULTI_PRODUCT_INDICATORS)

    def is_low_quality_result(self, result: dict[str, Any]) -> bool:
        """Check if search result is low quality."""
        url = str(result.get("url") or "").lower()
        title = str(result.get("title") or "").lower()
        description = str(result.get("description") or "").lower()
        # Gemini grounded results sometimes attach related-query suggestions in
        # extra_snippets (for example "reviews" or "reddit discussion") that
        # are not evidence about the target page itself. Treat only the URL,
        # title, and main description as quality signals.
        combined = f"{title} {description} {url}"

        domain = self.domain_from_url(url)
        if domain and any(domain == blocked or domain.endswith(f".{blocked}") for blocked in self.BLOCKED_DOMAINS):
            return True

        parsed_url = urlparse(url)
        if parsed_url.path.lower() == "/blocked" and "url=" in parsed_url.query.lower():
            return True

        if self.is_category_like_url(url):
            return True

        provider = str(result.get("provider") or "").lower()
        result_type = str(result.get("result_type") or "").lower()
        if provider == "gemini" and result_type == "grounded":
            if any(marker in description for marker in self.GROUNDED_EXPLANATION_MARKERS):
                return True

        if any(fragment in combined for fragment in self.LOW_QUALITY_URL_FRAGMENTS):
            return True

        if self._has_multi_product_indicators(combined):
            return True

        return any(re.search(pattern, combined) for pattern in self.LOW_QUALITY_PATTERNS)

    def score_search_result(
        self,
        result: dict[str, Any],
        sku: str,
        brand: Optional[str],
        product_name: Optional[str],
        category: Optional[str],
        prefer_manufacturer: bool = False,
        preferred_domains: Optional[list[str]] = None,
    ) -> float:
        """Score a search result for relevance."""
        url = str(result.get("url") or "")
        title = str(result.get("title") or "")
        description = str(result.get("description") or "")
        extra_snippets = " ".join(str(value) for value in (result.get("extra_snippets") or []))
        combined = f"{url} {title} {description} {extra_snippets}".lower()
        domain = self.domain_from_url(url)

        score = 0.0

        # SKU match bonus
        if sku and sku.lower() in combined:
            score += 5.0

        # Brand token match
        brand_tokens = self._matching.tokenize_keywords(brand)
        if brand_tokens:
            score += min(3.0, float(sum(1 for token in brand_tokens if token in combined)))

        # Product name token overlap
        expected_tokens = self._matching.tokenize_keywords(product_name)
        if expected_tokens:
            overlap = len(expected_tokens.intersection(self._matching.tokenize_keywords(combined)))
            score += min(4.0, float(overlap) * 0.8)

        expected_variant_tokens = self._matching.extract_variant_tokens(product_name)
        if expected_variant_tokens:
            actual_variant_tokens = self._matching.extract_variant_tokens(combined)
            variant_overlap = len(expected_variant_tokens.intersection(actual_variant_tokens))
            if variant_overlap:
                score += min(3.0, float(variant_overlap) * 1.5)
            else:
                score -= 1.5
            if self._matching.has_conflicting_variant_tokens(product_name, combined):
                score -= 3.0

        # Category match
        category_tokens = self._matching.tokenize_keywords(category)
        if category_tokens:
            score += min(1.5, float(sum(1 for token in category_tokens if token in combined)) * 0.5)

        # Product page indicators
        if any(marker in combined for marker in ["/product", "/products", "/p/", "-p-"]):
            score += 1.0

        source_tier = self.classify_source_domain(domain, brand)
        if source_tier == "official":
            score += 6.0 if prefer_manufacturer else 4.5
        elif source_tier == "major_retailer":
            score += 2.5
        elif source_tier == "secondary_retailer":
            score += 1.0
        elif source_tier == "marketplace":
            score -= 3.5

        if preferred_domains and domain:
            for index, preferred_domain in enumerate(preferred_domains):
                if not preferred_domain:
                    continue
                if domain == preferred_domain or domain.endswith(f".{preferred_domain}"):
                    score += max(0.5, 2.5 - float(index) * 0.5)
                    break

        # Category page penalty
        if self.is_category_like_url(url):
            score -= 2.0

        # E-commerce signals
        if not self.is_category_like_url(url) and any(marker in combined for marker in ["price", "$", "in stock", "add to cart", "buy now"]):
            score += 1.0

        # Low quality penalty
        if self.is_low_quality_result(result):
            score -= 6.0

        return score

    def pick_strong_candidate_url(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        brand: Optional[str],
        product_name: Optional[str],
        category: Optional[str],
        prefer_manufacturer: bool = False,
        preferred_domains: Optional[list[str]] = None,
    ) -> Optional[str]:
        """Pick a strong candidate URL if one stands out."""
        if not search_results:
            return None

        scored: list[tuple[dict[str, Any], float]] = []
        for result in search_results:
            score = self.score_search_result(
                result=result,
                sku=sku,
                brand=brand,
                product_name=product_name,
                category=category,
                prefer_manufacturer=prefer_manufacturer,
                preferred_domains=preferred_domains,
            )
            scored.append((result, score))

        scored.sort(key=lambda item: item[1], reverse=True)
        top_result, top_score = scored[0]
        second_score = scored[1][1] if len(scored) > 1 else -999.0

        if top_score >= 6.0 and (top_score - second_score) >= 2.0:
            return str(top_result.get("url") or "")

        return None

    def prepare_search_results(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        brand: Optional[str],
        product_name: Optional[str],
        category: Optional[str],
        prefer_manufacturer: bool = False,
        preferred_domains: Optional[list[str]] = None,
    ) -> list[dict[str, Any]]:
        """Prepare and rank search results."""
        if not search_results:
            return []

        deduped: list[dict[str, Any]] = []
        seen_urls: set[str] = set()

        for result in search_results:
            url = str(result.get("url") or "").strip()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            deduped.append(result)

        scored = [
            (
                result,
                self.score_search_result(
                    result,
                    sku,
                    brand,
                    product_name,
                    category,
                    prefer_manufacturer=prefer_manufacturer,
                    preferred_domains=preferred_domains,
                ),
            )
            for result in deduped
        ]

        scored.sort(key=lambda item: item[1], reverse=True)
        ranked = [item[0] for item in scored]

        high_signal = [result for result in ranked if not self.is_low_quality_result(result)]
        return high_signal or ranked
