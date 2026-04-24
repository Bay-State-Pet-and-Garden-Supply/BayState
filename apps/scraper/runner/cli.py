from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any

from core.api_client import ConnectionError
from core.api_client import JobConfig
from core.api_client import ScraperAPIClient
from core.api_client import ScraperConfig
from utils.debugging.config_validator import (
    build_local_validation_payload,
    ConfigValidator,
    format_local_validation_payload,
    LocalRuntimePreflight,
    validate_local_runtime_requirements,
)
from utils.logging_handlers import JobLoggingSession
from utils.structured_logging import setup_structured_logging

from runner.chunk_mode import run_chunk_worker_mode
from runner.full_mode import run_full_mode
from runner.realtime_mode import run_realtime_mode

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a scrape job from the API")
    parser.add_argument("--job-id", help="Job ID to execute")
    parser.add_argument("--api-url", help="API base URL (or set SCRAPER_API_URL)")
    parser.add_argument("--runner-name", default=os.environ.get("RUNNER_NAME", "unknown"))
    parser.add_argument(
        "--mode",
        choices=["full", "chunk_worker", "realtime"],
        default="full",
        help="Execution mode: 'full', 'chunk_worker', or 'realtime'",
    )
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")

    # Local mode flags
    parser.add_argument("--local", action="store_true", help="Run in local mode (no API server required)")
    parser.add_argument("--config", help="Path to local YAML scraper config (requires --local)")
    parser.add_argument("--sku", help="SKU or comma-separated SKUs to scrape (requires --local)")
    parser.add_argument("--output", help="Output file path for results JSON (default: stdout)")
    parser.add_argument("--headless", action="store_true", default=True, help="Run browser headless (default: true)")
    parser.add_argument("--no-headless", action="store_true", help="Run browser in visible mode for debugging")
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate local YAML config and exit (or preflight before local execution)",
    )
    parser.add_argument(
        "--strict-validate",
        action="store_true",
        help="Treat config validation warnings as errors in local validation mode",
    )
    parser.add_argument(
        "--test-mode",
        action="store_true",
        default=False,
        help="Run in test mode using test_assertions from config instead of test_skus",
    )

    args = parser.parse_args()

    if args.validate and not args.local:
        parser.error("--validate requires --local")

    if args.strict_validate and not (args.local or args.validate):
        parser.error("--strict-validate is only supported with local config validation")

    if args.local:
        if not args.config:
            parser.error("--config is required in --local mode")
    else:
        if args.mode in {"full", "chunk_worker"} and not args.job_id:
            parser.error("--job-id is required unless --mode realtime or --local")

    return args


def _log_local_validation_summary(preflight: LocalRuntimePreflight) -> None:
    if preflight.uses_login:
        logger.info(
            "[Local Validate] Login-enabled config detected",
            extra={
                "phase": "local-validate",
                "details": {
                    "credential_refs": preflight.credential_refs,
                    "credential_sources": preflight.credential_sources,
                    "missing_credential_refs": preflight.missing_credential_refs,
                },
            },
        )


def validate_local_config(args: argparse.Namespace) -> int:
    config_path = Path(args.config)
    validator = ConfigValidator(strict=args.strict_validate)
    validation_result = validator.validate_file(config_path)
    preflight = validate_local_runtime_requirements(
        config_path,
        strict=args.strict_validate,
        validation_result=validation_result,
    )
    payload = build_local_validation_payload(validation_result, preflight)

    print(format_local_validation_payload(payload))
    print()
    print(json.dumps(payload, indent=2))
    return 0 if payload["valid"] else 1


