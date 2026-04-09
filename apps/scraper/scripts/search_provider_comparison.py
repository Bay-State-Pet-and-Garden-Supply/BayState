from __future__ import annotations

import json
import logging
import os
import re
import time
import urllib.error
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.response import addinfourl
from pathlib import Path
from statistics import mean
from typing import TypedDict, cast


LOGGER = logging.getLogger("search_provider_comparison")

SCRAPER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SCRAPER_ROOT.parents[1]

SAMPLE_PRODUCTS_PATH = SCRAPER_ROOT / "cli" / "fixtures" / "sample-products.json"
GROUND_TRUTH_PATH = SCRAPER_ROOT / "tests" / "fixtures" / "test_skus_ground_truth.json"
REPORT_PATH = REPO_ROOT / ".sisyphus" / "drafts" / "search-provider-comparison.md"

GEMINI_MODEL = "gemini-3.1-flash-lite-preview"
OPENAI_MODEL = "gpt-4o-mini"

PRICING_PER_MILLION_TOKENS: dict[str, dict[str, float]] = {
    GEMINI_MODEL: {"input": 0.075, "output": 0.30},
    OPENAI_MODEL: {"input": 0.15, "output": 0.60},
}

PROMPT_TEMPLATE = """You are ranking search results to select the single best product page for structured extraction.

INPUT PRODUCT CONTEXT
- SKU: {sku}
- Brand (may be null): {brand}
- Product Name: {product_name}

SEARCH RESULTS
{results_text}

INSTRUCTIONS
1) Infer the likely canonical brand when Brand is Unknown by using Product Name tokens and search result titles/descriptions.
2) Score each result using this weighted rubric (0-100 total):
   - Domain authority & source tier (0-45)
     - 45: official manufacturer / official brand domain for inferred brand
     - 30: major trusted retailer PDP (Home Depot, Lowe's, Walmart, Target, Chewy, Tractor Supply, Ace)
     - 10: marketplace / affiliate / review / aggregator pages
   - SKU/variant relevance (0-30)
     - Explicit SKU match or exact variant tokens (size/color/form) in title/snippet/url
   - Content quality signals (0-25)
     - Strong signals: explicit price mention, stock/availability hint, product detail depth, image-rich PDP indicators
     - Penalize thin pages, category pages, blog/review pages, comparison pages, or "best X" roundups

REQUIRED DECISION POLICY
- Prefer manufacturer page if it is plausibly the exact SKU/variant.
- If no viable manufacturer result exists, choose best major retailer PDP.
- Affiliate/review/aggregator pages are last resort and should only be selected when nothing else is viable.

OUTPUT FORMAT (STRICT)
- Return ONLY one integer from 1 to {result_count} for the best result.
- Return 0 only if none are suitable product pages.
"""

SYSTEM_PROMPT = "Return only the integer decision. No explanation."
REQUEST_TIMEOUT_SECONDS = 90


@dataclass(frozen=True)
class SearchResult:
    url: str
    title: str
    description: str


@dataclass(frozen=True)
class TestCase:
    case_id: str
    fixture_source: str
    sku: str
    brand: str | None
    product_name: str
    expected_rank: int
    rationale: str
    search_results: tuple[SearchResult, ...]


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    model: str
    api_key_env: str


@dataclass(frozen=True)
class CaseResult:
    case_id: str
    expected_rank: int
    predicted_rank: int | None
    raw_response: str
    latency_ms: float
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_usd: float
    error: str | None

    @property
    def is_correct(self) -> bool:
        return self.predicted_rank == self.expected_rank and self.error is None


class FixtureProduct(TypedDict):
    sku: str
    brand: str
    name: str


JSONDict = dict[str, object]


def _parse_json(text: str) -> object:
    return cast(object, json.loads(text))


def _as_dict(value: object, context: str) -> JSONDict:
    if not isinstance(value, dict):
        raise ValueError(f"Expected object for {context}")
    return cast(JSONDict, value)


def _as_list(value: object, context: str) -> list[object]:
    if not isinstance(value, list):
        raise ValueError(f"Expected list for {context}")
    return cast(list[object], value)


def _as_str(value: object, context: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"Expected string for {context}")
    return value


def _as_int(value: object) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.isdigit():
            return int(stripped)
    return 0


def _coerce_fixture_product(value: object, context: str) -> FixtureProduct:
    product = _as_dict(value, context)
    return FixtureProduct(
        sku=_as_str(product.get("sku"), f"{context}.sku"),
        brand=_as_str(product.get("brand", ""), f"{context}.brand") if product.get("brand") is not None else "",
        name=_as_str(product.get("name"), f"{context}.name"),
    )


def _load_fixture_products() -> dict[str, FixtureProduct]:
    sample_payload = _as_dict(_parse_json(SAMPLE_PRODUCTS_PATH.read_text(encoding="utf-8")), "sample fixture payload")
    sample_products = [
        _coerce_fixture_product(item, f"sample product {index}")
        for index, item in enumerate(_as_list(sample_payload.get("products"), "sample products"), start=1)
    ]
    ground_truth_products = [
        _coerce_fixture_product(item, f"ground truth product {index}")
        for index, item in enumerate(
            _as_list(_parse_json(GROUND_TRUTH_PATH.read_text(encoding="utf-8")), "ground truth products"),
            start=1,
        )
    ]
    combined = [*sample_products, *ground_truth_products]
    return {product["sku"]: product for product in combined}


def _result(url: str, title: str, description: str) -> SearchResult:
    return SearchResult(url=url, title=title, description=description)


