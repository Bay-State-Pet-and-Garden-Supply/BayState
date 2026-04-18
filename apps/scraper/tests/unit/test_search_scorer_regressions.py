from __future__ import annotations

from scrapers.ai_search.scoring import SearchScorer


def _result(url: str, title: str, description: str = "") -> dict[str, object]:
    return {
        "url": url,
        "title": title,
        "description": description,
    }


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
