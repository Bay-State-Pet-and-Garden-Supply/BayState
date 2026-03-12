"""Search result scoring and filtering logic."""

from typing import Any, Optional
from urllib.parse import urlparse

from scrapers.ai_search.matching import MatchingUtils


class SearchScorer:
    """Handles scoring and filtering of search results."""

    # Trusted retailer domains
    TRUSTED_RETAILERS = {
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
        "berings.com",
        "farmstore.com",
        "hugglepets.co.uk",
        "mickeyspetsupplies.com",
        "rachelspetsupply.com",
        "animalproductsshop.com",
    }

    # Blocked domains (social media, etc.)
    BLOCKED_DOMAINS = {
        "reddit.com",
        "pinterest.com",
        "youtube.com",
        "facebook.com",
        "instagram.com",
        "tiktok.com",
        "medium.com",
        "quora.com",
    }

    # Low quality terms to penalize
    LOW_QUALITY_TERMS = [
        "review",
        "best",
        "top 10",
        "comparison",
        "vs",
        "reddit",
        "pinterest",
        "youtube",
        "facebook",
        "instagram",
        "tiktok",
        "affiliate",
        "coupon",
        "deal",
        "blog",
        "forum",
        "category/",
        "/collections/",
        "gift guide",
        "buying guide",
        "top picks",
        "best toys",
        "best dog toys",
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
    ]

    def __init__(self):
        self._matching = MatchingUtils()

    def domain_from_url(self, value: str) -> str:
        """Extract domain from URL."""
        domain = str(urlparse(value).netloc or "").lower().strip()
        if domain.startswith("www."):
            domain = domain[4:]
        return domain

    def is_trusted_retailer(self, domain: str) -> bool:
        """Check if domain is a trusted retailer."""
        return any(domain == candidate or domain.endswith(f".{candidate}") for candidate in self.TRUSTED_RETAILERS)

    def is_brand_domain(self, domain: str, brand: Optional[str]) -> bool:
        """Check if domain matches the brand."""
        brand_normalized = self._matching.normalize_token_text(brand)
        domain_normalized = self._matching.normalize_token_text(domain)
        if not brand_normalized or not domain_normalized:
            return False
        return brand_normalized in domain_normalized

    def is_category_like_url(self, url: str) -> bool:
        """Check if URL looks like a category page."""
        lowered = url.lower()
        return any(pattern in lowered for pattern in self.CATEGORY_PATTERNS)

    def is_low_quality_result(self, result: dict[str, Any]) -> bool:
        """Check if search result is low quality."""
        url = str(result.get("url") or "").lower()
        title = str(result.get("title") or "").lower()
        description = str(result.get("description") or "").lower()
        extra_snippets = " ".join(str(value) for value in (result.get("extra_snippets") or []))
        combined = f"{title} {description} {extra_snippets} {url}"

        domain = self.domain_from_url(url)
        if domain and any(domain == blocked or domain.endswith(f".{blocked}") for blocked in self.BLOCKED_DOMAINS):
            return True

        if self.is_category_like_url(url):
            return True

        return any(term in combined for term in self.LOW_QUALITY_TERMS)

    def score_search_result(
        self,
        result: dict[str, Any],
        sku: str,
        brand: Optional[str],
        product_name: Optional[str],
        category: Optional[str],
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

        # Category match
        category_tokens = self._matching.tokenize_keywords(category)
        if category_tokens:
            score += min(1.5, float(sum(1 for token in category_tokens if token in combined)) * 0.5)

        # Product page indicators
        if any(marker in combined for marker in ["/product", "/products", "/p/", "-p-"]):
            score += 1.0

        # Brand domain bonus
        if domain and brand and self._matching.normalize_token_text(brand) in self._matching.normalize_token_text(domain):
            score += 4.0

        # Trusted retailer bonus
        if self.is_trusted_retailer(domain):
            score += 1.5

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
    ) -> list[dict[str, Any]]:
        """Prepare and rank search results."""
        if not search_results:
            return []

        # Dedupe by URL
        deduped: list[dict[str, Any]] = []
        seen_urls: set[str] = set()

        for result in search_results:
            url = str(result.get("url") or "").strip()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            deduped.append(result)

        # Sort by score
        ranked = sorted(
            deduped,
            key=lambda result: self.score_search_result(result, sku, brand, product_name, category),
            reverse=True,
        )

        # Prefer trusted retailers and brand domains
        if brand:
            preferred = []
            for result in ranked:
                domain = self.domain_from_url(str(result.get("url") or ""))
                if self.is_trusted_retailer(domain) or self.is_brand_domain(domain, brand):
                    preferred.append(result)
            if preferred:
                ranked = preferred

        # Filter out low quality results, but keep all if everything is filtered
        high_signal = [result for result in ranked if not self.is_low_quality_result(result)]
        return high_signal or ranked
