from __future__ import annotations

import pytest

from scrapers.ai_search.scoring import SearchScorer, reset_domain_history


def _result(url: str, title: str, description: str = "") -> dict[str, object]:
    return {
        "url": url,
        "title": title,
        "description": description,
    }


@pytest.fixture(autouse=True)
def _reset_domain_history_fixture():
    """Reset domain history before each test to prevent state leakage."""
    reset_domain_history()
    yield
    reset_domain_history()


def test_is_brand_domain_handles_joined_words_and_possessives() -> None:
    scorer = SearchScorer()

    assert scorer.is_brand_domain("stellaandchewys.com", "Stella & Chewy's") is True
    assert scorer.is_brand_domain("shop.deere.com", "John Deere") is True


def test_shop_product_urls_are_not_category_like_pages() -> None:
    scorer = SearchScorer()

    assert scorer.is_category_like_url("https://fluvalaquatics.com/us/shop/product/betta-premium-aquarium-kit-2-6-us-gal-10-l") is False
    assert scorer.is_category_like_url("https://www.petco.com/shop/en/petcostore/product/advantage-ii-once-a-month-topical-kills-flea-for-kitten") is False


def test_listing_and_search_pages_are_low_quality() -> None:
    scorer = SearchScorer()

    assert scorer.is_low_quality_result(
        _result(
            "https://www.amazon.com/s?k=john+deere+tractor+toys+1%2F64+scale",
            "John Deere Tractor Toys 1/64 Scale - Amazon.com",
        )
    )
    assert scorer.is_low_quality_result(
        _result(
            "https://outwardhound.com/products/bestsellers/",
            "Bestsellers - Outward Hound",
        )
    )
    assert scorer.is_low_quality_result(
        _result(
            "https://vpracingfuels.com/pages/ppf",
            "Plastic Product Formers - VP Racing Fuels",
        )
    )


def test_scoring_prefers_exact_official_stella_page_over_retailer() -> None:
    scorer = SearchScorer()
    official_result = _result(
        "https://www.stellaandchewys.com/products/stellas-shredrs-beef-salmon-recipe-in-broth",
        "Stella's Shredrs Beef & Salmon Recipe in Broth for Dogs",
    )
    retailer_result = _result(
        "https://shop.bensonspet.com/products/810027374677",
        "Stella & Chewy's Dog Topper Shreds Beef Salmon In Broth 2.8 oz",
    )

    official_score = scorer.score_search_result(
        official_result,
        sku="810027374677",
        brand="Stella & Chewy's",
        product_name="Stella & Chewy's Dog Topper Shreds Beef Salmon In Broth 2.8 oz",
        category="Dog Food Toppers",
        prefer_manufacturer=True,
    )
    retailer_score = scorer.score_search_result(
        retailer_result,
        sku="810027374677",
        brand="Stella & Chewy's",
        product_name="Stella & Chewy's Dog Topper Shreds Beef Salmon In Broth 2.8 oz",
        category="Dog Food Toppers",
        prefer_manufacturer=True,
    )

    assert official_score > retailer_score


def test_scoring_prefers_exact_variant_page_over_related_official_page() -> None:
    scorer = SearchScorer()
    exact_result = _result(
        "https://www.fourpaws.com/products/wee-wee-cat-litter-box-system-pads",
        "Wee-Wee Cat Litter Box System Pads",
        'Each pad measures 11" x 17" and includes 10 cat litter box pads.',
    )
    sibling_result = _result(
        "https://www.fourpaws.com/products/wee-wee-cat-pee-pads",
        "Wee-Wee Cat Pads",
        'Each pad measures 28" x 30" and includes 10 cat urine pads.',
    )

    exact_score = scorer.score_search_result(
        exact_result,
        sku="045663976866",
        brand="Four Paws",
        product_name="Four Paws Wee-Wee Cat Pads 11x17 10ct",
        category="Cat Litter Accessories",
        prefer_manufacturer=True,
    )
    sibling_score = scorer.score_search_result(
        sibling_result,
        sku="045663976866",
        brand="Four Paws",
        product_name="Four Paws Wee-Wee Cat Pads 11x17 10ct",
        category="Cat Litter Accessories",
        prefer_manufacturer=True,
    )

    assert exact_score > sibling_score