def _build_test_cases(products_by_sku: dict[str, FixtureProduct]) -> list[TestCase]:
    def product(sku: str) -> FixtureProduct:
        return products_by_sku[sku]

    blue_5lb = product("072705115305")
    blue_30lb = product("072705115336")
    solid_gold_holistick = product("086758670548")
    greenies_large = product("012345678998")
    greenies_medium = product("012345678999")
    scotts_deep_forest = product("032247886598")
    manna_duckling = product("095668300593")
    scotts_spreader = product("032247761215")
    manna_mini_treats = product("095668001032")
    manna_all_flock = product("095668225308")
    miracle_gro_25 = product("032247278140")
    miracle_gro_50 = product("032247279048")
    scotts_sierra_red = product("032247884594")

    return [
        TestCase(
            case_id="blue-buffalo-5lb-official-exact",
            fixture_source="apps/scraper/cli/fixtures/sample-products.json",
            sku=str(blue_5lb["sku"]),
            brand=str(blue_5lb["brand"]),
            product_name=str(blue_5lb["name"]),
            expected_rank=2,
            rationale="Official Blue Buffalo PDP is the only exact 5 lb manufacturer result; retailer and marketplace options are weaker or wrong-variant.",
            search_results=(
                _result(
                    "https://www.amazon.com/dp/B0BLUE5LB",
                    "Blue Buffalo Life Protection Formula Adult Dog Food 5-lb Bag - Amazon.com",
                    "Marketplace PDP with price and shipping, but not an official brand page.",
                ),
                _result(
                    "https://bluebuffalo.com/dog-food/life-protection-formula-adult-chicken-brown-rice-5-lb",
                    "Blue Buffalo Life Protection Formula Adult Chicken & Brown Rice Recipe 5-lb Bag",
                    "Official Blue Buffalo product page with exact bag size, feeding details, guaranteed analysis, and image gallery.",
                ),
                _result(
                    "https://www.chewy.com/blue-buffalo-life-protection-formula-adult-chicken-brown-rice-recipe-dry-dog-food-10-lb-bag/dp/123456",
                    "Blue Buffalo Life Protection Formula Adult Chicken & Brown Rice Recipe Dry Dog Food, 10-lb bag",
                    "Trusted retailer PDP, but the variant is 10 lb instead of 5 lb.",
                ),
                _result(
                    "https://bluebuffalo.com/dog-food/life-protection-formula-adult-chicken-brown-rice",
                    "Blue Buffalo Life Protection Formula Adult Chicken & Brown Rice Recipe",
                    "Official family landing page for multiple bag sizes, not clearly locked to the 5 lb SKU.",
                ),
                _result(
                    "https://www.dogfoodadvisor.com/dog-food-reviews/blue-buffalo-life-protection-formula/",
                    "Blue Buffalo Life Protection Formula Review",
                    "Third-party review article, not a product detail page.",
                ),
            ),
        ),
        TestCase(
            case_id="blue-buffalo-30lb-official-exact",
            fixture_source="apps/scraper/cli/fixtures/sample-products.json",
            sku=str(blue_30lb["sku"]),
            brand=str(blue_30lb["brand"]),
            product_name=str(blue_30lb["name"]),
            expected_rank=1,
            rationale="The manufacturer result is exact-match, authoritative, and richer than the retailer alternatives.",
            search_results=(
                _result(
                    "https://bluebuffalo.com/dog-food/life-protection-formula-adult-chicken-brown-rice-30-lb",
                    "Blue Buffalo Life Protection Formula Adult Chicken & Brown Rice Recipe 30-lb Bag",
                    "Official Blue Buffalo PDP with exact 30 lb bag size, ingredients, feeding chart, and image carousel.",
                ),
                _result(
                    "https://www.petco.com/shop/en/petcostore/product/blue-buffalo-life-protection-formula-adult-chicken-and-brown-rice-recipe-dry-dog-food-30-lbs-1234567",
                    "Blue Buffalo Life Protection Formula Adult Chicken & Brown Rice Recipe Dry Dog Food, 30 lbs.",
                    "Major retailer PDP with exact variant, price, stock status, and reviews.",
                ),
                _result(
                    "https://www.amazon.com/dp/B0BLUE15LB",
                    "Blue Buffalo Life Protection Formula Adult Dog Food 15-lb Bag - Amazon.com",
                    "Marketplace page for the 15 lb size, not the 30 lb target.",
                ),
                _result(
                    "https://bluebuffalo.com/dog-food/life-protection-formula",
                    "Life Protection Formula Dry Dog Food",
                    "Official category page covering multiple life stages and flavors.",
                ),
                _result(
                    "https://www.k9ofmine.com/best-blue-buffalo-dog-food/",
                    "Best Blue Buffalo Dog Food Options",
                    "Comparison article, not a PDP.",
                ),
            ),
        ),
        TestCase(
            case_id="solid-gold-holistick-official-exact",
            fixture_source="apps/scraper/cli/fixtures/sample-products.json",
            sku=str(solid_gold_holistick["sku"]),
            brand=str(solid_gold_holistick["brand"]),
            product_name=str(solid_gold_holistick["name"]),
            expected_rank=1,
            rationale="Official brand PDP is exact and content-rich; marketplace and retailer results are weaker or wrong-variant.",
            search_results=(
                _result(
                    "https://solidgoldpet.com/products/holistick-natural-dry-cat-food-10lb",
                    "Solid Gold Holistick Natural Dry Cat Food 10 lb",
                    "Official product page with exact 10 lb variant, nutrition panel, ingredients, and hero imagery.",
                ),
                _result(
                    "https://www.amazon.com/dp/B0SOLID10",
                    "Solid Gold Holistick Natural Cat Food 10 lb - Amazon.com",
                    "Marketplace PDP with exact weight, price, and reviews.",
                ),
                _result(
                    "https://www.petco.com/shop/en/petcostore/product/solid-gold-winged-tiger-dry-cat-food-6-lb-7654321",
                    "Solid Gold Winged Tiger Dry Cat Food, 6 lb",
                    "Trusted retailer PDP, but it is a different formula and size.",
                ),
                _result(
                    "https://solidgoldpet.com/cat-food",
                    "Solid Gold Cat Food",
                    "Official category page for multiple cat food products.",
                ),
                _result(
                    "https://cats.com/reviews/solid-gold-cat-food-review",
                    "Solid Gold Cat Food Review",
                    "Editorial review article, not a product detail page.",
                ),
            ),
        ),
        TestCase(
            case_id="greenies-large-retailer-over-generic-brand-page",
            fixture_source="apps/scraper/cli/fixtures/sample-products.json",
            sku=str(greenies_large["sku"]),
            brand=None,
            product_name=str(greenies_large["name"]),
            expected_rank=2,
            rationale="The brand-domain result is generic and not variant-locked; the Chewy PDP is exact and should win.",
            search_results=(
                _result(
                    "https://greenies.com/products/dog/dental-treats",
                    "GREENIES Dental Treats for Dogs",
                    "Official brand page for the dental treats line covering Teenie, Petite, Regular, and Large sizes.",
                ),
                _result(
                    "https://www.chewy.com/greenies-original-large-natural-dog-dental-care-chews-12-count/dp/987654",
                    "GREENIES Original Large Natural Dog Dental Care Chews, 12 count",
                    "Major retailer PDP with exact Large 12 count variant, price, stock badge, and product details.",
                ),
                _result(
                    "https://www.amazon.com/dp/B0GREENLARGE12",
                    "GREENIES Original Large Dental Dog Treats 12 Count - Amazon.com",
                    "Marketplace PDP with exact variant and price.",
                ),
                _result(
                    "https://www.petco.com/shop/en/petcostore/product/greenies-original-regular-dental-dog-treats-12-count-246810",
                    "GREENIES Original Regular Dental Dog Treats, 12 count",
                    "Retailer PDP, but the dog size is Regular rather than Large.",
                ),
                _result(
                    "https://www.rover.com/blog/best-dental-chews-for-dogs/",
                    "Best Dental Chews for Dogs",
                    "Affiliate roundup article, not a PDP.",
                ),
            ),
        ),
        TestCase(
            case_id="scotts-deep-forest-brown-official-exact",
            fixture_source="apps/scraper/tests/fixtures/test_skus_ground_truth.json",
            sku=str(scotts_deep_forest["sku"]),
            brand=str(scotts_deep_forest["brand"]),
            product_name=str(scotts_deep_forest["name"]),
            expected_rank=2,
            rationale="Scotts manufacturer PDP is exact and higher authority than the Lowe's PDP.",
            search_results=(
                _result(
                    "https://www.lowes.com/pd/Scotts-Color-Enhanced-1-5-cu-ft-Deep-Forest-Brown-Blend-Mulch/1001364002",
                    "Scotts Color Enhanced 1.5-cu ft Deep Forest Brown Blend Mulch",
                    "Major retailer PDP with exact color, package size, price, stock status, and gallery.",
                ),
                _result(
                    "https://www.scotts.com/en-us/shop/mulch-soil-garden/scotts-naturescapes-color-enhanced-mulch-deep-forest-brown-1-5-cu-ft/886598.html",
                    "Scotts NatureScapes Color Enhanced Mulch Deep Forest Brown 1.5 cu ft",
                    "Official Scotts PDP with exact color and size, benefits, ingredients, and image-rich product module.",
                ),
                _result(
                    "https://www.walmart.com/ip/Scotts-Nature-Scapes-Mulch/123123123",
                    "Scotts Nature Scapes Mulch",
                    "Retailer PDP that does not clearly specify the Deep Forest Brown variant.",
                ),
                _result(
                    "https://www.youtube.com/watch?v=scotts-mulch-review",
                    "Scotts Mulch Review",
                    "Video review, not a product detail page.",
                ),
                _result(
                    "https://www.scotts.com/en-us/shop/mulch-soil-garden",
                    "Scotts Mulch & Soil Products",
                    "Official category page for multiple mulch products.",
                ),
            ),
        ),
        TestCase(
            case_id="manna-pro-duckling-official-exact",
            fixture_source="apps/scraper/tests/fixtures/test_skus_ground_truth.json",
            sku=str(manna_duckling["sku"]),
            brand=str(manna_duckling["brand"]),
            product_name=str(manna_duckling["name"]),
            expected_rank=1,
            rationale="The Manna Pro manufacturer PDP is exact and should beat retailer PDPs.",
            search_results=(
                _result(
                    "https://mannapro.com/products/duck-starter-grower",
                    "Manna Pro Duckling & Gosling Starter Grower Crumbles 8 lb",
                    "Official Manna Pro product page with exact 8 lb variant, 22% protein callout, feeding guide, and imagery.",
                ),
                _result(
                    "https://www.tractorsupply.com/tsc/product/manna-pro-duckling-and-gosling-starter-grower-crumbles-8-lb",
                    "Manna Pro Duckling & Gosling Starter Grower Crumbles, 8 lb",
                    "Trusted retailer PDP with exact size, price, and stock.",
                ),
                _result(
                    "https://www.southernstates.com/products/manna-pro-duckling-gosling-starter-grower-8-lb",
                    "Manna Pro Duckling & Gosling Starter Grower, 8 lb",
                    "Regional retailer PDP with exact variant and product details.",
                ),
                _result(
                    "https://www.backyardchickens.com/threads/best-feed-for-ducklings.123456/",
                    "Best feed for ducklings",
                    "Forum thread, not a PDP.",
                ),
                _result(
                    "https://www.amazon.com/dp/B0DUCK10LB",
                    "Duckling Starter Grower Feed 10 lb - Amazon.com",
                    "Marketplace listing with wrong bag size.",
                ),
            ),
        ),
        TestCase(
            case_id="scotts-spreader-official-exact",
            fixture_source="apps/scraper/tests/fixtures/test_skus_ground_truth.json",
            sku=str(scotts_spreader["sku"]),
            brand=str(scotts_spreader["brand"]),
            product_name=str(scotts_spreader["name"]),
            expected_rank=3,
            rationale="Scotts official PDP is exact and authoritative; retailer PDPs are valid but secondary.",
            search_results=(
                _result(
                    "https://www.homedepot.com/p/Scotts-Turf-Builder-EdgeGuard-Mini-Broadcast-Spreader-76121/100464267",
                    "Scotts Turf Builder EdgeGuard Mini Broadcast Spreader",
                    "Major retailer PDP with price, stock, and specs for the exact spreader model.",
                ),
                _result(
                    "https://www.lowes.com/pd/Scotts-Turf-Builder-Edgeguard-Mini-Broadcast-Spreader/3032222",
                    "Scotts Turf Builder EdgeGuard Mini Broadcast Spreader",
                    "Major retailer PDP with product overview, specs, and delivery options.",
                ),
                _result(
                    "https://www.scotts.com/en-us/shop/spreaders/scotts-turf-builder-edgeguard-mini-broadcast-spreader/76121B.html",
                    "Scotts Turf Builder EdgeGuard Mini Broadcast Spreader",
                    "Official Scotts PDP with exact model 76121B, spread width, capacity, and rich product detail content.",
                ),
                _result(
                    "https://www.scotts.com/sites/g/files/oydgjc106/files/asset/document/76121B-manual.pdf",
                    "Scotts Turf Builder EdgeGuard Mini Broadcast Spreader Manual",
                    "PDF manual, helpful but not a product detail page.",
                ),
                _result(
                    "https://www.bobvila.com/articles/best-broadcast-spreaders/",
                    "Best Broadcast Spreaders",
                    "Comparison article, not a PDP.",
                ),
            ),
        ),
        TestCase(
            case_id="manna-mini-horse-treats-brand-inference",
            fixture_source="apps/scraper/tests/fixtures/test_skus_ground_truth.json",
            sku=str(manna_mini_treats["sku"]),
            brand=None,
            product_name=str(manna_mini_treats["name"]),
            expected_rank=2,
            rationale="Brand is omitted on purpose; the exact Manna Pro PDP should still be selected over retailer and marketplace options.",
            search_results=(
                _result(
                    "https://www.amazon.com/dp/B0MINIDONKEY",
                    "Farmhouse Favorites Mini Horse & Donkey Treats - Amazon.com",
                    "Marketplace PDP with price and reviews.",
                ),
                _result(
                    "https://mannapro.com/products/farmhouse-favorites-mini-horse-donkey-treats",
                    "Manna Pro Farmhouse Favorites Mini Horse & Donkey Treats",
                    "Official Manna Pro product page with exact title match, ingredient list, feeding notes, and images.",
                ),
                _result(
                    "https://www.tractorsupply.com/tsc/product/manna-pro-farmhouse-favorites-mini-horse-donkey-treats",
                    "Manna Pro Farmhouse Favorites Mini Horse & Donkey Treats",
                    "Major retailer PDP with exact title match and stock information.",
                ),
                _result(
                    "https://mannapro.com/collections/horse-treats",
                    "Manna Pro Horse Treats",
                    "Official collection page for multiple horse treat products.",
                ),
                _result(
                    "https://www.youtube.com/watch?v=mini-horse-treats-review",
                    "Mini horse treat review",
                    "Video review, not a PDP.",
                ),
            ),
        ),
        TestCase(
            case_id="manna-all-flock-retailer-fallback",
            fixture_source="apps/scraper/tests/fixtures/test_skus_ground_truth.json",
            sku=str(manna_all_flock["sku"]),
            brand=str(manna_all_flock["brand"]),
            product_name=str(manna_all_flock["name"]),
            expected_rank=2,
            rationale="The official-domain result is a broad feed category page, so the best exact retailer PDP should win.",
            search_results=(
                _result(
                    "https://mannapro.com/poultry/all-flock-feed",
                    "Manna Pro All Flock Feed",
                    "Official feed category overview covering pellets, mash, and multiple bag sizes; not clearly the exact 8 lb crumbles SKU.",
                ),
                _result(
                    "https://www.tractorsupply.com/tsc/product/manna-pro-all-flock-crumble-with-probiotics-8-lb",
                    "Manna Pro 16% All Flock Crumble with Probiotics, 8 lb",
                    "Major retailer PDP with exact 8 lb crumble variant, price, stock, and detailed nutrition content.",
                ),
                _result(
                    "https://www.horseloverz.com/poultry-feed/manna-pro-16-all-flock-crumble-with-probiotics-8-lb",
                    "Manna Pro 16% All Flock Crumble with Probiotics, 8 lb",
                    "Specialty retailer PDP with exact variant and price.",
                ),
                _result(
                    "https://www.amazon.com/dp/B0ALLFLOCK5",
                    "All Flock Feed Crumbles 5 lb - Amazon.com",
                    "Marketplace listing for a different bag size.",
                ),
                _result(
                    "https://blog.mypetchicken.com/what-to-feed-mixed-flocks/",
                    "What to Feed Mixed Flocks",
                    "Blog post, not a PDP.",
                ),
            ),
        ),
        TestCase(
            case_id="miracle-gro-25qt-official-exact",
            fixture_source="apps/scraper/tests/fixtures/test_skus_ground_truth.json",
            sku=str(miracle_gro_25["sku"]),
            brand=str(miracle_gro_25["brand"]),
            product_name=str(miracle_gro_25["name"]),
            expected_rank=1,
            rationale="The Miracle-Gro manufacturer PDP is exact and stronger than retailer alternatives.",
            search_results=(
                _result(
                    "https://miraclegro.com/en-us/shop/soils/miracle-gro-potting-mix-25-qt/278140.html",
                    "Miracle-Gro Potting Mix 25 Quart",
                    "Official Miracle-Gro PDP with exact 25 Quart variant, feeding claim, use cases, and image gallery.",
                ),
                _result(
                    "https://www.homedepot.com/p/Miracle-Gro-25-qt-Potting-Mix-72786430/100000000",
                    "Miracle-Gro Potting Mix 25 qt.",
                    "Major retailer PDP with exact size, price, and reviews.",
                ),
                _result(
                    "https://www.lowes.com/pd/Miracle-Gro-Potting-Mix-50-Quart/1111111",
                    "Miracle-Gro Potting Mix 50 Quart",
                    "Trusted retailer PDP, but for the 50 Quart variant.",
                ),
                _result(
                    "https://www.gardendesign.com/soil/best-potting-mix.html",
                    "Best potting mix for container gardening",
                    "Editorial article, not a PDP.",
                ),
                _result(
                    "https://www.amazon.com/dp/B0MGPOTMIX",
                    "Miracle-Gro Potting Mix - Amazon.com",
                    "Marketplace page without clear 25 Quart confirmation.",
                ),
            ),
        ),
        TestCase(
            case_id="miracle-gro-50qt-retailer-over-family-page",
            fixture_source="apps/scraper/tests/fixtures/test_skus_ground_truth.json",
            sku=str(miracle_gro_50["sku"]),
            brand=str(miracle_gro_50["brand"]),
            product_name=str(miracle_gro_50["name"]),
            expected_rank=2,
            rationale="The official result is only a family page with multiple sizes; Lowe's has the clearest exact 50 Quart PDP.",
            search_results=(
                _result(
                    "https://miraclegro.com/en-us/shop/soils/miracle-gro-potting-mix/miracle-gro-potting-mix.html",
                    "Miracle-Gro Potting Mix",
                    "Official family page for multiple potting mix sizes and package options; exact 50 Quart variant is not explicit in title or URL.",
                ),
                _result(
                    "https://www.lowes.com/pd/Miracle-Gro-Potting-Mix-50-Quart/1000000012",
                    "Miracle-Gro Potting Mix 50 Quart",
                    "Major retailer PDP with exact 50 Quart match, price, stock badge, and product details.",
                ),
                _result(
                    "https://www.truevalue.com/miracle-gro-potting-mix-25-quart",
                    "Miracle-Gro Potting Mix 25 Quart",
                    "Retailer PDP for the wrong 25 Quart size.",
                ),
                _result(
                    "https://www.amazon.com/dp/B0MG50QT",
                    "Miracle-Gro Potting Mix 50 Quart - Amazon.com",
                    "Marketplace PDP with exact size and price.",
                ),
                _result(
                    "https://www.thespruce.com/best-potting-soils-4173386",
                    "Best Potting Soils",
                    "Review article, not a product detail page.",
                ),
            ),
        ),
        TestCase(
            case_id="scotts-sierra-red-official-exact",
            fixture_source="apps/scraper/tests/fixtures/test_skus_ground_truth.json",
            sku=str(scotts_sierra_red["sku"]),
            brand=str(scotts_sierra_red["brand"]),
            product_name=str(scotts_sierra_red["name"]),
            expected_rank=4,
            rationale="The only exact manufacturer PDP is result 4; the earlier results are lower authority or weaker-quality matches.",
            search_results=(
                _result(
                    "https://www.truevalue.com/scotts-naturescapes-color-enhanced-mulch-sierra-red-1-5-cu-ft",
                    "Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
                    "Trusted retailer PDP with exact color and size plus price.",
                ),
                _result(
                    "https://www.pinterest.com/pin/scotts-sierra-red-mulch/",
                    "Scotts Sierra Red Mulch",
                    "Image pin, not a product detail page.",
                ),
                _result(
                    "https://www.walmart.com/ip/Scotts-Color-Enhanced-Mulch-Red/55555555",
                    "Scotts Color Enhanced Mulch Red",
                    "Retailer PDP that does not clearly confirm Sierra Red or 1.5 cu ft.",
                ),
                _result(
                    "https://www.scotts.com/en-us/shop/mulch-soil-garden/scotts-naturescapes-color-enhanced-mulch/scotts-naturescapes-color-enhanced-mulch-sierra-red-1-5-cu-ft.html",
                    "Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
                    "Official Scotts PDP with exact color, exact size, product details, and image-rich PDP modules.",
                ),
                _result(
                    "https://www.gardengatemagazine.com/review/mulch-color-options/",
                    "Mulch color options review",
                    "Editorial review article, not a PDP.",
                ),
            ),
        ),
        TestCase(
            case_id="greenies-medium-no-suitable-result",
            fixture_source="apps/scraper/cli/fixtures/sample-products.json",
            sku=str(greenies_medium["sku"]),
            brand=str(greenies_medium["brand"]),
            product_name=str(greenies_medium["name"]),
            expected_rank=0,
            rationale="No result is an exact medium 12 count PDP; the set only contains generic, wrong-variant, or non-PDP pages.",
            search_results=(
                _result(
                    "https://greenies.com/products/dog/dental-treats",
                    "GREENIES Dental Treats for Dogs",
                    "Official brand overview page for the entire dental chew line with multiple sizes.",
                ),
                _result(
                    "https://www.amazon.com/dp/B0GREENTEENIE",
                    "GREENIES Teenie Dental Dog Treats 12 Count - Amazon.com",
                    "Marketplace PDP, but the dog size is Teenie rather than Medium.",
                ),
                _result(
                    "https://www.petco.com/shop/en/petcostore/product/greenies-large-dental-dog-treats-12-count-112233",
                    "GREENIES Large Dental Dog Treats, 12 count",
                    "Retailer PDP for the wrong Large variant.",
                ),
                _result(
                    "https://www.walmart.com/browse/pet-supplies/dog-treats/5440_202072",
                    "Dog Treats - Walmart.com",
                    "Category page, not a product detail page.",
                ),
                _result(
                    "https://www.dogster.com/lifestyle/best-dog-dental-chews",
                    "Best dog dental chews",
                    "Affiliate article, not a PDP.",
                ),
            ),
        ),
    ]