def run_local_mode(args: argparse.Namespace) -> None:
    """Execute a scraper locally against a YAML config without requiring an API server."""
    from datetime import datetime
    from scrapers.parser.yaml_parser import ScraperConfigParser

    # Auto-enable local YAML loading
    os.environ["USE_YAML_CONFIGS"] = "true"

    config_path = args.config
    if not os.path.isfile(config_path):
        logger.error(f"Config file not found: {config_path}")
        sys.exit(1)

    validator = ConfigValidator(strict=args.strict_validate)
    validation_result = validator.validate_file(config_path)
    preflight = validate_local_runtime_requirements(
        config_path,
        strict=args.strict_validate,
        validation_result=validation_result,
    )
    if not validation_result.valid or not preflight.valid:
        payload = build_local_validation_payload(validation_result, preflight)
        logger.error("[Local] Config validation failed")
        print(format_local_validation_payload(payload))
        print()
        print(json.dumps(payload, indent=2))
        sys.exit(1)

    _log_local_validation_summary(preflight)

    if args.validate:
        payload = build_local_validation_payload(validation_result, preflight)
        print(format_local_validation_payload(payload))
        print()
        print(json.dumps(payload, indent=2))
        return

    parser = ScraperConfigParser()
    try:
        config = parser.load_from_file(config_path)
    except Exception as e:
        logger.error(f"Failed to load config: {e}")
        sys.exit(1)

    logger.info(f"[Local] Loaded config: {config.name} ({config_path})")

    # Determine SKUs: --sku flag > test_skus from config
    if args.sku:
        skus = [s.strip() for s in args.sku.split(",") if s.strip()]
    elif config.test_skus:
        skus = list(config.test_skus)
        logger.info(f"[Local] No --sku provided, using {len(skus)} test_skus from config")
    else:
        logger.error("[Local] No SKUs: pass --sku or define test_skus in the YAML config")
        sys.exit(1)

    logger.info(f"[Local] SKUs to scrape: {skus}")

    # Build a minimal JobConfig for the runner
    job_id = f"local_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    scraper_cfg = ScraperConfig(
        name=config.name,
        display_name=getattr(config, "display_name", None),
        base_url=config.base_url,
        search_url_template=getattr(config, "search_url_template", None),
        selectors=[s.model_dump() if hasattr(s, "model_dump") else s for s in config.selectors],
        options={
            "workflows": [w.model_dump() if hasattr(w, "model_dump") else w for w in config.workflows],
            "timeout": config.timeout,
            "use_stealth": config.use_stealth,
        },
        test_skus=list(config.test_skus) if config.test_skus else [],
        retries=config.retries if config.retries is not None else 2,
        validation=config.validation.model_dump() if hasattr(getattr(config, "validation", None), "model_dump") else getattr(config, "validation", None),
        login=config.login.model_dump() if hasattr(getattr(config, "login", None), "model_dump") else getattr(config, "login", None),
        credential_refs=list(config.credential_refs) if config.credential_refs else [],
    )

    # Check for API configuration
    api_url = os.environ.get("SCRAPER_API_URL")
    api_key = os.environ.get("SCRAPER_API_KEY", "")

    if not api_url:
        logger.info("[Local] SCRAPER_API_URL not set, will try Supabase/env fallback for credentials")
    if not api_key:
        logger.warning("[Local] SCRAPER_API_KEY not set - credential fetching may fail")

    credential_client = ScraperAPIClient(
        api_url=api_url,
        api_key=api_key,
        runner_name="local-cli",
    )

    job_config = JobConfig(
        job_id=job_id,
        skus=skus,
        scrapers=[scraper_cfg],
        test_mode=True,
        max_workers=1,
    )

    from runner import run_job, settings

    settings.browser_settings["headless"] = not args.no_headless

    logger.info(f"[Local] Starting local scrape job: {job_id}")
    try:
        with JobLoggingSession(
            job_id=job_id,
            runner_name="local-cli",
            api_client=credential_client,
        ) as job_logging:
            logger.info(
                "[Local] Local job validation complete",
                extra={
                    "job_id": job_id,
                    "runner_name": "local-cli",
                    "phase": "local-validate",
                    "details": {
                        "config_path": str(config_path),
                        "config_name": config.name,
                        "uses_login": preflight.uses_login,
                        "credential_refs": preflight.credential_refs,
                        "credential_sources": preflight.credential_sources,
                        "missing_credential_refs": preflight.missing_credential_refs,
                    },
                    "flush_immediately": True,
                },
            )
            results = run_job(
                job_config,
                runner_name="local-cli",
                api_client=credential_client,
                job_logging=job_logging,
            )
    except Exception as e:
        logger.exception(f"[Local] Job failed: {e}")
        sys.exit(1)

    output_json = json.dumps(results, indent=2, default=str)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
        logger.info(f"[Local] Results written to {args.output}")
    elif not args.test_mode:
        print(output_json)

    if args.test_mode:
        test_payload = build_test_mode_payload(config, results)
        
        print("\n" + "="*50)
        print(f" TEST MODE SUMMARY: {config.name}")
        print("="*50)
        
        total = len(test_payload["assertion_results"])
        passed = sum(1 for r in test_payload["assertion_results"] if r["passed"])
        
        for result in test_payload["assertion_results"]:
            status = "✅ PASSED" if result["passed"] else "❌ FAILED"
            print(f"\nSKU: {result['sku']} - {status}")
            
            if not result["passed"]:
                print("  Failures:")
                expected = result["expected"]
                actual = result["actual"]
                for field, exp_val in expected.items():
                    act_val = actual.get(field)
                    if exp_val != act_val:
                        print(f"    - {field}:")
                        print(f"        Expected: {exp_val}")
                        print(f"        Actual:   {act_val}")
        
        print("\n" + "="*50)
        print(f" FINAL SCORE: {passed}/{total} ({passed/total*100:.1f}%)")
        print("="*50 + "\n")
        
        if passed < total:
            sys.exit(1)


class TestModeResult:
    def __init__(self, skus: list[str]):
        self.skus = skus


def _select_test_mode_skus(config: Any, cli_sku: str | None) -> list[str]:
    if cli_sku:
        return [s.strip() for s in cli_sku.split(",") if s.strip()]

    test_assertions = getattr(config, "test_assertions", None)
    if test_assertions:
        return [a.sku for a in test_assertions if hasattr(a, "sku") and a.sku]

    test_skus = getattr(config, "test_skus", None)
    if test_skus:
        return list(test_skus)

    return []