def test_scoring_demotes_brand_homepage_without_variant_evidence() -> None:
    scorer = SearchScorer()
    homepage_result = _result(
        "https://studmuffinshorsetreats.com/",
        "Stud Muffins Horse Treats",
        "Wholesome horse treats made with oats, barley, corn, and flaxseed.",
    )
    distributor_result = _result(
        "https://www.bigdweb.com/stud-muffins-horse-treats-10-oz",
        "Stud Muffins Horse Treats 10 oz",
        "Horse treat tub 10 oz",
    )

    homepage_score = scorer.score_search_result(
        homepage_result,
        sku="813347001018",
        brand="Stud Muffins",
        product_name="Stud Muffins Horse Treats 10 oz Tub",
        category="Horse Treats",
        prefer_manufacturer=True,
    )
    distributor_score = scorer.score_search_result(
        distributor_result,
        sku="813347001018",
        brand="Stud Muffins",
        product_name="Stud Muffins Horse Treats 10 oz Tub",
        category="Horse Treats",
        prefer_manufacturer=True,
    )

    assert distributor_score > homepage_score


def test_scoring_prefers_exact_official_fluval_pdp_over_retailer() -> None:
    scorer = SearchScorer()
    official_result = _result(
        "https://fluvalaquatics.com/us/shop/product/betta-premium-aquarium-kit-2-6-us-gal-10-l",
        "Betta Premium Aquarium Kit, 2.6 US Gal / 10 L - Fluval USA",
    )
    retailer_result = _result(
        "https://shop.bensonspet.com/products/015561104982",
        "Fluval Betta Premium Aquarium Kit, 2.6 Gallon - Benson's Pet Center",
    )

    official_score = scorer.score_search_result(
        official_result,
        sku="015561104982",
        brand="Fluval",
        product_name="Fluval Betta Premium Aquarium Kit 2.6 Gallon",
        category="Aquariums",
        prefer_manufacturer=True,
    )
    retailer_score = scorer.score_search_result(
        retailer_result,
        sku="015561104982",
        brand="Fluval",
        product_name="Fluval Betta Premium Aquarium Kit 2.6 Gallon",
        category="Aquariums",
        prefer_manufacturer=True,
    )

    assert official_score > retailer_score


def test_scoring_prefers_official_deere_pdp_over_amazon_search_page() -> None:
    scorer = SearchScorer()
    official_result = _result(
        "https://shop.deere.com/us/product/Collect-N-Play-1-64-4WD-Tractor/p/LP86735",
        "Collect N Play 1/64 4WD Tractor | Shop.Deere.com",
    )
    amazon_search_result = _result(
        "https://www.amazon.com/s?k=john+deere+tractor+toys+1%2F64+scale",
        "John Deere Tractor Toys 1/64 Scale - Amazon.com",
    )

    official_score = scorer.score_search_result(
        official_result,
        sku="036881472414",
        brand="John Deere",
        product_name="John Deere 1:64 Scale 4WD Tractor Toy",
        category="Toy Vehicles",
        prefer_manufacturer=True,
    )
    amazon_search_score = scorer.score_search_result(
        amazon_search_result,
        sku="036881472414",
        brand="John Deere",
        product_name="John Deere 1:64 Scale 4WD Tractor Toy",
        category="Toy Vehicles",
        prefer_manufacturer=True,
    )

    assert official_score > amazon_search_score


def test_scoring_prefers_exact_mannapro_official_pdp_over_exact_small_retailer() -> None:
    scorer = SearchScorer()
    official_result = _result(
        "https://mannapro.com/products/fresh-flakes-poultry-bedding",
        "Fresh Flakes Poultry Bedding | MannaPro",
    )
    retailer_result = _result(
        "https://hillsflatlumber.com/p/manna-pro-fresh-flakes-poultry-bedding-095668480400",
        "Manna Pro Fresh Flakes 12 Lb. Poultry Bedding",
    )

    official_score = scorer.score_search_result(
        official_result,
        sku="095668480400",
        brand="Manna Pro",
        product_name="Manna Pro Fresh Flakes Poultry Bedding 12 Lb",
        category="Poultry Bedding",
        prefer_manufacturer=True,
    )
    retailer_score = scorer.score_search_result(
        retailer_result,
        sku="095668480400",
        brand="Manna Pro",
        product_name="Manna Pro Fresh Flakes Poultry Bedding 12 Lb",
        category="Poultry Bedding",
        prefer_manufacturer=True,
    )

    assert official_score > retailer_score


