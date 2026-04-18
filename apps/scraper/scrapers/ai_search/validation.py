"""Extraction result validation."""

import logging
import re
from typing import Any, Optional, Tuple
from urllib.parse import urlparse

from scrapers.ai_search.matching import MatchingUtils
from scrapers.ai_search.scoring import SearchScorer

logger = logging.getLogger(__name__)

# Patterns that indicate a URL is a logo, favicon, placeholder, or site icon
# rather than an actual product image.
_LOGO_PLACEHOLDER_PATTERNS = [
    re.compile(r"/logos?[/_.-]", re.IGNORECASE),
    re.compile(r"/favicon", re.IGNORECASE),
    re.compile(r"/brand[/_.-]", re.IGNORECASE),
    re.compile(r"/placeholder", re.IGNORECASE),
    re.compile(r"/default[_.-]?image", re.IGNORECASE),
    re.compile(r"/no[_-]?image", re.IGNORECASE),
    re.compile(r"/icons?/", re.IGNORECASE),
    re.compile(r"/site[_.-]", re.IGNORECASE),
    re.compile(r"[/_.-]logo\.(png|jpe?g|svg|webp|gif)", re.IGNORECASE),
    re.compile(r"-logo[_.-]", re.IGNORECASE),
    re.compile(r"/spacer\.", re.IGNORECASE),
    re.compile(r"/pixel\.", re.IGNORECASE),
    re.compile(r"/blank\.", re.IGNORECASE),
    re.compile(r"/1x1\.", re.IGNORECASE),
    re.compile(r"/s_\d+x\d+\.", re.IGNORECASE),  # spacer pixels (s_1x2.gif, etc.)
    re.compile(r"/social[_-]?share", re.IGNORECASE),
    re.compile(r"/og[_-]?(image|default)", re.IGNORECASE),
]

# Minimum path depth for a product image URL (reject very short paths that
# are often site-level assets like /images/logo.png).
_MIN_PATH_SEGMENTS_FOR_PRODUCT_IMAGE = 2


def _is_likely_logo_or_placeholder(url: str) -> bool:
    """Return True if a URL looks like a logo, placeholder, or site icon."""
    for pattern in _LOGO_PLACEHOLDER_PATTERNS:
        if pattern.search(url):
            return True

    # Check for very short image paths that are often site-level assets
    try:
        path = urlparse(url).path
        segments = [s for s in path.split("/") if s]
        # Single-segment paths like /logo.png are suspect
        if len(segments) <= 1 and re.search(r"\.(png|jpe?g|svg|webp|gif)$", path, re.IGNORECASE):
            return True
    except Exception:
        pass

    return False


