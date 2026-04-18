"""Search result scoring and filtering logic."""

import re
import httpx
from dataclasses import dataclass
from datetime import datetime
from threading import Lock
from typing import Any, Optional
from urllib.parse import urlparse


# Domain success history tracking
@dataclass
class _DomainStats:
    attempts: int = 0
    successes: int = 0
    last_updated: Optional[str] = None


_DOMAIN_HISTORY: dict[str, _DomainStats] = {}
_DOMAIN_HISTORY_LOCK = Lock()


def get_domain_success_rate(domain: str) -> float:
    """Get success rate for a domain."""
    if domain not in _DOMAIN_HISTORY:
        return 0.5  # Neutral for unknown domains
    stats = _DOMAIN_HISTORY[domain]
    if stats.attempts < 3:
        return 0.5  # Insufficient data
    return stats.successes / stats.attempts


def record_domain_attempt(domain: str, success: bool) -> None:
    """Record a scraping attempt for a domain."""
    with _DOMAIN_HISTORY_LOCK:
        if domain not in _DOMAIN_HISTORY:
            _DOMAIN_HISTORY[domain] = _DomainStats()
        stats = _DOMAIN_HISTORY[domain]
        stats.attempts += 1
        if success:
            stats.successes += 1
        stats.last_updated = datetime.utcnow().isoformat()


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
        "summitracing.com",
    }

    GENERAL_MASS_RETAILERS = {
        "amazon.com",
        "walmart.com",
        "target.com",
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

    LISTING_PATH_SEGMENTS = {
        "all",
        "all-products",
        "bestseller",
        "bestsellers",
        "browse",
        "categories",
        "category",
        "collections",
        "new-products",
        "our-products",
        "products",
        "search",
        "shop-all",
        "where-to-buy",
    }

    CATEGORY_DOMAIN_PREFERENCES = (
        (
            {"dog", "cat", "pet", "pets", "flea", "tick", "aquarium", "aquariums"},
            {
                "chewy.com": 6.5,
                "petco.com": 6.0,
                "petsmart.com": 5.5,
                "petfood.express": 5.0,
                "petsuppliesplus.com": 4.5,
                "thepetbeastro.com": 5.5,
                "hollywoodfeed.com": 4.5,
            },
        ),
        (
            {"garden", "outdoor", "mulch", "fountain", "decor", "hardware", "farm", "pest"},
            {
                "acehardware.com": 6.0,
                "tractorsupply.com": 5.5,
                "homedepot.com": 5.0,
                "lowes.com": 4.5,
            },
        ),
        (
            {"horse", "equine"},
            {
                "bigdweb.com": 6.0,
                "doversaddlery.com": 5.5,
                "sstack.com": 5.5,
                "statelinetack.com": 5.0,
                "cheshirehorse.com": 5.0,
            },
        ),
        (
            {"fuel", "engine", "motorsport", "utility", "container", "containers", "jug", "jugs"},
            {
                "summitracing.com": 6.5,
                "jegs.com": 6.0,
                "plasticproductformers.com": 5.5,
                "acehardware.com": 4.5,
            },
        ),
    )

    LEXICAL_VARIANT_GROUPS = (
        {"bulk", "packet", "packets"},
        {"dog", "cat"},
    )

    LEXICAL_VARIANT_EQUIVALENTS = {
        "packet": "packet",
        "packets": "packet",
        "bulk": "bulk",
        "dog": "dog",
        "cat": "cat",
    }

    # Title/snippet phrases that suggest a multi-product listing page
    # rather than a single product detail page.
    MULTI_PRODUCT_INDICATORS = [
        r"\bshop all\b",
        r"\bbrowse\b",
        r"\bcollection\b",
        r"\ball products\b",
        r"\bbestsellers?\b",
        r"\bnew products\b",
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
        if brand_normalized in domain_normalized:
            return True

        brand_tokens = [token for token in re.findall(r"[a-z0-9]+", str(brand or "").lower()) if len(token) >= 3 and token not in self._matching.STOP_WORDS]
        if not brand_tokens:
            return False

        matched_tokens = [token for token in brand_tokens if token in domain_normalized]
        if not matched_tokens:
            return False
        if len(matched_tokens) == len(brand_tokens):
            return True

        longest_token = max(brand_tokens, key=len)
        return longest_token in domain_normalized and (len(matched_tokens) / len(brand_tokens)) >= 0.5

    @staticmethod
    def _path_segments(url: str) -> list[str]:
        return [segment for segment in urlparse(url).path.lower().split("/") if segment]

    def _path_tokens(self, url: str) -> set[str]:
        return self._matching.tokenize_keywords(" ".join(self._path_segments(url)).replace("-", " ").replace("_", " "))

    @staticmethod
    def _is_root_path(url: str) -> bool:
        return (urlparse(url).path or "/").rstrip("/") == ""

    def _category_preferred_domains(self, category: Optional[str]) -> list[str]:
        category_tokens = self._matching.tokenize_keywords(category)
        if not category_tokens:
            return []

        preferred: list[str] = []
        for trigger_tokens, domains in self.CATEGORY_DOMAIN_PREFERENCES:
            if category_tokens.intersection(trigger_tokens):
                for domain in domains:
                    if domain not in preferred:
                        preferred.append(domain)
        return preferred

    def _category_domain_bonus(self, domain: str, category: Optional[str]) -> float:
        category_tokens = self._matching.tokenize_keywords(category)
        if not category_tokens or not domain:
            return 0.0

        for trigger_tokens, domain_weights in self.CATEGORY_DOMAIN_PREFERENCES:
            if not category_tokens.intersection(trigger_tokens):
                continue
            for preferred_domain, bonus in domain_weights.items():
                if self._domain_matches_candidates(domain, {preferred_domain}):
                    return bonus
        return 0.0

    def _category_mass_retailer_penalty(self, domain: str, category: Optional[str]) -> float:
        category_tokens = self._matching.tokenize_keywords(category)
        if not category_tokens or not domain or not self._domain_matches_candidates(domain, self.GENERAL_MASS_RETAILERS):
            return 0.0

        for trigger_tokens, _domain_weights in self.CATEGORY_DOMAIN_PREFERENCES:
            if category_tokens.intersection(trigger_tokens):
                return 2.5
        return 0.0

    def _lexical_variant_adjustment(self, expected_text: Optional[str], actual_text: str) -> float:
        expected_tokens = self._matching.tokenize_keywords(expected_text)
        actual_tokens = self._matching.tokenize_keywords(actual_text)
        if not expected_tokens or not actual_tokens:
            return 0.0

        adjustment = 0.0
        for group in self.LEXICAL_VARIANT_GROUPS:
            expected_group_tokens = expected_tokens.intersection(group)
            if not expected_group_tokens:
                continue

            actual_group_tokens = actual_tokens.intersection(group)
            normalized_expected = {self.LEXICAL_VARIANT_EQUIVALENTS.get(token, token) for token in expected_group_tokens}
            normalized_actual = {self.LEXICAL_VARIANT_EQUIVALENTS.get(token, token) for token in actual_group_tokens}
            if normalized_actual.intersection(normalized_expected):
                adjustment += 1.0
            elif normalized_actual.difference(normalized_expected):
                adjustment -= 3.0
        return adjustment

    def _iter_product_name_brand_candidates(self, product_name: Optional[str]) -> list[str]:
        tokens = [token for token in re.findall(r"[a-z0-9]+", str(product_name or "").lower()) if token and not token.isdigit()]
        candidates: list[str] = []
        for prefix_length in range(min(3, len(tokens)), 0, -1):
            prefix_tokens = tokens[:prefix_length]
            if all(token in self._matching.BRAND_PREFIX_EXCLUDED_TOKENS for token in prefix_tokens):
                continue
            candidate = " ".join(token.capitalize() for token in prefix_tokens)
            normalized_candidate = self._matching.normalize_token_text(candidate)
            if len(normalized_candidate) < 4:
                continue
            candidates.append(candidate)
        return candidates

    def infer_brand_from_domain(self, domain: str, product_name: Optional[str]) -> Optional[str]:
        """Infer a brand-like prefix from the product name when the domain supports it."""
        normalized_domain = self._matching.normalize_token_text(domain)
        if not normalized_domain:
            return None

        for candidate in self._iter_product_name_brand_candidates(product_name):
            if self.is_brand_domain(domain, candidate):
                return candidate
        return None

    @staticmethod
    def _split_title_segments(title: str) -> list[str]:
        segments = [str(title or "").strip()]
        for separator in ("|", "—", "–"):
            next_segments: list[str] = []
            for segment in segments:
                next_segments.extend(part.strip() for part in segment.split(separator))
            segments = next_segments

        next_segments = []
        for segment in segments:
            if " - " in segment:
                next_segments.extend(part.strip() for part in segment.split(" - "))
            else:
                next_segments.append(segment)

        deduped: list[str] = []
        seen: set[str] = set()
        for segment in next_segments:
            cleaned = " ".join(segment.split())
            lowered = cleaned.lower()
            if cleaned and lowered not in seen:
                seen.add(lowered)
                deduped.append(cleaned)
        return deduped

    def infer_brand_from_result(self, result: dict[str, Any], product_name: Optional[str]) -> Optional[str]:
        """Infer a brand hint from a result when explicit brand context is missing."""
        url = str(result.get("url") or "")
        domain = self.domain_from_url(url)
        if not domain:
            return None

        for candidate_text in (result.get("title"), result.get("description")):
            brand_hint = self._matching.infer_brand_prefix(str(candidate_text or ""), product_name, url)
            if brand_hint and self.is_brand_domain(domain, brand_hint):
                return brand_hint

        title = str(result.get("title") or "")
        for segment in self._split_title_segments(title):
            normalized_segment = self._matching.normalize_token_text(segment)
            if len(normalized_segment) < 4:
                continue
            if self.is_brand_domain(domain, segment):
                return segment

        return self.infer_brand_from_domain(domain, product_name)

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
        parsed = urlparse(url)
        path = parsed.path.rstrip("/").lower() or "/"
        segments = self._path_segments(url)
        if path in {"/s", "/search"}:
            return True
        if "c" in segments and len(segments) >= 4:
            return True
        if segments and segments[0] == "pages" and len(segments) <= 2:
            return True
        if segments and segments[-1] in self.LISTING_PATH_SEGMENTS:
            return True
        if len(segments) >= 2 and segments[0] in {"products", "collections"} and segments[1] in self.LISTING_PATH_SEGMENTS:
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
        expected_tokens = self._matching.tokenize_keywords(product_name)
        brand_tokens = self._matching.tokenize_keywords(brand)
        path_tokens = self._path_tokens(url)

        score = 0.0

        # SKU match bonus
        if sku and sku.lower() in combined:
            score += 5.0

        # Brand token match
        brand_tokens = self._matching.tokenize_keywords(brand)
        if brand_tokens:
            score += min(3.0, float(sum(1 for token in brand_tokens if token in combined)))

        # Product name token overlap
        if expected_tokens:
            overlap = len(expected_tokens.intersection(self._matching.tokenize_keywords(combined)))
            score += min(4.0, float(overlap) * 0.8)
            specific_expected_tokens = expected_tokens.difference(brand_tokens)
            if specific_expected_tokens and path_tokens:
                path_overlap = len(specific_expected_tokens.intersection(path_tokens))
                score += min(2.5, float(path_overlap) * 0.9)
        else:
            specific_expected_tokens = set()

        expected_variant_tokens = self._matching.extract_variant_tokens(product_name)
        variant_overlap = 0
        if expected_variant_tokens:
            actual_variant_tokens = self._matching.extract_variant_tokens(combined)
            variant_overlap = len(expected_variant_tokens.intersection(actual_variant_tokens))
            if variant_overlap:
                score += min(3.0, float(variant_overlap) * 1.5)
            else:
                score -= 2.0
            if self._matching.has_conflicting_variant_tokens(product_name, combined):
                score -= 4.5

        score += self._lexical_variant_adjustment(product_name, combined)

        # Category match
        category_tokens = self._matching.tokenize_keywords(category)
        if category_tokens:
            score += min(1.5, float(sum(1 for token in category_tokens if token in combined)) * 0.5)

        # Product page indicators
        if any(marker in combined for marker in ["/product", "/products", "/p/", "-p-"]):
            score += 1.0

        effective_brand = brand or self.infer_brand_from_result(result, product_name)
        source_tier = self.classify_source_domain(domain, effective_brand)
        if source_tier == "official":
            # Official manufacturer PDPs are the gold-standard source.
            # The bonus must comfortably exceed major_retailer (2.5) to
            # prevent retailers with SKU-in-URL or e-commerce signals
            # from overtaking the official site.
            score += 8.0 if prefer_manufacturer else 6.0
            specific_overlap_tokens = len(specific_expected_tokens.intersection(path_tokens.union(self._matching.tokenize_keywords(title))))
            if (
                not self.is_category_like_url(url)
                and specific_overlap_tokens >= 3
                and not self._matching.has_conflicting_variant_tokens(product_name, combined)
            ):
                score += 3.5
            elif (
                not self.is_category_like_url(url)
                and specific_overlap_tokens >= 2
                and not self._matching.has_conflicting_variant_tokens(product_name, combined)
            ):
                score += 4.5
        elif source_tier == "major_retailer":
            score += 2.5
        elif source_tier == "secondary_retailer":
            score += 1.0
        elif source_tier == "marketplace":
            score -= 3.5

        # Domain success history bonus/penalty
        if domain:
            success_rate = get_domain_success_rate(domain)
            if success_rate > 0.8:
                score += 3.0
            elif success_rate < 0.3:
                score -= 3.0

        if preferred_domains and domain:
            effective_preferred_domains = list(preferred_domains)
        else:
            effective_preferred_domains = []

        for category_domain in self._category_preferred_domains(category):
            if category_domain not in effective_preferred_domains:
                effective_preferred_domains.append(category_domain)

        if effective_preferred_domains and domain:
            for index, preferred_domain in enumerate(effective_preferred_domains):
                if not preferred_domain:
                    continue
                if domain == preferred_domain or domain.endswith(f".{preferred_domain}"):
                    score += max(0.5, 2.5 - float(index) * 0.5)
                    break

        if domain:
            score += self._category_domain_bonus(domain, category)
            score -= self._category_mass_retailer_penalty(domain, category)

        if source_tier == "official" and self._is_root_path(url) and expected_variant_tokens and variant_overlap == 0:
            # Brand homepages often mention the product family but are poor extraction
            # targets when the exact variant is absent from the path/snippet.
            score -= 4.0

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

    async def has_structured_data(self, url: str) -> bool | None:
        """Quick check if URL has JSON-LD or schema.org markup.

        Returns True when structured data is detected, False when the page is
        reachable and clearly lacks it, and None when the pre-check is
        inconclusive (for example, a transient network failure or non-200
        response).
        """
        try:
            # Use httpx for async HTTP
            async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
                # Try HEAD first
                head_response = await client.head(url)
                if head_response.status_code != 200:
                    return None

                # Fetch first 8KB
                response = await client.get(url, headers={"Range": "bytes=0-8191"})

                if response.status_code not in (200, 206):
                    return None

                html = response.text.lower()

                # Check for structured data indicators
                has_jsonld = "application/ld+json" in html
                has_schema = "schema.org" in html
                has_og = "og:title" in html and "og:description" in html

                return has_jsonld or has_schema or has_og

        except Exception:
            return None
