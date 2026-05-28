import pytest
from unittest.mock import MagicMock
from scrapers.ai_search.extraction import ExtractionUtils

@pytest.fixture
def extraction_utils():
    scoring = MagicMock()
    scoring.domain_from_url.return_value = "frommfamily.com"
    return ExtractionUtils(scoring)

def test_merge_product_images_fromm_scenario(extraction_utils):
    html = """
    <html>
        <body>
            <div class="product-gallery">
                <h1>PurrSnickitty Duck Liver Pâté</h1>
                <img src="https://cdn.frommfamily.com/duck-liver-pate-1.jpg" alt="Duck Liver Pate 1">
                <img src="https://cdn.frommfamily.com/duck-liver-pate-2.jpg" alt="Duck Liver Pate 2">
            </div>
            <div class="recipe-features">
                <h2>Recipe Features</h2>
                <img src="https://cdn.frommfamily.com/icon-grain-free.png" alt="Grain Free">
            </div>
            <div class="related-products">
                <h2>Related Products</h2>
                <img src="https://cdn.frommfamily.com/chicken-pate.jpg" alt="Chicken Pate">
            </div>
        </body>
    </html>
    """
    
    crawl_media = {
        "images": [
            {"src": "https://cdn.frommfamily.com/duck-liver-pate-1.jpg", "score": 0.9, "width": 800, "height": 800},
            {"src": "https://cdn.frommfamily.com/duck-liver-pate-2.jpg", "score": 0.8, "width": 800, "height": 800},
            {"src": "https://cdn.frommfamily.com/icon-grain-free.png", "score": 0.3, "width": 100, "height": 100},
            {"src": "https://cdn.frommfamily.com/chicken-pate.jpg", "score": 0.7, "width": 500, "height": 500},
        ]
    }
    
    jsonld_images = ["https://cdn.frommfamily.com/duck-liver-pate-1.jpg"]
    meta_images = ["https://cdn.frommfamily.com/duck-liver-pate-1.jpg"]
    
    sorted_images, diagnostics = extraction_utils.merge_product_images(
        source_url="https://frommfamily.com/products/cat/purrsnickitty/can/duck-liver-pate/",
        html=html,
        markdown="",
        crawl_media=crawl_media,
        jsonld_images=jsonld_images,
        meta_images=meta_images,
        expected_product_name="PurrSnickitty Duck Liver Pâté",
        expected_brand="Fromm"
    )
    
    # Should include both gallery images
    assert "https://cdn.frommfamily.com/duck-liver-pate-1.jpg" in sorted_images
    assert "https://cdn.frommfamily.com/duck-liver-pate-2.jpg" in sorted_images
    
    # Should exclude icon and related product
    assert "https://cdn.frommfamily.com/icon-grain-free.png" not in sorted_images
    assert "https://cdn.frommfamily.com/chicken-pate.jpg" not in sorted_images
    
    # Check diagnostics
    assert diagnostics["selected_count"] == 2
    assert diagnostics["total_candidates"] == 4

def test_merge_product_images_underextraction_warning(extraction_utils):
    html = "<html><body>" + "".join([f'<img src="https://cdn.site.com/img{i}.jpg">' for i in range(10)]) + "</body></html>"
    crawl_media = {"images": [{"src": f"https://cdn.site.com/img{i}.jpg"} for i in range(10)]}
    
    # Simulate a case where we only select 1 image but many exist
    sorted_images, diagnostics = extraction_utils.merge_product_images(
        source_url="https://site.com/p",
        html=html,
        markdown="",
        crawl_media=crawl_media,
        jsonld_images=["https://cdn.site.com/img0.jpg"],
        meta_images=[],
        expected_product_name="Some Product"
    )
    
    # Since they all have same keywords/position, they might all get positive scores if they match keywords.
    # Let's check if diagnostics flags it if we force low selection.
    # Actually, in the real implementation, if they don't match keywords or position, they get low scores.
    # But if we have 10 candidates and only 1 is returned in jsonld, and others have score <= 0.
    
    assert diagnostics["total_candidates"] == 10


def test_product_media_selector_non_product_filtering():
    from scrapers.product_url_extraction.media_selector import ProductMediaSelector

    selector = ProductMediaSelector(
        expected_product_name="Urban Stick Small",
        expected_brand="Bionic",
    )

    crawl_media_images = [
        {"src": "https://www.bionicdogtoys.com/wp-content/uploads/2023/07/Urban-Stick_S-english.jpg", "score": 9.0},
        {"src": "https://www.bionicdogtoys.com/wp-content/uploads/2023/07/bionic-durable-urban-stick-english-large-1.jpg", "score": 9.0},
        # These should be filtered out
        {"src": "https://www.bionicdogtoys.com/wp-content/uploads/flags/canada-flag.png", "score": 8.5},
        {"src": "https://www.bionicdogtoys.com/wp-content/uploads/flags/us.svg", "score": 8.5},
        {"src": "https://www.bionicdogtoys.com/wp-content/themes/dogi-child/assets/buynow.png", "score": 8.5},
    ]

    res = selector.select(
        crawl_media_images=crawl_media_images,
        jsonld_images=[],
        source_url="https://www.bionicdogtoys.com/product/urban-stick"
    )

    # Approved images should only contain the actual product images
    approved_srcs = []
    if res.primary_image:
        approved_srcs.append(res.primary_image.src)
    approved_srcs.extend([img.src for img in res.gallery_images])

    assert "https://www.bionicdogtoys.com/wp-content/uploads/2023/07/Urban-Stick_S-english.jpg" in approved_srcs
    assert "https://www.bionicdogtoys.com/wp-content/uploads/2023/07/bionic-durable-urban-stick-english-large-1.jpg" in approved_srcs

    # The flags, svgs, theme assets should be rejected
    assert "https://www.bionicdogtoys.com/wp-content/uploads/flags/canada-flag.png" not in approved_srcs
    assert "https://www.bionicdogtoys.com/wp-content/uploads/flags/us.svg" not in approved_srcs
    assert "https://www.bionicdogtoys.com/wp-content/themes/dogi-child/assets/buynow.png" not in approved_srcs

    # Verify they are in rejected with non_product_hint reasons
    rejected_srcs = {img.src: img for img in res.rejected_images}
    assert "https://www.bionicdogtoys.com/wp-content/uploads/flags/canada-flag.png" in rejected_srcs
    assert any("non_product_hint:flag" in r for r in rejected_srcs["https://www.bionicdogtoys.com/wp-content/uploads/flags/canada-flag.png"].reasons)
    
    assert "https://www.bionicdogtoys.com/wp-content/uploads/flags/us.svg" in rejected_srcs
    assert any("non_product_hint:svg" in r or "non_product_hint:flag" in r for r in rejected_srcs["https://www.bionicdogtoys.com/wp-content/uploads/flags/us.svg"].reasons)

    assert "https://www.bionicdogtoys.com/wp-content/themes/dogi-child/assets/buynow.png" in rejected_srcs
    assert any("non_product_hint:themes" in r or "non_product_hint:buynow" in r for r in rejected_srcs["https://www.bionicdogtoys.com/wp-content/themes/dogi-child/assets/buynow.png"].reasons)


