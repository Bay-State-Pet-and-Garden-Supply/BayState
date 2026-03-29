from __future__ import annotations

import pytest

from scrapers.ai_search.crawl4ai_extractor import FallbackExtractor
from scrapers.ai_search.matching import MatchingUtils
from scrapers.ai_search.scoring import SearchScorer
from scrapers.ai_search.validation import ExtractionValidator

SCOTTS_URL = "https://scottsmiraclegro.com/en-us/brands/scotts/products/spreaders/76121B.html"
SCOTTS_HTML = """
<!doctype html>
<html lang="en">
  <head>
    <title>Scotts&reg; Turf Builder&reg; EdgeGuard&reg; Mini Broadcast Spreader | ScottsMiracle-Gro US</title>
    <meta
      name="description"
      content="Scotts Turf Builder Edgeguard Mini Broadcast Spreader can fertilize your large lawn efficiently and accurately. Learn more about it now."
    />
    <meta
      property="og:title"
      content="Scotts&reg; Turf Builder&reg; EdgeGuard&reg; Mini Broadcast Spreader | ScottsMiracle-Gro US"
    />
    <meta
      property="og:description"
      content="Scotts Turf Builder Edgeguard Mini Broadcast Spreader can fertilize your large lawn efficiently and accurately. Learn more about it now."
    />
    <meta
      property="og:image"
      content="https://smg.widen.net/content/92eofq7i69/webp/76121-3_0_F.webp?w=800&h=800"
    />
    <meta property="og:url" content="https://scottsmiraclegro.com/en-us/brands/scotts/products/spreaders/76121B.html" />
  </head>
  <body></body>
</html>
"""

MIRACLE_URL = "https://scottsmiraclegro.com/en-us/brands/miracle-gro/products/potting-mix/72790430.html"
MIRACLE_HTML = """
<!doctype html>
<html lang="en">
  <head>
    <title>Miracle-Gro Potting Mix, For Container Plants, 50 qt. | ScottsMiracle-Gro US</title>
    <meta
      name="description"
      content="Your plants want to show off. Give indoor and outdoor container plants the right ingredients to grow bigger and more beautiful with Miracle-Gro Potting Mix. Our"
    />
    <meta
      property="og:title"
      content="Miracle-Gro Potting Mix, For Container Plants, 50 qt. | ScottsMiracle-Gro US"
    />
    <meta
      property="og:description"
      content="Your plants want to show off. Give indoor and outdoor container plants the right ingredients to grow bigger and more beautiful with Miracle-Gro Potting Mix. Our"
    />
    <meta
      property="og:image"
      content="https://smg.widen.net/content/dqfioq6pyh/webp/72790430_0_F.webp?w=800&h=800"
    />
    <meta property="og:url" content="https://scottsmiraclegro.com/en-us/brands/miracle-gro/products/potting-mix/72790430.html" />
  </head>
  <body></body>
</html>
"""

CATIT_FAMILY_URL = "https://www.catit.com/products/litter-boxes-accessories/litter-boxes-with-airsift-filter-system/"
CATIT_FAMILY_HTML = """
<!doctype html>
<html lang="en-US">
  <head>
    <title>Catit Litter Boxes with Airsift Filter System - Products</title>
    <meta
      name="description"
      content="The Catit Litter Box is practical and cat-friendly, with easy-access door, anti-leak design, and integrated Airsift odor filter system."
    />
    <meta property="og:title" content="Litter Boxes with Airsift Filter System" />
    <meta
      property="og:description"
      content="The Catit Litter Box is practical and cat-friendly, with easy-access door, anti-leak design, and integrated Airsift odor filter system."
    />
    <meta
      property="og:image"
      content="https://www.catit.com/wp-content/uploads/2023/11/Litter-Box-Airsift_border-1.jpg"
    />
    <meta
      property="og:url"
      content="https://www.catit.com/products/litter-boxes-accessories/litter-boxes-with-airsift-filter-system/"
    />
  </head>
  <body></body>
</html>
"""

CATIT_PDP_URL = (
    "https://www.bigdogpetsupply.com/products/"
    "catit-airsift-jumbo-hooded-litter-pan-warm-gray-white-privacy-and-easy-access-for-cleaning-ideal-for-larger-or-multiple-cat-households"
)
CATIT_PDP_HTML = """
<!doctype html>
<html lang="en">
  <head>
    <title>Catit Airsift Jumbo Hooded Litter Pan, Warm Gray/White - Privacy and E &ndash; Big Dog Pet Supply</title>
    <meta
      name="description"
      content="Color: Warm Gray Style: Litter Pan Color Warm Gray Brand Catit Material Plastic Product Dimensions 18.3&quot;L x 19.7&quot;W x 22.4&quot;H Global Trade Identification Number 00022517506950 Manufacturer Rolf C. Hagen (USA) Corp. UPC 022517506950"
    />
    <meta
      property="og:title"
      content="Catit Airsift Jumbo Hooded Litter Pan, Warm Gray/White - Privacy and E"
    />
    <meta
      property="og:description"
      content="Color: Warm Gray Style: Litter Pan Color Warm Gray Brand Catit Material Plastic Product Dimensions 18.3&quot;L x 19.7&quot;W x 22.4&quot;H Global Trade Identification Number 00022517506950 Manufacturer Rolf C. Hagen (USA) Corp. UPC 022517506950"
    />
    <meta
      property="og:image"
      content="https://www.bigdogpetsupply.com/cdn/shop/files/61HlSfNvjCL._AC_SL1500.jpg?v=1752226817"
    />
    <meta
      property="og:url"
      content="https://www.bigdogpetsupply.com/products/catit-airsift-jumbo-hooded-litter-pan-warm-gray-white-privacy-and-easy-access-for-cleaning-ideal-for-larger-or-multiple-cat-households"
    />
  </head>
  <body></body>
</html>
"""