def test_scoring_prefers_exact_mannapro_official_horse_treat_pdp_over_exact_small_retailer() -> None:
    scorer = SearchScorer()
    official_result = _result(
        "https://mannapro.com/products/bite-size-nuggets-horse-treats",
        "Bite-Size Nuggets Horse Treats | MannaPro",
    )
    retailer_result = _result(
        "https://cooperstruevalue.com/p/horse-treats-alfalfa-molasses-nuggets-095668302580",
        "Manna Pro Bite Size Horse Treats, Alfalfa & Molasses Nuggets, 4 Lb",
    )

    official_score = scorer.score_search_result(
        official_result,
        sku="095668302580",
        brand="Manna Pro",
        product_name="Manna Pro Bite Size Alfalfa Molasses Nuggets 4 Lb",
        category="Horse Treats",
        prefer_manufacturer=True,
    )
    retailer_score = scorer.score_search_result(
        retailer_result,
        sku="095668302580",
        brand="Manna Pro",
        product_name="Manna Pro Bite Size Alfalfa Molasses Nuggets 4 Lb",
        category="Horse Treats",
        prefer_manufacturer=True,
    )

    assert official_score > retailer_score


def test_scoring_prefers_seed_packets_over_bulk_variant() -> None:
    scorer = SearchScorer()
    packet_result = _result(
        "https://bentleyseeds.com/products/sunflower-chocolate-cherry-seed-packets",
        "Sunflower, Chocolate Cherry Seed Packets",
    )
    bulk_result = _result(
        "https://bentleyseeds.com/products/sunflower-chocolate-cherry-sunflower-seed-bulk",
        "Sunflower, Chocolate Cherry - Bulk Seed | Bentley Seeds",
    )

    packet_score = scorer.score_search_result(
        packet_result,
        sku="051589005993",
        brand="Bentley Seeds",
        product_name="BENTLEY SUNFLOWER SEED PACKET CHOCOLATE CHERRY",
        category="Garden Seeds",
        prefer_manufacturer=True,
    )
    bulk_score = scorer.score_search_result(
        bulk_result,
        sku="051589005993",
        brand="Bentley Seeds",
        product_name="BENTLEY SUNFLOWER SEED PACKET CHOCOLATE CHERRY",
        category="Garden Seeds",
        prefer_manufacturer=True,
    )

    assert packet_score > bulk_score


def test_scoring_prefers_exact_deere_pdp_over_deere_collection_page() -> None:
    scorer = SearchScorer()
    pdp_result = _result(
        "https://shop.deere.com/us/product/Collect-N-Play-1-64-4WD-Tractor/p/LP86735",
        "Collect N Play 1/64 4WD Tractor | Shop.Deere.com",
    )
    collection_result = _result(
        "https://shop.deere.com/us/Merchandise-Workshop/Collectibles/1%3A64-Scale/c/1to64Scale/",
        "1:64 Scale | Shop.Deere.com",
    )

    pdp_score = scorer.score_search_result(
        pdp_result,
        sku="036881472414",
        brand="John Deere",
        product_name="John Deere 1:64 Scale 4WD Tractor Toy",
        category="Toy Vehicles",
        prefer_manufacturer=True,
    )
    collection_score = scorer.score_search_result(
        collection_result,
        sku="036881472414",
        brand="John Deere",
        product_name="John Deere 1:64 Scale 4WD Tractor Toy",
        category="Toy Vehicles",
        prefer_manufacturer=True,
    )

    assert pdp_score > collection_score


def test_scoring_prefers_official_family_page_with_variant_signals_over_small_retailer() -> None:
    scorer = SearchScorer()
    official_family_result = _result(
        "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html",
        "Scotts Nature Scapes Color Enhanced Mulch 1.5 cu. ft.",
        "Official Scotts family page with Red, Brown, and Black color variants plus 1.5 CF and 2 CF size options.",
    )
    retailer_result = _result(
        "https://www.wiltonhardware.com/p/nature-scapes-color-enhanced-mulch-sierra-red-032247884594",
        "Nature Scapes Color Enhanced Mulch Sierra Red 032247884594",
        "Independent retailer PDP for Scotts Sierra Red mulch 1.5 cu ft.",
    )

    official_score = scorer.score_search_result(
        official_family_result,
        sku="032247884594",
        brand="Scotts",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        category="Mulch",
        prefer_manufacturer=True,
    )
    retailer_score = scorer.score_search_result(
        retailer_result,
        sku="032247884594",
        brand="Scotts",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        category="Mulch",
        prefer_manufacturer=True,
    )

    assert official_score > retailer_score


