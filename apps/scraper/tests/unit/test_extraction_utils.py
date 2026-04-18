from __future__ import annotations

from scrapers.ai_search.extraction import ExtractionUtils
from scrapers.ai_search.scoring import SearchScorer


def _build_utils() -> ExtractionUtils:
    return ExtractionUtils(SearchScorer())


def test_infer_categories_filters_generic_breadcrumbs_and_brand_crumbs() -> None:
    utils = _build_utils()
    html = """
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home"},
        {"@type": "ListItem", "position": 2, "name": "Departments"},
        {"@type": "ListItem", "position": 3, "name": "Automotive"},
        {"@type": "ListItem", "position": 4, "name": "Brands"},
        {"@type": "ListItem", "position": 5, "name": "VP Racing"},
        {"@type": "ListItem", "position": 6, "name": "Utility Fuel Spout, Mini"}
      ]
    }
    </script>
    """

    categories = utils.infer_categories(
        html_text=html,
        source_url="https://heimantruevalue.com/p/mini-utility-fuel-spout-for-easy-pouring-and-controlled-flow-846781005182",
        candidate_name="Utility Fuel Spout, Mini",
        expected_name=None,
        explicit_brand="VP Racing",
    )

    assert categories == ["Automotive"]


def test_infer_categories_canonicalizes_seed_breadcrumb_labels() -> None:
    utils = _build_utils()
    html = """
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Seed"},
        {"@type": "ListItem", "position": 2, "name": "Vegetable Seed"},
        {"@type": "ListItem", "position": 3, "name": "Seed Corn Silver Queen"}
      ]
    }
    </script>
    """

    categories = utils.infer_categories(
        html_text=html,
        source_url="https://farmersdaughtergardencenter.com/product/seed-corn-silver-queen",
        candidate_name="SEED CORN SILVER QUEEN",
        expected_name=None,
        explicit_brand="Lake Valley Seed",
    )

    assert "Seeds" in categories
    assert "Seed" not in categories
    assert "Vegetable Seeds" in categories


def test_infer_categories_adds_poultry_treat_keywords_without_breadcrumbs() -> None:
    utils = _build_utils()

    categories = utils.infer_categories(
        html_text="",
        source_url="https://nissleyfeed.com/products/happy-hen-grasshoppers-4oz",
        candidate_name="HAPPY HEN GRASSHOPPERS 4OZ",
        expected_name=None,
        explicit_brand="Happy Hen Treats",
    )

    assert "Poultry" in categories
    assert "Treats" in categories


def test_infer_categories_adds_poultry_feed_and_supplement_keywords() -> None:
    utils = _build_utils()

    categories = utils.infer_categories(
        html_text="",
        source_url="https://www.bradleycaldwell.com/manna-pro-hydro-hen-supplement-20-oz-667947",
        candidate_name="MANNA PRO HYDRO HEN SUPPLEMENT | 20 OZ",
        expected_name=None,
        explicit_brand="Manna Pro",
    )

    assert "Poultry" in categories
    assert "Supplements" in categories


def test_normalize_images_drops_page_relative_files_artifact() -> None:
    utils = _build_utils()

    images = utils.normalize_images(
        ["files/HTG-017_front.jpg"],
        "https://bentleyseeds.com/products/turnip-purple-white-globe",
    )

    assert images == []


def test_normalize_images_drops_page_relative_products_artifact() -> None:
    """LLMs sometimes hallucinate paths like `products/<name>.jpg` which,
    resolved against `/products/<slug>`, produce `/products/products/<name>.jpg`."""
    utils = _build_utils()

    images = utils.normalize_images(
        [
            "products/BentleySeed_AllSortsSunflowers.jpg",
            "products/AllSortsSunflower_WithFlowers_2021.jpg",
        ],
        "https://bentleyseeds.com/products/all-sorts-mix-sunflower-seed",
    )

    assert images == []


def test_normalize_images_preserves_absolute_products_url() -> None:
    """Absolute URLs with /products/ path should NOT be flagged."""
    utils = _build_utils()

    images = utils.normalize_images(
        ["https://cdn.shopify.com/s/files/1/0023/BentleySeed_AllSorts.jpg"],
        "https://bentleyseeds.com/products/all-sorts-mix-sunflower-seed",
    )

    assert images == ["https://cdn.shopify.com/s/files/1/0023/BentleySeed_AllSorts.jpg"]


def test_normalize_images_preserves_valid_shopify_cdn_file_url() -> None:
    utils = _build_utils()

    images = utils.normalize_images(
        ["//bentleyseeds.com/cdn/shop/files/HTG-017_front.jpg?v=1739186744"],
        "https://bentleyseeds.com/products/turnip-purple-white-globe",
    )

    assert images == ["https://bentleyseeds.com/cdn/shop/files/HTG-017_front.jpg?v=1739186744"]


