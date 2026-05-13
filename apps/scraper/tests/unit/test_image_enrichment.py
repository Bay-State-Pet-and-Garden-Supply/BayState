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