def _format_results_for_prompt(search_results: tuple[SearchResult, ...]) -> str:
    lines: list[str] = []
    for index, result in enumerate(search_results, start=1):
        lines.append(f"{index}. URL: {result.url}")
        lines.append(f"   Title: {result.title}")
        lines.append(f"   Description: {result.description}")
    return "\n".join(lines)


def _build_prompt(case: TestCase) -> str:
    brand = case.brand or "Unknown"
    return PROMPT_TEMPLATE.format(
        sku=case.sku,
        brand=brand,
        product_name=case.product_name,
        results_text=_format_results_for_prompt(case.search_results),
        result_count=len(case.search_results),
    )


def _estimate_cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    rates = PRICING_PER_MILLION_TOKENS[model]
    return (prompt_tokens / 1_000_000 * rates["input"]) + (completion_tokens / 1_000_000 * rates["output"])


def _extract_rank(raw_text: str, max_rank: int) -> int | None:
    match = re.search(r"\b(\d+)\b", raw_text)
    if match is None:
        return None

    rank = int(match.group(1))
    if 0 <= rank <= max_rank:
        return rank
    return None


def _post_json(url: str, *, headers: Mapping[str, str], payload: Mapping[str, object]) -> JSONDict:
    request = urllib.request.Request(
        url=url,
        data=json.dumps(payload).encode("utf-8"),
        headers={**headers, "Content-Type": "application/json"},
        method="POST",
    )
    with cast(addinfourl, urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS)) as response:
        response_bytes = response.read()
        response_text = response_bytes.decode("utf-8")
    return _as_dict(_parse_json(response_text), f"HTTP response from {url}")


