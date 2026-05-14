"""
Enrichment Models (v1)

Pydantic models for the AI enrichment pipeline.
Mirrors the EnrichmentResultV1 TypeScript contract.
"""

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


from typing import Literal


EnrichmentResultStatus = Literal["success", "partial", "failed"]

EnrichmentMode = Literal["structured", "metadata", "llm", "mixed"]


class EnrichmentResultSource(BaseModel):
    url: str
    domain: Optional[str] = None
    label: Optional[str] = None
    target_id: Optional[str] = None


class EnrichedProductFacts(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    sku: Optional[str] = None
    weight: Optional[str] = None
    dimensions: Optional[str] = None
    shipping_weight: Optional[str] = None
    image_urls: list[str] = Field(default_factory=list)
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


class EnrichmentResultV1(BaseModel):
    schema_version: str = "v1"
    sku: str
    source: EnrichmentResultSource
    status: str = Field(pattern=r"^(success|partial|failed)$")
    _status_literal: EnrichmentResultStatus = "success"  # marker for type checking
    extracted_at: str  # ISO datetime
    model: Optional[str] = None
    mode: str = Field(pattern=r"^(structured|metadata|llm|mixed)$", default="mixed")
    _mode_literal: EnrichmentMode = "mixed"  # marker for type checking
    product: EnrichedProductFacts = Field(default_factory=EnrichedProductFacts)
    confidence: EnrichmentConfidence = Field(default_factory=EnrichmentConfidence)
    validation: EnrichmentValidation = Field(default_factory=EnrichmentValidation)
    attempts: list[EnrichmentAttemptSummary] = Field(default_factory=list)


def build_error_result(
    sku: str,
    url: str,
    error_message: str,
    model: Optional[str] = None,
    mode: str = "llm",
) -> EnrichmentResultV1:
    """Build a failed enrichment result for error cases."""
    return EnrichmentResultV1(
        schema_version="v1",
        sku=sku,
        source=EnrichmentResultSource(url=url),
        status="failed",
        extracted_at=datetime.utcnow().isoformat(),
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
    )


def build_v1_from_extraction_result(
    result: dict[str, Any],
    sku: str,
    url: str,
    domain: Optional[str] = None,
    model: Optional[str] = None,
    mode: str = "mixed",
    extraction_mode: str = "llm",
) -> EnrichmentResultV1:
    """
    Build an EnrichmentResultV1 from a Crawl4AIExtractor/extraction result dict.

    Maps the extraction result's product fields into the v1 contract shape.
    """
    product_data = result.get("product", result)

    return EnrichmentResultV1(
        schema_version="v1",
        sku=sku,
        source=EnrichmentResultSource(
            url=url,
            domain=domain,
        ),
        status="success" if result.get("success", True) else "failed",
        extracted_at=datetime.utcnow().isoformat(),
        model=model,
        mode=mode,
        product=EnrichedProductFacts(
            name=product_data.get("name"),
            brand=product_data.get("brand"),
            description=product_data.get("description"),
            category=product_data.get("category"),
            sku=product_data.get("sku"),
            weight=product_data.get("weight"),
            dimensions=product_data.get("dimensions"),
            shipping_weight=product_data.get("shipping_weight"),
            image_urls=product_data.get("image_urls", []),
            ingredients=product_data.get("ingredients"),
            features=product_data.get("features", []),
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
        ),
        confidence=EnrichmentConfidence(
            overall=result.get("confidence", {}).get("overall", 0.0),
            fields=result.get("confidence", {}).get("fields", {}),
        ),
        validation=EnrichmentValidation(
            sku_match=result.get("validation", {}).get("sku_match"),
            warnings=result.get("validation", {}).get("warnings", []),
            missing_required=result.get("validation", {}).get("missing_required", []),
        ),
        attempts=[
            EnrichmentAttemptSummary(
                mode=extraction_mode,
                status=result.get("status", "success"),
                error=result.get("error"),
            )
        ],
    )