def test_infer_brand_from_candidate_title_prefix() -> None:
    utils = _build_utils()

    inferred_brand = utils.infer_brand(
        explicit_brand=None,
        candidate_name="Four Paws Wee-Wee Cat Litter Box System Pads 11 in x 17 in 10 ct",
        description="Retailer product page",
        source_url="https://petswarehouse.com/products/four-paws-wee-wee-cat-litter-box-system-pads-11-in-x-17-in-10-ct",
        expected_name="WEE WEE CAT PADS 11X 17 10CT",
    )

    assert inferred_brand == "Four Paws"


def test_extract_demandware_variant_candidates_prefers_matching_color_and_size() -> None:
    utils = _build_utils()
    html = """
    <button class="btn-size" value="https://scottsmiraclegro.com/on/demandware.store/Sites-SMG-Site/en_US/Product-Variation?dwvar_scotts-nature-scapes-color-enhanced-mulch_color=0031&amp;dwvar_scotts-nature-scapes-color-enhanced-mulch_size=1.5cf&amp;pid=scotts-nature-scapes-color-enhanced-mulch&amp;quantity=1" data-attr-value="1.5cf" data-attr-id="size">1.5 CF</button>
    <button class="btn-size" value="https://scottsmiraclegro.com/on/demandware.store/Sites-SMG-Site/en_US/Product-Variation?dwvar_scotts-nature-scapes-color-enhanced-mulch_color=0031&amp;dwvar_scotts-nature-scapes-color-enhanced-mulch_size=2cf&amp;pid=scotts-nature-scapes-color-enhanced-mulch&amp;quantity=1" data-attr-value="2cf" data-attr-id="size">2 CF</button>
    <button aria-label="Select Color Black" data-url="https://scottsmiraclegro.com/on/demandware.store/Sites-SMG-Site/en_US/Product-Variation?dwvar_scotts-nature-scapes-color-enhanced-mulch_color=0031&amp;dwvar_scotts-nature-scapes-color-enhanced-mulch_size=1.5cf&amp;pid=scotts-nature-scapes-color-enhanced-mulch&amp;quantity=1"><span data-attr-value="0031"></span></button>
    <button aria-label="Select Color Red" data-url="https://scottsmiraclegro.com/on/demandware.store/Sites-SMG-Site/en_US/Product-Variation?dwvar_scotts-nature-scapes-color-enhanced-mulch_color=0039&amp;dwvar_scotts-nature-scapes-color-enhanced-mulch_size=1.5cf&amp;pid=scotts-nature-scapes-color-enhanced-mulch&amp;quantity=1"><span data-attr-value="0039"></span></button>
    <button aria-label="Select Color Brown" data-url="https://scottsmiraclegro.com/on/demandware.store/Sites-SMG-Site/en_US/Product-Variation?dwvar_scotts-nature-scapes-color-enhanced-mulch_color=0041&amp;dwvar_scotts-nature-scapes-color-enhanced-mulch_size=1.5cf&amp;pid=scotts-nature-scapes-color-enhanced-mulch&amp;quantity=1"><span data-attr-value="0041"></span></button>
    """

    candidates = utils.extract_demandware_variant_candidates(
        html_text=html,
        source_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
        expected_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
    )

    assert candidates
    assert "color=0039" in candidates[0]["url"]
    assert "size=1.5cf" in candidates[0]["url"]
    assert candidates[0]["score"] > candidates[-1]["score"]


def test_extract_product_from_html_jsonld_supports_demandware_variation_payload() -> None:
    utils = _build_utils()
    payload = {
        "product": {
            "productName": "Scotts Nature Scapes Color Enhanced Mulch 1.5 cu. ft.",
            "brand": "Scotts",
            "upc": "032247884594",
            "id": "88459442",
            "selectedProductUrl": "/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html",
            "shortDescription": "Scotts Nature Scapes color enhanced mulch enhances landscaping with rich, red color.",
            "images": {"large": [{"url": "https://smg.widen.net/content/q6rayjk4jt/webp/88459440_0_F.webp?&w=800&h=800"}]},
        }
    }

    result = utils.extract_product_from_html_jsonld(
        html_text=__import__("json").dumps(payload),
        source_url="https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
        sku="032247884594",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        brand="Scotts",
        matching_utils=utils._matching,
    )

    assert result is not None
    assert result["resolved_variant"]["resolver"] == "demandware_product_variation"
    assert result["brand"] == "Scotts"
    assert result["url"].endswith("/88459442.html")