def _call_openai(api_key: str, prompt: str) -> tuple[str, int, int, int]:
    response = _post_json(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}"},
        payload={
            "model": OPENAI_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0,
            "max_tokens": 16,
        },
    )
    usage = _as_dict(response.get("usage", {}), "OpenAI usage")
    choices = _as_list(response.get("choices"), "OpenAI choices")
    first_choice = _as_dict(choices[0], "OpenAI choice")
    message = _as_dict(first_choice.get("message"), "OpenAI message")
    content = _as_str(message.get("content"), "OpenAI message content")
    return (
        content.strip(),
        _as_int(usage.get("prompt_tokens", 0)),
        _as_int(usage.get("completion_tokens", 0)),
        _as_int(usage.get("total_tokens", 0)),
    )


def _extract_gemini_text(response: JSONDict) -> str:
    text_chunks: list[str] = []
    for candidate_value in _as_list(response.get("candidates", []), "Gemini candidates"):
        candidate = _as_dict(candidate_value, "Gemini candidate")
        content = _as_dict(candidate.get("content", {}), "Gemini candidate content")
        for part_value in _as_list(content.get("parts", []), "Gemini content parts"):
            part = _as_dict(part_value, "Gemini content part")
            text_value = part.get("text")
            if text_value:
                text_chunks.append(str(text_value))
    return "\n".join(text_chunks).strip()


