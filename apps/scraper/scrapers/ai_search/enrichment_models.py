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


class CoreData(BaseModel):
    name: Optional[str] = None
    brand_name: Optional[str] = None
    brand_id: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    weight_lbs: Optional[float] = None
    category_id: Optional[str] = None
    canonical_category_breadcrumb: Optional[str] = None
    search_keywords: Optional[str] = None
    confidence_score: Optional[float] = None
    stock_status: Optional[str] = None
    availability: Optional[str] = None
    minimum_quantity: Optional[int] = None
    is_special_order: Optional[bool] = None
    is_taxable: Optional[bool] = None


class FacetData(BaseModel):
    definition_slug: str
    value: str
    confidence_score: Optional[float] = None
    evidence_source: Optional[str] = None


class MediaData(BaseModel):
    url: str
    role: Optional[str] = None
    source: Optional[str] = None
    confidence_score: Optional[float] = None


class EvidenceData(BaseModel):
    source_urls: list[str] = Field(default_factory=list)
    selected_images: list[str] = Field(default_factory=list)
    image_text: Optional[str] = None
    extraction_notes: Optional[str] = None


class EnrichedProductFacts(BaseModel):
    core: Optional[CoreData] = None
    facets: list[FacetData] = Field(default_factory=list)
    media: list[MediaData] = Field(default_factory=list)
    evidence: Optional[EvidenceData] = None

    def _get_facet(self, slug: str) -> Optional[str]:
        return next((f.value for f in self.facets if f.definition_slug == slug), None)

    def _get_facets_list(self, slug: str) -> list[str]:
        return [f.value for f in self.facets if f.definition_slug == slug]

    @property
    def name(self) -> Optional[str]:
        return self.core.name if self.core else None

    @property
    def brand(self) -> Optional[str]:
        return self.core.brand_name if self.core else None

    @property
    def description(self) -> Optional[str]:
        return self.core.description if self.core else None

    @property
    def category(self) -> Optional[str]:
        return self.core.canonical_category_breadcrumb if self.core else None

    @property
    def upc(self) -> Optional[str]:
        return None

    @property
    def weight(self) -> Optional[float]:
        return self.core.weight_lbs if self.core else None

    @property
    def shipping_weight(self) -> Optional[float]:
        return None

    @property
    def dimensions(self) -> Optional[str]:
        return self._get_facet("dimensions")

    @property
    def image_urls(self) -> list[str]:
        return [m.url for m in self.media]

    @property
    def ingredients(self) -> Optional[str]:
        return self._get_facet("ingredients")

    @property
    def features(self) -> list[str]:
        return self._get_facets_list("features")

    @property
    def pet_type(self) -> Optional[str]:
        return self._get_facet("pet_type")

    @property
    def life_stage(self) -> Optional[str]:
        return self._get_facet("life_stage")

    @property
    def pet_size(self) -> Optional[str]:
        return self._get_facet("pet_size")

    @property
    def food_form(self) -> Optional[str]:
        return self._get_facet("food_form")

    @property
    def flavor(self) -> Optional[str]:
        return self._get_facet("flavor")

    @property
    def special_diet(self) -> list[str]:
        return self._get_facets_list("special_diet")

    @property
    def health_feature(self) -> list[str]:
        return self._get_facets_list("health_feature")

    @property
    def packaging_type(self) -> Optional[str]:
        return self._get_facet("packaging_type")

    @property
    def size(self) -> Optional[str]:
        return self._get_facet("size")

    @property
    def color(self) -> Optional[str]:
        return self._get_facet("color")

    @property
    def guaranteed_analysis(self) -> Optional[str]:
        return self._get_facet("guaranteed_analysis")

    @property
    def npk_ratio(self) -> Optional[str]:
        return self._get_facet("npk_ratio")

    @property
    def unit_value(self) -> Optional[str]:
        return self._get_facet("unit_value")

    @property
    def unit_type(self) -> Optional[str]:
        return self._get_facet("unit_type")



import re

def parse_weight_lbs(weight_val: Any) -> Optional[float]:
    if weight_val is None:
        return None
    if isinstance(weight_val, (int, float)):
        return float(weight_val)
    if isinstance(weight_val, str):
        text = weight_val.strip().lower()
        if not text:
            return None

        unit_patterns = [
            (r"([0-9]+(?:\.[0-9]+)?)\s*(?:lb|lbs|pound|pounds)\b", 1.0),
            (r"([0-9]+(?:\.[0-9]+)?)\s*(?:oz|ounce|ounces)\b", 1.0 / 16.0),
            (r"([0-9]+(?:\.[0-9]+)?)\s*(?:kg|kilogram|kilograms)\b", 2.2046226218),
            (r"([0-9]+(?:\.[0-9]+)?)\s*(?:g|gram|grams)\b", 1.0 / 453.59237),
        ]
        for pattern, multiplier in unit_patterns:
            match = re.search(pattern, text)
            if match:
                try:
                    return float(match.group(1)) * multiplier
                except ValueError:
                    return None

        match = re.search(r"([0-9]+(?:\.[0-9]+)?)", text)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                pass
    return None