def run_test_mode(args: argparse.Namespace, _config: Any = None) -> TestModeResult:
    from scrapers.parser.yaml_parser import ScraperConfigParser

    os.environ["USE_YAML_CONFIGS"] = "true"

    if _config is not None:
        config = _config
    else:
        config_path = args.config
        if not os.path.isfile(config_path):
            logger.error(f"Config file not found: {config_path}")
            sys.exit(1)

        validator = ConfigValidator(strict=args.strict_validate)
        validation_result = validator.validate_file(config_path)
        preflight = validate_local_runtime_requirements(
            config_path,
            strict=args.strict_validate,
            validation_result=validation_result,
        )
        if not validation_result.valid or not preflight.valid:
            payload = build_local_validation_payload(validation_result, preflight)
            logger.error("[Test Mode] Config validation failed")
            print(format_local_validation_payload(payload))
            print()
            print(json.dumps(payload, indent=2))
            sys.exit(1)

        _log_local_validation_summary(preflight)

        parser = ScraperConfigParser()
        try:
            config = parser.load_from_file(config_path)
        except Exception as e:
            logger.error(f"Failed to load config: {e}")
            sys.exit(1)

        logger.info(f"[Test Mode] Loaded config: {config.name} ({config_path})")

    skus = _select_test_mode_skus(config, args.sku)

    if skus and getattr(config, "test_assertions", None) and not args.sku:
        logger.info(f"[Test Mode] Using {len(skus)} SKUs from test_assertions")
    elif skus and getattr(config, "test_skus", None) and not getattr(config, "test_assertions", None) and not args.sku:
        logger.info(f"[Test Mode] No test_assertions, falling back to {len(skus)} test_skus")

    if not skus:
        logger.error("[Test Mode] No SKUs: define test_assertions or test_skus in the YAML config")
        sys.exit(1)

    logger.info(f"[Test Mode] SKUs to test: {skus}")

    return TestModeResult(skus=skus)


def build_test_mode_payload(
    config: Any,
    results: dict[str, Any],
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "test_type": "qa",
        "scraper_name": getattr(config, "name", "unknown"),
        "results": results,
        "assertion_results": [],
    }

    test_assertions = getattr(config, "test_assertions", None) or []
    # run_job returns a dict with "data" containing {sku: result_dict}
    results_data = results.get("data", {})
    
    if os.environ.get("DEBUG_TEST_MODE") == "true":
        print(f"DEBUG: results_data keys: {list(results_data.keys())}")
    
    for assertion in test_assertions:
        if not hasattr(assertion, "sku"):
            continue

        sku = assertion.sku
        expected = getattr(assertion, "expected", {}) or {}
        sku_data = results_data.get(sku, {})
        
        # Data is nested by scraper name: {sku: {scraper_name: data}}
        scraper_name = getattr(config, "name", "unknown")
        actual = sku_data.get(scraper_name, {})
        
        if not actual and sku_data:
            # Fallback: if scraper name not found but only one scraper ran, use that
            if len(sku_data) == 1:
                actual = list(sku_data.values())[0]

        field_results = []
        for field_name, expected_value in expected.items():
            actual_value = actual.get(field_name)
            field_results.append(
                {
                    "field": field_name,
                    "expected": expected_value,
                    "actual": actual_value,
                    "passed": actual_value == expected_value,
                }
            )

        all_passed = all(f["passed"] for f in field_results) if field_results else True

        payload["assertion_results"].append(
            {
                "sku": sku,
                "expected": expected,
                "actual": {f["field"]: f["actual"] for f in field_results},
                "passed": all_passed,
            }
        )

    return payload


def main() -> None:
    args = parse_args()
    setup_structured_logging(debug=args.debug)

    if args.local:
        if args.validate:
            sys.exit(validate_local_config(args))
        if args.test_mode:
            test_info = run_test_mode(args)
            args.sku = ",".join(test_info.skus)
        
        run_local_mode(args)
        return

    api_url = args.api_url or os.environ.get("SCRAPER_API_URL")
    if not api_url:
        logger.error("No API URL provided. Set --api-url or SCRAPER_API_URL")
        sys.exit(1)

    client = ScraperAPIClient(api_url=api_url, runner_name=args.runner_name)

    logger.info(f"[Runner] Performing pre-flight health check against {api_url}")
    try:
        client.health_check()
    except ConnectionError as e:
        logger.error(f"[Runner] Pre-flight health check failed: {e}")
        sys.exit(1)

    if args.mode == "realtime":
        asyncio.run(run_realtime_mode(client, args.runner_name))
    elif args.mode == "chunk_worker":
        run_chunk_worker_mode(client, args.job_id, args.runner_name)
    else:
        run_full_mode(client, args.job_id, args.runner_name)
