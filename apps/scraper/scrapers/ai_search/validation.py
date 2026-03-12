"""Extraction result validation."""

import logging
from typing import Any, Optional, Tuple

from scrapers.ai_search.matching import MatchingUtils
from scrapers.ai_search.scoring import SearchScorer

logger = logging.getLogger(__name__)


class ExtractionValidator:
    """Validates extraction results against expected product context."""

    def __init__(self, confidence_threshold: float = 0.7):
        self.confidence_threshold = confidence_threshold
        self._matching = MatchingUtils()
        self._scoring = SearchScorer()

    def validate_extraction_match(
        self,
        extraction_result: dict[str, Any],
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        source_url: str,
    ) -> Tuple[bool, str]:
        """Validate that extracted data matches expected product context."""
        # Telemetry context for logging
        validation_context = {
            "url": source_url,
            "sku": sku,
            "expected_brand": brand,
            "expected_name": product_name,
            "confidence": extraction_result.get("confidence", 0),
            "extracted_brand": extraction_result.get("brand", ""),
            "extracted_name": extraction_result.get("product_name", ""),
        }
        logger.info(f"[AI Search Validation] Validating extraction from {source_url}")
        logger.debug(f"  Expected: sku={sku}, brand={brand}, name={product_name}")

        extracted_name = str(extraction_result.get("product_name") or "").strip()
        extracted_brand = str(extraction_result.get("brand") or "").strip()
        logger.debug(f"  Extracted: name={extracted_name}, brand={extracted_brand}")

        # Check extraction success
        if not extraction_result.get("success"):
            error = extraction_result.get("error") or "Extraction failed"
            logger.warning(f"[AI Search Validation] REJECTED: extraction failed - {error}")
            validation_context["rejection_reason"] = error
            logger.info(f"[AI Search Validation] Validation telemetry: {validation_context}")
            return False, error

        # Check for images
        # Check for images
        images = extraction_result.get("images")
        if not isinstance(images, list) or len(images) == 0:
            logger.warning(f"[AI Search Validation] REJECTED: missing product images")
            validation_context["rejection_reason"] = "missing product images"
            logger.info(f"[AI Search Validation] Validation telemetry: {validation_context}")
            return False, "Missing product images"
        if not isinstance(images, list) or len(images) == 0:
            logger.warning(f"[AI Search Validation] REJECTED: missing product images")
            return False, "Missing product images"

        # Validate confidence
        raw_confidence = extraction_result.get("confidence", 0)
        try:
            confidence = float(raw_confidence)
        except (TypeError, ValueError):
            confidence = 0.0
        if confidence < self.confidence_threshold:
            reason = f"confidence too low ({confidence:.2f} < {self.confidence_threshold:.2f})"
            logger.warning(f"[AI Search Validation] REJECTED: {reason}")
            validation_context["rejection_reason"] = reason
            logger.info(f"[AI Search Validation] Validation telemetry: {validation_context}")
            return (
                False,
                f"Confidence below threshold ({confidence:.2f} < {self.confidence_threshold:.2f})",
            )

        # Domain confidence check
        minimum_domain_confidence = max(self.confidence_threshold, 0.76)
        source_domain = self._scoring.domain_from_url(source_url)
        is_trusted_domain = bool(source_domain) and (
            self._scoring.is_trusted_retailer(source_domain)
            or (bool(brand) and self._matching.normalize_token_text(str(brand)) in self._matching.normalize_token_text(source_domain))
        )
        if confidence + 0.005 < minimum_domain_confidence and not is_trusted_domain:
            reason = f"confidence too low for untrusted domain ({confidence:.2f} < {minimum_domain_confidence:.2f})"
            logger.warning(f"[AI Search Validation] REJECTED: {reason}")
            validation_context["rejection_reason"] = reason
            validation_context["is_trusted_domain"] = is_trusted_domain
            logger.info(f"[AI Search Validation] Validation telemetry: {validation_context}")
            return (
                False,
                f"Confidence too low for untrusted domain ({confidence:.2f} < {minimum_domain_confidence:.2f})",
            )
            logger.warning(
                f"[AI Search Validation] REJECTED: confidence too low for untrusted domain "
                f"({confidence:.2f} < {minimum_domain_confidence:.2f}, trusted={is_trusted_domain})"
            )
            return (
                False,
                f"Confidence too low for untrusted domain ({confidence:.2f} < {minimum_domain_confidence:.2f})",
            )

        # Brand domain validation
        source_domain_normalized = self._matching.normalize_token_text(source_domain)
        extracted_name = str(extraction_result.get("product_name") or "").strip()
        if brand and source_domain_normalized and self._matching.normalize_token_text(str(brand)) in source_domain_normalized:
            brand_in_name = self._matching.normalize_token_text(str(brand)) in self._matching.normalize_token_text(extracted_name)
            if not brand_in_name:
                reason = "Source domain brand does not match extracted product title"
                validation_context["rejection_reason"] = reason
                logger.info(f"[AI Search Validation] Validation telemetry: {validation_context}")
                return False, reason
            if not brand_in_name:
                return False, "Source domain brand does not match extracted product title"

        # Brand match validation
        extracted_brand = str(extraction_result.get("brand") or "").strip()
        if not self._matching.is_brand_match(brand, extracted_brand, source_url):
            reason = f"brand mismatch (expected={brand}, found={extracted_brand})"
            logger.warning(f"[AI Search Validation] REJECTED: {reason}")
            validation_context["rejection_reason"] = reason
            logger.info(f"[AI Search Validation] Validation telemetry: {validation_context}")
            return False, "Brand mismatch with expected product context"

        # Name match validation
        if product_name and not self._matching.is_name_match(product_name, extracted_name):
            reason = f"product name mismatch (expected={product_name}, found={extracted_name})"
            logger.warning(f"[AI Search Validation] REJECTED: {reason}")
            validation_context["rejection_reason"] = reason
            logger.info(f"[AI Search Validation] Validation telemetry: {validation_context}")
            return False, "Product name mismatch with expected product context"
        if product_name and not self._matching.is_name_match(product_name, extracted_name):
            logger.warning(f"[AI Search Validation] REJECTED: product name mismatch (expected={product_name}, found={extracted_name})")
            return False, "Product name mismatch with expected product context"

        # Token overlap validation
        if product_name and brand and not self._matching.has_specific_token_overlap(product_name, extracted_name, brand):
            if source_domain and self._scoring.is_trusted_retailer(source_domain):
                return True, "ok"
            reason = f"product title missing specific expected variant tokens (confidence={confidence:.2f})"
            logger.warning(f"[AI Search Validation] REJECTED: {reason}")
            validation_context["rejection_reason"] = reason
            logger.info(f"[AI Search Validation] Validation telemetry: {validation_context}")
            return False, "Product title missing specific expected variant tokens"
        if product_name and brand and not self._matching.has_specific_token_overlap(product_name, extracted_name, brand):
            if source_domain and self._scoring.is_trusted_retailer(source_domain):
                return True, "ok"
            logger.warning(f"[AI Search Validation] REJECTED: product title missing specific expected variant tokens (confidence={confidence:.2f})")
            return False, "Product title missing specific expected variant tokens"

        # SKU presence validation
        if sku:
            combined = (
                f"{source_url} {extracted_name} {extracted_brand} {extraction_result.get('description') or ''} {extraction_result.get('size_metrics') or ''}"
            ).lower()
            if sku and sku.lower() not in combined:
                has_strong_signals = confidence >= 0.8 and extracted_brand and brand and self._matching.is_brand_match(brand, extracted_brand, source_url)
                if not has_strong_signals:
                    reason = f"SKU not found and weak match signals (confidence={confidence:.2f})"
                    logger.warning(f"[AI Search Validation] REJECTED: {reason}")
                    validation_context["rejection_reason"] = reason
                    return False, "SKU not found and weak match signals"

        logger.info(f"[AI Search Validation] ACCEPTED: confidence={confidence:.2f}, brand={extracted_brand}, source={source_url}")
        validation_context["rejection_reason"] = None
        validation_context["accepted"] = True
        logger.info(f"[AI Search Validation] Validation telemetry: {validation_context}")
        return True, "ok"
