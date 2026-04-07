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


def test_normalize_images_preserves_valid_shopify_cdn_file_url() -> None:
    utils = _build_utils()

    images = utils.normalize_images(
        ["//bentleyseeds.com/cdn/shop/files/HTG-017_front.jpg?v=1739186744"],
        "https://bentleyseeds.com/products/turnip-purple-white-globe",
    )

    assert images == [
        "https://bentleyseeds.com/cdn/shop/files/HTG-017_front.jpg?v=1739186744"
    ]
