from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import cast

import httpx

CallbackSource = dict[str, object]
CallbackScraperMap = dict[str, CallbackSource]
CallbackDataMap = dict[str, CallbackScraperMap]


class CallbackDeliveryError(Exception):
    pass


class CallbackDelivery:
    callback_url: str
    api_key: str
    runner_name: str
    scraper_name: str
    max_retries: int
    timeout_seconds: float

    def __init__(
        self,
        callback_url: str,
        api_key: str,
        runner_name: str,
        scraper_name: str,
        max_retries: int = 3,
        timeout_seconds: float = 60.0,
    ) -> None:
        self.callback_url = callback_url
        self.api_key = api_key
        self.runner_name = runner_name
        self.scraper_name = scraper_name
        self.max_retries = max_retries
        self.timeout_seconds = timeout_seconds

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _as_dict(value: object) -> dict[str, object] | None:
        if isinstance(value, dict):
            normalized: dict[str, object] = {}
            source = cast(dict[object, object], value)
            for key, nested_value in source.items():
                if isinstance(key, str):
                    normalized[key] = nested_value
            return normalized
        return None

    def _generate_signature(self, payload: bytes) -> str:
        return hmac.new(self.api_key.encode("utf-8"), payload, hashlib.sha256).hexdigest()

    def _with_scraped_at(self, source: dict[str, object]) -> CallbackSource:
        normalized: CallbackSource = dict(source)
        if "scraped_at" not in normalized:
            normalized["scraped_at"] = self._now_iso()
        return normalized

    def transform_results(self, raw_results: object) -> CallbackDataMap:
        transformed: CallbackDataMap = {}

        raw_dict = self._as_dict(raw_results)
        if raw_dict is not None:
            nested_data = self._as_dict(raw_dict.get("data"))
            if nested_data is not None:
                for sku, sku_payload in nested_data.items():
                    payload_dict = self._as_dict(sku_payload)
                    if payload_dict is None:
                        continue
                    transformed[sku] = {
                        self.scraper_name: self._with_scraped_at(payload_dict),
                    }
                return transformed

            all_values_dict = all(self._as_dict(value) is not None for value in raw_dict.values())
            if all_values_dict:
                for sku, sku_payload in raw_dict.items():
                    payload_dict = self._as_dict(sku_payload)
                    if payload_dict is None:
                        continue
                    transformed[sku] = {
                        self.scraper_name: self._with_scraped_at(payload_dict),
                    }
                return transformed

            return transformed

        if isinstance(raw_results, list):
            entries = cast(list[object], raw_results)
            for entry in entries:
                entry_dict = self._as_dict(entry)
                if entry_dict is None:
                    continue

                sku_value = entry_dict.get("sku")
                if not isinstance(sku_value, str) or not sku_value:
                    alt_sku = entry_dict.get("SKU")
                    if isinstance(alt_sku, str) and alt_sku:
                        sku_value = alt_sku
                    else:
                        continue

                explicit_data = self._as_dict(entry_dict.get("data"))
                if explicit_data is not None:
                    source_payload = self._with_scraped_at(explicit_data)
                else:
                    source_payload: CallbackSource = {}
                    for key, value in entry_dict.items():
                        if key in {"sku", "SKU", "url", "success", "error", "markdown", "html", "data"}:
                            continue
                        source_payload[key] = value
                    source_payload = self._with_scraped_at(source_payload)

                transformed[sku_value] = {self.scraper_name: source_payload}

        return transformed

    def build_payload(
        self,
        job_id: str,
        transformed_results: CallbackDataMap,
        status: str = "completed",
        lease_token: str | None = None,
        error_message: str | None = None,
    ) -> dict[str, object]:
        payload: dict[str, object] = {
            "job_id": job_id,
            "status": status,
            "runner_name": self.runner_name,
            "results": {
                "skus_processed": len(transformed_results),
                "scrapers_run": [self.scraper_name],
                "data": transformed_results,
            },
        }

        if lease_token is not None:
            payload["lease_token"] = lease_token
        if error_message is not None:
            payload["error_message"] = error_message

        return payload

    def _headers(self, payload_bytes: bytes, idempotency_key: str | None = None) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": self.api_key,
            "X-Signature": self._generate_signature(payload_bytes),
        }
        if idempotency_key is not None:
            headers["X-Idempotency-Key"] = idempotency_key
        return headers

    @staticmethod
    def _is_retryable_http_error(error: httpx.HTTPError) -> bool:
        if isinstance(error, (httpx.NetworkError, httpx.TimeoutException)):
            return True
        if isinstance(error, httpx.HTTPStatusError):
            status_code = error.response.status_code
            return status_code == 429 or 500 <= status_code < 600
        return False

    async def post_payload(self, payload: dict[str, object], idempotency_key: str | None = None) -> None:
        payload_bytes = json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")
        headers = self._headers(payload_bytes, idempotency_key=idempotency_key)

        delay_seconds = 1.0
        last_error: httpx.HTTPError | None = None

        for attempt in range(self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                    response = await client.post(self.callback_url, content=payload_bytes, headers=headers)
                    _ = response.raise_for_status()
                    return
            except httpx.HTTPError as error:
                last_error = error
                if attempt >= self.max_retries or not self._is_retryable_http_error(error):
                    break
                await asyncio.sleep(delay_seconds)
                delay_seconds *= 2

        raise CallbackDeliveryError("Callback delivery failed") from last_error

    async def send_callback(
        self,
        job_id: str,
        crawl4ai_results: object,
        idempotency_key: str | None = None,
        lease_token: str | None = None,
        error_message: str | None = None,
    ) -> dict[str, object]:
        status = "failed" if error_message is not None else "completed"
        transformed = self.transform_results(crawl4ai_results)
        payload = self.build_payload(
            job_id=job_id,
            transformed_results=transformed,
            status=status,
            lease_token=lease_token,
            error_message=error_message,
        )
        await self.post_payload(payload, idempotency_key=idempotency_key)
        return payload