def build_nested_product_facts(fields: dict[str, Any], evidence_url: Optional[str] = None) -> EnrichedProductFacts:
    name = fields.get("name") or fields.get("title") or fields.get("product_name")
    brand_name = fields.get("brand") or fields.get("brand_name")
    description = fields.get("description")
    
    weight_str = fields.get("weight") or fields.get("shipping_weight") or fields.get("package_weight")
    weight_lbs = parse_weight_lbs(weight_str)
    
    category = fields.get("category")
    if not category:
        categories = fields.get("categories", [])
        if isinstance(categories, list) and categories:
            category = categories[0]
            
    core = CoreData(
        name=name,
        brand_name=brand_name,
        description=description,
        weight_lbs=weight_lbs,
        canonical_category_breadcrumb=category,
        availability=fields.get("availability"),
        minimum_quantity=fields.get("minimum_quantity"),
        is_special_order=fields.get("is_special_order"),
        is_taxable=fields.get("is_taxable"),
    )
    
    facets = []
    
    # Legacy-to-canonical field name mapping.
    # Adapters emit flat field names (e.g. "pet_type", "case_pack") that
    # must be resolved to canonical definition_slug values before storage.
    LEGACY_FACET_ALIASES: dict[str, str] = {
        "pet_type": "animal_type",
        "pet_size": "breed_size",
        "protein": "primary_protein",
        "protein_source": "primary_protein",
        "case_pack": "package_count",
        "pack_count": "package_count",
        "unit_of_measure": "unit_type",
        "bci_item_number": "item_number",
        "mfg_number": "manufacturer_number",
        "mfg_part_number": "manufacturer_number",
        "weight": "package_weight",
        "shipping_weight": "package_weight",
    }
    
    single_facet_keys = [
        # Animal / pet product facets
        "animal_type", "life_stage", "breed_size",
        "food_form", "flavor", "primary_protein", "diet_type",
        # Package / logistics facets
        "package_count", "package_weight", "packaging_type",
        "unit_value", "unit_type", "dimensions",
        # Ingredient / nutrition facets
        "ingredients", "npk_ratio",
        # Generic product facets
        "size", "color", "material", "scent",
        # Identifiers (stored as facets for evidence/matching)
        "item_number", "manufacturer_number",
        # Other
        "indoor_outdoor", "subscription_eligible",
    ]
    for key in single_facet_keys:
        val = fields.get(key)
        # Also check legacy aliases
        if val is None or val == "":
            for legacy, canonical in LEGACY_FACET_ALIASES.items():
                if canonical == key and legacy in fields:
                    val = fields.get(legacy)
                    break
        if val is not None and val != "":
            if isinstance(val, list):
                val_str = "|".join(str(v) for v in val)
            else:
                val_str = str(val)
            if val_str.strip():
                facets.append(FacetData(definition_slug=key, value=val_str.strip()))
                
    list_facet_keys = ["special_diet", "health_feature", "features", "claims", "play_style"]
    for key in list_facet_keys:
        val = fields.get(key)
        if isinstance(val, list):
            for item in val:
                if item and str(item).strip():
                    facets.append(FacetData(definition_slug=key, value=str(item).strip()))
        elif isinstance(val, str) and val.strip():
            items = [i.strip() for i in re.split(r"[|,]", val) if i.strip()]
            for item in items:
                facets.append(FacetData(definition_slug=key, value=item))
                
    media = []
    image_urls = fields.get("image_urls") or fields.get("images") or []
    if isinstance(image_urls, list):
        for idx, img in enumerate(image_urls):
            img_url = None
            if isinstance(img, str):
                img_url = img
            elif isinstance(img, dict) and img.get("original_url"):
                img_url = img.get("original_url")
            elif isinstance(img, dict) and img.get("data_url"):
                img_url = img.get("data_url")
            if img_url:
                role = "primary" if idx == 0 else "additional"
                media.append(MediaData(url=img_url, role=role, source="enrichment"))
                
    evidence_urls = [evidence_url] if evidence_url else []
    flat_images = [m.url for m in media]
    evidence = EvidenceData(
        source_urls=evidence_urls,
        selected_images=flat_images,
        image_text=fields.get("image_text"),
        extraction_notes=fields.get("extraction_notes"),
    )
    
    return EnrichedProductFacts(
        core=core,
        facets=facets,
        media=media,
        evidence=evidence
    )



