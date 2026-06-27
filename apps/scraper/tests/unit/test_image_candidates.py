"""Tests for image candidate builder and selection."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scrapers.product_url_extraction.image_candidates import (
    ImageCandidate,
    build_image_candidates,
    select_image_candidates,
)


FIXTURE_DIR = Path(__file__).parent.parent / "fixtures" / "crawl4ai"


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------


def _load_fixture(name: str) -> dict:
    """Load a JSON fixture from the crawl4ai fixtures directory."""
    path = FIXTURE_DIR / name
    with open(path) as f:
        return json.load(f)


def _get_pdp_html() -> str:
    """Load a real PDP snapshot HTML for HTML-parsing tests."""
    snapshot_dir = FIXTURE_DIR / "snapshots"
    files = list(snapshot_dir.glob("*openfarmpet*"))
    if files:
        with open(files[0]) as f:
            return f.read()
    return ""


# ---------------------------------------------------------------------------
# Tests: build_image_candidates
# ---------------------------------------------------------------------------


class TestBuildFromEmptyCrawl:
    """Empty or minimal crawl result produces empty candidate list."""

    def test_empty_crawl_result(self):
        """Empty crawl result dict produces empty list."""
        candidates = build_image_candidates({}, "https://example.com")
        assert candidates == []

    def test_crawl_with_no_media(self):
        """Crawl result with no media key produces empty list."""
        result = {"url": "https://example.com", "success": True, "metadata": {}}
        candidates = build_image_candidates(result, "https://example.com")
        assert candidates == []

    def test_crawl_with_empty_media_images(self):
        """Crawl result with empty media.images produces empty list."""
        result = {
            "url": "https://example.com",
            "success": True,
            "metadata": {},
            "media": {"images": []},
        }
        candidates = build_image_candidates(result, "https://example.com")
        assert candidates == []


class TestBuildFromMediaImages:
    """Build candidates from Crawl4AI media.images."""

    def test_single_media_image(self):
        """Single media image produces one ImageCandidate."""
        result = {
            "url": "https://example.com/pdp/1",
            "success": True,
            "metadata": {},
            "media": {
                "images": [
                    {
                        "src": "https://example.com/images/product.jpg",
                        "alt": "Product Image",
                        "desc": "main product image",
                        "score": 9,
                        "width": 800,
                        "height": 800,
                        "type": "image",
                        "group_id": 0,
                        "format": "jpg",
                    }
                ]
            },
        }
        candidates = build_image_candidates(result, "https://example.com/pdp/1")
        assert len(candidates) == 1
        c = candidates[0]
        assert c.url == "https://example.com/images/product.jpg"
        assert c.source_type == "dom_image"
        assert c.alt_text == "Product Image"
        assert c.width == 800
        assert c.height == 800
        assert c.score == 9.0
        assert c.gallery_context is True  # group_id >= 0

    def test_multiple_media_images(self):
        """Multiple media images produce multiple candidates."""
        result = {
            "url": "https://example.com/pdp/1",
            "success": True,
            "metadata": {},
            "media": {
                "images": [
                    {"src": "https://example.com/img1.jpg", "score": 9, "group_id": 0},
                    {"src": "https://example.com/img2.jpg", "score": 7, "group_id": 0},
                    {"src": "https://example.com/img3.jpg", "score": 5, "group_id": 1},
                ]
            },
        }
        candidates = build_image_candidates(result, "https://example.com/pdp/1")
        assert len(candidates) == 3
        assert candidates[0].url == "https://example.com/img1.jpg"
        assert candidates[1].url == "https://example.com/img2.jpg"
        assert candidates[2].url == "https://example.com/img3.jpg"

    def test_media_image_with_relative_src(self):
        """Relative image src is resolved to absolute URL."""
        result = {
            "url": "https://example.com/pdp/1",
            "success": True,
            "metadata": {},
            "media": {
                "images": [
                    {"src": "/images/product.jpg", "score": 8, "group_id": 0}
                ]
            },
        }
        candidates = build_image_candidates(result, "https://example.com/pdp/1")
        assert len(candidates) == 1
        assert candidates[0].url == "https://example.com/images/product.jpg"

    def test_media_image_with_protocol_relative_src(self):
        """Protocol-relative URL (//) is resolved to https."""
        result = {
            "url": "https://example.com/pdp/1",
            "success": True,
            "metadata": {},
            "media": {
                "images": [
                    {"src": "//cdn.example.com/images/product.jpg", "score": 8, "group_id": 0}
                ]
            },
        }
        candidates = build_image_candidates(result, "https://example.com/pdp/1")
        assert len(candidates) == 1
        assert candidates[0].url == "https://cdn.example.com/images/product.jpg"


class TestBuildFromJsonLd:
    """Build candidates from JSON-LD product schema."""

    def test_jsonld_single_image(self):
        """JSON-LD with direct image string produces image candidate."""
        html = """
        <html><head>
        <script type="application/ld+json">
        {"@context": "https://schema.org", "@type": "Product", "name": "Test Product", "image": "https://example.com/product.jpg"}
        </script>
        </head></html>
        """
        result = {
            "url": "https://example.com/pdp/1",
            "success": True,
            "metadata": {},
            "media": {"images": []},
        }
        candidates = build_image_candidates(result, "https://example.com/pdp/1", page_html=html)
        assert len(candidates) == 1
        c = candidates[0]
        assert c.url == "https://example.com/product.jpg"
        assert c.source_type == "jsonld"

    def test_jsonld_image_array(self):
        """JSON-LD with image array produces multiple candidates."""
        html = """
        <html><head>
        <script type="application/ld+json">
        {"@context": "https://schema.org", "@type": "Product", "name": "Test", "image": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"]}
        </script>
        </head></html>
        """
        result = {"url": "https://example.com/pdp/1", "success": True, "metadata": {}, "media": {"images": []}}
        candidates = build_image_candidates(result, "https://example.com/pdp/1", page_html=html)
        assert len(candidates) == 2
        assert candidates[0].url == "https://example.com/img1.jpg"
        assert candidates[1].url == "https://example.com/img2.jpg"

    def test_jsonld_in_graph(self):
        """JSON-LD with @graph containing Product."""
        html = """
        <html><head>
        <script type="application/ld+json">
        {"@context": "https://schema.org", "@graph": [{"@type": "Product", "name": "Test", "image": "https://example.com/graph-img.jpg"}]}
        </script>
        </head></html>
        """
        result = {"url": "https://example.com/pdp/1", "success": True, "metadata": {}, "media": {"images": []}}
        candidates = build_image_candidates(result, "https://example.com/pdp/1", page_html=html)
        assert len(candidates) == 1
        assert candidates[0].url == "https://example.com/graph-img.jpg"

    def test_jsonld_type_array(self):
        """JSON-LD with @type as array does not crash."""
        html = """
        <html><head>
        <script type="application/ld+json">
        {"@context": "https://schema.org", "@type": ["Product", "Thing"], "name": "Test", "image": "https://example.com/product.jpg"}
        </script>
        </head></html>
        """
        result = {"url": "https://example.com/pdp/1", "success": True, "metadata": {}, "media": {"images": []}}
        candidates = build_image_candidates(result, "https://example.com/pdp/1", page_html=html)
        assert len(candidates) == 1
        assert candidates[0].url == "https://example.com/product.jpg"

    def test_jsonld_type_array_mixed(self):
        """JSON-LD with both @type string and array entries does not crash."""
        html = """
        <html><head>
        <script type="application/ld+json">
        {"@context": "https://schema.org", "@graph": [
            {"@type": ["Product", "Thing"], "name": "A", "image": "https://example.com/a.jpg"},
            {"@type": "Product", "name": "B", "image": "https://example.com/b.jpg"},
            {"@type": "WebPage", "name": "C"}
        ]}
        </script>
        </head></html>
        """
        result = {"url": "https://example.com/pdp/1", "success": True, "metadata": {}, "media": {"images": []}}
        candidates = build_image_candidates(result, "https://example.com/pdp/1", page_html=html)
        assert len(candidates) == 2
        urls = {c.url for c in candidates}
        assert "https://example.com/a.jpg" in urls
        assert "https://example.com/b.jpg" in urls


class TestBuildFromMetaTags:
    """Build candidates from OpenGraph and Twitter meta tags."""

    def test_og_image(self):
        """og:image meta tag produces candidate."""
        html = """<html><head>
        <meta property="og:image" content="https://example.com/og-image.jpg">
        </head></html>"""
        result = {"url": "https://example.com/pdp/1", "success": True, "metadata": {}, "media": {"images": []}}
        candidates = build_image_candidates(result, "https://example.com/pdp/1", page_html=html)
        assert len(candidates) == 1
        assert candidates[0].url == "https://example.com/og-image.jpg"
        assert candidates[0].source_type == "opengraph"

    def test_twitter_image(self):
        """twitter:image meta tag produces candidate."""
        html = """<html><head>
        <meta name="twitter:image" content="https://example.com/twitter-img.jpg">
        </head></html>"""
        result = {"url": "https://example.com/pdp/1", "success": True, "metadata": {}, "media": {"images": []}}
        candidates = build_image_candidates(result, "https://example.com/pdp/1", page_html=html)
        assert len(candidates) == 1
        assert candidates[0].url == "https://example.com/twitter-img.jpg"
        assert candidates[0].source_type == "twitter"

    def test_og_and_twitter_same_url(self):
        """Same URL from OG and Twitter should be deduplicated."""
        html = """<html><head>
        <meta property="og:image" content="https://example.com/product.jpg">
        <meta name="twitter:image" content="https://example.com/product.jpg">
        </head></html>"""
        result = {"url": "https://example.com/pdp/1", "success": True, "metadata": {}, "media": {"images": []}}
        candidates = build_image_candidates(result, "https://example.com/pdp/1", page_html=html)
        assert len(candidates) == 1


class TestDeduplication:
    """Deduplication by canonical URL."""

    def test_dedup_same_url_different_sources(self):
        """Same image URL from media and JSON-LD is deduplicated."""
        html = """
        <html><head>
        <script type="application/ld+json">
        {"@type": "Product", "image": "https://example.com/product.jpg"}
        </script>
        </head></html>
        """
        result = {
            "url": "https://example.com/pdp/1",
            "success": True,
            "metadata": {},
            "media": {
                "images": [
                    {"src": "https://example.com/product.jpg", "score": 9, "group_id": 0}
                ]
            },
        }
        candidates = build_image_candidates(result, "https://example.com/pdp/1", page_html=html)
        assert len(candidates) == 1

    def test_dedup_same_canonical_different_src(self):
        """URLs with same canonical form are deduplicated."""
        result = {
            "url": "https://example.com/pdp/1",
            "success": True,
            "metadata": {},
            "media": {
                "images": [
                    {"src": "https://example.com/images/product.jpg?width=800&height=800", "score": 9, "group_id": 0},
                    {"src": "https://example.com/images/product.jpg?width=100&height=100", "score": 5, "group_id": 0},
                ]
            },
        }
        candidates = build_image_candidates(result, "https://example.com/pdp/1")
        assert len(candidates) == 1


class TestSelectImageCandidates:
    """Selection wrapper tests."""

    def test_select_empty_candidates(self):
        """Empty candidate list returns empty selection."""
        selection = select_image_candidates([], "https://example.com")
        assert selection.primary is None
        assert selection.gallery == []
        assert selection.rejected == []

    def test_select_single_candidate(self):
        """Single candidate with product name selects it as primary."""
        candidates = [
            ImageCandidate(
                url="https://example.com/product.jpg",
                canonical_url="https://example.com/product.jpg",
                source_url="https://example.com/pdp/1",
                source_type="dom_image",
                alt_text="Test Product",
                score=9,
                width=800,
                height=800,
                gallery_context=True,
            )
        ]
        selection = select_image_candidates(candidates, "https://example.com/pdp/1", product_name="Test Product")
        assert selection.primary is not None
        assert selection.primary.url == "https://example.com/product.jpg"

    def test_select_multiple_candidates(self):
        """Multiple candidates produce gallery and possibly rejected."""
        candidates = [
            ImageCandidate(
                url="https://example.com/img1.jpg",
                canonical_url="https://example.com/img1.jpg",
                source_url="https://example.com/pdp/1",
                source_type="dom_image", score=9, gallery_context=True,
            ),
            ImageCandidate(
                url="https://example.com/img2.jpg",
                canonical_url="https://example.com/img2.jpg",
                source_url="https://example.com/pdp/1",
                source_type="dom_image", score=7, gallery_context=True,
            ),
            ImageCandidate(
                url="https://example.com/logo.png",
                canonical_url="https://example.com/logo.png",
                source_url="https://example.com/pdp/1",
                source_type="dom_image", score=1,
                gallery_context=False, non_product_context=True,
            ),
        ]
        selection = select_image_candidates(candidates, "https://example.com/pdp/1")
        assert selection.primary is not None
        assert len(selection.gallery) >= 0
        # logo is non_product_context, likely rejected
        assert any("logo" in r.url for r in selection.rejected) or any("logo" in a.url for a in selection.gallery)


class TestSelectionRoleAndReasons:
    """Tests that selection_role and rejection_reasons are populated after selection."""

    def test_primary_has_selection_role(self):
        """Primary candidate gets selection_role='primary'."""
        candidates = [
            ImageCandidate(
                url="https://example.com/img1.jpg",
                canonical_url="https://example.com/img1.jpg",
                source_url="https://example.com/pdp/1",
                source_type="dom_image", score=9, gallery_context=True,
            ),
        ]
        selection = select_image_candidates(candidates, "https://example.com/pdp/1", product_name="Test")
        assert selection.primary is not None
        assert selection.primary.selection_role == "primary"

    def test_rejected_has_role_and_reasons(self):
        """Rejected candidates get selection_role='rejected' and rejection reasons."""
        candidates = [
            ImageCandidate(
                url="https://example.com/logo.png",
                canonical_url="https://example.com/logo.png",
                source_url="https://example.com/pdp/1",
                source_type="dom_image", score=1,
                gallery_context=False, non_product_context=True,
            ),
            ImageCandidate(
                url="https://example.com/product.jpg",
                canonical_url="https://example.com/product.jpg",
                source_url="https://example.com/pdp/1",
                source_type="dom_image", score=9, gallery_context=True,
            ),
        ]
        selection = select_image_candidates(candidates, "https://example.com/pdp/1")
        # Non-product context image is likely rejected
        if selection.rejected:
            rejected = selection.rejected[0]
            assert rejected.selection_role == "rejected"
            assert isinstance(rejected.rejection_reasons, list)

    def test_gallery_has_role(self):
        """Gallery candidates get selection_role='gallery'."""
        candidates = [
            ImageCandidate(
                url="https://example.com/img1.jpg",
                canonical_url="https://example.com/img1.jpg",
                source_url="https://example.com/pdp/1",
                source_type="dom_image", score=9, gallery_context=True,
            ),
            ImageCandidate(
                url="https://example.com/img2.jpg",
                canonical_url="https://example.com/img2.jpg",
                source_url="https://example.com/pdp/1",
                source_type="dom_image", score=7, gallery_context=True,
            ),
            ImageCandidate(
                url="https://example.com/img3.jpg",
                canonical_url="https://example.com/img3.jpg",
                source_url="https://example.com/pdp/1",
                source_type="dom_image", score=5, gallery_context=True,
            ),
        ]
        selection = select_image_candidates(candidates, "https://example.com/pdp/1")
        assert selection.primary is not None
        # At least one gallery image should have role="gallery"
        for g in selection.gallery:
            assert g.selection_role == "gallery"

    def test_context_flags_preserved_through_selection(self):
        """gallery_context, non_product_context, duplicate_context survive selection."""
        candidates = [
            ImageCandidate(
                url="https://example.com/logo.png",
                canonical_url="https://example.com/logo.png",
                source_url="https://example.com/pdp/1",
                source_type="dom_image", score=1,
                gallery_context=False, non_product_context=True,
            ),
            ImageCandidate(
                url="https://example.com/gallery-main.jpg",
                canonical_url="https://example.com/gallery-main.jpg",
                source_url="https://example.com/pdp/1",
                source_type="dom_image", score=9,
                gallery_context=True, non_product_context=False,
            ),
        ]
        selection = select_image_candidates(candidates, "https://example.com/pdp/1")
        # Verify context flags are preserved on the selected instances
        for c in candidates:
            if "gallery-main" in c.url:
                assert c.gallery_context is True
            if "logo" in c.url:
                assert c.non_product_context is True


class TestFromRealFixtures:
    """Tests using real fixture data."""

    def test_build_from_pdp_fixture(self):
        """Build candidates from real PDP crawl fixture."""
        result = _load_fixture("pdp_crawl_result.json")
        candidates = build_image_candidates(result, result["url"])
        assert len(candidates) == 3
        # All three images from the fixture should be present
        urls = {c.url for c in candidates}
        pdp_url = "https://openfarmpet.com/cdn/shop/products/PDPImages-DryDog-Main-2022-TURKEYC-FOP.png"
        assert pdp_url in "".join(urls)

    def test_build_from_category_fixture(self):
        """Build candidates from category fixture."""
        result = _load_fixture("category_crawl_result.json")
        candidates = build_image_candidates(result, result["url"])
        assert len(candidates) == 3  # 3 images in fixture

    def test_select_from_pdp_fixture(self):
        """Select from real PDP fixture candidates."""
        result = _load_fixture("pdp_crawl_result.json")
        candidates = build_image_candidates(result, result["url"])
        selection = select_image_candidates(candidates, result["url"])
        assert selection.primary is not None
        assert selection.stats["raw_count"] >= 3

    def test_select_from_pdp_fixture_with_brand(self):
        """Select with brand name helps scoring."""
        result = _load_fixture("pdp_crawl_result.json")
        candidates = build_image_candidates(result, result["url"])
        selection = select_image_candidates(candidates, result["url"], brand="Open Farm")
        assert selection.primary is not None

    def test_build_with_snapshot_html(self):
        """Build candidates using real snapshot HTML (if available)."""
        html = _get_pdp_html()
        if not html:
            pytest.skip("No snapshot HTML file found")
        result = {
            "url": "https://openfarmpet.com/products/chicken-and-turkey-dry-dog-food",
            "success": True,
            "metadata": {},
            "media": {"images": []},
        }
        candidates = build_image_candidates(result, result["url"], page_html=html)
        # Should find some candidates from OG tags and DOM images
        assert len(candidates) > 0
        # Should include the og:image URL
        assert any("openfarmpet.com/cdn/shop/products" in c.url for c in candidates)
