import asyncio
from crawl4ai.extraction_strategy import LLMExtractionStrategy, JsonCssExtractionStrategy
from crawl4ai import LLMConfig
from pydantic import BaseModel, Field

class SimpleProduct(BaseModel):
    name: str = Field(description="Name of the product")
    price: float = Field(description="Price of the product")

async def test():
    # LLM strategy
    strategy = LLMExtractionStrategy(
        llm_config=LLMConfig(
            provider="openai/google/gemma-4-e4b",
            api_token="lm-studio",
            base_url="http://localhost:1234/v1",
        ),
        schema=SimpleProduct.model_json_schema(),
        extraction_type="schema",
        instruction="Extract product name and price.",
        input_format="fit_markdown",
    )
    
    test_html = "<html><body><h1>Catit Nibbly Chicken Wraps</h1><span class='price'>$4.99</span></body></html>"
    test_markdown = "# Catit Nibbly Chicken Wraps\nPrice: $4.99\nDelicious chicken and fish wraps for cats."
    
    print("Running LLM strategy with markdown:")
    res_md = strategy.extract("https://example.com", 0, test_markdown)
    print("Result md:", res_md)
    
    print("Running LLM strategy with html:")
    res_html = strategy.extract("https://example.com", 0, test_html)
    print("Result html:", res_html)

if __name__ == "__main__":
    asyncio.run(test())
