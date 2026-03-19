"""Test script to verify credential loading from API in CLI mode."""

import os
import sys

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

# Load .env.development if it exists, otherwise .env
env_file = ".env.development" if os.path.exists(".env.development") else ".env"
load_dotenv(env_file)

from core.api_client import ScraperAPIClient


def test_credential_loading():
    """Test that credentials can be loaded from the API."""
    api_url = os.environ.get("SCRAPER_API_URL")
    api_key = os.environ.get("SCRAPER_API_KEY")

    print(f"SCRAPER_API_URL: {api_url or 'NOT SET'}")
    print(f"SCRAPER_API_KEY: {'SET (' + api_key[:10] + '...)' if api_key else 'NOT SET'}")
    print()

    if not api_url:
        print("[X] SCRAPER_API_URL not set. Using default: https://bay-state-app.vercel.app")
        api_url = "https://bay-state-app.vercel.app"

    if not api_key:
        print("[X] SCRAPER_API_KEY not set. Cannot fetch credentials from API.")
        print("   You can still use environment variables like ORGILL_USERNAME / ORGILL_PASSWORD")
        return

    client = ScraperAPIClient(
        api_url=api_url,
        api_key=api_key,
        runner_name="test-cli",
    )

    # Test fetching credentials for orgill
    print("Fetching credentials for 'orgill'...")
    creds = client.get_credentials("orgill")

    if creds:
        print(f"[OK] Successfully fetched credentials!")
        print(f"   Type: {creds.get('type', 'basic')}")
        print(f"   Username: {creds.get('username', 'N/A')[:10]}...")
        print(f"   Password: {'*' * len(creds.get('password', ''))}")
    else:
        print("[FAIL] No credentials found for 'orgill'")
        print("   Check that:")
        print("   1. The scraper has credentials configured in the admin panel")
        print("   2. The API key has access to this scraper")


if __name__ == "__main__":
    test_credential_loading()
