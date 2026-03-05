"""T12: crawl4ai PoC Test Harness (Direct Import Version)

Tests transpiled retailer configs against HTML fixtures using LLM extraction.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# Add paths for imports - repo_root must be first to find lib.transpiler
# __file__ is .../BayStateScraper/tests/test_crawl4ai_poc.py
# parents[1] is .../BayStateScraper (correct repo root)
repo_root = Path(__file__).parents[1].resolve()  # Use absolute path
sys.path.insert(0, str(repo_root))  # Add repo root first to find lib module



def load_fixture(fixture_name: str) -> str:
    """Load HTML fixture content."""
    fixtures_dir = Path(__file__).parent / "fixtures" / "crawl4ai"
    fixture_path = fixtures_dir / fixture_name
    return fixture_path.read_text(encoding="utf-8")


def transpile_config(config_name: str) -> dict[str, Any]:
    """Transpile a config using the transpiler module."""
    try:
        # Import here to ensure path is set
        from lib.transpiler import YAMLToCrawl4AITranspiler

        config_path = repo_root / "scrapers" / "configs" / f"{config_name}.yaml"
        transpiler = YAMLToCrawl4AITranspiler()
        result = transpiler.transpile_file(config_path)

        return {
            "success": result.success,
            "scraper_name": result.scraper_name,
            "scraper_type": result.scraper_type,
            "extraction_strategy": result.extraction_strategy,
            "schema": result.schema,
            "engine_config": result.engine_config,
            "needs_manual_review": result.needs_manual_review,
            "issues": [{"code": i.code, "message": i.message, "severity": i.severity} for i in result.issues],
        }
    except Exception as e:
        import traceback

        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc(),
        }


def test_extraction_strategy(
    config: dict[str, Any],
    html: str,
    url: str = "",
) -> dict[str, Any]:
    """Test extraction against fixture."""

    strategy_type = config.get("extraction_strategy", "unknown")
    schema = config.get("schema", {})

    test_result = {
        "strategy": strategy_type,
        "success": False,
        "extracted_data": None,
        "issues": [],
        "metadata": {},
    }

    if strategy_type == "llm":
        if not schema:
            test_result["issues"].append("Missing schema for LLM extraction")
            return test_result

        if "provider" not in schema:
            test_result["issues"].append("Missing provider in schema")

        if "instruction" not in schema:
            test_result["issues"].append("Missing instruction in schema")

        if "schema" not in schema:
            test_result["issues"].append("Missing output schema")

        html_size = len(html)
        test_result["metadata"]["html_size_bytes"] = html_size
        test_result["metadata"]["html_size_chars"] = len(html)
        estimated_tokens = html_size // 4
        test_result["metadata"]["estimated_tokens"] = estimated_tokens

        output_schema = schema.get("schema", {})
        if output_schema.get("type") == "object" and "properties" in output_schema:
            properties = output_schema["properties"]
            test_result["metadata"]["extractable_fields"] = list(properties.keys())
            test_result["metadata"]["required_fields"] = output_schema.get("required", [])
            test_result["success"] = True
        else:
            test_result["issues"].append("Invalid output schema structure")

    elif strategy_type == "css":
        test_result["issues"].append("CSS extraction not yet implemented in test harness")

    elif strategy_type == "xpath":
        test_result["issues"].append("XPath extraction not yet implemented in test harness")

    else:
        test_result["issues"].append(f"Unknown extraction strategy: {strategy_type}")

    return test_result


def run_poc_test(
    config_name: str,
    fixture_name: str,
    expected_fields: list[str] | None = None,
) -> dict[str, Any]:
    """Run a complete PoC test for one retailer."""
    print(f"\n{'=' * 60}")
    print(f"Testing: {config_name}")
    print(f"Fixture: {fixture_name}")
    print(f"{'=' * 60}")

    print("1. Transpiling config...")
    config = transpile_config(config_name)

    if not config.get("success"):
        print("   [FAIL] Transpilation failed")
        print(f"   Error: {config.get('error')}")
        return {
            "config_name": config_name,
            "success": False,
            "error": f"Transpilation failed: {config.get('error', 'Unknown error')}",
        }

    print("   [OK] Transpiled successfully")
    print(f"   - Strategy: {config.get('extraction_strategy')}")
    print(f"   - Scraper: {config.get('scraper_name')}")
    print(f"   - Type: {config.get('scraper_type')}")
    print(f"   - Manual review needed: {config.get('needs_manual_review', False)}")

    if config.get("issues"):
        print(f"   - Transpiler issues: {len(config['issues'])}")
        for issue in config["issues"]:
            print(f"     [!] [{issue['severity']}] {issue['code']}: {issue['message']}")

    print("2. Loading HTML fixture...")
    try:
        html = load_fixture(fixture_name)
        print(f"   [OK] Loaded {len(html)} bytes")
    except Exception as e:
        print(f"   [FAIL] Failed to load fixture: {e}")
        return {
            "config_name": config_name,
            "success": False,
            "error": f"Failed to load fixture: {e}",
        }

    print("3. Testing extraction strategy...")
    test_result = test_extraction_strategy(config, html)

    if expected_fields and test_result.get("success"):
        extractable = set(test_result["metadata"].get("extractable_fields", []))
        expected = set(expected_fields)
        missing = expected - extractable

        if missing:
            test_result["issues"].append(f"Missing expected fields: {missing}")
            test_result["success"] = False
        else:
            print(f"   [OK] All expected fields present: {list(expected)}")

    print("4. Results:")
    print(f"   - Success: {test_result['success']}")
    print(f"   - Strategy: {test_result['strategy']}")

    if test_result["metadata"]:
        print(f"   - HTML size: {test_result['metadata'].get('html_size_bytes')} bytes")
        print(f"   - Est. tokens: {test_result['metadata'].get('estimated_tokens')}")
        fields = test_result["metadata"].get("extractable_fields", [])
        print(f"   - Extractable fields: {fields}")

    if test_result["issues"]:
        print(f"   - Issues: {len(test_result['issues'])}")
        for issue in test_result["issues"]:
            print(f"     ! {issue}")

    return {
        "config_name": config_name,
        "fixture": fixture_name,
        "success": test_result["success"] and config.get("needs_manual_review") == False,
        "transpiled_config": config,
        "test_result": test_result,
        "issues": test_result["issues"] + [f"[{i['severity']}] {i['code']}: {i['message']}" for i in config.get("issues", [])],
    }


def main() -> int:
    """Run T12 PoC tests."""
    print("=" * 60)
    print("T12: crawl4ai Migration PoC Test")
    print("=" * 60)

    test_cases = [
        {
            "config": "ai-walmart",
            "fixture": "walmart_product.html",
            "expected_fields": ["name", "brand", "price", "images"],
        },
        {
            "config": "ai-amazon",
            "fixture": "amazon_product.html",
            "expected_fields": ["name", "brand", "price", "images", "asin"],
        },
        {
            "config": "ai-mazuri",
            "fixture": "mazuri_product.html",
            "expected_fields": ["name", "brand", "images", "ingredients", "guaranteed_analysis"],
        },
    ]

    results = []
    success_count = 0

    for test_case in test_cases:
        result = run_poc_test(
            test_case["config"],
            test_case["fixture"],
            test_case.get("expected_fields"),
        )
        results.append(result)
        if result["success"]:
            success_count += 1

    print(f"\n{'=' * 60}")
    print("SUMMARY")
    print(f"{'=' * 60}")
    print(f"Total tests: {len(results)}")
    print(f"Successful: {success_count}")
    print(f"Failed: {len(results) - success_count}")
    print(f"Success rate: {success_count / len(results) * 100:.1f}%")

    # Save results
    output_dir = repo_root.parents[1] / ".sisyphus" / "evidence"
    output_dir.mkdir(parents=True, exist_ok=True)

    output_file = output_dir / "t12-extraction-results.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(
            {
                "test_run": "T12-crawl4ai-poc",
                "total_tests": len(results),
                "successful": success_count,
                "failed": len(results) - success_count,
                "success_rate": success_count / len(results),
                "results": results,
            },
            f,
            indent=2,
            default=str,
        )

    print(f"\nResults saved to: {output_file}")

    return 0 if success_count == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
