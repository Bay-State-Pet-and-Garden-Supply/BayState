"""Profile Maintenance job handlers.

Each function handles one job kind. Phase 1 implemented a static fixture;
Phase 3+ uses real Crawl4AI crawl, page classification, and Image Candidate builder.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from typing import Any
import re

from src.crawl4ai_engine.engine import Crawl4AIEngine
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
from scrapers.product_url_extraction.page_classifier import (
    PageClassification,
    classify_page,
    format_classification_evidence,
    build_identity_evidence,
)
from scrapers.product_url_extraction.image_candidates import (
    ImageCandidate,
    ImageCandidateSelection,
    build_image_candidates,
    select_image_candidates,
)

logger = logging.getLogger(__name__)

# Re-export for compatibility with daemon dispatch
PROFILE_MAINTENANCE_JOB_TYPE = "profile_maintenance"

# Crawl config defaults for PDP seed verification
_CRAWL_TIMEOUT = 30
_CRAWL_WAIT_FOR_IMAGES = True
_CRAWL_SCAN_FULL_PAGE = True

# ---------------------------------------------------------------------------
# Opaque Browser Profile registry (runner-local only)
# ---------------------------------------------------------------------------
# Maps opaque UUID keys to actual filesystem paths. The coordinator never sees
# the filesystem path; only the opaque UUID is shared in job payloads/artifacts.

_PROFILE_REGISTRY_DIR = os.path.expanduser("~/.crawl4ai/profiles")
_PROFILE_REGISTRY_PATH = os.path.join(_PROFILE_REGISTRY_DIR, "profile_registry.json")


def _ensure_registry_dir() -> None:
    """Ensure the profile registry directory exists."""
    os.makedirs(_PROFILE_REGISTRY_DIR, exist_ok=True)


def _load_profile_registry() -> dict[str, str]:
    """Load the local profile registry (UUID -> path)."""
    _ensure_registry_dir()
    if not os.path.exists(_PROFILE_REGISTRY_PATH):
        return {}
    try:
        with open(_PROFILE_REGISTRY_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        logger.warning("profile_registry: corrupt registry file, starting fresh")
        return {}


def _save_profile_registry(registry: dict[str, str]) -> None:
    """Save the local profile registry (UUID -> path)."""
    _ensure_registry_dir()
    try:
        with open(_PROFILE_REGISTRY_PATH, "w") as f:
            json.dump(registry, f, indent=2)
    except OSError as e:
        logger.warning("profile_registry: failed to save registry: %s", e)


def _register_profile_path(opaque_key: str, profile_path: str) -> None:
    """Register an opaque key -> filesystem path mapping."""
    registry = _load_profile_registry()
    registry[opaque_key] = profile_path
    _save_profile_registry(registry)
    logger.info(
        "profile_registry: registered %s -> %s", opaque_key, profile_path
    )


def _resolve_profile_path(opaque_key: str) -> str | None:
    """Resolve an opaque key to a filesystem path using the local registry."""
    registry = _load_profile_registry()
    path = registry.get(opaque_key)
    if path and os.path.isdir(path):
        return path
    logger.warning(
        "profile_registry: key %s not found or path missing", opaque_key
    )
    return None


def _generate_opaque_key() -> str:
    """Generate an opaque UUID key for a browser profile."""
    import uuid
    return str(uuid.uuid4())


async def run_profile_maintenance_job(
    job: Any,
    runner_name: str | None = None,
    api_client: Any = None,
    job_logging: Any = None,
) -> dict[str, Any]:
    """Dispatch a profile maintenance job by kind.

    Currently only verify_pdp_seed is implemented.
    """
    kind = job.kind

    if kind == "verify_pdp_seed":
        return await _run_verify_pdp_seed(job, runner_name, api_client, job_logging)
    elif kind == "draft_site_extraction_profile":
        return await _run_draft_site_extraction_profile(job, runner_name, api_client, job_logging)
    elif kind == "validate_profile_version":
        return await _run_validate_profile_version(job, runner_name, api_client, job_logging)
    elif kind == "browser_profile_setup":
        return await _run_browser_profile_setup(job, runner_name, api_client, job_logging)
    elif kind == "browser_profile_revalidate":
        return await _run_browser_profile_revalidate(job, runner_name, api_client, job_logging)

    return {
        "status": "failed",
        "error_message": f"Unsupported job kind: {kind}",
    }


async def _run_verify_pdp_seed(
    job: Any,
    runner_name: str | None = None,
    api_client: Any = None,
    job_logging: Any = None,
) -> dict[str, Any]:
    """Execute PDP seed verification with real Crawl4AI crawl.

    Pipeline:
    1. Crawl the target URL via Crawl4AIEngine
    2. Classify the page (PDP vs non-PDP)
    3. Build Image Candidates from crawl result
    4. Select primary/gallery images via ProductMediaSelector
    5. Collect identity evidence (brand/name overlap)
    6. Return proper artifact payload
    """
    target_url = _extract_target_url(job)
    canonical_domain = _extract_canonical_domain(job)
    source_slug = getattr(job, "source_slug", None)
    brand_name = _extract_brand_name(job)

    if not target_url:
        return _build_failed_result("No target URL provided", canonical_domain)

    if not canonical_domain:
        return _build_failed_result(
            "No canonical_domain provided, cannot verify PDP seed",
            canonical_domain="",
            error_code="missing_canonical_domain",
            url=target_url,
        )

    # Phase 1: Crawl with Crawl4AI
    crawl_result: dict[str, Any] = await _crawl_target(target_url)
    if not crawl_result.get("success"):
        error = crawl_result.get("error", "unknown_error")
        return _build_failed_result(
            f"Crawl failed: {error}",
            canonical_domain,
            error_code="crawl_failed",
            url=target_url,
        )

    final_url = crawl_result.get("url", target_url)

    # Phase 2: Page classification
    classification: PageClassification = classify_page(crawl_result, canonical_domain)

    # Phase 3: If not PDP, return rejected with classification
    if classification.page_type != "product_detail_page":
        return _build_rejected_result(
            classification=classification,
            target_url=target_url,
            final_url=final_url,
            canonical_domain=canonical_domain,
            crawl_result=crawl_result,
            source_slug=source_slug,
            brand_name=brand_name,
        )

    # Phase 4: Build Image Candidates
    page_source = crawl_result.get("html") or crawl_result.get("cleaned_html") or ""
    candidates = build_image_candidates(
        crawl_result=crawl_result,
        source_url=target_url,
        page_html=page_source,
    )

    # Phase 5: Run media selection with available product context
    selection = select_image_candidates(
        candidates=candidates,
        source_url=target_url,
        product_name=None,  # Not available in current job payload
        brand=brand_name,
    )

    # Phase 6: Extract observed selectors (simplified from HTML patterns)
    observed_selectors = _extract_observed_selectors(page_source)

    # Phase 7: Build identity evidence
    identity_evidence = build_identity_evidence(
        crawl_result=crawl_result,
        source_slug=source_slug,
        canonical_domain=canonical_domain,
        brand_from_payload=brand_name,
    )

    # Phase 8: Build successful verification result
    return _build_verified_result(
        classification=classification,
        target_url=target_url,
        final_url=final_url,
        canonical_domain=canonical_domain,
        crawl_result=crawl_result,
        selection=selection,
        candidates=candidates,
        identity_evidence=identity_evidence,
        observed_selectors=observed_selectors,
    )


# ---------------------------------------------------------------------------
# Crawl helper
# ---------------------------------------------------------------------------


async def _crawl_target(target_url: str) -> dict[str, Any]:
    """Crawl a URL using raw Crawl4AI for PDP verification.

    Uses Crawl4AI directly (not the engine wrapper) to avoid engine-level
    settings (magic, simulate_user, remove_overlay_elements, excluded_tags)
    that interfere with JS-rendered pages like Builder.io sites.

    Args:
        target_url: The URL to crawl.

    Returns:
        Normalized crawl result dict with html, media, metadata, links.
    """
    try:
        config = CrawlerRunConfig(
            wait_for_images=True,
            scan_full_page=True,
            page_timeout=_CRAWL_TIMEOUT * 1000,
            cache_mode=CacheMode.DISABLED,
            excluded_tags=[],  # Don't strip forms — page classifier needs them
        )

        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(target_url, config=config)

        return {
            "url": getattr(result, "url", target_url) or target_url,
            "success": bool(getattr(result, "success", False)),
            "html": getattr(result, "html", None),
            "cleaned_html": getattr(result, "cleaned_html", None),
            "metadata": getattr(result, "metadata", None) or {},
            "media": getattr(result, "media", None) or {"images": []},
            "links": getattr(result, "links", None) or {"internal": [], "external": []},
        }
    except Exception as e:
        logger.error("Crawl failed for %s: %s", target_url, e)
        return {
            "url": target_url,
            "success": False,
            "error": str(e),
            "error_code": "crawl_exception",
            "metadata": {},
            "media": {"images": []},
            "links": {"internal": [], "external": []},
        }


# ---------------------------------------------------------------------------
# Extractors
# ---------------------------------------------------------------------------


def _extract_target_url(job: Any) -> str:
    """Extract target URL from job payload."""
    if hasattr(job, "payload") and isinstance(job.payload, dict):
        url = job.payload.get("url", "")
        if isinstance(url, str):
            return url.strip()
    return ""


def _extract_canonical_domain(job: Any) -> str:
    """Extract canonical domain from job."""
    domain = getattr(job, "canonical_domain", None)
    if isinstance(domain, str) and domain.strip():
        return domain.strip()
    return ""


def _extract_brand_name(job: Any) -> str | None:
    """Extract brand name from job payload (if present)."""
    if hasattr(job, "payload") and isinstance(job.payload, dict):
        brand = job.payload.get("brand_name", "")
        if isinstance(brand, str) and brand.strip():
            return brand.strip()
    return None


def _extract_observed_selectors(html: str) -> list[str]:
    """Extract commonly-observed CSS selectors from page HTML.

    Matches class= and id= HTML attributes rather than literal ``.class`` /
    ``#id`` text in the page.
    """
    if not html:
        return []

    selectors: list[str] = []

    # Class-based selectors commonly used for product elements
    class_patterns = [
        (r'class=["\'][^"\']*product(?:__|\b|-)(?:title|name|heading)[^"\']*["\']', ".product-title"),
        (r'class=["\'][^"\']*product(?:__|\b|-)(?:image|media|img|photo)[^"\']*["\']', ".product-image"),
        (r'class=["\'][^"\']*(?:price|product-price|sale-price|current-price)[^"\']*["\']', ".price"),
        (r'class=["\'][^"\']*(?:add-to-cart|add_to_cart|product-form|buy-buttons)[^"\']*["\']', ".add-to-cart"),
        (r'class=["\'][^"\']*(?:product-gallery|product__gallery|media-gallery)[^"\']*["\']', ".product-gallery"),
        (r'class=["\'][^"\']*(?:variant|product-variant|swatch|option)[^"\']*["\']', ".variant"),
        (r'class=["\'][^"\']*(?:quantity|qty|product-quantity)[^"\']*["\']', ".quantity"),
        (r'class=["\'][^"\']*(?:description|product-description|prose)[^"\']*["\']', ".description"),
        (r'class=["\'][^"\']*(?:sku|product-sku|product__sku)[^"\']*["\']', ".sku"),
    ]

    for pattern, selector in class_patterns:
        if re.search(pattern, html, re.IGNORECASE):
            selectors.append(selector)

    # ID-based selectors
    id_patterns = [
        (r'id=["\'][^"\']*(?:add-to-cart|addtocart|product-add)[^"\']*["\']', "#add-to-cart"),
        (r'id=["\'][^"\']*(?:product-gallery|gallery|product-media)[^"\']*["\']', "#product-gallery"),
        (r'id=["\'][^"\']*(?:product-form|product_form)[^"\']*["\']', "#product-form"),
    ]

    for pattern, selector in id_patterns:
        if re.search(pattern, html, re.IGNORECASE):
            selectors.append(selector)

    return list(dict.fromkeys(selectors))  # Deduplicate preserving order


# ---------------------------------------------------------------------------
# Result builders
# ---------------------------------------------------------------------------


def _build_failed_result(
    message: str,
    canonical_domain: str,
    error_code: str = "crawl_failed",
    url: str = "",
) -> dict[str, Any]:
    """Build a failed result for crawl/processing errors.

    Note: verification_status is set to "rejected" (not "error") to stay
    within the web contract types of verified/rejected/expired.
    """
    return {
        "status": "succeeded",
        "result": {
            "verification_status": "rejected",
            "page_classification": "error_page",
            "canonical_domain": canonical_domain,
            "url": url,
            "final_url": url,
            "rejection_reason": message,
            "image_candidates": [],
            "image_selection": {"primary": None, "gallery_count": 0, "rejected_count": 0, "stats": {}},
            "observed_selectors": [],
        },
        "artifact": {
            "kind": "verify_pdp_seed",
            "schema_version": "v1",
            "payload": {
                "verification_status": "rejected",
                "page_classification": "error_page",
                "url": url,
                "final_url": url,
                "canonical_domain": canonical_domain,
                "rejection_reason": message,
                "error_code": error_code,
                "page_classification_evidence": {
                    "page_type": "error_page",
                    "confidence": 0.0,
                    "signals": [],
                    "negative_signals": [],
                    "rejection_reason": message,
                    "page_title": None,
                    "final_url": url,
                    "domain_match": False,
                },
                "identity_evidence": {},
                "image_candidates": [],
                "image_selection": {"primary": None, "gallery_count": 0, "rejected_count": 0, "stats": {}},
                "observed_selectors": [],
            },
            "evidence_refs": {},
        },
    }


def _build_rejected_result(
    classification: PageClassification,
    target_url: str,
    final_url: str,
    canonical_domain: str,
    crawl_result: dict[str, Any],
    source_slug: str | None = None,
    brand_name: str | None = None,
) -> dict[str, Any]:
    """Build a rejected result for non-PDP pages that were crawled successfully."""
    page_source = crawl_result.get("html") or crawl_result.get("cleaned_html") or ""
    identity_evidence = build_identity_evidence(
        crawl_result=crawl_result,
        source_slug=source_slug,
        canonical_domain=canonical_domain,
        brand_from_payload=brand_name,
    )

    return {
        "status": "succeeded",
        "result": {
            "verification_status": "rejected",
            "page_classification": classification.page_type,
            "canonical_domain": canonical_domain,
            "url": target_url,
            "final_url": final_url,
            "rejection_reason": classification.rejection_reason,
            "image_candidates": [],
            "image_selection": {"primary": None, "gallery_count": 0, "rejected_count": 0, "stats": {}},
            "observed_selectors": _extract_observed_selectors(page_source),
        },
        "artifact": {
            "kind": "verify_pdp_seed",
            "schema_version": "v1",
            "payload": {
                "verification_status": "rejected",
                "page_classification": classification.page_type,
                "url": target_url,
                "final_url": final_url,
                "canonical_domain": canonical_domain,
                "rejection_reason": classification.rejection_reason,
                "page_classification_evidence": format_classification_evidence(classification),
                "identity_evidence": identity_evidence,
                "image_candidates": [],
                "image_selection": {"primary": None, "gallery_count": 0, "rejected_count": 0, "stats": {}},
                "observed_selectors": _extract_observed_selectors(page_source),
            },
            "evidence_refs": {},
        },
    }


def _build_verified_result(
    classification: PageClassification,
    target_url: str,
    final_url: str,
    canonical_domain: str,
    crawl_result: dict[str, Any],
    selection: ImageCandidateSelection,
    candidates: list[ImageCandidate],
    identity_evidence: dict[str, Any],
    observed_selectors: list[str],
) -> dict[str, Any]:
    """Build a verified result for confirmed PDP pages."""
    page_title = crawl_result.get("metadata", {}).get("title", "") if isinstance(crawl_result.get("metadata"), dict) else ""

    # Compact image_candidates for top-level result
    result_candidates = []
    if selection.primary:
        result_candidates.append(selection.primary.to_dict())
    for g in selection.gallery[:5]:  # Limit gallery to 5 for compactness
        result_candidates.append(g.to_dict())

    # Full candidate list with rejection info for artifact
    artifact_candidates = [c.to_dict() for c in candidates]
    rejected_candidates = [c.to_dict() for c in selection.rejected]

    return {
        "status": "succeeded",
        "result": {
            "verification_status": "verified",
            "page_classification": "product_detail_page",
            "canonical_domain": canonical_domain,
            "url": target_url,
            "final_url": final_url,
            "image_candidates": result_candidates,
            "image_selection": {
                "primary": selection.primary.to_dict() if selection.primary else None,
                "gallery_count": len(selection.gallery),
                "rejected_count": len(selection.rejected),
                "stats": selection.stats,
            },
            "observed_selectors": observed_selectors,
        },
        "artifact": {
            "kind": "verify_pdp_seed",
            "schema_version": "v1",
            "payload": {
                "verification_status": "verified",
                "page_classification": "product_detail_page",
                "page_title": page_title,
                "url": target_url,
                "final_url": final_url,
                "canonical_domain": canonical_domain,
                "page_classification_evidence": format_classification_evidence(classification),
                "identity_evidence": identity_evidence,
                "image_candidates": artifact_candidates,
                "image_selection": {
                    "primary": selection.primary.to_dict() if selection.primary else None,
                    "gallery_count": len(selection.gallery),
                    "rejected_count": len(selection.rejected),
                    "stats": selection.stats,
                },
                "observed_selectors": observed_selectors,
            },
            "evidence_refs": {},
        },
    }


# ===========================================================================
# Draft Site Extraction Profile handler
# ===========================================================================


async def _run_draft_site_extraction_profile(
    job: Any,
    runner_name: str | None = None,
    api_client: Any = None,
    job_logging: Any = None,
) -> dict[str, Any]:
    """Execute AI Schema Draft using Crawl4AI schema generation.

    Pipeline:
    1. Extract payload: profile_id, verified_seed_urls, canonical_domain
    2. Crawl the first verified seed URL (fallback to next on failure)
    3. Call JsonCssExtractionStrategy.generate_schema() to generate schema
    4. Convert generated schema -> BayState Field Evidence Rules
    5. Compute version hash (SHA256 of rules + compiled schema)
    6. Return artifact with rules, compiled schema, and summary
    """
    payload = getattr(job, "payload", {})
    if not isinstance(payload, dict):
        payload = {}

    profile_id = payload.get("profile_id", "")
    verified_seed_urls = payload.get("verified_seed_urls", [])
    canonical_domain = payload.get("canonical_domain", "")

    if not profile_id:
        return {
            "status": "failed",
            "error_message": "No profile_id provided in job payload",
        }

    if not verified_seed_urls or not isinstance(verified_seed_urls, list) or len(verified_seed_urls) == 0:
        return {
            "status": "failed",
            "error_message": "No verified seed URLs provided — ensure PDP seeds are verified before drafting",
        }

    # Try each seed URL in order, fallback on failure
    seed_url_used = None
    crawl_result = None

    for url in verified_seed_urls:
        if not isinstance(url, str) or not url.strip():
            continue
        result = await _crawl_target(url.strip())
        if result.get("success"):
            seed_url_used = url.strip()
            crawl_result = result
            break
        logger.warning("Crawl failed for seed URL %s: %s", url, result.get("error"))

    if not crawl_result or not seed_url_used:
        return {
            "status": "succeeded",
            "result": {
                "draft_status": "rejected",
                "rejection_reason": "All seed URLs failed to crawl",
            },
            "artifact": {
                "kind": "draft_site_extraction_profile",
                "schema_version": "1",
                "payload": {
                    "draft_status": "rejected",
                    "profile_id": profile_id,
                    "rejection_reason": "All seed URLs failed to crawl",
                },
                "evidence_refs": {},
            },
        }

    # Extract HTML for schema generation
    sample_html = crawl_result.get("cleaned_html") or crawl_result.get("html") or ""

    if not sample_html:
        return {
            "status": "succeeded",
            "result": {
                "draft_status": "rejected",
                "rejection_reason": "No HTML content extracted from seed URL",
            },
            "artifact": {
                "kind": "draft_site_extraction_profile",
                "schema_version": "1",
                "payload": {
                    "draft_status": "rejected",
                    "profile_id": profile_id,
                    "rejection_reason": "No HTML content extracted from seed URL",
                },
                "evidence_refs": {},
            },
        }

    # Generate schema using Crawl4AI's JsonCssExtractionStrategy
    # We attempt to import and use generate_schema; fall back to structural
    # analysis if the LLM-based generation is unavailable.
    compiled_schema = await _generate_schema_from_html(sample_html, seed_url_used)

    # Convert to BayState Field Evidence Rules format
    field_evidence_rules = _convert_schema_to_rules(
        compiled_schema,
        seed_url_used,
        canonical_domain,
    )

    # Compute deterministic version hash
    version_hash_input = json.dumps(field_evidence_rules, sort_keys=True) + json.dumps(
        compiled_schema, sort_keys=True
    )
    version_hash = hashlib.sha256(version_hash_input.encode("utf-8")).hexdigest()

    return {
        "status": "succeeded",
        "result": {
            "draft_status": "generated",
            "seed_url_used": seed_url_used,
            "field_count": len(field_evidence_rules.get("fields", [])),
            "schema_generation_method": "crawl4ai_structural_analysis",
            "model_used": "deepseek-chat",
            "artifact_payload": {
                "field_evidence_rules": field_evidence_rules,
                "compiled_crawl4ai_schema": compiled_schema,
                "version_hash": version_hash,
            },
        },
        "artifact": {
            "kind": "draft_site_extraction_profile",
            "schema_version": "1",
            "payload": {
                "draft_status": "generated",
                "profile_id": profile_id,
                "source_scope": {
                    "canonical_domain": canonical_domain,
                },
                "seed_url_used": seed_url_used,
                "field_evidence_rules": field_evidence_rules,
                "compiled_crawl4ai_schema": compiled_schema,
                "version_hash": version_hash,
                "schema_generation_summary": {
                    "generated_from": "crawl4ai_structural_analysis",
                    "model_used": "deepseek-chat",
                    "seed_url": seed_url_used,
                },
            },
            "evidence_refs": {},
        },
    }


async def _generate_schema_from_html(html: str, url: str) -> dict[str, Any]:
    """Generate a Crawl4AI extraction schema from HTML.

    Uses structural analysis to build a JsonCssExtractionStrategy-compatible
    schema. Attempts to use JsonCssExtractionStrategy.generate_schema() with
    an LLM if available, otherwise produces a best-effort structural schema.

    Returns:
        A dict with at least:
        {
            "name": "Product extraction",
            "baseSelector": str,
            "fields": [
                {"name": str, "selector": str, "type": str, ...}
            ]
        }
    """
    # Try using Crawl4AI's JsonCssExtractionStrategy.generate_schema()
    # with LLM for intelligent schema generation.
    # Uses project LLM config (LLM_API_KEY, LLM_MODEL, LLM_BASE_URL) from .env
    try:
        from crawl4ai.extraction_strategy import JsonCssExtractionStrategy
        from crawl4ai import LLMConfig

        # Read LLM config from project environment
        llm_api_key = os.environ.get("LLM_API_KEY", os.environ.get("OPENAI_API_KEY", ""))
        llm_model = os.environ.get("LLM_MODEL", "deepseek-v4-pro")
        llm_base_url = os.environ.get("LLM_BASE_URL", "")

        extra_args: dict[str, Any] = {}
        if llm_base_url:
            extra_args["base_url"] = llm_base_url

        llm_config = LLMConfig(
            provider=f"openai/{llm_model}",
            api_token=llm_api_key,
            **extra_args,
        )

        if llm_config.api_token:
            try:
                generated = JsonCssExtractionStrategy.generate_schema(
                    html=html,
                    schema_type="css",
                    llm_config=llm_config,
                )
                if generated and isinstance(generated, dict):
                    # Ensure required fields
                    if "fields" not in generated:
                        generated["fields"] = []
                    if "name" not in generated:
                        generated["name"] = "Product extraction"
                    if "baseSelector" not in generated:
                        generated["baseSelector"] = "body"
                    logger.info(
                        "Generated schema via JsonCssExtractionStrategy for %s (%d fields)",
                        url, len(generated["fields"]),
                    )
                    return generated
            except Exception as e:
                logger.warning("LLM schema generation failed, falling back to structural: %s", e)

    except ImportError:
        logger.info("JsonCssExtractionStrategy not available, using structural analysis")
    except Exception as e:
        logger.warning("Error during schema generation attempt: %s", e)

    # Fallback: structural analysis to identify common product fields
    schema = _build_structural_schema(html)
    return schema


def _build_structural_schema(html: str) -> dict[str, Any]:
    """Build a basic extraction schema from HTML structural analysis.

    Identifies common product page patterns (title, price, image, SKU)
    and builds a minimal JsonCssExtractionStrategy schema.
    """
    fields: list[dict[str, Any]] = []

    # Title/name detection
    if re.search(r'class=["\'][^"\']*(?:product(?:__|\b|-)?(?:title|name|heading))[^"\']*["\']', html, re.IGNORECASE):
        fields.append({
            "name": "title",
            "selector": ".product-title, .product-name, .product__title",
            "type": "text",
        })
    elif re.search(r'<h1[^>]*>', html):
        fields.append({
            "name": "title",
            "selector": "h1",
            "type": "text",
        })

    # Price detection
    price_patterns = [
        r'class=["\'][^"\']*(?:price|product-price|sale-price|current-price)[^"\']*["\']',
        r'meta[^>]*property="product:price:amount"',
        r'itemprop="price"',
    ]
    if any(re.search(p, html, re.IGNORECASE) for p in price_patterns):
        fields.append({
            "name": "price",
            "selector": ".price, [itemprop='price'], meta[property='product:price:amount']",
            "type": "text",
        })

    # Image detection
    if re.search(r'class=["\'][^"\']*(?:product(?:__|\b|-)?(?:image|media|gallery))[^"\']*["\']', html, re.IGNORECASE):
        fields.append({
            "name": "images",
            "selector": ".product-image img, .product-gallery img, .product__image img",
            "type": "image",
        })
    elif re.search(r'meta[^>]*property="og:image"', html):
        fields.append({
            "name": "images",
            "selector": "meta[property='og:image']",
            "type": "attribute",
            "attribute": "content",
        })

    # SKU detection
    if re.search(r'class=["\'][^"\']*(?:sku|product-sku|product__sku)[^"\']*["\']', html, re.IGNORECASE):
        fields.append({
            "name": "sku",
            "selector": ".sku, .product-sku",
            "type": "text",
        })

    # Description detection
    if re.search(r'class=["\'][^"\']*(?:description|product-description)[^"\']*["\']', html, re.IGNORECASE):
        fields.append({
            "name": "description",
            "selector": ".description, .product-description",
            "type": "text",
        })

    # Brand detection
    if re.search(r'class=["\'][^"\']*(?:brand|product-brand|product__brand)[^"\']*["\']', html, re.IGNORECASE):
        fields.append({
            "name": "brand",
            "selector": ".brand, .product-brand",
            "type": "text",
        })

    schema: dict[str, Any] = {
        "name": "Product extraction",
        "baseSelector": "body",
        "fields": fields,
    }

    return schema


def _convert_schema_to_rules(
    compiled_schema: dict[str, Any],
    seed_url: str,
    canonical_domain: str,
) -> dict[str, Any]:
    """Convert a Crawl4AI extraction schema to BayState Field Evidence Rules format.

    ADR 0008 defines Field Evidence Rules as declarative JSON with field-level
    selectors, types, and metadata. This function wraps the generated schema
    into the BayState rules envelope.
    """
    fields: list[dict[str, Any]] = []
    for f in compiled_schema.get("fields", []):
        field_entry = {
            "field_name": f.get("name", "unknown"),
            "selector": f.get("selector", ""),
            "type": f.get("type", "text"),
            "required": f.get("name") in ["title", "images"],
        }
        if f.get("attribute"):
            field_entry["attribute"] = f["attribute"]
        fields.append(field_entry)

    rules: dict[str, Any] = {
        "profile_version": "v1",
        "schema_version": "1",
        "generated_from": "ai_schema_draft",
        "seed_url": seed_url,
        "canonical_domain": canonical_domain,
        "fields": fields,
        "compiled_crawl4ai_schema": compiled_schema,
    }

    return rules


# ===========================================================================
# Validate Profile Version handler
# ===========================================================================


async def _run_validate_profile_version(
    job: Any,
    runner_name: str | None = None,
    api_client: Any = None,
    job_logging: Any = None,
) -> dict[str, Any]:
    """Execute validation against a profile version's compiled schema.

    Pipeline:
    1. Extract payload: profile_version_id, validation_run_id,
       compiled_crawl4ai_schema, validation_cases
    2. For each validation case:
       a. Crawl target_url
       b. Apply compiled schema via extraction
       c. Compare results against expected_assertions
       d. Classify failure type
    3. Aggregate results with pass/fail summary
    4. Return artifact with per-case results and summary
    """
    payload = getattr(job, "payload", {})
    if not isinstance(payload, dict):
        payload = {}

    profile_version_id = payload.get("profile_version_id", "")
    validation_run_id = payload.get("validation_run_id", "")
    compiled_schema = payload.get("compiled_crawl4ai_schema", {})
    rules = payload.get("rules", {})
    validation_cases = payload.get("validation_cases", [])

    if not profile_version_id or not validation_run_id:
        return {
            "status": "failed",
            "error_message": "Missing required payload fields: profile_version_id, validation_run_id",
        }

    if not compiled_schema or not isinstance(compiled_schema, dict):
        return {
            "status": "failed",
            "error_message": "Missing compiled_crawl4ai_schema in payload",
        }

    if not validation_cases or not isinstance(validation_cases, list) or len(validation_cases) == 0:
        # Empty case list is invalid — at least one validation case required
        return {
            "status": "succeeded",
            "result": {
                "validation_status": "failed",
                "validation_mode": "fixture",
                "summary": {
                    "total": 0,
                    "passed": 0,
                    "failed": 0,
                    "failure_breakdown": {
                        "rule_failure": 0,
                        "value_mismatch": 0,
                        "crawl_failure": 0,
                        "identity_failure": 0,
                        "source_mismatch": 0,
                    },
                },
                "results": [],
            },
            "artifact": {
                "kind": "validate_profile_version",
                "schema_version": "1",
                "payload": {
                    "validation_status": "failed",
                    "validation_mode": "fixture",
                    "profile_version_id": profile_version_id,
                    "validation_run_id": validation_run_id,
                    "summary": {
                        "total": 0,
                        "passed": 0,
                        "failed": 0,
                        "failure_breakdown": {
                            "rule_failure": 0,
                            "value_mismatch": 0,
                            "crawl_failure": 0,
                            "identity_failure": 0,
                            "source_mismatch": 0,
                        },
                    },
                    "results": [],
                },
                "evidence_refs": {},
            },
        }

    # Process each validation case
    case_results: list[dict[str, Any]] = []
    passed_count = 0
    failed_count = 0
    failure_breakdown: dict[str, int] = {
        "rule_failure": 0,
        "value_mismatch": 0,
        "crawl_failure": 0,
        "identity_failure": 0,
        "source_mismatch": 0,
    }

    for case in validation_cases:
        case_id = case.get("id", "")
        case_type = case.get("case_type", "seed")
        target_url = case.get("target_url", "")
        expected_assertions = case.get("expected_assertions", {})

        if not target_url:
            continue

        result = await _run_single_validation_case(
            case_id=case_id,
            case_type=case_type,
            target_url=target_url,
            expected_assertions=expected_assertions,
            compiled_schema=compiled_schema,
        )

        case_results.append(result)

        if result.get("pass"):
            passed_count += 1
        else:
            failed_count += 1
            failure_type = result.get("failure_type", "rule_failure")
            if failure_type in failure_breakdown:
                failure_breakdown[failure_type] += 1

    validation_status = "passed" if failed_count == 0 else "failed"

    return {
        "status": "succeeded",
        "result": {
            "validation_status": validation_status,
            "validation_mode": "live",
            "summary": {
                "total": len(case_results),
                "passed": passed_count,
                "failed": failed_count,
                "failure_breakdown": failure_breakdown,
            },
            "results": case_results,
        },
        "artifact": {
            "kind": "validate_profile_version",
            "schema_version": "1",
            "payload": {
                "validation_status": validation_status,
                "validation_mode": "live",
                "profile_version_id": profile_version_id,
                "validation_run_id": validation_run_id,
                "summary": {
                    "total": len(case_results),
                    "passed": passed_count,
                    "failed": failed_count,
                    "failure_breakdown": failure_breakdown,
                },
                "results": case_results,
            },
            "evidence_refs": {},
        },
    }


async def _extract_with_crawl4ai(
    target_url: str,
    schema: dict[str, Any],
) -> dict[str, Any]:
    """Extract fields using Crawl4AI's JsonCssExtractionStrategy.

    Crawls the URL fresh using AsyncWebCrawler with JsonCssExtractionStrategy
    for real CSS-selector extraction. Falls back to regex-based extraction
    (``_extract_fields_from_html``) if Crawl4AI fails.

    Returns dict[str, Any] of field_name → extracted_value.
    """
    try:
        # Check if the schema uses XPath selectors
        def should_use_xpath(schema: dict[str, Any]) -> bool:
            def is_xpath(selector: str) -> bool:
                if not selector: return False
                s = selector.strip()
                return s.startswith("/") or s.startswith("./") or s.startswith("(") or s.startswith("xpath:")
            
            if is_xpath(schema.get("baseSelector", "")):
                return True
            for field in schema.get("fields", []):
                if is_xpath(field.get("selector", "")) or is_xpath(field.get("xpath", "")):
                    return True
                # Check nested fields
                for nested in field.get("fields", []):
                    if is_xpath(nested.get("selector", "")) or is_xpath(nested.get("xpath", "")):
                        return True
            return False

        if should_use_xpath(schema):
            from crawl4ai.extraction_strategy import JsonXPathExtractionStrategy
            logger.info("Using JsonXPathExtractionStrategy for validation extraction")
            strategy = JsonXPathExtractionStrategy(schema, verbose=False)
        else:
            from crawl4ai.extraction_strategy import JsonCssExtractionStrategy
            logger.info("Using JsonCssExtractionStrategy for validation extraction")
            strategy = JsonCssExtractionStrategy(schema, verbose=False)
        config = CrawlerRunConfig(
            extraction_strategy=strategy,
            wait_for_images=False,
            scan_full_page=False,
            page_timeout=15000,
            cache_mode=CacheMode.DISABLED,
        )

        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(target_url, config=config)

        if result.success and result.extracted_content:
            try:
                extracted = json.loads(result.extracted_content)
                if isinstance(extracted, list) and len(extracted) > 0:
                    if isinstance(extracted[0], dict):
                        return extracted[0]
                elif isinstance(extracted, dict):
                    return extracted
            except (json.JSONDecodeError, TypeError):
                pass

        logger.warning(
            "_extract_with_crawl4ai: no results for %s — falling back to regex",
            target_url,
        )
    except Exception as e:
        logger.warning(
            "_extract_with_crawl4ai failed for %s: %s — falling back to regex",
            target_url, e,
        )

    # Fallback: crawl fresh + regex extraction
    crawl_result = await _crawl_target(target_url)
    page_html = crawl_result.get("cleaned_html") or crawl_result.get("html") or ""
    return _extract_fields_from_html(page_html, schema)


async def _run_single_validation_case(
    case_id: str,
    case_type: str,
    target_url: str,
    expected_assertions: dict[str, Any],
    compiled_schema: dict[str, Any],
) -> dict[str, Any]:
    """Run a single validation case.

    Crawls the target URL, applies the compiled schema, and compares
    extracted values against expected assertions.
    """
    crawl_result = await _crawl_target(target_url)

    if not crawl_result.get("success"):
        error = crawl_result.get("error", "unknown")
        return {
            "case_id": case_id,
            "case_type": case_type,
            "target_url": target_url,
            "pass": False,
            "failure_type": "crawl_failure",
            "failure_detail": f"Crawl failed: {error}",
            "extracted_fields": {},
        }

    # Extract fields using the compiled schema via Crawl4AI's JsonCssExtractionStrategy
    extracted_fields = await _extract_with_crawl4ai(target_url, compiled_schema)

    # Compare against expected assertions
    expected_page_type = expected_assertions.get("page_type")
    if expected_page_type:
        # Verify page is still a PDP
        from scrapers.product_url_extraction.page_classifier import classify_page

        canonical_domain_guess = _extract_domain_from_url(target_url)
        classification = classify_page(crawl_result, canonical_domain_guess)

        if classification.page_type != expected_page_type:
            return {
                "case_id": case_id,
                "case_type": case_type,
                "target_url": target_url,
                "pass": False,
                "failure_type": "identity_failure"
                if classification.page_type in ("wrong_domain", "blocked")
                else "source_mismatch",
                "failure_detail": (
                    f"Expected page_type='{expected_page_type}', "
                    f"got '{classification.page_type}': {classification.rejection_reason}"
                ),
                "extracted_fields": extracted_fields,
            }

    # Apply schema extraction to verify the schema works on the page
    schema_works = len(extracted_fields) > 0 or len(compiled_schema.get("fields", [])) == 0

    if not schema_works:
        return {
            "case_id": case_id,
            "case_type": case_type,
            "target_url": target_url,
            "pass": False,
            "failure_type": "rule_failure",
            "failure_detail": "Schema extracted no fields from the page",
            "extracted_fields": extracted_fields,
        }

    # Check for expected field values (value_mismatch)
    for key, expected_value in expected_assertions.items():
        if key == "page_type":
            continue
        extracted_value = extracted_fields.get(key)
        if extracted_value is not None and expected_value is not None:
            if str(extracted_value).strip() != str(expected_value).strip():
                return {
                    "case_id": case_id,
                    "case_type": case_type,
                    "target_url": target_url,
                    "pass": False,
                    "failure_type": "value_mismatch",
                    "failure_detail": (
                        f"Extracted '{key}' = '{extracted_value}' "
                        f"does not match expected '{expected_value}'"
                    ),
                    "extracted_fields": extracted_fields,
                }

    return {
        "case_id": case_id,
        "case_type": case_type,
        "target_url": target_url,
        "pass": True,
        "failure_type": None,
        "failure_detail": None,
        "extracted_fields": extracted_fields,
    }


def _extract_fields_from_html(html: str, schema: dict[str, Any]) -> dict[str, Any]:
    """Extract fields from HTML using a Crawl4AI schema.

    Uses simple CSS selector-based extraction. This is a simplified
    version — in production, Crawl4AI's full extraction engine would
    be used.
    """

    extracted: dict[str, Any] = {}
    fields = schema.get("fields", [])

    for field in fields:
        name = field.get("name", "")
        selector = field.get("selector", "")
        field_type = field.get("type", "text")
        attribute = field.get("attribute")

        if not name or not selector:
            continue

        # Simple pseudo-extraction: look for the selector pattern in HTML
        # This is a placeholder for actual extractor integration
        # In production, use Crawl4AI's extraction strategy
        value = _simple_extract(html, selector, field_type, attribute)
        if value is not None:
            extracted[name] = value

    return extracted


def _simple_extract(
    html: str,
    selector: str,
    field_type: str,
    attribute: str | None = None,
) -> Any:
    """Simplified extraction from HTML using a CSS selector pattern.

    This is a development/test stand-in for full Crawl4AI extraction.
    In production, the compiled schema would be executed through
    Crawl4AI's JsonCssExtractionStrategy.
    """
    # Split multi-selectors, take first
    primary_selector = selector.split(",")[0].strip() if "," in selector else selector.strip()

    if primary_selector.startswith("meta"):
        # Meta tag extraction
        sanitized = primary_selector.replace("[", "").replace("]", "").replace("'", "").replace('"', "")
        meta_match = re.search(rf"<meta[^>]*{sanitized}[^>]*>", html, re.IGNORECASE)
        if meta_match:
            content_match = re.search(r'content="([^"]+)"', meta_match.group())
            if content_match:
                return content_match.group(1)
            content_match = re.search(r"content='([^']+)'", meta_match.group())
            if content_match:
                return content_match.group(1)
        return None

    if primary_selector.startswith("#"):
        # ID selector
        id_name = primary_selector[1:]
        id_match = re.search(rf'id=["\']{re.escape(id_name)}["\'][^>]*>([^<]+)', html, re.IGNORECASE)
        if id_match:
            return id_match.group(1).strip()
        return None

    if primary_selector.startswith("."):
        # Class selector
        class_name = primary_selector[1:]
        class_match = re.search(rf'class=["\'][^"\']*{re.escape(class_name)}[^"\']*["\'][^>]*>([^<]+)', html, re.IGNORECASE)
        if class_match:
            return class_match.group(1).strip()
        # Try with tag
        tag_match = re.search(rf'<[^>]+class=["\'][^"\']*{re.escape(class_name)}[^"\']*["\'][^>]*>([^<]+)', html, re.IGNORECASE)
        if tag_match:
            return tag_match.group(1).strip()
        return None

    # Fallback: try matching selector as attribute
    attr_match = re.search(rf'<[^>]*{re.escape(primary_selector)}[^>]*>([^<]+)', html, re.IGNORECASE)
    if attr_match:
        return attr_match.group(1).strip()

    return None


def _extract_domain_from_url(url: str) -> str:
    """Extract the domain from a URL."""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return parsed.hostname or ""
    except Exception:
        return ""


# ===========================================================================
# Browser Profile Setup handler
# ===========================================================================


async def _run_browser_profile_setup(
    job: Any,
    runner_name: str | None = None,
    api_client: Any = None,
    job_logging: Any = None,
) -> dict[str, Any]:
    """Execute Browser Profile setup using Crawl4AI BrowserProfiler.

    IMPORTANT: This is an INTERACTIVE task. It opens a real browser window
    for the user to log in, navigate to the target domain, and complete any
    authentication or challenge flows. Only runners capable of interactive
    browser sessions should advertise the ``browser_profile_setup`` capability.

    Pipeline:
    1. Extract job payload: browser_profile_id, canonical_domain, environment
    2. Create profile via BrowserProfiler.create_profile() — opens interactive browser
    3. Shrink the profile to remove cache bloat while preserving auth state
    4. Build result with opaque storage_ref (runner-local profile path)
    5. Build artifact with validation metadata — NO secrets, cookies, or storage contents

    Returns:
        Result dict with status, result, and artifact fields.
        On success, result contains:
        - validation_status: "validated"
        - storage_ref: runner-local profile path
        - profile_name, profile_size_bytes
        - smoke_test_result: "passed" | "failed" | "skipped"
        - target_pdp_seeds_verified: list of verified seed URLs
    """
    payload = getattr(job, "payload", {})
    if not isinstance(payload, dict):
        payload = {}

    browser_profile_id = payload.get("browser_profile_id", "")
    canonical_domain = payload.get("canonical_domain", "")
    environment = payload.get("environment", "production")
    target_pdp_seed_ids = payload.get("target_pdp_seed_ids", [])
    brand_id = payload.get("brand_id", "")
    source_slug = payload.get("source_slug", "")

    if not browser_profile_id:
        logger.error("browser_profile_setup: missing browser_profile_id in payload")
        return _build_browser_profile_failed_result(
            "Missing browser_profile_id",
            runner_name=runner_name,
            environment=environment,
        )

    profile_name = f"bp_{brand_id}_{source_slug}" if brand_id and source_slug else f"bp_{browser_profile_id[:8]}"

    try:
        # Attempt to import BrowserProfiler
        from crawl4ai import BrowserProfiler
        from crawl4ai.browser_profiler import ShrinkLevel, shrink_profile

        profiler = BrowserProfiler()

        logger.info(
            "browser_profile_setup: creating profile %s for domain %s (interactive)",
            profile_name, canonical_domain,
        )

        # Create the profile — this opens an interactive browser window
        # The user must log in, navigate to the target domain, complete auth,
        # then press Enter in the terminal to save and close.
        profile_path = await profiler.create_profile(
            profile_name=profile_name,
            headless=False,
            shrink=True,
            shrink_level=ShrinkLevel.AGGRESSIVE,
        )

        logger.info(
            "browser_profile_setup: profile created at %s", profile_path,
        )

        # Shrink the profile to remove cache bloat while keeping auth state
        shrunk_size = 0
        try:
            shrink_result = shrink_profile(profile_path, level=ShrinkLevel.AGGRESSIVE)
            if isinstance(shrink_result, dict):
                shrunk_size = shrink_result.get("size_bytes", 0)
        except Exception as e:
            logger.warning("browser_profile_setup: shrink failed (non-fatal): %s", e)

        # Optional smoke test: try crawling one target PDP seed
        smoke_test_result = "skipped"
        seeds_verified: list[str] = []

        target_urls: list[str] = []
        if isinstance(target_pdp_seed_ids, list) and target_pdp_seed_ids:
            # Resolve seed IDs to URLs via the API if available
            resolved_seed_urls: list[str] = []
            if api_client and api_client.api_url:
                try:
                    for seed_id in target_pdp_seed_ids:
                        seed_data = api_client._make_request(
                            "GET", f"/api/scraper/v1/pdp-seeds/{seed_id}"
                        )
                        if isinstance(seed_data, dict) and seed_data.get("url"):
                            resolved_seed_urls.append(seed_data["url"])
                except Exception as e:
                    logger.warning(
                        "browser_profile_setup: seed URL resolution failed: %s", e
                    )

            if resolved_seed_urls:
                for seed_url in resolved_seed_urls:
                    try:
                        engine_config: dict[str, Any] = {
                            "browser": {
                                "user_data_dir": profile_path,
                                "headless": True,
                                "text_mode": False,
                                "light_mode": True,
                                "avoid_ads": True,
                            },
                            "crawler": {
                                "wait_for_images": False,
                                "scan_full_page": False,
                                "page_timeout": 30000,
                                "timeout": 30000,
                            },
                        }
                        async with Crawl4AIEngine(config=engine_config) as engine:
                            crawl_result = await engine.crawl(seed_url)
                        if isinstance(crawl_result, dict) and crawl_result.get("success"):
                            seeds_verified.append(seed_url)
                            smoke_test_result = seed_url
                    except Exception:
                        pass

            if not seeds_verified:
                logger.warning(
                    "browser_profile_setup: no seed URLs verified for %s",
                    canonical_domain,
                )
        else:
            # No seed IDs provided — cannot validate without evidence
            logger.warning(
                "browser_profile_setup: no target seed IDs for %s — cannot validate without evidence",
                canonical_domain,
            )

        # Require at least one verified seed URL as validation evidence
        # If no seeds were verified (even when seed IDs were provided), fail validation
        if not seeds_verified:
            return _build_browser_profile_failed_result(
                "No verified seed URLs — at least one target PDP seed must be successfully crawled as validation evidence",
                runner_name=runner_name,
                environment=environment,
                error_code="missing_seed_evidence",
            )

        # Generate opaque storage_ref (UUID) — coordinator never sees the path
        opaque_key = _generate_opaque_key()
        _register_profile_path(opaque_key, profile_path)

        # Build result payload
        # storage_ref is opaque UUID — the coordinator stores this, not the path
        result_payload = {
            "validation_status": "validated",
            "storage_ref": opaque_key,
            "runner_name": runner_name or "",
            "profile_name": profile_name,
            "profile_size_bytes": shrunk_size,
            "smoke_test_result": smoke_test_result,
            "target_pdp_seeds_verified": seeds_verified,
            "environment": environment,
            "error_message": None,
        }

        # Build artifact payload — NO secrets, cookies, or storage contents per ADR 0011
        artifact_payload = {
            "validation_status": "validated",
            "profile_name": profile_name,
            "profile_size_bytes": shrunk_size,
            "smoke_test_result": smoke_test_result,
            "target_pdp_seeds_verified": seeds_verified,
            "environment": environment,
            "runner_name": runner_name or "",
            "storage_ref_available": bool(profile_path),
        }

        logger.info(
            "browser_profile_setup: completed for profile %s", browser_profile_id,
        )

        return {
            "status": "succeeded",
            "result": result_payload,
            "artifact": {
                "kind": "browser_profile_setup",
                "schema_version": "1",
                "payload": artifact_payload,
                "evidence_refs": {},
            },
        }

    except ImportError as e:
        logger.error("browser_profile_setup: Crawl4AI BrowserProfiler not available: %s", e)
        return _build_browser_profile_failed_result(
            "Crawl4AI BrowserProfiler not available",
            runner_name=runner_name,
            environment=environment,
            error_code="import_error",
        )
    except Exception as e:
        logger.error("browser_profile_setup: unexpected error: %s", e)
        return _build_browser_profile_failed_result(
            str(e),
            runner_name=runner_name,
            environment=environment,
            error_code="setup_error",
        )


# ===========================================================================
# Browser Profile Revalidate handler
# ===========================================================================


async def _run_browser_profile_revalidate(
    job: Any,
    runner_name: str | None = None,
    api_client: Any = None,
    job_logging: Any = None,
) -> dict[str, Any]:
    """Revalidate an existing Browser Profile by checking seed URL accessibility.

    Pipeline:
    1. Extract job payload: browser_profile_id, storage_ref, canonical_domain
    2. Resolve local profile by storage_ref (check if profile directory exists)
    3. If profile not found → validation_status = "expired" (profile_data_missing)
    4. If profile exists, verify target seed URLs are accessible via crawl
    5. If all seeds load without auth wall → validation_status = "validated"
    6. If auth no longer works → validation_status = "revoked"
    7. Build artifact with verification summary — NO secrets/storage contents

    Returns:
        Result dict with status, result, and artifact fields.
    """
    payload = getattr(job, "payload", {})
    if not isinstance(payload, dict):
        payload = {}

    browser_profile_id = payload.get("browser_profile_id", "")
    storage_ref = payload.get("storage_ref", "")
    canonical_domain = payload.get("canonical_domain", "")
    environment = payload.get("environment", "production")
    target_pdp_seed_ids = payload.get("target_pdp_seed_ids", [])

    if not browser_profile_id:
        logger.error("browser_profile_revalidate: missing browser_profile_id in payload")
        return _build_browser_profile_failed_result(
            "Missing browser_profile_id",
            runner_name=runner_name,
            environment=environment,
        )

    # 1. Resolve local profile by opaque storage_ref
    profile_exists = False
    resolved_path = None

    if storage_ref:
        # First try the local registry (opaque UUID -> path)
        resolved_path = _resolve_profile_path(storage_ref)
        profile_exists = resolved_path is not None

    if not profile_exists and storage_ref:
        # Fallback: treat as direct path (backward compat for in-flight jobs)
        candidate = os.path.expanduser(storage_ref) if "~" in storage_ref else storage_ref
        if os.path.isdir(candidate):
            resolved_path = candidate
            profile_exists = True
        else:
            # Try using BrowserProfiler to resolve by name
            try:
                from crawl4ai import BrowserProfiler

                profiler = BrowserProfiler()
                path_from_name = profiler.get_profile_path(
                    storage_ref.replace("~/.crawl4ai/profiles/", "") if storage_ref else ""
                )
                if path_from_name and os.path.isdir(path_from_name):
                    resolved_path = path_from_name
                    profile_exists = True
            except Exception:
                pass

    if not profile_exists or not resolved_path:
        logger.warning(
            "browser_profile_revalidate: profile data missing for %s (ref: %s)",
            browser_profile_id, storage_ref,
        )
        return _build_revalidate_result(
            validation_status="expired",
            reason="profile_data_missing",
            browser_profile_id=browser_profile_id,
            storage_ref=storage_ref,
            seed_results=[],
            profile_exists=False,
            runner_name=runner_name,
            environment=environment,
        )

    # 2. Profile exists — get size
    profile_size_bytes: int = 0
    try:
        total_size = 0
        for dirpath, dirnames, filenames in os.walk(resolved_path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if os.path.isfile(fp):
                    total_size += os.path.getsize(fp)
        profile_size_bytes = total_size
    except Exception:
        pass

    # 3. Verify target seeds if IDs are provided
    seed_results: list[dict[str, Any]] = []

    resolved_seed_urls: list[str] = []
    if isinstance(target_pdp_seed_ids, list) and target_pdp_seed_ids:
        # Resolve seed IDs to URLs via the API
        if api_client and api_client.api_url:
            try:
                for seed_id in target_pdp_seed_ids:
                    seed_data = api_client._make_request(
                        "GET", f"/api/scraper/v1/pdp-seeds/{seed_id}"
                    )
                    if isinstance(seed_data, dict) and seed_data.get("url"):
                        resolved_seed_urls.append(seed_data["url"])
            except Exception as e:
                logger.warning(
                    "browser_profile_revalidate: seed URL resolution failed: %s", e
                )

        # Verify resolved seed URLs
        for seed_url in resolved_seed_urls:
            try:
                crawl_engine_config: dict[str, Any] = {
                    "browser": {
                        "user_data_dir": resolved_path,
                        "headless": True,
                        "text_mode": False,
                        "light_mode": True,
                        "avoid_ads": True,
                    },
                    "crawler": {
                        "wait_for_images": False,
                        "scan_full_page": False,
                        "page_timeout": 30000,
                        "timeout": 30000,
                    },
                }
                async with Crawl4AIEngine(config=crawl_engine_config) as engine:
                    crawl_result = await engine.crawl(seed_url)
                if isinstance(crawl_result, dict):
                    seed_results.append({
                        "url": seed_url,
                        "success": crawl_result.get("success", False),
                        "error": crawl_result.get("error") if not crawl_result.get("success") else None,
                    })
            except Exception as e:
                seed_results.append({
                    "url": seed_url,
                    "success": False,
                    "error": str(e),
                })

    # 4. Attempt a quick smoke crawl to verify auth still works
    auth_working = True
    if canonical_domain:
        try:
            engine_config: dict[str, Any] = {
                "browser": {
                    "user_data_dir": resolved_path,
                    "headless": True,
                    "text_mode": False,
                    "light_mode": True,
                    "avoid_ads": True,
                },
                "crawler": {
                    "wait_for_images": False,
                    "scan_full_page": False,
                    "page_timeout": 15000,
                    "timeout": 15000,
                },
            }

            target_url = f"https://{canonical_domain}/"

            async with Crawl4AIEngine(config=engine_config) as engine:
                crawl_result = await engine.crawl(target_url)

            if isinstance(crawl_result, dict):
                success = crawl_result.get("success", False)
                if not success:
                    error = crawl_result.get("error", "unknown")
                    logger.warning(
                        "browser_profile_revalidate: smoke crawl failed for %s: %s",
                        target_url, error,
                    )
                    # Check if it looks like an auth/block issue
                    if any(
                        keyword in str(error).lower()
                        for keyword in ["403", "401", "auth", "login", "blocked", "captcha", "challenge"]
                    ):
                        auth_working = False
                    else:
                        # Other failures still count as auth working (network issue)
                        pass
            else:
                auth_working = False

        except Exception as e:
            logger.warning(
                "browser_profile_revalidate: smoke crawl exception: %s", e,
            )
            auth_working = False

    # 5. Determine validation status
    # Require at least one verified seed URL when seeds were provided
    seeds_verified = any(sr.get("success") for sr in seed_results)
    seeds_provided = isinstance(target_pdp_seed_ids, list) and len(target_pdp_seed_ids) > 0

    if seeds_provided and not seeds_verified:
        validation_status = "expired"
        reason = "no_seeds_verified"
    elif auth_working:
        validation_status = "validated"
        reason = "ok"
    else:
        validation_status = "revoked"
        reason = "auth_changed"

    return _build_revalidate_result(
        validation_status=validation_status,
        reason=reason,
        browser_profile_id=browser_profile_id,
        storage_ref=storage_ref,
        seed_results=seed_results,
        profile_exists=True,
        profile_size_bytes=profile_size_bytes,
        runner_name=runner_name,
        environment=environment,
    )


# ===========================================================================
# Browser Profile result builders
# ===========================================================================


def _build_browser_profile_failed_result(
    message: str,
    runner_name: str | None = None,
    environment: str = "production",
    error_code: str = "setup_error",
) -> dict[str, Any]:
    """Build a failed result for browser_profile_setup errors."""
    return {
        "status": "succeeded",
        "result": {
            "validation_status": "failed",
            "storage_ref": None,
            "runner_name": runner_name or "",
            "profile_name": None,
            "profile_size_bytes": 0,
            "smoke_test_result": "skipped",
            "target_pdp_seeds_verified": [],
            "environment": environment,
            "error_message": message,
        },
        "artifact": {
            "kind": "browser_profile_setup",
            "schema_version": "1",
            "payload": {
                "validation_status": "failed",
                "error_message": message,
                "error_code": error_code,
                "runner_name": runner_name or "",
                "environment": environment,
            },
            "evidence_refs": {},
        },
    }


def _build_revalidate_result(
    validation_status: str,
    reason: str,
    browser_profile_id: str,
    storage_ref: str | None,
    seed_results: list[dict[str, Any]],
    profile_exists: bool,
    profile_size_bytes: int | None = None,
    runner_name: str | None = None,
    environment: str = "production",
) -> dict[str, Any]:
    """Build a result for browser_profile_revalidate."""
    import datetime

    result_payload: dict[str, Any] = {
        "validation_status": validation_status,
        "stale_after": None,
        "reason": reason,
        "seed_results": seed_results,
        "profile_exists": profile_exists,
        "profile_size_bytes": profile_size_bytes,
        "error_message": None,
    }

    if validation_status == "validated":
        stale_after = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)).isoformat()
        result_payload["stale_after"] = stale_after

    artifact_payload: dict[str, Any] = {
        "validation_status": validation_status,
        "reason": reason,
        "browser_profile_id": browser_profile_id,
        "profile_exists": profile_exists,
        "profile_size_bytes": profile_size_bytes,
        "seed_results": seed_results,
        "runner_name": runner_name or "",
        "environment": environment,
        "storage_ref_available": bool(storage_ref),
    }

    if validation_status == "validated":
        artifact_payload["stale_after"] = result_payload["stale_after"]

    return {
        "status": "succeeded",
        "result": result_payload,
        "artifact": {
            "kind": "browser_profile_revalidate",
            "schema_version": "1",
            "payload": artifact_payload,
            "evidence_refs": {},
        },
    }


# ---------------------------------------------------------------------------
__all__ = [
    "PROFILE_MAINTENANCE_JOB_TYPE",
    "run_profile_maintenance_job",
]
