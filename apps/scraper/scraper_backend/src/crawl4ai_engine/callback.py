"""Callback adapter for Crawl4AI results.

Transforms crawl4ai outputs into the existing BayState callback payload shape,
adds idempotency metadata, and signs payloads with HMAC-SHA256.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Final

import httpx

from ...validation.schemas import validate_callback_payload, validate_scraped_result


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _canonical_json(payload: Mapping[str, object]) -> str:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True)


@dataclass(frozen=True)
class Crawl4AICallbackRecord:
    """Normalized, per-SKU callback record for crawl4ai output."""

    job_id: str
    vendor: str
    sku: str
    success: bool
    data: dict[str, object]
    error: str | None
    scraped_at: str

    def to_dict(self) -> dict[str, object]:
        return {
            "job_id": self.job_id,
            "vendor": self.vendor,
            "sku": self.sku,
            "success": self.success,
            "data": self.data,
            "error": self.error,
            "scraped_at": self.scraped_at,
        }


def make_idempotency_key(job_id: str, vendor: str, sku: str, scraped_at: str) -> str:
    """Create deterministic idempotency key for a single callback record."""
    fingerprint = f"{job_id}|{vendor}|{sku}|{scraped_at}"
    return hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()


def sign_payload(body: str, secret: str) -> str:
    """Generate HMAC signature for callback body.

    Returns a prefixed value in the common webhook format:
    `sha256=<hex_digest>`.
    """
    digest = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def transform_result(
    *,
    job_id: str,
    vendor: str,
    sku: str,
    result: Mapping[str, object],
    scraped_at: str | None = None,
) -> Crawl4AICallbackRecord:
    """Transform a single crawl4ai result entry to callback record format."""
    result_scraped_at = scraped_at or str(result.get("scraped_at") or _utcnow_iso())
    success = bool(result.get("success", True))
    error = result.get("error")
    if error is not None:
        error = str(error)

    data = {key: value for key, value in result.items() if key not in {"success", "error", "sku", "vendor", "scraped_at"}}

    return Crawl4AICallbackRecord(
        job_id=job_id,
        vendor=vendor,
        sku=sku,
        success=success,
        data=data,
        error=error,
        scraped_at=result_scraped_at,
    )


def build_scraper_callback_payload(
    *,
    job_id: str,
    runner_name: str,
    vendor: str,
    records: list[Crawl4AICallbackRecord],
    lease_token: str | None = None,
    status: str = "completed",
    logs: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    """Build payload matching BayStateApp callback contract.

    Output shape aligns with `lib/scraper-callback/contract.ts` in BayStateApp.
    """
    data_by_sku: dict[str, dict[str, object]] = {}
    for record in records:
        data_by_sku[record.sku] = {
            vendor: {
                **record.data,
                "scraped_at": record.scraped_at,
                "success": record.success,
                "error": record.error,
            }
        }

    results_payload: dict[str, object] = {
        "skus_processed": len(records),
        "scrapers_run": [vendor],
        "data": data_by_sku,
    }

    payload: dict[str, object] = {
        "job_id": job_id,
        "status": status,
        "runner_name": runner_name,
        "results": results_payload,
    }

    if logs:
        results_payload["logs"] = logs

    if lease_token:
        payload["lease_token"] = lease_token

    if status == "failed":
        failures = [r.error for r in records if r.error]
        payload["error_message"] = failures[0] if failures else "crawl4ai callback failed"

    return payload


def build_callback_headers(
    *,
    body: str,
    api_key: str,
    webhook_secret: str,
    idempotency_key: str,
) -> dict[str, str]:
    """Build callback headers including auth, signature, and idempotency."""
    return {
        "Content-Type": "application/json",
        "X-API-Key": api_key,
        "X-Scraper-Signature": sign_payload(body, webhook_secret),
        "Idempotency-Key": idempotency_key,
    }


class CallbackClient:
    """Small HTTP client for posting callback payloads."""

    def __init__(
        self,
        *,
        callback_url: str,
        api_key: str,
        webhook_secret: str,
        timeout_seconds: float = 30.0,
    ) -> None:
        self._callback_url: Final[str] = callback_url
        self._api_key: Final[str] = api_key
        self._webhook_secret: Final[str] = webhook_secret
        self._timeout_seconds: Final[float] = timeout_seconds

    def _validate_payload(self, payload: Mapping[str, object]) -> dict[str, Any]:
        """Validate callback payload using Pandera schemas.

        Performs two-level validation:
        1. Validates overall callback payload structure
        2. Validates each SKU's scraped result individually

        Times the validation operation and reports failures to Sentry.

        Args:
            payload: The callback payload to validate

        Returns:
            Dict containing validation results with keys:
            - valid: bool indicating if validation passed
            - duration_ms: float of validation time in milliseconds
            - errors: list of error messages (empty if valid)

        Raises:
            Does not raise - validation errors are captured and reported.
        """
        start_time = time.perf_counter()
        errors: list[str] = []

        try:
            # Cast to dict for validation functions
            payload_dict = dict(payload)

            # Level 1: Validate overall callback structure
            validate_callback_payload(payload_dict)

            # Level 2: Validate each SKU's data
            results = payload_dict.get("results", {})
            data_by_sku = results.get("data", {}) if isinstance(results, dict) else {}

            for sku, vendor_data in data_by_sku.items():
                if not isinstance(vendor_data, dict):
                    errors.append(f"SKU {sku}: vendor data is not a dict")
                    continue

                for vendor, scraped_data in vendor_data.items():
                    if not isinstance(scraped_data, dict):
                        errors.append(f"SKU {sku} vendor {vendor}: scraped data is not a dict")
                        continue

                    try:
                        validate_scraped_result(scraped_data)
                    except Exception as e:
                        errors.append(f"SKU {sku} vendor {vendor}: {e}")

        except Exception as e:
            errors.append(f"Payload validation failed: {e}")

        duration_ms = (time.perf_counter() - start_time) * 1000

        # Report to Sentry if validation failed
        if errors:
            try:
                sentry_sdk = __import__("sentry_sdk")
                with sentry_sdk.push_scope() as scope:
                    scope.set_extra("validation_duration_ms", duration_ms)
                    scope.set_extra("validation_errors", errors)
                    scope.set_extra("payload_job_id", payload.get("job_id", "unknown"))
                    sentry_sdk.capture_message(f"Callback payload validation failed: {len(errors)} errors", level="warning")
            except Exception:
                pass  # Sentry not available, continue silently

        return {
            "valid": len(errors) == 0,
            "duration_ms": duration_ms,
            "errors": errors,
        }

    def send(self, payload: Mapping[str, object], idempotency_key: str) -> httpx.Response:
        """Send callback payload and raise for HTTP failure."""
        # Check if Pandera validation is enabled
        if os.environ.get("ENABLE_PANDERA_VALIDATION", "").lower() in ("1", "true", "yes"):
            validation_result = self._validate_payload(payload)
            if not validation_result["valid"]:
                # Validation failed - errors already reported to Sentry
                # Still continue to send the payload (don't block on validation failure)
                # The validation errors are logged and the coordinator will receive
                # the data for further processing/decision
                pass

        body = _canonical_json(payload)
        headers = build_callback_headers(
            body=body,
            api_key=self._api_key,
            webhook_secret=self._webhook_secret,
            idempotency_key=idempotency_key,
        )
        with httpx.Client(timeout=self._timeout_seconds) as client:
            response = client.post(self._callback_url, content=body, headers=headers)
            _ = response.raise_for_status()
            return response


__all__ = [
    "CallbackClient",
    "Crawl4AICallbackRecord",
    "build_callback_headers",
    "build_scraper_callback_payload",
    "make_idempotency_key",
    "sign_payload",
    "transform_result",
]