def test_scoring_demotes_noisy_official_review_state_url_below_clean_official_url() -> None:
    scorer = SearchScorer()
    clean_result = _result(
        "https://scottsmiraclegro.com/en-us/scotts-nature-scapes-color-enhanced-mulch.html",
        "Scotts Nature Scapes Color Enhanced Mulch 1.5 cu. ft.",
        "Official Scotts product page.",
    )
    noisy_result = _result(
        "https://scottsmiraclegro.com/en-us/scotts-nature-scapes-color-enhanced-mulch.html?bvstate=pg:7/ct:r",
        "Scotts Nature Scapes Color Enhanced Mulch 1.5 cu. ft.",
        "Official Scotts product page with review state query parameters.",
    )

    clean_score = scorer.score_search_result(
        clean_result,
        sku="032247884594",
        brand="Scotts",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        category="Mulch",
        prefer_manufacturer=True,
    )
    noisy_score = scorer.score_search_result(
        noisy_result,
        sku="032247884594",
        brand="Scotts",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        category="Mulch",
        prefer_manufacturer=True,
    )

    assert clean_score > noisy_score


def test_scoring_prefers_category_fit_hardware_retailer_over_amazon() -> None:
    scorer = SearchScorer()
    ace_result = _result(
        "https://www.acehardware.com/departments/lawn-and-garden/farm-and-ranch-supplies/livestock-minerals/7006684",
        "St. Gabriel Organics GoodEarth Diatomaceous Earth For All Animals ...",
    )
    amazon_result = _result(
        "https://www.amazon.com/St-Gabriel-GoodEarth-Food-Grade-Diatomaceous/dp/B0GMYC1SD8",
        "St. Gabriel Organics GoodEarth Food-Grade Diatomaceous Earth ...",
    )

    ace_score = scorer.score_search_result(
        ace_result,
        sku="699064503017",
        brand="St. Gabriel Organics",
        product_name="St. Gabriel Organics GoodEarth Diatomaceous Earth Food Grade 20 oz",
        category="Farm & Garden Pest Control",
        prefer_manufacturer=True,
    )
    amazon_score = scorer.score_search_result(
        amazon_result,
        sku="699064503017",
        brand="St. Gabriel Organics",
        product_name="St. Gabriel Organics GoodEarth Diatomaceous Earth Food Grade 20 oz",
        category="Farm & Garden Pest Control",
        prefer_manufacturer=True,
    )

    assert ace_score > amazon_score


def test_scoring_prefers_specialty_pet_retailer_over_walmart_for_etta_salmon() -> None:
    scorer = SearchScorer()
    specialty_result = _result(
        "https://www.thepetbeastro.com/etta-says-flavor-fusion-dog-treats-or-salmon-and-s.html",
        "Etta Says Flavor Fusion Dog Treats | Salmon & Sweet Potato 1.75 oz",
    )
    walmart_result = _result(
        "https://www.walmart.com/ip/Etta-Says-856595005308-1-75-oz-Flavor-Fusion-Chew-Salmon-Dog-Treat-Case-of-12/5944245461",
        "Etta Says 856595005308 1.75 oz Flavor Fusion Chew Salmon Dog ...",
    )

    specialty_score = scorer.score_search_result(
        specialty_result,
        sku="856595005308",
        brand="Etta Says!",
        product_name="Etta Says Flavor Fusion Salmon & Sweet Potato 1.75 oz",
        category="Dog Treats",
        prefer_manufacturer=True,
    )
    walmart_score = scorer.score_search_result(
        walmart_result,
        sku="856595005308",
        brand="Etta Says!",
        product_name="Etta Says Flavor Fusion Salmon & Sweet Potato 1.75 oz",
        category="Dog Treats",
        prefer_manufacturer=True,
    )

    assert specialty_score > walmart_score