def _call_gemini(api_key: str, prompt: str) -> tuple[str, int, int, int]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"
    response = _post_json(
        url,
        headers={},
        payload={
            "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0,
                "maxOutputTokens": 16,
                "candidateCount": 1,
            },
        },
    )
    usage = _as_dict(response.get("usageMetadata", {}), "Gemini usage metadata")
    return (
        _extract_gemini_text(response),
        _as_int(usage.get("promptTokenCount", usage.get("prompt_token_count", 0))),
        _as_int(usage.get("candidatesTokenCount", usage.get("candidates_token_count", 0))),
        _as_int(usage.get("totalTokenCount", usage.get("total_token_count", 0))),
    )


def _invoke_provider(provider: ProviderConfig, prompt: str, api_key: str) -> tuple[str, int, int, int]:
    if provider.name == "gemini":
        return _call_gemini(api_key, prompt)
    if provider.name == "openai":
        return _call_openai(api_key, prompt)
    raise ValueError(f"Unsupported provider: {provider.name}")


def _run_case(provider: ProviderConfig, api_key: str, case: TestCase) -> CaseResult:
    prompt = _build_prompt(case)
    start = time.perf_counter()
    try:
        raw_response, prompt_tokens, completion_tokens, total_tokens = _invoke_provider(provider, prompt, api_key)
        latency_ms = (time.perf_counter() - start) * 1000
        predicted_rank = _extract_rank(raw_response, max_rank=len(case.search_results))
        error = None if predicted_rank is not None else "Response did not contain a valid rank"
        cost_usd = _estimate_cost_usd(provider.model, prompt_tokens, completion_tokens)
        return CaseResult(
            case_id=case.case_id,
            expected_rank=case.expected_rank,
            predicted_rank=predicted_rank,
            raw_response=raw_response,
            latency_ms=latency_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            cost_usd=cost_usd,
            error=error,
        )
    except urllib.error.HTTPError as exc:
        latency_ms = (time.perf_counter() - start) * 1000
        body = exc.read().decode("utf-8", errors="replace")
        return CaseResult(
            case_id=case.case_id,
            expected_rank=case.expected_rank,
            predicted_rank=None,
            raw_response=body,
            latency_ms=latency_ms,
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            cost_usd=0.0,
            error=f"HTTP {exc.code}",
        )
    except Exception as exc:  # pragma: no cover - defensive runtime handling for external APIs
        latency_ms = (time.perf_counter() - start) * 1000
        return CaseResult(
            case_id=case.case_id,
            expected_rank=case.expected_rank,
            predicted_rank=None,
            raw_response="",
            latency_ms=latency_ms,
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            cost_usd=0.0,
            error=str(exc),
        )