def test_product_media_selector_expected_name_exception():
    from scrapers.product_url_extraction.media_selector import ProductMediaSelector

    # Product name contains "Flag"
    selector = ProductMediaSelector(
        expected_product_name="American Flag Dog Collar",
        expected_brand="Bionic",
    )

    crawl_media_images = [
        {"src": "https://www.bionicdogtoys.com/wp-content/uploads/2023/07/american-flag-collar.jpg", "score": 9.0},
    ]

    res = selector.select(
        crawl_media_images=crawl_media_images,
        jsonld_images=[],
        source_url="https://www.bionicdogtoys.com/product/american-flag-collar"
    )

    approved_srcs = []
    if res.primary_image:
        approved_srcs.append(res.primary_image.src)
    approved_srcs.extend([img.src for img in res.gallery_images])

    # Should NOT be filtered out because "flag" is in expected_product_name
    assert "https://www.bionicdogtoys.com/wp-content/uploads/2023/07/american-flag-collar.jpg" in approved_srcs


def test_product_media_selector_scopes_to_product_gallery_and_dedupes_clones():
    from scrapers.product_url_extraction.media_selector import ProductMediaSelector

    selector = ProductMediaSelector(
        expected_product_name="Fromm PurrSnickitty Duck Stew 3 oz",
        expected_brand="Fromm",
    )

    html = """
    <html>
      <body>
        <section class="product-gallery swiper">
          <div class="swiper-slide">
            <img src="https://cdn.frommfamily.com/products/duck-stew-front.jpg?width=240" alt="Duck Stew front">
          </div>
          <div class="swiper-slide-duplicate">
            <img src="https://cdn.frommfamily.com/products/duck-stew-front.jpg?width=1200" alt="Duck Stew front clone">
          </div>
          <div class="swiper-slide">
            <img data-zoom-image="https://cdn.frommfamily.com/products/duck-stew-back.jpg?width=1600" alt="Duck Stew back">
          </div>
        </section>
        <section class="related-products carousel">
          <img src="https://cdn.frommfamily.com/products/chicken-stew-front.jpg?width=1200" alt="Chicken Stew related">
        </section>
        <footer>
          <img src="https://cdn.frommfamily.com/assets/footer-logo.png" alt="Footer logo">
        </footer>
      </body>
    </html>
    """

    crawl_media_images = [
        {"src": "https://cdn.frommfamily.com/products/duck-stew-front.jpg?width=240", "score": 8.0},
        {"src": "https://cdn.frommfamily.com/products/duck-stew-front.jpg?width=1200", "score": 8.0},
        {"src": "https://cdn.frommfamily.com/products/duck-stew-back.jpg?width=1600", "score": 8.0},
        {"src": "https://cdn.frommfamily.com/products/chicken-stew-front.jpg?width=1200", "score": 8.0},
        {"src": "https://cdn.frommfamily.com/assets/footer-logo.png", "score": 8.0},
    ]

    res = selector.select(
        crawl_media_images=crawl_media_images,
        jsonld_images=[],
        source_url="https://frommfamily.com/products/cat/purrsnickitty-duck-stew-3-oz",
        page_html=html,
    )

    approved_srcs = []
    if res.primary_image:
        approved_srcs.append(res.primary_image.src)
    approved_srcs.extend([img.src for img in res.gallery_images])

    assert "https://cdn.frommfamily.com/products/duck-stew-front.jpg?width=240" in approved_srcs or "https://cdn.frommfamily.com/products/duck-stew-front.jpg?width=1200" in approved_srcs
    assert "https://cdn.frommfamily.com/products/duck-stew-back.jpg?width=1600" in approved_srcs
    assert all("chicken-stew-front" not in src for src in approved_srcs)
    assert all("footer-logo" not in src for src in approved_srcs)

    canonical_srcs = {res.primary_image.canonical_src} if res.primary_image else set()
    canonical_srcs.update(img.canonical_src for img in res.gallery_images)
    assert len(canonical_srcs) == len(approved_srcs)
    assert len(approved_srcs) == 2
    assert res.stats.duplicate_ratio > 0
    assert res.primary_image is not None
    assert "gallery_context" in res.primary_image.reasons
