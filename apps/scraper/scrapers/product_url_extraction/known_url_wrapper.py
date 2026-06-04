from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from typing import Any

from scrapers.product_url_extraction.extractor import ProductPageExtractor

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class KnownUrlExtractionRequest:
    """Typed request payload for known-URL extraction.

    This wrapper exists so TypeScript callers can invoke ProductPageExtractor via
    a narrow JSON contract instead of importing Python internals directly.
    """

    url: str
    upc: str
    product_name: str | None = None
    register_name: str | None = None
    brand: str | None = None
    fallback_urls: list[str] = field(default_factory=list)
    headless: bool = True
    llm_provider: str | None = None
    llm_model: str = "deepseek-chat"
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    cache_enabled: bool = True
    extraction_strategy: str = "llm"
    prompt_version: str = "v1"

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "KnownUrlExtractionRequest":
        url = str(payload.get("url", "")).strip()
        upc = str(payload.get("upc", "")).strip()

        if not url:
            raise ValueError("KnownUrlExtractionRequest requires a non-empty url")
        if not upc:
            raise ValueError("KnownUrlExtractionRequest requires a non-empty upc")

        fallback_urls = payload.get("fallback_urls") or []
        if not isinstance(fallback_urls, list):
            raise ValueError("fallback_urls must be a list when provided")

        return cls(
            url=url,
            upc=upc,
            product_name=_optional_text(payload.get("product_name")),
            register_name=_optional_text(payload.get("register_name")),
            brand=_optional_text(payload.get("brand")),
            fallback_urls=[
                str(url).strip()
                for url in fallback_urls
                if url is not None and str(url).strip()
            ],
            headless=bool(payload.get("headless", True)),
            llm_provider=_optional_text(payload.get("llm_provider")),
            llm_model=_optional_text(payload.get("llm_model")) or "deepseek-chat",
            llm_api_key=_optional_text(payload.get("llm_api_key")),
            llm_base_url=_optional_text(payload.get("llm_base_url")),
            cache_enabled=bool(payload.get("cache_enabled", True)),
            extraction_strategy=_optional_text(payload.get("extraction_strategy")) or "llm",
            prompt_version=_optional_text(payload.get("prompt_version")) or "v1",
        )


def _optional_text(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def _build_extracted_payload(result: dict[str, Any]) -> dict[str, Any]:
    attributes = {
        key: value
        for key, value in {
            "product_name": result.get("product_name"),
            "brand": result.get("brand"),
            "size_metrics": result.get("size_metrics"),
            "weight": result.get("weight"),
            "dimensions": result.get("dimensions"),
            "shipping_weight": result.get("shipping_weight"),
            "features": result.get("features"),
            "ingredients": result.get("ingredients"),
            "pet_type": result.get("pet_type"),
            "life_stage": result.get("life_stage"),
            "food_form": result.get("food_form"),
            "flavor": result.get("flavor"),
            "guaranteed_analysis": result.get("guaranteed_analysis"),
            # Canonical facet fields
            "animal_type": result.get("animal_type"),
            "breed_size": result.get("breed_size"),
            "primary_protein": result.get("primary_protein"),
            "diet_type": result.get("diet_type"),
            "package_count": result.get("package_count"),
            "package_weight": result.get("package_weight"),
            "packaging_type": result.get("packaging_type"),
            "material": result.get("material"),
            "color": result.get("color"),
            "method": result.get("method"),
            "confidence": result.get("confidence"),
            "final_url": result.get("final_url"),
            "telemetry": result.get("telemetry"),
        }.items()
        if value not in (None, "", [], {})
    }

    payload: dict[str, Any] = {
        "attributes": attributes,
    }

    description = _optional_text(result.get("description"))
    if description:
        payload["description"] = description

    images = result.get("images") or []
    if images:
        payload["images"] = images

    categories = result.get("categories") or []
    if categories:
        payload["categories"] = categories

    return payload


def _build_warnings(result: dict[str, Any]) -> list[str]:
    warnings: list[str] = []

    if not result.get("images"):
        warnings.append("Extractor returned no product images.")
    if not result.get("description"):
        warnings.append("Extractor returned no product description.")
    if float(result.get("confidence", 0.0) or 0.0) < 0.6:
        warnings.append("Extractor confidence is below the preferred threshold (0.60).")

    return warnings


async def run_known_url_extraction(
    request: KnownUrlExtractionRequest,
) -> dict[str, Any]:
    """Execute ProductPageExtractor behind a stable JSON boundary."""
    logger.info(
        "Running known-url extraction",
        extra={
            "url": request.url,
            "upc": request.upc,
            "brand": request.brand,
        },
    )

    extractor = ProductPageExtractor(
        headless=request.headless,
        llm_provider=request.llm_provider,
        llm_model=request.llm_model,
        llm_api_key=request.llm_api_key,
        llm_base_url=request.llm_base_url,
        cache_enabled=request.cache_enabled,
        extraction_strategy=request.extraction_strategy,
        prompt_version=request.prompt_version,
    )

    result = await extractor.extract(
        url=request.url,
        upc=request.upc,
        product_name=request.product_name,
        register_name=request.register_name,
        brand=request.brand,
        fallback_urls=request.fallback_urls or None,
    )

    if result.get("success"):
        warnings = _build_warnings(result)
        return {
            "status": "success",
            "input": asdict(request),
            "extracted": _build_extracted_payload(result),
            "warnings": warnings,
            "raw_result": result,
        }

    error = _optional_text(result.get("error")) or "Known-url extraction failed"
    return {
        "status": "failed",
        "input": asdict(request),
        "error": error,
        "warnings": [error],
        "raw_result": result,
    }
