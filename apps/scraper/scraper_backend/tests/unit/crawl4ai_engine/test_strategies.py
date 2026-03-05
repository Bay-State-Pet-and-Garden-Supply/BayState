import sys
import types
from pathlib import Path
import re


if "crawl4ai" not in sys.modules:
    crawl4ai_module = types.ModuleType("crawl4ai")
    extraction_module = types.ModuleType("crawl4ai.extraction_strategy")
    async_configs_module = types.ModuleType("crawl4ai.async_configs")

    class _LLMConfig:
        def __init__(self, provider: str, api_token: str | None = None, base_url: str | None = None):
            self.provider = provider
            self.api_token = api_token
            self.base_url = base_url

    class _JsonCssExtractionStrategy:
        def __init__(self, schema):
            self.schema = schema

        def extract(self, html: str):
            products = re.findall(r"<div class=\"product\">(.*?)</div>", html, flags=re.DOTALL)
            results = []
            for product in products:
                item = {}
                for field in self.schema.get("fields", []):
                    selector = field.get("selector", "")
                    if selector == "h2.title":
                        match = re.search(r"<h2 class=\"title\">(.*?)</h2>", product, flags=re.DOTALL)
                        item[field["name"]] = match.group(1).strip() if match else ""
                    elif selector == "span.price":
                        match = re.search(r"<span class=\"price\">(.*?)</span>", product, flags=re.DOTALL)
                        item[field["name"]] = match.group(1).strip() if match else ""
                    elif selector == "img":
                        match = re.search(r"<img[^>]*src=\"(.*?)\"", product, flags=re.DOTALL)
                        item[field["name"]] = match.group(1).strip() if match else ""
                results.append(item)
            return results

    class _JsonXPathExtractionStrategy:
        def __init__(self, schema):
            self.schema = schema

        def extract(self, html: str):
            products = re.findall(r"<div class=\"product\">(.*?)</div>", html, flags=re.DOTALL)
            results = []
            for product in products:
                item = {}
                for field in self.schema.get("fields", []):
                    selector = field.get("selector", "")
                    if selector == "//h2[@class='title']":
                        match = re.search(r"<h2 class=\"title\">(.*?)</h2>", product, flags=re.DOTALL)
                        item[field["name"]] = match.group(1).strip() if match else ""
                    elif selector == "//span[@class='price']":
                        match = re.search(r"<span class=\"price\">(.*?)</span>", product, flags=re.DOTALL)
                        item[field["name"]] = match.group(1).strip() if match else ""
                    elif selector == "//img":
                        match = re.search(r"<img[^>]*src=\"(.*?)\"", product, flags=re.DOTALL)
                        item[field["name"]] = match.group(1).strip() if match else ""
                results.append(item)
            return results

    class _LLMExtractionStrategy:
        def __init__(self, **kwargs):
            self.total_usage = {"prompt_tokens": 0, "completion_tokens": 0}

        def extract(self, html: str):
            return []

    crawl4ai_module.LLMConfig = _LLMConfig
    async_configs_module.LLMConfig = _LLMConfig
    extraction_module.JsonCssExtractionStrategy = _JsonCssExtractionStrategy
    extraction_module.JsonXPathExtractionStrategy = _JsonXPathExtractionStrategy
    extraction_module.LLMExtractionStrategy = _LLMExtractionStrategy

    sys.modules["crawl4ai"] = crawl4ai_module
    sys.modules["crawl4ai.extraction_strategy"] = extraction_module
    sys.modules["crawl4ai.async_configs"] = async_configs_module

project_root = Path(__file__).parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root / "scraper_backend" / "src"))

from crawl4ai_engine.strategies.css import CssExtractionStrategyWrapper
from crawl4ai_engine.strategies.fallback import ExtractionFallbackChain
from crawl4ai_engine.strategies.llm import LLMExtractionStrategyWrapper
from crawl4ai_engine.strategies.xpath import XPathExtractionStrategyWrapper


def test_css_extraction_strategy():
    html = """
    <div class="product">
        <h2 class="title">Product 1</h2>
        <span class="price">$10.00</span>
        <img src="image1.jpg" />
    </div>
    <div class="product">
        <h2 class="title">Product 2</h2>
        <span class="price">$20.00</span>
        <img src="image2.jpg" />
    </div>
    """

    selectors = {"title": {"selector": "h2.title"}, "price": {"selector": "span.price"}, "image": {"selector": "img", "attribute": "src"}}

    strategy = CssExtractionStrategyWrapper.from_yaml_selectors("div.product", selectors)
    results = strategy.extract(html)

    assert len(results) == 2
    assert results[0]["title"] == "Product 1"
    assert results[0]["price"] == "$10.00"
    assert results[0]["image"] == "image1.jpg"
    assert results[1]["title"] == "Product 2"
    assert results[1]["price"] == "$20.00"
    assert results[1]["image"] == "image2.jpg"