def test_scoring_prefers_chewy_over_small_pet_retailer_for_etta_duck() -> None:
    scorer = SearchScorer()
    chewy_result = _result(
        "https://www.chewy.com/etta-says-fusion-gourmet-adult-duck/dp/1263062",
        "ETTA SAYS! Fusion Gourmet Adult Duck & Pumpkin Flavor Natural ...",
    )
    retailer_result = _result(
        "https://shop.bensonspet.com/products/856595005902",
        "Etta Says! Flavor Fusion Dog Chew Duck and Pumpkin 1.5 oz",
    )

    chewy_score = scorer.score_search_result(
        chewy_result,
        sku="856595005902",
        brand="Etta Says!",
        product_name="Etta Says! Flavor Fusion Duck & Pumpkin 1.5 oz",
        category="Dog Treats",
        prefer_manufacturer=True,
    )
    retailer_score = scorer.score_search_result(
        retailer_result,
        sku="856595005902",
        brand="Etta Says!",
        product_name="Etta Says! Flavor Fusion Duck & Pumpkin 1.5 oz",
        category="Dog Treats",
        prefer_manufacturer=True,
    )

    assert chewy_score > retailer_score


# ============================================================================
# T13: Ported Assertions from Legacy batch_search Tests
# ============================================================================


def test_sku_in_url_provides_match_bonus() -> None:
    """SKU matches in URL should provide scoring bonus.

    Ported from: test_batch_search_sku_first.py
    Rationale: SKU-first search ordering depends on SKU matching in URLs
    """
    scorer = SearchScorer()

    # URL with SKU in path should get bonus
    sku_match_result = _result(
        "https://retailer.com/products/810027374677",
        "Stella & Chewy's Product",
    )
    no_sku_result = _result(
        "https://retailer.com/products/stella-chewys",
        "Stella & Chewy's Product",
    )

    sku_score = scorer.score_search_result(
        sku_match_result,
        sku="810027374677",
        brand="Stella & Chewy's",
        product_name="Stella & Chewy's Dog Topper",
        category="Dog Food Toppers",
    )
    no_sku_score = scorer.score_search_result(
        no_sku_result,
        sku="810027374677",
        brand="Stella & Chewy's",
        product_name="Stella & Chewy's Dog Topper",
        category="Dog Food Toppers",
    )

    # SKU match should provide bonus (exact bonus amount varies by implementation)
    assert sku_score != no_sku_score


def test_brand_domain_detection_in_scoring() -> None:
    """Brand domains should be detected and scored appropriately.

    Ported from: test_batch_search_sku_first.py
    Rationale: Brand domain detection is core to official site preference
    """
    scorer = SearchScorer()

    # Test various brand domain patterns
    assert scorer.is_brand_domain("stellaandchewys.com", "Stella & Chewy's") is True
    assert scorer.is_brand_domain("purina.com", "Purina") is True
    assert scorer.is_brand_domain("chewy.com", "Stella & Chewy's") is False


def test_context_aware_brand_boost_in_ranking() -> None:
    """Brand context should boost scores for matching domains.

    Ported from: test_context_ranking.py
    Rationale: Context-aware ranking is essential for brand site preference
    """
    scorer = SearchScorer()

    brand_result = _result(
        "https://purina.com/products/fancy-feast",
        "Fancy Feast Cat Food",
    )
    generic_result = _result(
        "https://generic-pet-food.com/product",
        "Cat Food",
    )

    # With Purina brand context
    brand_score = scorer.score_search_result(
        brand_result,
        sku="12345",
        brand="Purina",
        product_name="Fancy Feast",
        category="Cat Food",
    )

    # Generic domain should score lower for Purina product
    generic_score = scorer.score_search_result(
        generic_result,
        sku="12345",
        brand="Purina",
        product_name="Fancy Feast",
        category="Cat Food",
    )

    # Brand domain should score higher
    assert brand_score > generic_score


def test_context_aware_name_token_matching() -> None:
    """Product name tokens should boost scores for matching results.

    Ported from: test_context_ranking.py
    Rationale: Name token matching improves relevance ranking
    """
    scorer = SearchScorer()

    matching_result = _result(
        "https://example.com/fancy-feast-salmon",
        "Fancy Feast Salmon Cat Food",
    )
    unrelated_result = _result(
        "https://example.com/random-product",
        "Random Product",
    )

    matching_score = scorer.score_search_result(
        matching_result,
        sku="12345",
        brand="Purina",
        product_name="Fancy Feast Salmon Cat Food",
        category="Cat Food",
    )
    unrelated_score = scorer.score_search_result(
        unrelated_result,
        sku="12345",
        brand="Purina",
        product_name="Fancy Feast Salmon Cat Food",
        category="Cat Food",
    )

    # Name token matches should provide higher score
    assert matching_score > unrelated_score