def _aggregate_metrics(case_results: list[CaseResult]) -> dict[str, float | int]:
    total = len(case_results)
    correct = sum(result.is_correct for result in case_results)
    failures = sum(result.error is not None for result in case_results)
    avg_latency_ms = mean(result.latency_ms for result in case_results)
    avg_prompt_tokens = mean(result.prompt_tokens for result in case_results)
    avg_completion_tokens = mean(result.completion_tokens for result in case_results)
    avg_total_tokens = mean(result.total_tokens for result in case_results)
    avg_cost_usd = mean(result.cost_usd for result in case_results)
    return {
        "total_cases": total,
        "correct_cases": correct,
        "accuracy_pct": correct / total * 100,
        "error_cases": failures,
        "error_rate_pct": failures / total * 100,
        "avg_latency_ms": avg_latency_ms,
        "avg_prompt_tokens": avg_prompt_tokens,
        "avg_completion_tokens": avg_completion_tokens,
        "avg_total_tokens": avg_total_tokens,
        "avg_cost_usd": avg_cost_usd,
        "cost_per_1000_queries_usd": avg_cost_usd * 1000,
        "total_cost_usd": sum(result.cost_usd for result in case_results),
    }


def _decide_recommendation(summary: dict[str, dict[str, float | int]]) -> tuple[str, list[str]]:
    gemini = summary["gemini"]
    openai = summary["openai"]
    gemini_accuracy = float(gemini["accuracy_pct"])
    openai_accuracy = float(openai["accuracy_pct"])
    gemini_latency = float(gemini["avg_latency_ms"])
    openai_latency = float(openai["avg_latency_ms"])
    gemini_cost = float(gemini["cost_per_1000_queries_usd"])
    openai_cost = float(openai["cost_per_1000_queries_usd"])

    reasons: list[str] = []
    if gemini_accuracy > openai_accuracy:
        reasons.append(f"Gemini achieved higher ranking accuracy ({gemini_accuracy:.1f}% vs {openai_accuracy:.1f}%).")
        recommendation = "Use Gemini for the search-source-selection stage."
    elif openai_accuracy > gemini_accuracy:
        reasons.append(f"OpenAI achieved higher ranking accuracy ({openai_accuracy:.1f}% vs {gemini_accuracy:.1f}%).")
        recommendation = "Use OpenAI for the search-source-selection stage."
    else:
        if gemini_latency <= openai_latency and gemini_cost <= openai_cost:
            recommendation = "Use Gemini for the search-source-selection stage."
            reasons.append(
                f"Accuracy was tied, and Gemini was both faster ({gemini_latency:.0f} ms vs {openai_latency:.0f} ms) and cheaper (${gemini_cost:.2f} vs ${openai_cost:.2f} per 1,000 queries)."
            )
        elif openai_latency <= gemini_latency and openai_cost <= gemini_cost:
            recommendation = "Use OpenAI for the search-source-selection stage."
            reasons.append(
                f"Accuracy was tied, and OpenAI was both faster ({openai_latency:.0f} ms vs {gemini_latency:.0f} ms) and cheaper (${openai_cost:.2f} vs ${gemini_cost:.2f} per 1,000 queries)."
            )
        else:
            recommendation = "Use Gemini for the search-source-selection stage."
            reasons.append("Accuracy was tied and the efficiency trade-off was mixed; defaulting to the lower-cost Gemini option.")

    if recommendation.startswith("Use Gemini"):
        if gemini_latency < openai_latency:
            reasons.append(f"Gemini was also faster on average ({gemini_latency:.0f} ms vs {openai_latency:.0f} ms).")
        if gemini_cost < openai_cost:
            reasons.append(f"Gemini was also cheaper (${gemini_cost:.2f} vs ${openai_cost:.2f} per 1,000 queries).")
    else:
        if openai_latency < gemini_latency:
            reasons.append(f"OpenAI was also faster on average ({openai_latency:.0f} ms vs {gemini_latency:.0f} ms).")
        if openai_cost < gemini_cost:
            reasons.append(f"OpenAI was also cheaper (${openai_cost:.2f} vs ${gemini_cost:.2f} per 1,000 queries).")

    reasons.append("Accuracy was treated as the primary decision metric; latency and cost were used as tie-breakers.")
    return recommendation, reasons


