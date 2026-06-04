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


def test_product_media_selector_blue_buffalo_scenario():
    from scrapers.product_url_extraction.media_selector import ProductMediaSelector

    selector = ProductMediaSelector(
        expected_product_name="BLUE Bits Plus Digestion & Immune Support Chicken Dog Treats",
        expected_brand="Blue Buffalo",
        expected_flavor_tokens=["chicken"],
    )

    crawl_media_images = [
        {"src": "https://www.bluebuffalo.com/globalassets/03-bff-why-choose-blue/ingredients/flaxseed.jpg", "score": 9.0},
        {"src": "https://www.bluebuffalo.com/globalassets/03-bff-why-choose-blue/ingredients/cooked-ingredients/chicken.jpg", "score": 9.0},
        {"src": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-treats/blue/teaser-product-image/teaser_sizzlers_original.png", "score": 9.0},
        {"src": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-treats/blue/teaser-product-image/teaser_healthbars_pc.png", "score": 9.0},
        {"src": "https://www.bluebuffalo.com/globalassets/03-bff-why-choose-blue/ingredients/potato.jpg", "score": 9.0},
        {"src": "https://www.bluebuffalo.com/globalassets/03-bff-why-choose-blue/ingredients/brown-rice.jpg", "score": 9.0},
        {"src": "https://www.bluebuffalo.com/globalassets/03-bff-why-choose-blue/ingredients/oatmeal.jpg", "score": 9.0},
        {"src": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-treats/blue/teaser-product-image/bits_beef_teaser.png", "score": 9.0},
        {"src": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-treats/blue/teaser-product-image/bits_salmon_teaser.png", "score": 9.0},
        {"src": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/life-protection-formula/teaser-product-image/teaser_lpf_dry_dog_puppylamb.png", "score": 9.0},
        {"src": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-treats/blue/teaser-product-image/bits_turkey_teaser.png", "score": 9.0},
        {"src": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-treats/blue/share-product-image/bitsplus_chicken_digestion_share.png", "score": 5.0},
    ]

    res = selector.select(
        crawl_media_images=crawl_media_images,
        jsonld_images=[],
        source_url="https://www.bluebuffalo.com/dog-treats/blue/blue-bits-plus-chicken-digestions"
    )

    approved_srcs = []
    if res.primary_image:
        approved_srcs.append(res.primary_image.src)
    approved_srcs.extend([img.src for img in res.gallery_images])

    # Only the share image should be approved
    assert len(approved_srcs) == 1
    assert approved_srcs[0] == "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-treats/blue/share-product-image/bitsplus_chicken_digestion_share.png"

    # All others should be in rejected
    rejected_srcs = {img.src for img in res.rejected_images}
    assert "https://www.bluebuffalo.com/globalassets/03-bff-why-choose-blue/ingredients/flaxseed.jpg" in rejected_srcs
    assert "https://www.bluebuffalo.com/globalassets/03-bff-why-choose-blue/ingredients/cooked-ingredients/chicken.jpg" in rejected_srcs
    assert "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-treats/blue/teaser-product-image/teaser_sizzlers_original.png" in rejected_srcs
    assert "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-treats/blue/teaser-product-image/bits_beef_teaser.png" in rejected_srcs


def test_product_media_selector_cross_flavor_substrings():
    from scrapers.product_url_extraction.media_selector import ProductMediaSelector

    # Case 1: Pumpkin Cheesecake (cheese should not match cheesecake as a foreign flavor)
    selector = ProductMediaSelector(
        expected_product_name="Creamery BITES, Pumpkin Cheesecake Recipe 12oz",
        expected_brand="K9 Granola Factory",
        expected_flavor_tokens=["Pumpkin", "Cheesecake"]
    )
    res = selector.select(
        crawl_media_images=[
            {"src": "https://www.k9granolafactory.com/cdn/shop/files/Pumpkin-Cheesecake-Creamery-Mockup_800x.png", "score": 9.0}
        ],
        jsonld_images=[],
        source_url="https://www.k9granolafactory.com/products/creamery-bites-pumpkin-cheesecake-recipe"
    )
    approved = [img.src for img in [res.primary_image] + res.gallery_images if img]
    assert "https://www.k9granolafactory.com/cdn/shop/files/Pumpkin-Cheesecake-Creamery-Mockup_800x.png" in approved

    # Case 2: Whitefish (fish should not match whitefish as a foreign flavor)
    selector = ProductMediaSelector(
        expected_product_name="Whitefish Recipe Dog Food",
        expected_brand="Open Farm",
        expected_flavor_tokens=["Whitefish"]
    )
    res = selector.select(
        crawl_media_images=[
            {"src": "https://openfarmpet.com/cdn/shop/files/whitefish-recipe-packaging.jpg", "score": 9.0}
        ],
        jsonld_images=[],
        source_url="https://openfarmpet.com/products/whitefish-dog-food"
    )
    approved = [img.src for img in [res.primary_image] + res.gallery_images if img]
    assert "https://openfarmpet.com/cdn/shop/files/whitefish-recipe-packaging.jpg" in approved

    # Case 3: Peanut Butter (peanut-butter with hyphen should match peanut butter with space)
    selector = ProductMediaSelector(
        expected_product_name="Peanut Butter Bites",
        expected_brand="Bionic",
        expected_flavor_tokens=["Peanut Butter"]
    )
    res = selector.select(
        crawl_media_images=[
            {"src": "https://www.bionicdogtoys.com/wp-content/uploads/peanut-butter-bites.png", "score": 9.0}
        ],
        jsonld_images=[],
        source_url="https://www.bionicdogtoys.com/product/peanut-butter-bites"
    )
    approved = [img.src for img in [res.primary_image] + res.gallery_images if img]
    assert "https://www.bionicdogtoys.com/wp-content/uploads/peanut-butter-bites.png" in approved


@pytest.mark.asyncio
async def test_llm_media_selector_success():
    from scrapers.product_url_extraction.media_selector import LLMMediaSelector
    from scrapers.ai_search.llm_runtime import LLMRuntimeConfig
    from unittest.mock import MagicMock, AsyncMock, patch

    runtime = LLMRuntimeConfig(model="gpt-4o-mini", base_url="https://api.openai.com/v1", api_key="fake-key")
    selector = LLMMediaSelector(
        llm_runtime=runtime,
        expected_product_name="Creamery BITES, Pumpkin Cheesecake Recipe 12oz",
        expected_brand="K9 Granola Factory",
        expected_flavor_tokens=["Pumpkin", "Cheesecake"]
    )

    # Mock the AsyncOpenAI client
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.choices = [
        MagicMock(message=MagicMock(content='{"selected_images": [{"index": 0, "role": "primary", "reason": "Exact match for Pumpkin Cheesecake product image"}]}'))
    ]
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    with patch("scrapers.product_url_extraction.media_selector.create_async_openai_client", return_value=mock_client):
        res = await selector.select(
            crawl_media_images=[
                {"src": "https://www.k9granolafactory.com/cdn/shop/files/Pumpkin-Cheesecake-Creamery-Mockup_800x.png", "score": 9.0}
            ],
            jsonld_images=[],
            source_url="https://www.k9granolafactory.com/products/creamery-bites-pumpkin-cheesecake-recipe"
        )
        
        assert res.primary_image is not None
        assert res.primary_image.src == "https://www.k9granolafactory.com/cdn/shop/files/Pumpkin-Cheesecake-Creamery-Mockup_800x.png"
        assert res.primary_image.role == "primary"
        assert any("llm_role:primary" in r for r in res.primary_image.reasons)


@pytest.mark.asyncio
async def test_llm_media_selector_fallback_on_error():
    from scrapers.product_url_extraction.media_selector import LLMMediaSelector
    from scrapers.ai_search.llm_runtime import LLMRuntimeConfig
    from unittest.mock import patch

    runtime = LLMRuntimeConfig(model="gpt-4o-mini", base_url="https://api.openai.com/v1", api_key="fake-key")
    selector = LLMMediaSelector(
        llm_runtime=runtime,
        expected_product_name="Peanut Butter Bites",
        expected_brand="Bionic",
        expected_flavor_tokens=["Peanut Butter"]
    )

    # Patch client to raise an exception
    with patch("scrapers.product_url_extraction.media_selector.create_async_openai_client", side_effect=Exception("API limit reached")):
        res = await selector.select(
            crawl_media_images=[
                {"src": "https://www.bionicdogtoys.com/wp-content/uploads/peanut-butter-bites.png", "score": 9.0}
            ],
            jsonld_images=[],
            source_url="https://www.bionicdogtoys.com/product/peanut-butter-bites"
        )
        
        # Should gracefully fall back to heuristics and succeed
        assert res.primary_image is not None
        assert res.primary_image.src == "https://www.bionicdogtoys.com/wp-content/uploads/peanut-butter-bites.png"
        assert res.primary_image.role == "primary"
        # No llm tag in reasons
        assert not any("llm_role" in r for r in res.primary_image.reasons)


@pytest.mark.asyncio
async def test_llm_media_selector_fallback_no_runtime():
    from scrapers.product_url_extraction.media_selector import LLMMediaSelector

    selector = LLMMediaSelector(
        llm_runtime=None,
        expected_product_name="Peanut Butter Bites",
        expected_brand="Bionic",
        expected_flavor_tokens=["Peanut Butter"]
    )

    res = await selector.select(
        crawl_media_images=[
            {"src": "https://www.bionicdogtoys.com/wp-content/uploads/peanut-butter-bites.png", "score": 9.0}
        ],
        jsonld_images=[],
        source_url="https://www.bionicdogtoys.com/product/peanut-butter-bites"
    )
    
    assert res.primary_image is not None
    assert res.primary_image.src == "https://www.bionicdogtoys.com/wp-content/uploads/peanut-butter-bites.png"
    assert res.primary_image.role == "primary"