class EnrichmentConfidence(BaseModel):
    overall: float = Field(ge=0.0, le=1.0)
    fields: dict[str, float] = Field(default_factory=dict)


class EnrichmentValidation(BaseModel):
    upc_match: Optional[bool] = None
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
    upc: str
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
    upc: str,
    url: str,
    error_message: str,
    model: Optional[str] = None,
    mode: str = "llm",
    requested_extraction_mode: Optional[RequestedExtractionMode] = None,
) -> EnrichmentResultV1:
    """Build a failed enrichment result for error cases."""
    return EnrichmentResultV1(
        schema_version="v1",
        upc=upc,
        source=EnrichmentResultSource(url=url),
        status="failed",
        extracted_at=now_iso(),
        model=model,
        mode=mode,
        product=EnrichedProductFacts(
            core=CoreData(),
            facets=[],
            media=[],
            evidence=EvidenceData(source_urls=[url])
        ),
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
    upc: str,
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
        upc: Product UPC.
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
                    prod = build_nested_product_facts(prod_val, evidence_url=sr.get("evidenceUrl") or url)
                elif isinstance(prod_val, EnrichedProductFacts):
                    prod = prod_val
                else:
                    prod = None
            else:
                prod = build_nested_product_facts(
                    {
                        "name": name,
                        "brand": product_data.get("brand") or result.get("brand"),
                        "description": product_data.get("description") or result.get("description"),
                        "category": category,
                        "upc": product_data.get("upc") or result.get("upc"),
                        "weight": product_data.get("weight") or result.get("weight"),
                        "dimensions": product_data.get("dimensions") or result.get("dimensions"),
                        "shipping_weight": product_data.get("shipping_weight"),
                        "image_urls": image_urls,
                        "ingredients": product_data.get("ingredients") or result.get("ingredients"),
                        "features": product_data.get("features", []) or result.get("features", []),
                        "pet_type": product_data.get("pet_type"),
                        "life_stage": product_data.get("life_stage"),
                        "pet_size": product_data.get("pet_size"),
                        "food_form": product_data.get("food_form"),
                        "flavor": product_data.get("flavor"),
                        "special_diet": product_data.get("special_diet", []),
                        "health_feature": product_data.get("health_feature", []),
                        "packaging_type": product_data.get("packaging_type"),
                        "size": product_data.get("size"),
                        "color": product_data.get("color"),
                        "guaranteed_analysis": product_data.get("guaranteed_analysis") or result.get("guaranteed_analysis"),
                        "npk_ratio": product_data.get("npk_ratio") or result.get("npk_ratio"),
                        "unit_value": product_data.get("unit_value") if product_data.get("unit_value") is not None else result.get("unit_value"),
                        "unit_type": product_data.get("unit_type") or result.get("unit_type"),
                    },
                    evidence_url=sr.get("evidenceUrl") or url
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
        upc=upc,
        source=EnrichmentResultSource(
            url=url,
            domain=domain,
        ),
        status="success" if success else "failed",
        extracted_at=now_iso(),
        model=model,
        mode=mode,
        product=build_nested_product_facts(
            {
                "name": name,
                "brand": product_data.get("brand") or result.get("brand"),
                "description": product_data.get("description") or result.get("description"),
                "category": category,
                "upc": product_data.get("upc") or result.get("upc"),
                "weight": product_data.get("weight") or result.get("weight"),
                "dimensions": product_data.get("dimensions") or result.get("dimensions"),
                "shipping_weight": product_data.get("shipping_weight"),
                "image_urls": image_urls,
                "ingredients": product_data.get("ingredients") or result.get("ingredients"),
                "features": product_data.get("features", []) or result.get("features", []),
                "pet_type": product_data.get("pet_type"),
                "life_stage": product_data.get("life_stage"),
                "pet_size": product_data.get("pet_size"),
                "food_form": product_data.get("food_form"),
                "flavor": product_data.get("flavor"),
                "special_diet": product_data.get("special_diet", []),
                "health_feature": product_data.get("health_feature", []),
                "packaging_type": product_data.get("packaging_type"),
                "size": product_data.get("size"),
                "color": product_data.get("color"),
                "guaranteed_analysis": product_data.get("guaranteed_analysis") or result.get("guaranteed_analysis"),
                "npk_ratio": product_data.get("npk_ratio") or result.get("npk_ratio"),
                "unit_value": product_data.get("unit_value") if product_data.get("unit_value") is not None else result.get("unit_value"),
                "unit_type": product_data.get("unit_type") or result.get("unit_type"),
            },
            evidence_url=url
        ),
        confidence=EnrichmentConfidence(
            overall=overall_confidence,
            fields=field_confidences,
        ),
        validation=EnrichmentValidation(
            upc_match=raw_validation.get("upc_match"),
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
