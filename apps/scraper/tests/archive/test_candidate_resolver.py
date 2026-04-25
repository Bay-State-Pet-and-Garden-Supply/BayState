"""Tests for AI search candidate resolution."""

import json

from scrapers.ai_search.candidate_resolver import CandidateResolver
from scrapers.ai_search.models import ResolvedCandidate
from scrapers.ai_search.scoring import SearchScorer


def test_resolve_candidates_expands_scotts_official_family_to_child_variant() -> None:
    resolver = CandidateResolver(SearchScorer())
    family_url = "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/scotts-nature-scapes-color-enhanced-mulch.html"
    resolved_url = "https://scottsmiraclegro.com/en-us/brands/scotts/products/browse-all-scotts-products/88459442.html"
    family_html = (
        '<button class="btn-size" '
        'value="https://scottsmiraclegro.com/on/demandware.store/Sites-SMG-Site/en_US/Product-Variation?'
        "dwvar_scotts-nature-scapes-color-enhanced-mulch_color=0039&amp;"
        "dwvar_scotts-nature-scapes-color-enhanced-mulch_size=1.5cf&amp;"
        'pid=scotts-nature-scapes-color-enhanced-mulch&amp;quantity=1" '
        'data-attr-value="1.5cf" data-attr-id="size">1.5 CF</button>'
        '<button aria-label="Select Color Red" '
        'data-url="https://scottsmiraclegro.com/on/demandware.store/Sites-SMG-Site/en_US/Product-Variation?'
        "dwvar_scotts-nature-scapes-color-enhanced-mulch_color=0039&amp;"
        "dwvar_scotts-nature-scapes-color-enhanced-mulch_size=1.5cf&amp;"
        'pid=scotts-nature-scapes-color-enhanced-mulch&amp;quantity=1">'
        '<span data-attr-value="0039"></span></button>'
    )
    variation_payload = json.dumps(
        {
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
    )

    candidates = resolver.resolve_candidates(
        search_results=[
            {
                "url": family_url,
                "title": "Scotts Nature Scapes Color Enhanced Mulch | Scotts",
                "description": "Official Scotts family page for Nature Scapes mulch.",
            }
        ],
        sku="032247884594",
        product_name="Scotts NatureScapes Color Enhanced Mulch Sierra Red 1.5 cu ft",
        brand="Scotts",
        html_by_url={family_url: family_html},
        resolved_payload_by_url={
            "https://scottsmiraclegro.com/on/demandware.store/Sites-SMG-Site/en_US/Product-Variation?dwvar_scotts-nature-scapes-color-enhanced-mulch_color=0039&dwvar_scotts-nature-scapes-color-enhanced-mulch_size=1.5cf&pid=scotts-nature-scapes-color-enhanced-mulch&quantity=1": variation_payload
        },
    )

    assert candidates == [
        ResolvedCandidate(
            url=resolved_url,
            canonical_url=resolver._extraction.canonicalize_url(resolved_url),
            source_url=family_url,
            source_domain="scottsmiraclegro.com",
            source_type="official_family",
            resolved_url=resolved_url,
            resolved_canonical_url=resolver._extraction.canonicalize_url(resolved_url),
            family_url=family_url,
            resolved_variant={"resolver": "demandware_product_variation", "variant_id": "032247884594"},
        )
    ]


def test_resolve_candidates_keeps_direct_retailer_when_no_official_resolution_exists() -> None:
    resolver = CandidateResolver(SearchScorer())
    retailer_url = "https://www.chewy.com/example-product/dp/123456"

    candidates = resolver.resolve_candidates(
        search_results=[
            {
                "url": retailer_url,
                "title": "Example Product 10 lb - Chewy",
                "description": "Direct retailer PDP.",
            }
        ],
        sku="000111222333",
        product_name="Example Product 10 lb",
        brand="Example Brand",
        html_by_url={},
        resolved_payload_by_url={},
    )

    assert candidates == [
        ResolvedCandidate(
            url=retailer_url,
            canonical_url=resolver._extraction.canonicalize_url(retailer_url),
            source_url=retailer_url,
            source_domain="chewy.com",
            source_type="direct",
            resolved_url=retailer_url,
            resolved_canonical_url=resolver._extraction.canonicalize_url(retailer_url),
            family_url=None,
            resolved_variant=None,
        )
    ]
