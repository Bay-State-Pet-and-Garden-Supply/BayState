from scrapers.ai_search.scoring import SearchScorer

def test_new_trusted_retailers_are_recognized() -> None:
    scorer = SearchScorer()
    
    new_retailers = [
        "petedge.com",
        "animalsupply.com",
        "phillipspet.com",
        "frontiercoop.com",
        "bradleycaldwell.com",
        "petswarehouse.com",
        "costco.com",
    ]
    
    for domain in new_retailers:
        assert scorer.is_trusted_retailer(domain) is True, f"{domain} should be recognized as a trusted retailer"

def test_existing_trusted_retailers_are_still_recognized() -> None:
    scorer = SearchScorer()
    
    existing_retailers = [
        "chewy.com",
        "amazon.com",
        "walmart.com",
        "petco.com",
    ]
    
    for domain in existing_retailers:
        assert scorer.is_trusted_retailer(domain) is True, f"{domain} should be recognized as a trusted retailer"

def test_subdomains_of_trusted_retailers_are_recognized() -> None:
    scorer = SearchScorer()
    
    assert scorer.is_trusted_retailer("shop.petedge.com") is True
    assert scorer.is_trusted_retailer("www.animalsupply.com") is True


def test_marketplaces_are_not_treated_as_trusted_retailers() -> None:
    scorer = SearchScorer()

    assert scorer.is_trusted_retailer("ebay.com") is False
    assert scorer.is_marketplace("ebay.com") is True


def test_walmart_blocked_pages_are_low_quality_results() -> None:
    scorer = SearchScorer()

    assert scorer.is_low_quality_result(
        {
            "url": "https://www.walmart.com/blocked?url=/ip/four-paws-wee-wee-cat-pads/123",
            "title": "Access denied",
            "description": "Blocked request",
        }
    )


def test_gemini_grounded_explanations_are_low_quality_results() -> None:
    scorer = SearchScorer()

    assert scorer.is_low_quality_result(
        {
            "url": "https://www.bradleycaldwell.com/wee-wee-cat-pads-10-pk-436324",
            "title": "bradleycaldwell.com",
            "description": "The search for `site:petswarehouse.com 045663976880` did not return any direct results. However, the UPC 045663976880 corresponds to Four Paws Wee-Wee Cat Pads.",
            "provider": "gemini",
            "result_type": "grounded",
        }
    )


def test_gemini_extra_snippets_do_not_disqualify_trusted_pdp() -> None:
    scorer = SearchScorer()

    assert not scorer.is_low_quality_result(
        {
            "url": "https://petswarehouse.com/products/four-paws-wee-wee-cat-litter-box-system-pads-11-in-x-17-in-10-ct",
            "title": "petswarehouse.com",
            "description": (
                'The Four Paws Wee-Wee Litter Box System Cat Pads (11" x 17", 10-count) '
                "are specialized absorbent pads designed specifically for use within cat litter box systems."
            ),
            "extra_snippets": [
                "Four Paws Wee Wee Cat Pads reviews",
                "reddit discussion Four Paws Wee Wee Cat Pads",
                "alternatives to Four Paws Wee Wee Cat Pads",
            ],
            "provider": "gemini",
            "result_type": "grounded",
        }
    )
