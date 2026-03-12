
import inspect
from crawl4ai import CrawlerRunConfig, AsyncWebCrawler

def inspect_crawl4ai():
    print("--- CrawlerRunConfig ---")
    print([p for p in inspect.signature(CrawlerRunConfig.__init__).parameters])
    print("--- AsyncWebCrawler ---")
    print([p for p in inspect.signature(AsyncWebCrawler.__init__).parameters])

if __name__ == "__main__":
    inspect_crawl4ai()
