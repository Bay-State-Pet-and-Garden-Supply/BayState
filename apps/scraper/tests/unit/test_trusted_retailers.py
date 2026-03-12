from scrapers.ai_search.scoring import SearchScorer

def test_new_trusted_retailers_are_recognized() -> None:
    scorer = SearchScorer()
    
    new_retailers = [
        "petedge.com",
        "animalsupply.com",
        "phillipspet.com",
        "frontiercoop.com",
        "bradleycaldwell.com",
        "costco.com",
        "ebay.com",
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
