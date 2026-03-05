"""Test fixtures and shared mocks for crawl4ai engine tests."""

from __future__ import annotations

import sys
import types
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

# Setup path to import crawl4ai_engine
_test_dir = Path(__file__).parent
_scraper_root = _test_dir.parent.parent.parent.parent
sys.path.insert(0, str(_scraper_root / "scraper_backend" / "src"))
_test_dir = Path(__file__).parent
_scraper_root = _test_dir.parent.parent.parent
sys.path.insert(0, str(_scraper_root / "scraper_backend" / "src"))


# =============================================================================
# Crawl4AI Mock Setup
# =============================================================================


def setup_crawl4ai_mocks():
    """Setup mock crawl4ai modules for testing without installation."""
    if "crawl4ai" in sys.modules:
        return

    crawl4ai_module = types.ModuleType("crawl4ai")
    extraction_module = types.ModuleType("crawl4ai.extraction_strategy")
    config_module = types.ModuleType("crawl4ai.config")

    class _MockBrowserConfig:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

    class _MockCrawlerRunConfig:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

    class _MockCrawlResult:
        """Mock crawl result from crawl4ai."""

        def __init__(
            self,
            success: bool = True,
            markdown: str = "",
            html: str = "",
            error: str | None = None,
            status_code: int = 200,
        ):
            self.success = success
            self.markdown = markdown
            self.html = html
            self.error = error
            self.status_code = status_code

    class _MockAsyncWebCrawler:
        """Mock AsyncWebCrawler for testing."""

        def __init__(self, config=None):
            self.config = config
            self._started = False

        async def start(self):
            self._started = True

        async def close(self):
            self._started = False

        async def arun(self, url: str, config=None):
            # Return mock result based on URL
            return _MockCrawlResult(
                success=True,
                markdown=f"Content from {url}",
                html=f"<html><body>Content from {url}</body></html>",
            )

    crawl4ai_module.AsyncWebCrawler = _MockAsyncWebCrawler
    crawl4ai_module.CrawlerRunConfig = _MockCrawlerRunConfig
    extraction_module._MockCrawlResult = _MockCrawlResult
    config_module.BrowserConfig = _MockBrowserConfig
    config_module.CrawlerRunConfig = _MockCrawlerRunConfig

    sys.modules["crawl4ai"] = crawl4ai_module
    sys.modules["crawl4ai.extraction_strategy"] = extraction_module
    sys.modules["crawl4ai.config"] = config_module


# Initialize mocks
setup_crawl4ai_mocks()


# =============================================================================
# Page Type Fixtures
# =============================================================================


@pytest.fixture
def product_listing_html():
    """HTML fixture for a product listing page."""
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Pet Supplies - Products</title></head>
    <body>
        <div class="product-grid">
            <div class="product">
                <h2 class="title">Premium Dog Food</h2>
                <span class="price">$49.99</span>
                <img src="/images/dog-food.jpg" alt="Dog Food" />
                <div class="rating">4.5 stars</div>
            </div>
            <div class="product">
                <h2 class="title">Cat Litter</h2>
                <span class="price">$24.99</span>
                <img src="/images/cat-litter.jpg" alt="Cat Litter" />
                <div class="rating">4.2 stars</div>
            </div>
            <div class="product">
                <h2 class="title">Bird Cage</h2>
                <span class="price">$89.99</span>
                <img src="/images/bird-cage.jpg" alt="Bird Cage" />
                <div class="rating">4.7 stars</div>
            </div>
        </div>
    </body>
    </html>
    """


@pytest.fixture
def product_detail_html():
    """HTML fixture for a product detail page."""
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Premium Dog Food - Details</title></head>
    <body>
        <div class="product-detail">
            <h1 class="product-title">Premium Dog Food - Large Breed</h1>
            <div class="price-container">
                <span class="current-price">$49.99</span>
                <span class="original-price">$59.99</span>
                <span class="discount">Save 17%</span>
            </div>
            <div class="product-description">
                <p>Premium nutrition for large breed dogs. Made with real chicken.</p>
            </div>
            <div class="specifications">
                <ul>
                    <li>Weight: 30 lbs</li>
                    <li>Flavor: Chicken</li>
                    <li>Life Stage: Adult</li>
                </ul>
            </div>
            <div class="reviews">
                <span class="avg-rating">4.5</span>
                <span class="review-count">(128 reviews)</span>
            </div>
            <button class="add-to-cart">Add to Cart</button>
            <div class="stock-status">In Stock</div>
        </div>
    </body>
    </html>
    """


