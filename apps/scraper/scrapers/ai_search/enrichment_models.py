"""
Enrichment Models (v1)

Pydantic models for the AI enrichment pipeline.
Mirrors the EnrichmentResultV1 TypeScript contract.

Approved source extraction adds:
- source.source_type / source.source_slug / source.approved_source_id / source.evidence
- decision ("deterministic_success" | "deterministic_partial" | "llm_fallback" | "failed")
- llm_used — whether LLM was invoked for this result
- source_results[] — per-source extraction details
"""

from datetime import datetime, timezone
from typing import Any, Optional
from pydantic import BaseModel, Field


from typing import Literal


EnrichmentResultStatus = Literal["success", "partial", "failed"]

EnrichmentMode = Literal["structured", "metadata", "llm", "mixed"]

EnrichmentDecision = Literal[
    "deterministic_success",
    "deterministic_partial",
    "llm_fallback",
    "failed",
]

RequestedExtractionMode = Literal["mixed", "distributor_only", "ai_only"]


class EnrichmentResultSource(BaseModel):
    url: str
    domain: Optional[str] = None
    label: Optional[str] = None
    target_id: Optional[str] = None
    source_type: Optional[str] = None  # "official_brand" | "distributor" | etc.
    source_slug: Optional[str] = None
    approved_source_id: Optional[str] = None
    evidence: Optional[str] = None  # match quality / how URL was selected