def test_xpath_extraction_strategy():
    html = """
    <div class="product">
        <h2 class="title">Product 1</h2>
        <span class="price">$10.00</span>
        <img src="image1.jpg" />
    </div>
    <div class="product">
        <h2 class="title">Product 2</h2>
        <span class="price">$20.00</span>
        <img src="image2.jpg" />
    </div>
    """

    selectors = {
        "title": {"selector": "//h2[@class='title']"},
        "price": {"selector": "//span[@class='price']"},
        "image": {"selector": "//img", "attribute": "src"},
    }

    strategy = XPathExtractionStrategyWrapper.from_yaml_selectors("//div[@class='product']", selectors)
    results = strategy.extract(html)

    assert len(results) == 2
    assert results[0]["title"] == "Product 1"
    assert results[0]["price"] == "$10.00"
    assert results[0]["image"] == "image1.jpg"
    assert results[1]["title"] == "Product 2"
    assert results[1]["price"] == "$20.00"
    assert results[1]["image"] == "image2.jpg"


class _FakeTracker:
    def __init__(self):
        self.calls = []

    def track_extraction(self, input_tokens: int, output_tokens: int, model: str, scraper_name: str = "default"):
        self.calls.append(
            {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "model": model,
                "scraper_name": scraper_name,
            }
        )


def test_llm_wrapper_supports_litellm_provider_and_tracks_cost():
    captured = {}

    class FakeLlmConfig:
        def __init__(self, provider: str, api_token: str | None = None, base_url: str | None = None):
            captured["provider"] = provider
            captured["api_token"] = api_token
            captured["base_url"] = base_url

    class FakeLlmStrategy:
        def __init__(self, **kwargs):
            captured["strategy_kwargs"] = kwargs
            self.total_usage = {"prompt_tokens": 120, "completion_tokens": 30}

        def extract(self, html: str):
            return [{"name": "Deluxe Kibble", "price": "$22.99"}]

    tracker = _FakeTracker()
    wrapper = LLMExtractionStrategyWrapper(
        provider="anthropic/claude-3-5-sonnet",
        instruction="Extract product data",
        api_token="test-key",
        schema={
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "price": {"type": "string"},
            },
        },
        cost_tracker=tracker,
        strategy_factory=FakeLlmStrategy,
        llm_config_factory=FakeLlmConfig,
        confidence_threshold=0.5,
        scraper_name="pets",
    )

    result = wrapper.extract_with_metadata("<html></html>")

    assert result["success"] is True
    assert result["strategy"] == "llm"
    assert result["data"][0]["name"] == "Deluxe Kibble"
    assert captured["provider"] == "anthropic/claude-3-5-sonnet"
    assert captured["api_token"] == "test-key"
    assert tracker.calls[0]["input_tokens"] == 120
    assert tracker.calls[0]["output_tokens"] == 30
    assert tracker.calls[0]["model"] == "claude-3-5-sonnet"
    assert tracker.calls[0]["scraper_name"] == "pets"


def test_llm_wrapper_applies_confidence_threshold():
    class FakeLlmStrategy:
        def __init__(self, **kwargs):
            self.total_usage = {"prompt_tokens": 10, "completion_tokens": 10}

        def extract(self, html: str):
            return [{"name": "", "price": None}]

    wrapper = LLMExtractionStrategyWrapper(
        provider="openai/gpt-4o-mini",
        instruction="Extract product data",
        schema={
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "price": {"type": "string"},
            },
        },
        strategy_factory=FakeLlmStrategy,
        llm_config_factory=lambda **kwargs: kwargs,
        confidence_threshold=0.7,
        cost_tracker=_FakeTracker(),
    )

    result = wrapper.extract_with_metadata("<html></html>")

    assert result["success"] is False
    assert result["data"] == []
    assert result["confidence"] == 0.0


def test_fallback_chain_uses_xpath_before_llm_when_css_fails():
    call_order = []

    class FakeCss:
        def extract(self, html: str):
            call_order.append("css")
            return []

    class FakeXPath:
        def extract(self, html: str):
            call_order.append("xpath")
            return [{"name": "Kibble"}]

    class FakeLLM:
        def extract_with_metadata(self, html: str, url: str = ""):
            call_order.append("llm")
            return {"success": True, "data": [{"name": "LLM Item"}], "confidence": 0.99, "metadata": {}}

    chain = ExtractionFallbackChain(
        css_strategy=FakeCss(),
        xpath_strategy=FakeXPath(),
        llm_strategy=FakeLLM(),
        confidence_threshold=0.5,
    )

    result = chain.extract("<html></html>")

    assert result.success is True
    assert result.strategy == "xpath"
    assert result.data[0]["name"] == "Kibble"
    assert call_order == ["css", "xpath"]


def test_fallback_chain_uses_llm_after_css_and_xpath_fail():
    call_order = []

    class FakeCss:
        def extract(self, html: str):
            call_order.append("css")
            return []

    class FakeXPath:
        def extract(self, html: str):
            call_order.append("xpath")
            return []

    class FakeLLM:
        def extract_with_metadata(self, html: str, url: str = ""):
            call_order.append("llm")
            return {
                "success": True,
                "data": [{"name": "Fallback LLM Item", "_confidence": 0.92}],
                "confidence": 0.92,
                "metadata": {"provider": "openai/gpt-4o-mini"},
            }

    chain = ExtractionFallbackChain(
        css_strategy=FakeCss(),
        xpath_strategy=FakeXPath(),
        llm_strategy=FakeLLM(),
        confidence_threshold=0.6,
    )

    result = chain.extract("<html></html>")

    assert result.success is True
    assert result.strategy == "llm"
    assert result.data[0]["name"] == "Fallback LLM Item"
    assert call_order == ["css", "xpath", "llm"]