async def _extract_and_validate(
    *,
    url: str,
    html: str,
    sku: str,
    product_name: str,
    brand: str,
) -> tuple[dict[str, object], tuple[bool, str]]:
    extractor = FallbackExtractor(scoring=SearchScorer(), matching=MatchingUtils())
    validator = ExtractionValidator(confidence_threshold=0.7)

    extraction = await extractor.extract(
        url=url,
        sku=sku,
        product_name=product_name,
        brand=brand,
        html=html,
    )
    validation = validator.validate_extraction_match(
        extraction_result=extraction,
        sku=sku,
        product_name=product_name,
        brand=brand,
        source_url=url,
    )
    return extraction, validation


@pytest.mark.asyncio
async def test_live_snapshot_accepts_scotts_official_page() -> None:
    extraction, validation = await _extract_and_validate(
        url=SCOTTS_URL,
        html=SCOTTS_HTML,
        sku="032247761215",
        product_name="Scotts Turf Builder Edgeguard Mini Broadcast Spreader",
        brand="Scotts",
    )

    assert extraction["success"] is True
    assert extraction["images"] == ["https://smg.widen.net/content/92eofq7i69/webp/76121-3_0_F.webp?w=800&h=800"]
    assert extraction["brand"] == "Scotts"
    assert validation == (True, "ok")


@pytest.mark.asyncio
async def test_live_snapshot_accepts_miracle_gro_official_page() -> None:
    extraction, validation = await _extract_and_validate(
        url=MIRACLE_URL,
        html=MIRACLE_HTML,
        sku="032247279048",
        product_name="Miracle-Gro Potting Mix 50 qt.",
        brand="Miracle-Gro",
    )

    assert extraction["success"] is True
    assert extraction["size_metrics"] == "50 qt"
    assert extraction["images"] == ["https://smg.widen.net/content/dqfioq6pyh/webp/72790430_0_F.webp?w=800&h=800"]
    assert validation == (True, "ok")


@pytest.mark.asyncio
async def test_live_snapshot_rejects_generic_catit_family_page_for_exact_variant() -> None:
    extraction, validation = await _extract_and_validate(
        url=CATIT_FAMILY_URL,
        html=CATIT_FAMILY_HTML,
        sku="022517506950",
        product_name="Catit Airsift Jumbo Hooded Litter Pan Warm Gray/White",
        brand="Catit",
    )

    assert extraction["success"] is False
    assert "title does not match expected product" in str(extraction["error"]).lower()
    assert validation[0] is False


@pytest.mark.asyncio
async def test_live_snapshot_accepts_exact_catit_retailer_page() -> None:
    extraction, validation = await _extract_and_validate(
        url=CATIT_PDP_URL,
        html=CATIT_PDP_HTML,
        sku="022517506950",
        product_name="Catit Airsift Jumbo Hooded Litter Pan Warm Gray/White",
        brand="Catit",
    )

    assert extraction["success"] is True
    assert "022517506950" in str(extraction["description"])
    assert validation == (True, "ok")


def test_prepare_search_results_prefers_exact_catit_pdp_over_brand_family_page() -> None:
    scorer = SearchScorer()

    ranked = scorer.prepare_search_results(
        search_results=[
            {
                "url": CATIT_FAMILY_URL,
                "title": "Litter Boxes with Airsift Filter System",
                "description": (
                    "The Catit Litter Box is practical and cat-friendly, with easy-access door "
                    "and integrated Airsift odor filter system."
                ),
            },
            {
                "url": CATIT_PDP_URL,
                "title": "Catit Airsift Jumbo Hooded Litter Pan, Warm Gray/White - Privacy and E",
                "description": (
                    "Color Warm Gray Brand Catit Global Trade Identification Number 00022517506950 "
                    "UPC 022517506950"
                ),
            },
        ],
        sku="022517506950",
        brand="Catit",
        product_name="Catit Airsift Jumbo Hooded Litter Pan Warm Gray/White",
        category="Litter Boxes",
    )

    assert ranked[0]["url"] == CATIT_PDP_URL