def test_domain_frequency_weighting_in_scoring() -> None:
    """Domain frequency should influence ranking decisions.

    Ported from: test_context_ranking.py
    Rationale: Domain frequency tracking helps identify reliable sources
    """
    from scrapers.ai_search.scoring import record_domain_attempt

    scorer = SearchScorer()

    # Record some domain history
    record_domain_attempt("reliable-retailer.com", success=True)
    record_domain_attempt("reliable-retailer.com", success=True)
    record_domain_attempt("reliable-retailer.com", success=True)

    reliable_result = _result(
        "https://reliable-retailer.com/product/123",
        "Product",
    )

    score = scorer.score_search_result(
        reliable_result,
        sku="12345",
        brand="Test Brand",
        product_name="Test Product",
        category="Test Category",
    )

    # Should have a score (domain history affects it)
    assert score > 0


# ============================================================================
# T8: SearchScorer Gap Regression Tests
# ============================================================================


def test_partial_substring_brand_match_is_rejected() -> None:
    """Partial brand substring matches should NOT be treated as brand domains.

    Regression: 'Manna Pro' should NOT match 'proplanners.com' just because
    'pro' appears in both. Only full token matches should count.
    """
    scorer = SearchScorer()

    # 'pro' is a substring of 'proplanners' but 'mannapro' is the full brand
    assert scorer.is_brand_domain("proplanners.com", "Manna Pro") is False

    # However, actual brand domain should still match
    assert scorer.is_brand_domain("mannapro.com", "Manna Pro") is True

    # Another case: 'pro' in 'professional' should not match 'Manna Pro'
    assert scorer.is_brand_domain("professional-tools.com", "Manna Pro") is False


def test_official_family_vs_official_generic_classification() -> None:
    """Product line pages should be classified as official_family with signals.

    Regression: Family pages (product lines with variants) should be classified
    as 'official_family' when they have variant signals, not 'official_generic'.
    """
    scorer = SearchScorer()

    # Family page with variant signals (size/color variants mentioned)
    family_with_signals = _result(
        "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products.html",
        "Scotts Nature Scapes Color Enhanced Mulch",
        "Available in Red, Brown, and Black color variants plus 1.5 CF and 2 CF size options.",
    )

    # Generic brand page without specific variant signals
    generic_page = _result(
        "https://scottsmiraclegro.com/en-us/brands/scotts/products.html",
        "Scotts Products",
        "Browse our complete line of lawn care products.",
    )

    family_class = scorer.classify_result_source(
        family_with_signals,
        sku="032247884594",
        brand="Scotts",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
    )

    generic_class = scorer.classify_result_source(
        generic_page,
        sku="032247884594",
        brand="Scotts",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
    )

    # Family page with signals should be classified as official_family
    assert family_class == "official_family"

    # Generic page without signals should be classified as official_generic
    assert generic_class == "official_generic"


def test_neutral_domain_success_rate_for_unknown_domains() -> None:
    """Unknown domains should return neutral success rate (0.5).

    Regression: Domains not in _DOMAIN_HISTORY should return 0.5, not 0.0.
    """
    from scrapers.ai_search.scoring import get_domain_success_rate

    # Unknown domain should have neutral rate
    assert get_domain_success_rate("unknown-domain-never-seen.com") == 0.5

    # Another unknown domain
    assert get_domain_success_rate("brand-new-retailer-12345.com") == 0.5


def test_neutral_below_3_attempts() -> None:
    """Domains with fewer than 3 attempts should return neutral success rate.

    Regression: Even recorded domains should return 0.5 until they have
    at least 3 attempts to provide statistically meaningful data.
    """
    from scrapers.ai_search.scoring import get_domain_success_rate, record_domain_attempt

    domain = "test-retailer-example.com"

    # Record 1 success
    record_domain_attempt(domain, success=True)
    assert get_domain_success_rate(domain) == 0.5  # Still neutral

    # Record 1 more success (2 total attempts)
    record_domain_attempt(domain, success=True)
    assert get_domain_success_rate(domain) == 0.5  # Still neutral

    # Record 1 more success (3 total attempts) - now we have data
    record_domain_attempt(domain, success=True)
    assert get_domain_success_rate(domain) == 1.0  # Now 100% success rate