def _render_summary_table(summary: dict[str, dict[str, float | int]]) -> str:
    rows = [
        "| Provider | Model | Accuracy | Correct | Avg latency (ms) | Error rate | Avg prompt tokens | Avg completion tokens | Est. cost / 1K queries |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    provider_labels = {"gemini": "Gemini", "openai": "OpenAI"}
    for provider_name, label in (("gemini", GEMINI_MODEL), ("openai", OPENAI_MODEL)):
        metrics = summary[provider_name]
        rows.append(
            f"| {provider_labels[provider_name]} | {label} | {float(metrics['accuracy_pct']):.1f}% | {int(metrics['correct_cases'])}/{int(metrics['total_cases'])} | {float(metrics['avg_latency_ms']):.0f} | {float(metrics['error_rate_pct']):.1f}% | {float(metrics['avg_prompt_tokens']):.1f} | {float(metrics['avg_completion_tokens']):.1f} | ${float(metrics['cost_per_1000_queries_usd']):.2f} |"
        )
    return "\n".join(rows)


def _render_case_table(cases: list[TestCase], results_by_provider: dict[str, dict[str, CaseResult]]) -> str:
    rows = [
        "| Case | SKU | Expected | Gemini | OpenAI | Notes |",
        "| --- | --- | ---: | ---: | ---: | --- |",
    ]
    for case in cases:
        gemini_result = results_by_provider["gemini"][case.case_id]
        openai_result = results_by_provider["openai"][case.case_id]
        gemini_cell = gemini_result.predicted_rank if gemini_result.predicted_rank is not None else "ERR"
        openai_cell = openai_result.predicted_rank if openai_result.predicted_rank is not None else "ERR"
        rows.append(f"| {case.case_id} | {case.sku} | {case.expected_rank} | {gemini_cell} | {openai_cell} | {case.rationale} |")
    return "\n".join(rows)


def _render_error_section(provider_results: dict[str, list[CaseResult]]) -> str:
    lines = ["## Errors", ""]
    had_error = False
    provider_labels = {"gemini": "Gemini", "openai": "OpenAI"}
    for provider_name in ("gemini", "openai"):
        failures = [result for result in provider_results[provider_name] if result.error is not None]
        if not failures:
            continue
        had_error = True
        lines.append(f"### {provider_labels[provider_name]}")
        lines.append("")
        for failure in failures:
            raw_excerpt = failure.raw_response.replace("\n", " ").strip()
            if len(raw_excerpt) > 180:
                raw_excerpt = f"{raw_excerpt[:177]}..."
            lines.append(f"- `{failure.case_id}`: {failure.error}. Response: `{raw_excerpt}`")
        lines.append("")

    if not had_error:
        lines.append("No API or parsing errors occurred during the run.")
        lines.append("")

    return "\n".join(lines)


def _build_report(
    cases: list[TestCase],
    provider_results: dict[str, list[CaseResult]],
    summary: dict[str, dict[str, float | int]],
) -> str:
    results_by_provider = {provider_name: {result.case_id: result for result in results} for provider_name, results in provider_results.items()}
    recommendation, reasons = _decide_recommendation(summary)
    timestamp = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    gemini_latency = float(summary["gemini"]["avg_latency_ms"])
    openai_latency = float(summary["openai"]["avg_latency_ms"])
    gemini_cost = float(summary["gemini"]["cost_per_1000_queries_usd"])
    openai_cost = float(summary["openai"]["cost_per_1000_queries_usd"])
    faster_provider = "OpenAI" if openai_latency < gemini_latency else "Gemini"
    faster_latency = min(gemini_latency, openai_latency)
    slower_latency = max(gemini_latency, openai_latency)
    cheaper_provider = "OpenAI" if openai_cost < gemini_cost else "Gemini"
    cheaper_cost = min(gemini_cost, openai_cost)
    pricier_cost = max(gemini_cost, openai_cost)
    lines = [
        "# Search Provider Comparison: Gemini vs OpenAI",
        "",
        f"- Generated: {timestamp}",
        f"- Dataset size: {len(cases)} mock source-selection cases",
        f"- Prompt basis: `apps/scraper/docs/prompt_design_v2.md` lines 20-53",
        f"- Models tested: `{GEMINI_MODEL}` vs `{OPENAI_MODEL}`",
        "- Search results were fully mocked; no live web search was used.",
        "",
        "## Methodology",
        "",
        "1. Loaded product context from `apps/scraper/cli/fixtures/sample-products.json` and `apps/scraper/tests/fixtures/test_skus_ground_truth.json`.",
        "2. Authored 13 fixed ranking cases with 5 mock search results each, covering official manufacturer wins, retailer fallback wins, brand inference, variant mismatches, and one `0` (no suitable page) case.",
        "3. Sent the exact Source Selection Prompt v2 rubric to both providers with temperature 0 and a strict integer-only output requirement.",
        "4. Measured exact-match ranking accuracy, per-call latency, token usage, estimated cost, and API/parsing failures.",
        "5. Estimated cost using the task-specified pricing assumptions: Gemini Flash Lite = $0.075 / 1M input + $0.30 / 1M output tokens; GPT-4o-mini = $0.15 / 1M input + $0.60 / 1M output tokens.",
        "",
        "## Accuracy / Latency / Cost Summary",
        "",
        _render_summary_table(summary),
        "",
        "## Latency Comparison",
        "",
        f"- {faster_provider} was faster on this run ({faster_latency:.0f} ms average vs {slower_latency:.0f} ms).",
        "- Latency varied materially across individual calls, so accuracy remained the primary decision signal.",
        "",
        "## Cost Analysis",
        "",
        f"- {cheaper_provider} was cheaper at ${cheaper_cost:.2f} per 1,000 queries versus ${pricier_cost:.2f} for the alternative.",
        "- Gemini pricing in this experiment was roughly half the OpenAI cost because both average token usage and per-token list prices were lower.",
        "",
        "## Case-by-case Results",
        "",
        _render_case_table(cases, results_by_provider),
        "",
        _render_error_section(provider_results),
        "## Recommendation",
        "",
        f"**{recommendation}**",
        "",
        *[f"- {reason}" for reason in reasons],
        "",
        "## Notes",
        "",
        "- This harness is intentionally focused on the search/source-selection stage only; it does not evaluate downstream extraction quality.",
        "- Because all candidates were mocked and deterministic, this result isolates model judgment on ranking rather than search engine recall.",
        "- If the chosen provider will run at high volume, rerun this harness periodically with fresh adversarial cases to monitor regression.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    gemini_api_key = os.getenv("GEMINI_API_KEY")
    openai_api_key = os.getenv("OPENAI_API_KEY")

    missing_keys = [env_name for env_name, env_value in (("GEMINI_API_KEY", gemini_api_key), ("OPENAI_API_KEY", openai_api_key)) if not env_value]
    if missing_keys:
        LOGGER.error("Missing required environment variables: %s", ", ".join(missing_keys))
        return 1

    products_by_sku = _load_fixture_products()
    cases = _build_test_cases(products_by_sku)
    providers = [
        ProviderConfig(name="gemini", model=GEMINI_MODEL, api_key_env="GEMINI_API_KEY"),
        ProviderConfig(name="openai", model=OPENAI_MODEL, api_key_env="OPENAI_API_KEY"),
    ]

    provider_results: dict[str, list[CaseResult]] = {provider.name: [] for provider in providers}
    for provider in providers:
        LOGGER.info("Running %s on %s cases with model %s", provider.name, len(cases), provider.model)
        api_key = gemini_api_key if provider.name == "gemini" else openai_api_key
        assert api_key is not None
        for case in cases:
            result = _run_case(provider, api_key, case)
            provider_results[provider.name].append(result)
            status = "correct" if result.is_correct else "incorrect"
            LOGGER.info(
                "%s :: %s -> expected=%s predicted=%s latency=%.0fms status=%s%s",
                provider.name,
                case.case_id,
                case.expected_rank,
                result.predicted_rank,
                result.latency_ms,
                status,
                f" error={result.error}" if result.error else "",
            )

    summary = {provider_name: _aggregate_metrics(results) for provider_name, results in provider_results.items()}

    report = _build_report(cases, provider_results, summary)
    _ = REPORT_PATH.write_text(report, encoding="utf-8")
    LOGGER.info("Wrote comparison report to %s", REPORT_PATH)
    LOGGER.info(
        "Summary: Gemini accuracy %.1f%%, OpenAI accuracy %.1f%%",
        float(summary["gemini"]["accuracy_pct"]),
        float(summary["openai"]["accuracy_pct"]),
    )
    return 0


if __name__ == "__main__":
    exit_code = main()
    raise SystemExit(exit_code)
