import asyncio
import json
import sys
from typing import List
from pydantic import BaseModel, Field
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy

class ProductSpecs(BaseModel):
    name: str = Field(..., description="Product name")
    price: str = Field(..., description="Product price")
    description: str = Field(..., description="Product description")
    sku: str = Field(None, description="Product SKU or model number")
    brand: str = Field(None, description="Product brand")
    specifications: dict = Field(default_factory=dict, description="Technical specifications")

async def generate_offline_schema(urls: List[str], output_path: str):
    """
    Crawls multiple URLs to gather HTML samples and generates a resilient CSS extraction schema.
    """
    browser_config = BrowserConfig(headless=True)
    run_config = CrawlerRunConfig(cache_mode=CacheMode.BYPASS)
    
    samples = []
    async with AsyncWebCrawler(config=browser_config) as crawler:
        print(f"Crawling {len(urls)} sample URLs...")
        for url in urls:
            result = await crawler.arun(url=url, config=run_config)
            if result.success:
                # We use a snippet of the HTML to avoid overwhelming the LLM context
                samples.append(f"<!-- Source: {url} -->\n{result.cleaned_html[:30000]}")
            else:
                print(f"Failed to crawl {url}: {result.error_message}")

    if not samples:
        print("No valid HTML samples collected.")
        return

    print("Generating schema using Crawl4AI utility...")
    # Concatenate samples for multi-sample analysis
    combined_html = "\n\n".join(samples)
    
    # Note: v0.8.0 generate_schema is available on the class
    # We'll use the prompt approach as per docs
    schema = await JsonCssExtractionStrategy.generate_schema(
        html=combined_html,
        root_selector="body", # Or more specific if possible
        schema_type="css",
        # For v0.8.0, it might expect different params. 
        # I'll use a simplified version if needed.
    )

    with open(output_path, "w") as f:
        json.dump(schema, f, indent=2)
    
    print(f"Successfully saved schema to {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python generate_crawl4ai_schema.py <output_json_path> <url1> [url2 ...]")
        sys.exit(1)
    
    output = sys.argv[1]
    sample_urls = sys.argv[2:]
    asyncio.run(generate_offline_schema(sample_urls, output))
