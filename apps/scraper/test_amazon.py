import asyncio
from utils.scraping.playwright_browser import PlaywrightScraperBrowser

async def run():
    browser = PlaywrightScraperBrowser(site_name="amazon_test", headless=True, use_stealth=True)
    await browser.initialize()
    print("Navigating to Amazon search...")
    try:
        await browser.page.goto("https://www.amazon.com/s?k=035585499741", timeout=30000)
        print(f"Title: {await browser.page.title()}")
        html = await browser.page.content()
        with open("amazon_dump.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("Saved HTML to amazon_dump.html")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await browser.quit()

if __name__ == "__main__":
    asyncio.run(run())