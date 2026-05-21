"""Tests for the approved source adapter registry."""
from __future__ import annotations

from scrapers.approved_sources.adapters.registry import (
    normalize_adapter_slug,
    get_adapter_class,
    list_adapters,
    list_aliases,
)


class TestRegistryAliases:
    """Verify all required slugs and aliases resolve correctly."""

    def test_bradley_resolves(self):
        assert normalize_adapter_slug("bradley") == "bradley_crawl4ai"
        assert normalize_adapter_slug("bradley_crawl4ai") == "bradley_crawl4ai"

    def test_central_pet_resolves(self):
        assert normalize_adapter_slug("central-pet") == "central_pet_crawl4ai"
        assert normalize_adapter_slug("central_pet") == "central_pet_crawl4ai"
        assert normalize_adapter_slug("central_pet_crawl4ai") == "central_pet_crawl4ai"

    def test_orgill_resolves(self):
        assert normalize_adapter_slug("orgill") == "orgill_crawl4ai"
        assert normalize_adapter_slug("orgill_crawl4ai") == "orgill_crawl4ai"

    def test_phillips_resolves(self):
        assert normalize_adapter_slug("phillips") == "phillips_crawl4ai"
        assert normalize_adapter_slug("phillips_crawl4ai") == "phillips_crawl4ai"

    def test_pet_food_experts_resolves(self):
        assert normalize_adapter_slug("petfoodex") == "pet_food_experts_crawl4ai"
        assert normalize_adapter_slug("pet_food_experts") == "pet_food_experts_crawl4ai"
        assert normalize_adapter_slug("pet-food-experts") == "pet_food_experts_crawl4ai"
        assert normalize_adapter_slug("pet_food_experts_crawl4ai") == "pet_food_experts_crawl4ai"

    def test_crawl4ai_direct_resolves(self):
        assert normalize_adapter_slug("crawl4ai_direct") == "serp_discovery"
        assert normalize_adapter_slug("official_brand") == "serp_discovery"
        assert normalize_adapter_slug("serp_discovery") == "serp_discovery"

    def test_unknown_slug_passthrough(self):
        assert normalize_adapter_slug("nonexistent") == "nonexistent"

    def test_unknown_slug_returns_none(self):
        cls = get_adapter_class("nonexistent")
        assert cls is None


class TestGetAdapterClass:
    """Verify adapter classes can be loaded by slug."""

    def test_bradley_adapter(self):
        cls = get_adapter_class("bradley")
        assert cls is not None
        assert cls.__name__ == "BradleyAdapter"

    def test_bradley_crawl4ai_adapter(self):
        cls = get_adapter_class("bradley_crawl4ai")
        assert cls is not None
        assert cls.__name__ == "BradleyAdapter"

    def test_central_pet_adapter(self):
        cls = get_adapter_class("central_pet")
        assert cls is not None
        assert cls.__name__ == "CentralPetAdapter"

    def test_central_pet_hyphen_adapter(self):
        cls = get_adapter_class("central-pet")
        assert cls is not None
        assert cls.__name__ == "CentralPetAdapter"

    def test_orgill_adapter(self):
        cls = get_adapter_class("orgill")
        assert cls is not None
        assert cls.__name__ == "OrgillAdapter"

    def test_phillips_adapter(self):
        cls = get_adapter_class("phillips")
        assert cls is not None
        assert cls.__name__ == "PhillipsAdapter"

    def test_pet_food_experts_adapter(self):
        cls = get_adapter_class("petfoodex")
        assert cls is not None
        assert cls.__name__ == "PetFoodExpertsAdapter"

    def test_serp_discovery_adapter(self):
        cls = get_adapter_class("serp_discovery")
        assert cls is not None
        assert cls.__name__ == "SerpDiscoveryAdapter"

        cls_direct = get_adapter_class("crawl4ai_direct")
        assert cls_direct is not None
        assert cls_direct.__name__ == "SerpDiscoveryAdapter"


class TestListAdapters:
    """Verify list_adapters returns expected slugs."""

    def test_includes_bradley(self):
        slugs = list_adapters()
        assert "bradley_crawl4ai" in slugs

    def test_includes_central_pet(self):
        slugs = list_adapters()
        assert "central_pet_crawl4ai" in slugs

    def test_includes_orgill(self):
        slugs = list_adapters()
        assert "orgill_crawl4ai" in slugs

    def test_includes_phillips(self):
        slugs = list_adapters()
        assert "phillips_crawl4ai" in slugs

    def test_includes_pet_food_experts(self):
        slugs = list_adapters()
        assert "pet_food_experts_crawl4ai" in slugs

    def test_includes_serp_discovery(self):
        slugs = list_adapters()
        assert "serp_discovery" in slugs


class TestListAliases:
    """Verify list_aliases returns expected mappings."""

    def test_has_all_known_aliases(self):
        aliases = list_aliases()
        assert aliases["bradley"] == "bradley_crawl4ai"
        assert aliases["central-pet"] == "central_pet_crawl4ai"
        assert aliases["central_pet"] == "central_pet_crawl4ai"
        assert aliases["orgill"] == "orgill_crawl4ai"
        assert aliases["phillips"] == "phillips_crawl4ai"
        assert aliases["petfoodex"] == "pet_food_experts_crawl4ai"
        assert aliases["crawl4ai_direct"] == "serp_discovery"
        assert aliases["official_brand"] == "serp_discovery"
        assert aliases["serp_discovery"] == "serp_discovery"