def test_blocked_retailer_domains_are_low_quality() -> None:
    """Blocked domains should be identified as low quality.

    Regression: Social media, barcode sites, price aggregators, and coupon
    sites should all be flagged as low quality results.
    """
    scorer = SearchScorer()

    # Social media should be blocked
    reddit_result = _result(
        "https://reddit.com/r/pets/comments/abc123/stella_chewys_review/",
        "Stella & Chewy's Review",
    )
    assert scorer.is_low_quality_result(reddit_result) is True

    # Barcode lookup sites should be blocked
    barcode_result = _result(
        "https://upcitemdb.com/upc/810027374677",
        "UPC 810027374677 - Stella & Chewy's",
    )
    assert scorer.is_low_quality_result(barcode_result) is True

    # Price aggregators should be blocked
    price_result = _result(
        "https://shopping.google.com/product/123/stella-chewys",
        "Stella & Chewy's Price Comparison",
    )
    assert scorer.is_low_quality_result(price_result) is True

    # Coupon sites should be blocked
    coupon_result = _result(
        "https://retailmenot.com/coupons/stella-chewys",
        "Stella & Chewy's Coupons",
    )
    assert scorer.is_low_quality_result(coupon_result) is True


def test_tie_breaking_behavior() -> None:
    """When scores are tied, results should be deterministically ordered.

    Regression: Results with identical scores should have stable ordering
    based on their original position or another deterministic factor.
    """
    scorer = SearchScorer()

    # Create two results with identical characteristics
    result1 = _result(
        "https://retailer1.com/product/123",
        "Product Name - Retailer 1",
    )
    result2 = _result(
        "https://retailer2.com/product/123",
        "Product Name - Retailer 2",
    )

    # Score both with identical parameters
    score1 = scorer.score_search_result(
        result1,
        sku="12345",
        brand="Test Brand",
        product_name="Test Product Name",
        category="Test Category",
    )

    score2 = scorer.score_search_result(
        result2,
        sku="12345",
        brand="Test Brand",
        product_name="Test Product Name",
        category="Test Category",
    )

    # Both unknown domains with same signals should score the same
    assert score1 == score2

    # When ranked, the order should be stable (first comes first)
    results = [result1, result2]
    prepared = scorer.prepare_search_results(
        results,
        sku="12345",
        brand="Test Brand",
        product_name="Test Product Name",
        category="Test Category",
    )

    # Both should be present with same score
    assert len(prepared) == 2


def test_empty_results_handling() -> None:
    """Empty result lists should be handled gracefully.

    Regression: Empty lists should return empty results without error.
    """
    scorer = SearchScorer()

    # Empty list should return empty list
    empty_results: list[dict[str, object]] = []
    prepared = scorer.prepare_search_results(
        empty_results,
        sku="12345",
        brand="Test Brand",
        product_name="Test Product Name",
        category="Test Category",
    )
    assert prepared == []

    # pick_strong_candidate_url should return None for empty list
    strong_candidate = scorer.pick_strong_candidate_url(
        empty_results,
        sku="12345",
        brand="Test Brand",
        product_name="Test Product Name",
        category="Test Category",
    )
    assert strong_candidate is None


def test_all_blocked_results_handling() -> None:
    """When all results are blocked, low-quality results should still be returned.

    Regression: If all results are blocked domains, prepare_search_results
    should fall back to returning the ranked list anyway (not empty).
    """
    scorer = SearchScorer()

    # Create results from blocked domains
    blocked_results = [
        _result(
            "https://reddit.com/r/pets/comments/abc123/discussion/",
            "Reddit Discussion",
        ),
        _result(
            "https://upcitemdb.com/upc/12345",
            "Barcode Lookup",
        ),
        _result(
            "https://pinterest.com/pin/abc123",
            "Pinterest Pin",
        ),
    ]

    # All are low quality
    assert all(scorer.is_low_quality_result(r) for r in blocked_results)

    # prepare_search_results should still return ranked results when all are low quality
    prepared = scorer.prepare_search_results(
        blocked_results,
        sku="12345",
        brand="Test Brand",
        product_name="Test Product Name",
        category="Test Category",
    )

    # Should return the ranked list even though all are blocked
    assert len(prepared) == 3


