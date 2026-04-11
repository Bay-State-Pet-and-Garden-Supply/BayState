#!/usr/bin/env python3
"""
V3 Prompt Deployment Verification Script

Run this on each scraper runner to verify v3 deployment readiness.
"""

import sys
import os
from pathlib import Path


def check_env_vars():
    """Check API keys are set"""
    print("🔑 Checking Environment Variables...")

    serper_key = os.getenv("SERPER_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    if not serper_key:
        print("  ❌ SERPER_API_KEY is not set")
        return False
    print(f"  ✅ SERPER_API_KEY set ({len(serper_key)} chars)")

    if not openai_key:
        print("  ❌ OPENAI_API_KEY not set")
        return False
    else:
        print(f"  ✅ OPENAI_API_KEY set ({len(openai_key)} chars)")

    return True


def check_dependencies():
    """Check Python dependencies"""
    print("\n📦 Checking Dependencies...")

    deps = [
        "scrapers.ai_search.crawl4ai_extractor",
        "scrapers.ai_search.scoring",
        "scrapers.ai_search.matching",
    ]

    all_ok = True
    for dep in deps:
        try:
            __import__(dep)
            print(f"  ✅ {dep.split('.')[-1]}")
        except ImportError as e:
            print(f"  ❌ {dep.split('.')[-1]}: {e}")
            all_ok = False

    return all_ok


def check_prompt_file():
    """Check v3 prompt file exists and is valid"""
    print("\n📝 Checking v3 Prompt File...")

    prompt_path = Path("apps/scraper/prompts/extraction_v3.txt")

    if not prompt_path.exists():
        print(f"  ❌ v3 prompt not found at {prompt_path}")
        return False

    content = prompt_path.read_text()

    # Check required sections
    required_sections = [
        "TARGET CONTEXT",
        "SIZE METRICS EXTRACTION",
        "CATEGORIES EXTRACTION",
        "DESCRIPTION EXTRACTION",
        "MUST-FILL CHECKLIST",
    ]

    all_ok = True
    for section in required_sections:
        if section in content:
            print(f"  ✅ {section}")
        else:
            print(f"  ❌ Missing: {section}")
            all_ok = False

    # Check price/availability NOT in output
    if "price" in content.lower() or "availability" in content.lower():
        print("  ⚠️  Warning: price/availability still mentioned in prompt")
    else:
        print("  ✅ No price/availability (product-focused)")

    return all_ok


def test_prompt_loading():
    """Test that v3 prompt loads correctly"""
    print("\n🧪 Testing Prompt Loading...")

    try:
        sys.path.insert(0, "apps/scraper")

        from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor
        from scrapers.ai_search.scoring import SearchScorer
        from scrapers.ai_search.matching import MatchingUtils

        extractor = Crawl4AIExtractor(headless=True, llm_model="gpt-4o-mini", scoring=SearchScorer(), matching=MatchingUtils(), prompt_version="v3")

        prompt = extractor._build_instruction(sku="032247886598", brand="Scotts", product_name="Test Product")

        print(f"  ✅ Prompt loaded successfully")
        print(f"  ✅ Prompt length: {len(prompt)} characters")

        # Verify key content
        checks = [
            ("SIZE METRICS" in prompt, "size metrics section"),
            ("CATEGORIES" in prompt, "categories section"),
            ("DESCRIPTION" in prompt, "description section"),
        ]

        for check, name in checks:
            if check:
                print(f"  ✅ Contains {name}")
            else:
                print(f"  ❌ Missing {name}")

        return True

    except Exception as e:
        print(f"  ❌ Error loading prompt: {e}")
        import traceback

        traceback.print_exc()
        return False


def main():
    """Run all checks"""
    print("=" * 60)
    print("V3 Prompt Deployment Verification")
    print("=" * 60)
    print()

    checks = [
        ("Environment Variables", check_env_vars),
        ("Dependencies", check_dependencies),
        ("Prompt File", check_prompt_file),
        ("Prompt Loading", test_prompt_loading),
    ]

    results = {}
    for name, check_func in checks:
        try:
            results[name] = check_func()
        except Exception as e:
            print(f"\n❌ {name} check failed: {e}")
            results[name] = False

    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)

    all_passed = True
    for name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {name}")
        if not passed:
            all_passed = False

    print()
    if all_passed:
        print("🎉 All checks passed! Runner is ready for v3 deployment.")
        print()
        print("Next steps:")
        print("  1. Test extraction: python scripts/evaluate.py --prompt-version v3 --skus 032247886598")
        print("  2. Monitor results: tail -f logs/scraper.log")
        print("  3. Full deployment: Follow V3_DEPLOYMENT_CHECKLIST.md")
        return 0
    else:
        print("⚠️  Some checks failed. Please fix issues before deploying v3.")
        print()
        print("Common fixes:")
        print("  - Set API keys: export SERPER_API_KEY=... && export OPENAI_API_KEY=...")
        print("  - Install dependencies: pip install -r requirements.txt")
        print("  - Pull latest code: git pull origin master")
        return 1


if __name__ == "__main__":
    sys.exit(main())
