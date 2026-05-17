"""Approved source adapter registry.

Maps adapter slugs and aliases to adapter classes.
All five required distributors plus crawl4ai_direct/official_brand.

Aliases supported:
  bradley / bradley_crawl4ai
  central-pet / central_pet / central_pet_crawl4ai
  orgill / orgill_crawl4ai
  phillips / phillips_crawl4ai
  petfoodex / pet_food_experts / pet-food-experts / pet_food_experts_crawl4ai
  crawl4ai_direct / official_brand
"""

from __future__ import annotations

import logging

from scrapers.approved_sources.adapters.base import ApprovedSourceAdapter

logger = logging.getLogger(__name__)

# =============================================================================
# Alias map: every known slug → canonical adapter_slug
# =============================================================================

ADAPTER_ALIASES: dict[str, str] = {
    # Bradley
    "bradley": "bradley_crawl4ai",
    "bradley_crawl4ai": "bradley_crawl4ai",
    # Central Pet
    "central-pet": "central_pet_crawl4ai",
    "central_pet": "central_pet_crawl4ai",
    "central_pet_crawl4ai": "central_pet_crawl4ai",
    # Orgill
    "orgill": "orgill_crawl4ai",
    "orgill_crawl4ai": "orgill_crawl4ai",
    # Phillips
    "phillips": "phillips_crawl4ai",
    "phillips_crawl4ai": "phillips_crawl4ai",
    # Pet Food Experts
    "petfoodex": "pet_food_experts_crawl4ai",
    "pet_food_experts": "pet_food_experts_crawl4ai",
    "pet-food-experts": "pet_food_experts_crawl4ai",
    "pet_food_experts_crawl4ai": "pet_food_experts_crawl4ai",
    # Generic / official brand
    "crawl4ai_direct": "crawl4ai_direct",
    "official_brand": "crawl4ai_direct",
}


def normalize_adapter_slug(slug: str) -> str:
    """Resolve an adapter slug or alias to its canonical slug.

    Returns the canonical slug if found, or the original slug if unknown.
    """
    return ADAPTER_ALIASES.get(slug, slug)


def get_adapter_class(slug: str) -> type[ApprovedSourceAdapter] | None:
    """Resolve an adapter slug/alias to an adapter class.

    Args:
        slug: Adapter slug or alias (e.g. "phillips", "central-pet").

    Returns:
        The adapter class, or None if slug is unknown or import fails.
    """
    canonical = normalize_adapter_slug(slug)
    _ensure_loaded()

    cls = _ADAPTER_CLASS_MAP.get(canonical)
    if cls is not None:
        return cls

    logger.warning("[Registry] No adapter class registered for slug: %s (canonical: %s)", slug, canonical)
    return None


def list_adapters() -> list[str]:
    """List all registered canonical adapter slugs."""
    _ensure_loaded()
    return list(_ADAPTER_CLASS_MAP.keys())


def list_aliases() -> dict[str, str]:
    """Return the full alias map (alias -> canonical)."""
    return dict(ADAPTER_ALIASES)


# =============================================================================
# Lazy-loaded class map
# =============================================================================

_ADAPTER_CLASS_MAP: dict[str, type[ApprovedSourceAdapter]] = {}
_loaded = False


def _ensure_loaded() -> None:
    """Lazy-import all adapters and populate the class map."""
    global _loaded
    if _loaded:
        return

    try:
        from scrapers.approved_sources.adapters.bradley import BradleyAdapter
        _ADAPTER_CLASS_MAP["bradley_crawl4ai"] = BradleyAdapter
    except ImportError as e:
        logger.debug("[Registry] BradleyAdapter not available: %s", e)

    try:
        from scrapers.approved_sources.adapters.central_pet import CentralPetAdapter
        _ADAPTER_CLASS_MAP["central_pet_crawl4ai"] = CentralPetAdapter
    except ImportError as e:
        logger.debug("[Registry] CentralPetAdapter not available: %s", e)

    try:
        from scrapers.approved_sources.adapters.orgill import OrgillAdapter
        _ADAPTER_CLASS_MAP["orgill_crawl4ai"] = OrgillAdapter
    except ImportError as e:
        logger.debug("[Registry] OrgillAdapter not available: %s", e)

    try:
        from scrapers.approved_sources.adapters.phillips import PhillipsAdapter
        _ADAPTER_CLASS_MAP["phillips_crawl4ai"] = PhillipsAdapter
    except ImportError as e:
        logger.debug("[Registry] PhillipsAdapter not available: %s", e)

    try:
        from scrapers.approved_sources.adapters.pet_food_experts import PetFoodExpertsAdapter
        _ADAPTER_CLASS_MAP["pet_food_experts_crawl4ai"] = PetFoodExpertsAdapter
    except ImportError as e:
        logger.debug("[Registry] PetFoodExpertsAdapter not available: %s", e)

    try:
        from scrapers.approved_sources.adapters.official_brand import OfficialBrandAdapter
        _ADAPTER_CLASS_MAP["crawl4ai_direct"] = OfficialBrandAdapter
    except ImportError as e:
        logger.debug("[Registry] OfficialBrandAdapter not available: %s", e)

    _loaded = True