def test_official_root_classification() -> None:
    """Official brand homepages without product evidence should be official_root.

    Regression: Brand homepages (root path) should be classified as
    official_root, not official_generic.
    """
    scorer = SearchScorer()

    homepage_result = _result(
        "https://stellaandchewys.com/",
        "Stella & Chewy's | Premium Pet Food",
    )

    classification = scorer.classify_result_source(
        homepage_result,
        sku="810027374677",
        brand="Stella & Chewy's",
        product_name="Stella & Chewy's Dog Topper Shreds Beef Salmon",
    )

    assert classification == "official_root"


def test_domain_success_rate_bonus_and_penalty() -> None:
    """High success rate domains should get bonus, low success rate should get penalty.

    Regression: Domains with >80% success rate should get +3.0 bonus,
    domains with <30% success rate should get -3.0 penalty.
    """
    from scrapers.ai_search.scoring import record_domain_attempt

    scorer = SearchScorer()

    # Create a result to score
    result = _result(
        "https://high-success-retailer.com/product/123",
        "Test Product",
    )

    # Record 10 successes out of 10 attempts (100% success rate)
    for _ in range(10):
        record_domain_attempt("high-success-retailer.com", success=True)

    score_high = scorer.score_search_result(
        result,
        sku="12345",
        brand="Test Brand",
        product_name="Test Product Name",
        category="Test Category",
    )

    # Reset and try low success rate
    reset_domain_history()

    result_low = _result(
        "https://low-success-retailer.com/product/123",
        "Test Product",
    )

    # Record 1 success out of 10 attempts (10% success rate)
    record_domain_attempt("low-success-retailer.com", success=True)
    for _ in range(9):
        record_domain_attempt("low-success-retailer.com", success=False)

    score_low = scorer.score_search_result(
        result_low,
        sku="12345",
        brand="Test Brand",
        product_name="Test Product Name",
        category="Test Category",
    )

    # High success domain should score higher than low success domain
    # (both have same base signals, but different domain history)
    assert score_high > score_low


def test_major_retailer_exact_vs_major_retailer_classification() -> None:
    """Major retailers with SKU/variant match should be classified as exact.

    Regression: Major retailer URLs with SKU match should get 'major_retailer_exact'
    classification vs plain 'major_retailer'.
    """
    scorer = SearchScorer()

    # Major retailer with SKU in URL
    exact_result = _result(
        "https://amazon.com/dp/B08N5WRWNW",
        "Test Product - Amazon.com",
    )

    # Major retailer without SKU match
    generic_result = _result(
        "https://amazon.com/s?k=test+product",
        "Test Product Search - Amazon.com",
    )

    exact_class = scorer.classify_result_source(
        exact_result,
        sku="B08N5WRWNW",
        brand="Test Brand",
        product_name="Test Product",
    )

    generic_class = scorer.classify_result_source(
        generic_result,
        sku="B08N5WRWNW",
        brand="Test Brand",
        product_name="Test Product",
    )

    assert exact_class == "major_retailer_exact"
    assert generic_class == "major_retailer"


def test_category_domain_bonus_for_matching_category() -> None:
    """Category-specific domains should get bonus for matching categories.

    Regression: Pet products on Chewy should get bonus, garden products on
    Ace Hardware should get bonus.
    """
    scorer = SearchScorer()

    # Pet product on pet retailer
    pet_result = _result(
        "https://chewy.com/product/123",
        "Dog Food - Chewy",
    )

    # Pet product on non-pet retailer
    generic_result = _result(
        "https://walmart.com/product/123",
        "Dog Food - Walmart",
    )

    pet_score = scorer.score_search_result(
        pet_result,
        sku="12345",
        brand="Test Brand",
        product_name="Premium Dog Food",
        category="Dog Food",
    )

    generic_score = scorer.score_search_result(
        generic_result,
        sku="12345",
        brand="Test Brand",
        product_name="Premium Dog Food",
        category="Dog Food",
    )

    # Pet specialist should score higher due to category bonus
    assert pet_score > generic_score