@pytest.fixture
def search_results_html():
    """HTML fixture for a search results page."""
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Search Results for "dog food"</title></head>
    <body>
        <div class="search-header">
            <h1>Search Results for "dog food"</h1>
            <span class="result-count">42 products found</span>
        </div>
        <div class="search-results">
            <div class="search-item">
                <a href="/product/123">Premium Dog Food</a>
                <span class="price">$49.99</span>
                <span class="availability">In Stock</span>
            </div>
            <div class="search-item">
                <a href="/product/456">Organic Dog Treats</a>
                <span class="price">$19.99</span>
                <span class="availability">In Stock</span>
            </div>
            <div class="search-item">
                <a href="/product/789">Dog Food Bowl</a>
                <span class="price">$14.99</span>
                <span class="availability">Out of Stock</span>
            </div>
        </div>
        <div class="pagination">
            <a href="?page=1">1</a>
            <a href="?page=2">2</a>
            <a href="?page=3">3</a>
        </div>
    </body>
    </html>
    """


@pytest.fixture
def category_page_html():
    """HTML fixture for a category/landing page."""
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Dog Supplies - Category</title></head>
    <body>
        <header>
            <h1>Dog Supplies</h1>
            <nav>
                <a href="/category/food">Food</a>
                <a href="/category/toys">Toys</a>
                <a href="/category/accessories">Accessories</a>
            </nav>
        </header>
        <main>
            <aside class="filters">
                <h3>Filters</h3>
                <label><input type="checkbox" name="brand" value="premium"> Premium</label>
                <label><input type="checkbox" name="brand" value="organic"> Organic</label>
                <label><input type="checkbox" name="price" value="under-25"> Under $25</label>
            </aside>
            <div class="product-list">
                <div class="product-card" data-id="1">
                    <img src="/img1.jpg" />
                    <h3>Product 1</h3>
                    <p class="price">$29.99</p>
                </div>
                <div class="product-card" data-id="2">
                    <img src="/img2.jpg" />
                    <h3>Product 2</h3>
                    <p class="price">$39.99</p>
                </div>
            </div>
        </main>
        <footer>
            <p>&copy; 2024 Pet Store</p>
        </footer>
    </body>
    </html>
    """


@pytest.fixture
def form_page_html():
    """HTML fixture for a page with forms (login, contact, etc.)."""
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Login - Pet Store</title></head>
    <body>
        <div class="login-container">
            <h1>Sign In</h1>
            <form id="login-form" action="/api/login" method="POST">
                <div class="form-group">
                    <label for="email">Email</label>
                    <input type="email" id="email" name="email" required />
                </div>
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" required />
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" name="remember" /> Remember Me
                    </label>
                </div>
                <button type="submit" class="btn-primary">Sign In</button>
            </form>
            <div class="form-footer">
                <a href="/forgot-password">Forgot Password?</a>
                <a href="/register">Create Account</a>
            </div>
        </div>
    </body>
    </html>
    """


@pytest.fixture
def javascript_heavy_html():
    """HTML fixture for a JavaScript-heavy SPA page."""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Single Page App - Products</title>
        <script src="/app.js"></script>
    </head>
    <body>
        <div id="app">
            <div class="loading">Loading...</div>
        </div>
        <template id="product-template">
            <div class="product-spa">
                <img data-bind="image" />
                <h2 data-bind="title"></h2>
                <span data-bind="price"></span>
                <button data-bind="addToCart">Add to Cart</button>
            </div>
        </template>
        <script>
            // Simulated SPA data
            window.__INITIAL_DATA__ = {
                products: [
                    {id: 1, title: "SPA Product 1", price: 29.99, image: "/img1.jpg"},
                    {id: 2, title: "SPA Product 2", price: 39.99, image: "/img2.jpg"}
                ]
            };
        </script>
    </body>
    </html>
    """


# =============================================================================
# Mock Factories
# =============================================================================


@pytest.fixture
def mock_crawl_result():
    """Factory for creating mock crawl results."""

    class MockCrawlResult:
        def __init__(
            self,
            success: bool = True,
            markdown: str = "Test content",
            html: str = "<html>Test</html>",
            error: str | None = None,
            status_code: int = 200,
        ):
            self.success = success
            self.markdown = markdown
            self.html = html
            self.error = error
            self.status_code = status_code

    return MockCrawlResult


@pytest.fixture
def mock_async_crawler():
    """Factory for creating a mock AsyncWebCrawler."""

    class MockAsyncWebCrawler:
        def __init__(self):
            self._started = False
            self.arun = AsyncMock()

        async def start(self):
            self._started = True

        async def close(self):
            self._started = False

    return MockAsyncWebCrawler


# =============================================================================
# Strategy Fixtures
# =============================================================================


@pytest.fixture
def sample_css_selectors():
    """Sample CSS selectors for extraction."""
    return {
        "title": {"selector": "h2.title"},
        "price": {"selector": "span.price"},
        "image": {"selector": "img", "attribute": "src"},
    }


@pytest.fixture
def sample_xpath_selectors():
    """Sample XPath selectors for extraction."""
    return {
        "title": {"selector": "//h2[@class='title']"},
        "price": {"selector": "//span[@class='price']"},
        "image": {"selector": "//img/@src"},
    }


@pytest.fixture
def sample_llm_config():
    """Sample LLM extraction configuration."""
    return {
        "provider": "openai/gpt-4o-mini",
        "instruction": "Extract product information including name, price, and description.",
        "api_token": "test-key",
        "schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "price": {"type": "string"},
                "description": {"type": "string"},
            },
        },
    }


# =============================================================================
# Error Fixtures
# =============================================================================


@pytest.fixture
def anti_bot_error():
    """Mock anti-bot detection error."""
    return Exception("CF-Challenge detected: please wait...")


@pytest.fixture
def network_error():
    """Mock network error."""
    return Exception("Connection reset by peer")


@pytest.fixture
def timeout_error():
    """Mock timeout error."""
    return Exception("Navigation timeout: 30000ms exceeded")


@pytest.fixture
def schema_validation_error():
    """Mock schema validation error."""
    return Exception("Schema validation failed: missing required field 'name'")