class EnrichedProductFacts(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    sku: Optional[str] = None
    weight: Optional[str] = None
    dimensions: Optional[str] = None
    shipping_weight: Optional[str] = None
    image_urls: list[Any] = Field(default_factory=list)
    ingredients: Optional[str] = None
    features: list[str] = Field(default_factory=list)
    pet_type: Optional[str] = None
    life_stage: Optional[str] = None
    pet_size: Optional[str] = None
    food_form: Optional[str] = None
    flavor: Optional[str] = None
    special_diet: list[str] = Field(default_factory=list)
    health_feature: list[str] = Field(default_factory=list)
    packaging_type: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    guaranteed_analysis: Optional[str] = None
    npk_ratio: Optional[str] = None
    unit_value: Optional[float] = None
    unit_type: Optional[str] = None


class EnrichmentConfidence(BaseModel):
    overall: float = Field(ge=0.0, le=1.0)
    fields: dict[str, float] = Field(default_factory=dict)


class EnrichmentValidation(BaseModel):
    sku_match: Optional[bool] = None
    warnings: list[str] = Field(default_factory=list)
    missing_required: list[str] = Field(default_factory=list)


class EnrichmentAttemptSummary(BaseModel):
    mode: str
    status: str
    error: Optional[str] = None


class SourceResultInfo(BaseModel):
    """Per-source extraction result metadata for approved source extraction."""

    sourceSlug: str
    sourceType: str
    confidence: float = 0.0
    matchedFields: list[str] = Field(default_factory=list)
    evidenceUrl: Optional[str] = None
    product: Optional[EnrichedProductFacts] = None



class EnrichmentResultV1(BaseModel):
    schema_version: str = "v1"
    sku: str
    source: EnrichmentResultSource
    status: str = Field(pattern=r"^(success|partial|failed)$")
    _status_literal: EnrichmentResultStatus = "success"  # marker for type checking
    extracted_at: str  # ISO datetime with timezone offset
    model: Optional[str] = None
    mode: str = Field(pattern=r"^(structured|metadata|llm|mixed)$", default="mixed")
    _mode_literal: EnrichmentMode = "mixed"  # marker for type checking
    requested_extraction_mode: Optional[RequestedExtractionMode] = None
    product: EnrichedProductFacts = Field(default_factory=EnrichedProductFacts)
    confidence: EnrichmentConfidence = Field(default_factory=EnrichmentConfidence)
    validation: EnrichmentValidation = Field(default_factory=EnrichmentValidation)
    attempts: list[EnrichmentAttemptSummary] = Field(default_factory=list)
    # Approved source extraction fields
    decision: Optional[str] = None  # EnrichmentDecision
    llm_used: Optional[bool] = None
    source_results: list[SourceResultInfo] = Field(default_factory=list)


def now_iso() -> str:
    """Return current UTC time in ISO 8601 format with timezone offset."""
    return datetime.now(timezone.utc).isoformat()


def build_error_result(
    sku: str,
    url: str,
    error_message: str,
    model: Optional[str] = None,
    mode: str = "llm",
    requested_extraction_mode: Optional[RequestedExtractionMode] = None,
) -> EnrichmentResultV1:
    """Build a failed enrichment result for error cases."""
    return EnrichmentResultV1(
        schema_version="v1",
        sku=sku,
        source=EnrichmentResultSource(url=url),
        status="failed",
        extracted_at=now_iso(),
        model=model,
        mode=mode,
        product=EnrichedProductFacts(),
        confidence=EnrichmentConfidence(overall=0.0),
        validation=EnrichmentValidation(
            warnings=[error_message],
            missing_required=[],
        ),
        attempts=[
            EnrichmentAttemptSummary(
                mode=mode,
                status="failed",
                error=error_message,
            )
        ],
        decision="failed",
        llm_used=False,
        requested_extraction_mode=requested_extraction_mode,
    )


def build_v1_from_extraction_result(
    result: dict[str, Any],
    sku: str,
    url: str,
    domain: Optional[str] = None,
    model: Optional[str] = None,
    mode: str = "mixed",
    extraction_mode: str = "llm",
    decision: Optional[str] = None,
    llm_used: Optional[bool] = None,
    source_results: Optional[list[dict[str, Any]]] = None,
    requested_extraction_mode: Optional[RequestedExtractionMode] = None,
) -> EnrichmentResultV1:
    """
    Build an EnrichmentResultV1 from a Crawl4AIExtractor/extraction result dict.

    Maps the extraction result's product fields into the v1 contract shape.

    Args:
        result: Extraction result dict with keys: success, product, confidence, validation, etc.
        sku: Product SKU.
        url: Source URL that was scraped.
        domain: Domain of the source URL.
        model: LLM model used (if any).
        mode: Extraction mode.
        extraction_mode: Internal extraction mode label.
        decision: Approved-source decision type.
        llm_used: Whether LLM was used.
        source_results: Per-source extraction details.
    """
    product_data = result.get("product", result)

    # Handle both Crawl4AIExtractor shape and ProductPageExtractor shape
    # ProductPageExtractor returns product_name not name, images not image_urls, confidence as float
    name = product_data.get("name") or product_data.get("product_name")
    image_urls = product_data.get("image_urls") or product_data.get("images", []) or result.get("images", [])
    category = product_data.get("category")
    if not category:
        categories = product_data.get("categories", [])
        category = categories[0] if isinstance(categories, list) and categories else None

    # Handle confidence as float (ProductPageExtractor) or dict (Crawl4AIExtractor)
    raw_confidence = result.get("confidence", 0.0)
    if isinstance(raw_confidence, dict):
        overall_confidence = raw_confidence.get("overall", 0.0)
        field_confidences = raw_confidence.get("fields", {})
    else:
        overall_confidence = float(raw_confidence) if raw_confidence else 0.0
        field_confidences = {}

    # Handle validation dict or default
    raw_validation = result.get("validation", {})
    if not isinstance(raw_validation, dict):
        raw_validation = {}

    success = result.get("success", True)
    if isinstance(success, bool) is False:
        success = True

    # Build source results if provided
    source_results_models: list[SourceResultInfo] = []
    if source_results:
        for sr in source_results:
            prod_val = sr.get("product")
            if prod_val is not None:
                if isinstance(prod_val, dict):
                    prod = EnrichedProductFacts(**prod_val)
                elif isinstance(prod_val, EnrichedProductFacts):
                    prod = prod_val
                else:
                    prod = None
            else:
                prod = EnrichedProductFacts(
                    name=name,
                    brand=product_data.get("brand") or result.get("brand"),
                    description=product_data.get("description") or result.get("description"),
                    category=category,
                    sku=product_data.get("sku") or result.get("sku"),
                    weight=product_data.get("weight") or result.get("weight"),
                    dimensions=product_data.get("dimensions") or result.get("dimensions"),
                    shipping_weight=product_data.get("shipping_weight"),
                    image_urls=image_urls,
                    ingredients=product_data.get("ingredients") or result.get("ingredients"),
                    features=product_data.get("features", []) or result.get("features", []),
                    pet_type=product_data.get("pet_type"),
                    life_stage=product_data.get("life_stage"),
                    pet_size=product_data.get("pet_size"),
                    food_form=product_data.get("food_form"),
                    flavor=product_data.get("flavor"),
                    special_diet=product_data.get("special_diet", []),
                    health_feature=product_data.get("health_feature", []),
                    packaging_type=product_data.get("packaging_type"),
                    size=product_data.get("size"),
                    color=product_data.get("color"),
                    guaranteed_analysis=product_data.get("guaranteed_analysis") or result.get("guaranteed_analysis"),
                    npk_ratio=product_data.get("npk_ratio") or result.get("npk_ratio"),
                    unit_value=product_data.get("unit_value") if product_data.get("unit_value") is not None else result.get("unit_value"),
                    unit_type=product_data.get("unit_type") or result.get("unit_type"),
                )

            source_results_models.append(
                SourceResultInfo(
                    sourceSlug=sr.get("sourceSlug", ""),
                    sourceType=sr.get("sourceType", ""),
                    confidence=sr.get("confidence", 0.0),
                    matchedFields=sr.get("matchedFields", []),
                    evidenceUrl=sr.get("evidenceUrl"),
                    product=prod,
                )
            )

    return EnrichmentResultV1(
        schema_version="v1",
        sku=sku,
        source=EnrichmentResultSource(
            url=url,
            domain=domain,
        ),
        status="success" if success else "failed",
        extracted_at=now_iso(),
        model=model,
        mode=mode,
        product=EnrichedProductFacts(
            name=name,
            brand=product_data.get("brand") or result.get("brand"),
            description=product_data.get("description") or result.get("description"),
            category=category,
            sku=product_data.get("sku") or result.get("sku"),
            weight=product_data.get("weight") or result.get("weight"),
            dimensions=product_data.get("dimensions") or result.get("dimensions"),
            shipping_weight=product_data.get("shipping_weight"),
            image_urls=image_urls,
            ingredients=product_data.get("ingredients") or result.get("ingredients"),
            features=product_data.get("features", []) or result.get("features", []),
            pet_type=product_data.get("pet_type"),
            life_stage=product_data.get("life_stage"),
            pet_size=product_data.get("pet_size"),
            food_form=product_data.get("food_form"),
            flavor=product_data.get("flavor"),
            special_diet=product_data.get("special_diet", []),
            health_feature=product_data.get("health_feature", []),
            packaging_type=product_data.get("packaging_type"),
            size=product_data.get("size"),
            color=product_data.get("color"),
            guaranteed_analysis=product_data.get("guaranteed_analysis") or result.get("guaranteed_analysis"),
            npk_ratio=product_data.get("npk_ratio") or result.get("npk_ratio"),
            unit_value=product_data.get("unit_value") if product_data.get("unit_value") is not None else result.get("unit_value"),
            unit_type=product_data.get("unit_type") or result.get("unit_type"),
        ),
        confidence=EnrichmentConfidence(
            overall=overall_confidence,
            fields=field_confidences,
        ),
        validation=EnrichmentValidation(
            sku_match=raw_validation.get("sku_match"),
            warnings=raw_validation.get("warnings", []),
            missing_required=raw_validation.get("missing_required", []),
        ),
        attempts=[
            EnrichmentAttemptSummary(
                mode=extraction_mode,
                status=result.get("status", "success"),
                error=result.get("error"),
            )
        ],
        decision=decision,
        llm_used=llm_used or (decision == "llm_fallback"),
        source_results=source_results_models,
        requested_extraction_mode=requested_extraction_mode,
    )
