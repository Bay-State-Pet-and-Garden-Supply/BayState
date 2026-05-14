#!/usr/bin/env python3
"""
TDD test loop for scraper configs.

Runs runner.py --test-mode, parses results, and on failure, re-inspects with
playwright-cli, applies auto-fixes to the YAML, and retries.

Usage:
    python run_test_loop.py --config scrapers/configs/vendor.yaml --max-retries 5
    python run_test_loop.py --config scrapers/configs/vendor.yaml --sku SKU123 --max-retries 3
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import yaml


def _scraper_cwd() -> Path:
    """Return the apps/scraper directory."""
    return Path(__file__).parent.parent.parent.parent / "apps" / "scraper"


def run_test_mode(config_path: str, sku: str | None = None) -> dict:
    """Run runner.py --test-mode and parse results."""
    env = os.environ.copy()
    env.setdefault("USE_YAML_CONFIGS", "true")

    cmd = [
        sys.executable, "runner.py",
        "--local",
        "--config", config_path,
        "--test-mode",
    ]
    if sku:
        cmd.extend(["--sku", sku])

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=str(_scraper_cwd()),
        env=env,
    )

    output = result.stdout + "\n" + result.stderr

    passed = []
    failed = []
    failures = []

    # Match: "SKU: XXX - ✅ PASSED" or "SKU: XXX - ❌ FAILED"
    sku_pattern = re.compile(r"SKU:\s+(\S+)\s+-\s+([✅❌])\s+(PASSED|FAILED)")
    for match in sku_pattern.finditer(output):
        sku_id, _, status = match.groups()
        if status == "PASSED":
            passed.append(sku_id)
        else:
            failed.append(sku_id)

    # Parse failure details — field names may contain spaces and punctuation
    failure_block_pattern = re.compile(
        r"SKU:\s+(\S+)\s+-\s+❌\s+FAILED\n"
        r"(?:.*\n)*?"
        r"\s+Failures:\n"
        r"((?:\s+-\s+[^:]+:\n\s+Expected:.*\n\s+Actual:.*\n)+)",
        re.MULTILINE,
    )
    for match in failure_block_pattern.finditer(output):
        sku_id = match.group(1)
        block = match.group(2)
        field_pattern = re.compile(
            r"\s+-\s+([^:]+):\n"
            r"\s+Expected:\s+(.*)\n"
            r"\s+Actual:\s+(.*)\n"
        )
        for fmatch in field_pattern.finditer(block):
            field, expected, actual = fmatch.groups()
            failures.append({
                "sku": sku_id,
                "field": field.strip(),
                "expected": expected.strip().strip('"'),
                "actual": actual.strip().strip('"'),
            })

    # Try to parse JSON output if present
    json_results = {}
    json_match = re.search(r'\{[\s\S]*"test_type"[\s\S]*\}', output)
    if json_match:
        try:
            json_results = json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    return {
        "exit_code": result.returncode,
        "passed": passed,
        "failed": failed,
        "failures": failures,
        "json_results": json_results,
        "raw_output": output,
    }


def _escape_js_string(s: str) -> str:
    """Escape a string for safe insertion into a JS string literal."""
    return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")


def get_navigate_url(config: dict, sku: str) -> str | None:
    """Extract the product URL template from the workflow and substitute the SKU."""
    workflows = config.get("workflows", [])
    for step in workflows:
        if step.get("action") == "navigate":
            url_template = step.get("params", {}).get("url", "")
            # Substitute template variables
            url = url_template.replace("{{sku}}", sku).replace("{sku}", sku)
            url = url.replace("{{base_url}}", config.get("base_url", ""))
            url = url.replace("{base_url}", config.get("base_url", ""))
            return url
    return None


def inspect_selector(url: str, selector: str) -> dict:
    """Use playwright-cli to inspect a failing selector."""
    print(f"  Inspecting selector: {selector}")

    subprocess.run(["playwright-cli", "open", url], capture_output=True)
    time.sleep(1)

    safe_selector = _escape_js_string(selector)

    count_script = f"document.querySelectorAll('{safe_selector}').length"
    count_result = subprocess.run(
        ["playwright-cli", "--raw", "eval", count_script],
        capture_output=True, text=True,
    )

    html_script = f"document.querySelector('{safe_selector}')?.outerHTML || ''"
    html_result = subprocess.run(
        ["playwright-cli", "--raw", "eval", html_script],
        capture_output=True, text=True,
    )

    text_script = f"document.querySelector('{safe_selector}')?.textContent?.trim() || ''"
    text_result = subprocess.run(
        ["playwright-cli", "--raw", "eval", text_script],
        capture_output=True, text=True,
    )

    # Try data-* attributes as alternative
    data_attrs_script = (
        f"const el = document.querySelector('{safe_selector}'); "
        f"el ? JSON.stringify([...el.attributes].map(a => `${{a.name}}=${{a.value}}`).slice(0,5)) : '[]'"
    )
    attrs_result = subprocess.run(
        ["playwright-cli", "--raw", "eval", data_attrs_script],
        capture_output=True, text=True,
    )

    subprocess.run(["playwright-cli", "close"], capture_output=True)

    try:
        count = int(count_result.stdout.strip())
    except ValueError:
        count = 0

    attrs = []
    try:
        attrs = json.loads(attrs_result.stdout.strip() or "[]")
    except json.JSONDecodeError:
        pass

    return {
        "count": count,
        "html": html_result.stdout.strip()[:500],
        "text": text_result.stdout.strip()[:200],
        "attributes": attrs,
    }


def apply_auto_fix(config: dict, failure: dict, selector_info: dict) -> dict | None:
    """
    Attempt to automatically fix the config for a given failure.
    Returns the updated config dict, or None if no fix could be applied.
    """
    field_name = failure["field"]
    actual = failure["actual"]
    count = selector_info["count"]

    selectors = config.get("selectors", [])
    sel_idx = None
    for i, sel in enumerate(selectors):
        if sel.get("name") == field_name:
            sel_idx = i
            break

    if sel_idx is None:
        return None

    sel = selectors[sel_idx]
    modified = False

    # Rule 1: Selector matches 0 elements → promote a fallback to primary
    if count == 0:
        fallbacks = sel.get("fallback_selectors", [])
        if fallbacks:
            new_primary = fallbacks[0]
            print(f"    🔄 Auto-fix: promoting fallback '{new_primary}' to primary selector for '{field_name}'")
            sel["selector"] = new_primary
            sel["fallback_selectors"] = fallbacks[1:] + [sel["selector"]]  # old primary becomes last fallback
            modified = True
        else:
            # Try a generic fallback
            generic = _generic_fallback(field_name)
            if generic:
                print(f"    🔄 Auto-fix: adding generic fallback '{generic}' for '{field_name}'")
                sel["fallback_selectors"] = [generic]
                modified = True

    # Rule 2: Element exists but text is empty → try common data-* attributes
    if count > 0 and actual == "":
        for attr in selector_info.get("attributes", []):
            if attr.startswith("data-") and "=" in attr:
                data_attr = attr.split("=")[0]
                if sel.get("attribute") != data_attr:
                    print(f"    🔄 Auto-fix: switching attribute from '{sel.get('attribute')}' to '{data_attr}' for '{field_name}'")
                    sel["attribute"] = data_attr
                    modified = True
                    break
        if not modified and sel.get("attribute") == "text":
            print(f"    🔄 Auto-fix: switching attribute from 'text' to 'innerText' for '{field_name}'")
            sel["attribute"] = "innerText"
            modified = True

    # Rule 3: Value has extra whitespace → add/adjust transform_value step
    if actual != "" and actual != failure["expected"]:
        stripped = actual.strip()
        if stripped == failure["expected"]:
            _ensure_transform(config, field_name, "strip")
            print(f"    🔄 Auto-fix: adding transform_value(strip) for '{field_name}'")
            modified = True
        elif "Visit the" in actual and field_name == "Brand":
            _ensure_transform(config, field_name, "regex_extract", pattern="Visit the (.+) Store")
            print(f"    🔄 Auto-fix: adding regex_extract transform for '{field_name}'")
            modified = True

    if modified:
        config["selectors"] = selectors
        return config
    return None


def _generic_fallback(field_name: str) -> str | None:
    """Return a generic fallback selector for a field."""
    fallbacks = {
        "Name": "h1",
        "Brand": ".brand",
        "Price": ".price",
        "Image URLs": "img",
        "Description": ".description",
        "UPC": "[data-upc]",
        "ItemNumber": "[data-sku]",
    }
    return fallbacks.get(field_name)


def _ensure_transform(config: dict, field: str, transform_type: str, **kwargs):
    """Ensure a transform_value step exists for the given field."""
    workflows = config.get("workflows", [])
    # Check if transform already exists
    for step in workflows:
        if step.get("action") == "transform_value":
            params = step.get("params", {})
            if params.get("field") == field:
                return  # already exists

    # Add transform step after the last extract action
    insert_idx = len(workflows)
    for i, step in enumerate(workflows):
        if step.get("action") in ("extract", "extract_and_transform"):
            insert_idx = i + 1

    transform_step = {
        "action": "transform_value",
        "name": f"Clean {field}",
        "params": {
            "field": field,
            "transformations": [{"type": transform_type, **kwargs}],
        },
    }
    workflows.insert(insert_idx, transform_step)
    config["workflows"] = workflows


def run_loop(config_path: str, max_retries: int = 5, sku: str | None = None) -> int:
    """Run the TDD loop."""
    config_path = Path(config_path)
    if not config_path.exists():
        print(f"ERROR: Config not found: {config_path}")
        return 2

    with open(config_path) as f:
        config = yaml.safe_load(f)

    base_url = config.get("base_url", "")
    test_skus = config.get("test_skus", [])
    if sku:
        test_skus = [sku]
    elif not test_skus:
        assertions = config.get("test_assertions", [])
        test_skus = [a["sku"] for a in assertions if a.get("sku")]

    for attempt in range(1, max_retries + 1):
        print(f"\n{'='*50}")
        print(f"Test attempt {attempt}/{max_retries}")
        print(f"{'='*50}")

        result = run_test_mode(str(config_path), sku)

        print(f"Passed: {len(result['passed'])}, Failed: {len(result['failed'])}")

        if not result["failed"]:
            print(f"\n✅ All tests passed! ({len(result['passed'])} SKUs)")
            return 0

        any_fix_applied = False

        for failure in result["failures"]:
            sku_id = failure["sku"]
            field = failure["field"]
            expected = failure["expected"]
            actual = failure["actual"]

            print(f"\n❌ Failure: SKU={sku_id}, Field={field}")
            print(f"   Expected: '{expected}'")
            print(f"   Actual:   '{actual}'")

            selectors = config.get("selectors", [])
            selector_str = None
            for sel in selectors:
                if sel.get("name") == field:
                    selector_str = sel.get("selector")
                    break

            url = get_navigate_url(config, sku_id)
            if not url:
                url = f"{base_url}/product/{sku_id}"
                print(f"   (Using fallback URL pattern: {url})")

            if selector_str:
                info = inspect_selector(url, selector_str)
                print(f"   Selector count: {info['count']}")
                print(f"   Selector text:  '{info['text']}'")

                fixed_config = apply_auto_fix(config, failure, info)
                if fixed_config:
                    config = fixed_config
                    any_fix_applied = True
                else:
                    print(f"   ⚠️  No auto-fix available for this failure.")

        if any_fix_applied:
            # Write updated config back
            with open(config_path, "w") as f:
                yaml.dump(config, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
            print(f"\n📝 Updated config written: {config_path}")
            print("   Retrying with fixed config...")
            time.sleep(1)
        elif attempt < max_retries:
            print(f"\n⏳ No auto-fixes applied. Retrying in 2 seconds...")
            time.sleep(2)
        else:
            print(f"\n⚠️  Max retries ({max_retries}) reached. Manual intervention needed.")
            print("   Review the config and fix selectors manually.")

    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="TDD test loop for scraper configs")
    parser.add_argument("--config", required=True, help="Path to YAML config file")
    parser.add_argument("--max-retries", type=int, default=5, help="Max retry attempts")
    parser.add_argument("--sku", help="Specific SKU to test")
    args = parser.parse_args()

    return run_loop(args.config, args.max_retries, args.sku)


if __name__ == "__main__":
    sys.exit(main())