class ExtractionValidator:
    """Validates extraction results against expected product context."""

    def __init__(self, confidence_threshold: float = 0.7):
        self.confidence_threshold = confidence_threshold
        self._matching = MatchingUtils()
        self._scoring = SearchScorer()

    def _to_confidence(self, value: Any) -> float:
        if isinstance(value, (int, float, str)):
            try:
                return float(value)
            except (TypeError, ValueError):
                return 0.0
        return 0.0

    @staticmethod
    def _resolve_bigcommerce_placeholder(url: str) -> str:
        """Replace BigCommerce {:size} template tokens with a usable default."""
        if "{:size}" in url:
            return url.replace("{:size}", "3840w")
        return url

    def _filter_valid_product_images(self, images: list[str]) -> list[str]:
        """Filter out logo, placeholder, and icon URLs from image list."""
        valid = []
        for url in images:
            if not isinstance(url, str) or not url.strip():
                continue
            if _is_likely_logo_or_placeholder(url):
                logger.info(f"[AI Search Validation] Filtered non-product image: {url}")
                continue
            # Resolve known CDN template placeholders
            url = self._resolve_bigcommerce_placeholder(url)
            # Reject URLs with any remaining unresolved template tokens
            if re.search(r"\{[^}]*\}", url):
                logger.info(f"[AI Search Validation] Filtered template URL: {url}")
                continue
            valid.append(url)
        return valid

    def _log_rejection(self, context: dict[str, Any], reason: str) -> Tuple[bool, str]:
        context["accepted"] = False
        context["rejection_reason"] = reason
        logger.warning(f"[AI Search Validation] REJECTED: {reason}")
        logger.info(f"[AI Search Validation] Validation telemetry: {context}")
        return False, reason

    def validate_extraction_match(
        self,
        extraction_result: dict[str, Any],
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        source_url: str,
    ) -> Tuple[bool, str]:
        """Validate that extracted data matches expected product context."""
        extracted_name = str(extraction_result.get("product_name") or "").strip()
        extracted_brand = str(extraction_result.get("brand") or "").strip()
        description = str(extraction_result.get("description") or "").strip()
        size_metrics = str(extraction_result.get("size_metrics") or "").strip()
        confidence = self._to_confidence(extraction_result.get("confidence", 0))
        source_domain = self._scoring.domain_from_url(source_url)
        brand_matches = self._matching.is_brand_match(brand, extracted_brand, source_url)
        name_matches = self._matching.is_name_match(product_name, extracted_name)
        combined_variant_text = f"{extracted_name} {description} {size_metrics}".strip()
        variant_matches = self._matching.has_variant_token_overlap(product_name, combined_variant_text)
        conflicting_variant_matches = self._matching.has_conflicting_variant_tokens(product_name, combined_variant_text)
        specific_token_overlap = self._matching.has_specific_token_overlap(product_name, combined_variant_text, brand)
        source_tier = self._scoring.classify_source_domain(source_domain, brand)
        resolved_variant = extraction_result.get("resolved_variant") if isinstance(extraction_result.get("resolved_variant"), dict) else None
        variant_resolver = str((resolved_variant or {}).get("resolver") or "").strip()
        is_resolved_official_family = source_tier == "official" and variant_resolver == "demandware_product_variation"

        validation_context = {
            "url": source_url,
            "sku": sku,
            "expected_brand": brand,
            "expected_name": product_name,
            "confidence": confidence,
            "extracted_brand": extracted_brand,
            "extracted_name": extracted_name,
            "source_tier": source_tier,
            "variant_resolver": variant_resolver or None,
        }

        logger.info(f"[AI Search Validation] Validating extraction from {source_url}")

        if not extraction_result.get("success"):
            error = str(extraction_result.get("error") or "Extraction failed")
            return self._log_rejection(validation_context, error)

        images = extraction_result.get("images")
        if not isinstance(images, list) or len(images) == 0:
            return self._log_rejection(validation_context, "Missing product images")

        # Filter out logo/placeholder/icon images
        valid_images = self._filter_valid_product_images(images)
        if len(valid_images) == 0:
            return self._log_rejection(
                validation_context,
                f"All {len(images)} image(s) appear to be logos or placeholders",
            )
        # Replace images in the result so downstream consumers get clean data
        extraction_result["images"] = valid_images

        is_trusted_domain = source_tier in {"official", "major_retailer", "secondary_retailer"}
        minimum_confidence = self.confidence_threshold if is_trusted_domain else max(self.confidence_threshold, 0.76)
        validation_context["is_trusted_domain"] = is_trusted_domain

        if confidence + 0.005 < minimum_confidence:
            if is_trusted_domain:
                return self._log_rejection(
                    validation_context,
                    f"Confidence below threshold ({confidence:.2f} < {minimum_confidence:.2f})",
                )
            return self._log_rejection(
                validation_context,
                f"Confidence too low for untrusted domain ({confidence:.2f} < {minimum_confidence:.2f})",
            )

        if brand and not brand_matches:
            return self._log_rejection(validation_context, "Brand mismatch with expected product context")

        if product_name and not name_matches:
            if is_resolved_official_family and (variant_matches or specific_token_overlap):
                validation_context["name_match_relaxed_for_official_family"] = True
            else:
                return self._log_rejection(validation_context, "Product name mismatch with expected product context")

        if product_name and not variant_matches and source_tier not in {"official", "major_retailer"}:
            return self._log_rejection(validation_context, "Product page missing expected variant tokens")

        if product_name and conflicting_variant_matches:
            return self._log_rejection(validation_context, "Product page contains conflicting variant tokens")

        if product_name and brand and not specific_token_overlap and source_tier not in {"official", "major_retailer"} and confidence < 0.9:
            return self._log_rejection(validation_context, "Product title missing specific expected variant tokens")

        combined = (f"{source_url} {extracted_name} {extracted_brand} {description} {size_metrics}").lower()
        has_exact_identifier = bool(sku) and sku.lower() in combined

        if source_tier == "marketplace" and not has_exact_identifier:
            return self._log_rejection(validation_context, "Marketplace result missing exact identifier evidence")

        if not brand and not extracted_brand and source_tier not in {"official", "major_retailer"} and not has_exact_identifier:
            return self._log_rejection(validation_context, "Missing brand evidence for non-preferred source")

        if sku:
            if not has_exact_identifier:
                has_brand_evidence = brand_matches if brand else bool(extracted_brand) or source_tier == "official"
                has_variant_evidence = (not product_name) or variant_matches or specific_token_overlap or is_resolved_official_family
                minimum_signal_confidence = max(0.83, self.confidence_threshold)
                if source_tier == "secondary_retailer":
                    minimum_signal_confidence = max(0.78, self.confidence_threshold)
                elif source_tier in {"official", "major_retailer"}:
                    minimum_signal_confidence = max(0.75, self.confidence_threshold)
                has_strong_signals = confidence >= minimum_signal_confidence and has_brand_evidence and has_variant_evidence and source_tier != "marketplace"
                if not has_strong_signals:
                    return self._log_rejection(validation_context, "SKU not found and weak match signals")

        validation_context["accepted"] = True
        validation_context["rejection_reason"] = None
        logger.info(f"[AI Search Validation] ACCEPTED: confidence={confidence:.2f}, brand={extracted_brand}, source={source_url}")
        logger.info(f"[AI Search Validation] Validation telemetry: {validation_context}")
        return True, "ok"
