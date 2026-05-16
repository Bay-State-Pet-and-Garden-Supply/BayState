"""
HTTP API client for communicating with BayStateApp coordinator.

Uses simple API Key authentication - no token refresh, no password management.
Runners authenticate with a single API key issued from the admin panel.
"""

from __future__ import annotations

import json
import logging
import os
import time
import hmac
import hashlib
import base64
from dataclasses import dataclass
from typing import Any

import httpx
# Phase 10: parser moved to legacy/ — enrichment path uses /api/internal/scraper-configs API
# from scrapers.parser.yaml_parser import ScraperConfigParser
from core.version import (
    get_runner_build_id,
    get_runner_build_sha,
    get_runner_release_channel,
)

logger = logging.getLogger(__name__)

# Retry configuration constants
DEFAULT_MAX_RETRIES = 3
RETRY_BACKOFF_MULTIPLIER = 2  # Exponential backoff: 1s, 2s, 4s, 8s
RETRY_INITIAL_DELAY = 1.0  # Initial delay in seconds
RUNNER_BUILD_ID_HEADER = "X-BayState-Runner-Build-Id"
RUNNER_BUILD_SHA_HEADER = "X-BayState-Runner-Build-Sha"
RUNNER_RELEASE_CHANNEL_HEADER = "X-BayState-Runner-Release-Channel"
LATEST_RUNNER_BUILD_ID_HEADER = "X-BayState-Latest-Runner-Build-Id"
LATEST_RUNNER_BUILD_SHA_HEADER = "X-BayState-Latest-Runner-Build-Sha"


@dataclass
class ClaimedEnrichment:
    """Enrichment attempt claimed from the coordinator."""

    attempt_id: str
    job_id: str
    sku: str
    target_url: str
    domain: str | None = None
    model: str | None = None
    mode: str = "mixed"
    target_id: str | None = None
    job_config: dict[str, Any] | None = None
    ai_credentials: dict[str, Any] | None = None
    lease_token: str | None = None
    lease_expires_at: str | None = None
    test_mode: bool = False
    source_plan: dict[str, Any] | None = None


class AuthenticationError(Exception):
    """Raised when authentication fails."""

    pass


class ConnectionError(Exception):
    """Raised when API connection fails."""

    pass


class RunnerBuildMismatchError(Exception):
    """Raised when the coordinator rejects this runner image build."""

    def __init__(
        self,
        message: str,
        runner_build_id: str | None = None,
        latest_build_id: str | None = None,
    ):
        self.runner_build_id = runner_build_id
        self.latest_build_id = latest_build_id
        super().__init__(message)


class ConfigFetchError(Exception):
    def __init__(
        self,
        message: str,
        config_slug: str | None = None,
        schema_version: str | None = None,
        original_error: Exception | None = None,
    ):
        self.config_slug = config_slug
        self.schema_version = schema_version
        self.original_error = original_error
        super().__init__(message)


def normalize_selectors_payload(raw_selectors: Any) -> list[dict[str, Any]]:
    """Normalize selectors payload from coordinator into list format."""
    if isinstance(raw_selectors, list):
        return raw_selectors

    if raw_selectors is None or raw_selectors == {}:
        return []

    if isinstance(raw_selectors, dict):
        normalized: list[dict[str, Any]] = []
        for field_name, field_config in raw_selectors.items():
            if not isinstance(field_config, dict):
                continue

            item = dict(field_config)
            if "name" not in item and isinstance(field_name, str):
                item["name"] = field_name
            normalized.append(item)
        return normalized

    return []


def _is_retryable_error(status_code: int | None, exception: Exception) -> bool:
    """
    Determine if an error is retryable based on HTTP status code and exception type.

    Args:
        status_code: HTTP status code (None if no response received)
        exception: The exception that was raised

    Returns:
        True if the error should be retried, False otherwise
    """
    # Network errors, timeouts, and connection issues are retryable
    if isinstance(exception, (httpx.NetworkError, httpx.TimeoutException)):
        return True

    # 5xx server errors are retryable
    if status_code is not None and 500 <= status_code < 600:
        return True

    # 429 Too Many Requests (rate limiting) is retryable
    if status_code == 429:
        return True

    # 4xx client errors are NOT retryable (except 401 which is handled separately)
    if status_code is not None and 400 <= status_code < 500:
        return False

    # For any other case, be conservative and allow retry
    return True


class ScraperAPIClient:
    """
    HTTP client for communicating with the BayStateApp coordinator API.

    Handles:
    - API Key authentication (X-API-Key header)
    - Fetching job configurations and scraper configs
    - Submitting scrape results
    - Status updates and heartbeats
    - Retry logic with exponential backoff for transient failures
    """

    def __init__(
        self,
        api_url: str | None = None,
        api_key: str | None = None,
        runner_name: str | None = None,
        timeout: float = 30.0,
        max_retries: int | None = None,
    ):
        self.api_url = os.environ.get("SCRAPER_API_URL", "") if api_url is None else api_url
        self.api_key = os.environ.get("SCRAPER_API_KEY", "") if api_key is None else api_key
        self.runner_name = runner_name or os.environ.get("RUNNER_NAME", "unknown-runner")
        self.timeout = timeout
        self.max_retries = max_retries if max_retries is not None else int(os.environ.get("SCRAPER_API_MAX_RETRIES", str(DEFAULT_MAX_RETRIES)))
        self._credential_cache: dict[str, dict[str, Any]] = {}

        if not self.api_url:
            logger.warning("SCRAPER_API_URL not configured")
        if not self.api_key:
            logger.warning("SCRAPER_API_KEY not configured")

    def health_check(self) -> bool:
        """
        Perform a quick health check to verify API connectivity.

        Uses the unified _make_request logic.

        Returns:
            True if API is healthy and responding.
        """
        try:
            self._make_request("GET", "/api/health")
            logger.info(f"[API Client] Health check passed: {self.api_url}")
            return True
        except Exception as e:
            error_msg = f"Health check failed: {str(e)}"
            logger.error(f"[API Client] {error_msg}")
            raise ConnectionError(error_msg) from e

    def _get_headers(self, payload: str | None = None) -> dict[str, str]:
        """Get headers for authenticated requests."""
        if not self.api_key:
            raise AuthenticationError("SCRAPER_API_KEY not configured")

        headers = {
            "Content-Type": "application/json",
            "X-API-Key": self.api_key,
        }
        runner_build_id = get_runner_build_id()
        runner_build_sha = get_runner_build_sha()
        runner_release_channel = get_runner_release_channel()

        if runner_build_id != "unknown":
            headers[RUNNER_BUILD_ID_HEADER] = runner_build_id
        if runner_build_sha != "unknown":
            headers[RUNNER_BUILD_SHA_HEADER] = runner_build_sha
        headers[RUNNER_RELEASE_CHANNEL_HEADER] = runner_release_channel

        # Add HMAC signature if WEBHOOK_SECRET is configured and payload is present
        webhook_secret = os.environ.get("WEBHOOK_SECRET")
        if webhook_secret and payload:
            signature = hmac.new(webhook_secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
            headers["X-Payload-Signature"] = signature

        return headers

    def _make_request(
        self,
        method: str,
        endpoint: str,
        payload: str | None = None,
    ) -> dict[str, Any]:
        """
        Make an authenticated HTTP request with retry logic and exponential backoff.

        Retries on transient failures (network errors, timeouts, 5xx errors).
        Fails immediately on non-retryable errors (4xx client errors, auth failures).
        """
        url = f"{self.api_url.rstrip('/')}{endpoint}"

        last_exception: Exception | None = None
        delay = RETRY_INITIAL_DELAY

        for attempt in range(self.max_retries + 1):
            try:
                # Refresh headers in each attempt to ensure consistent state
                headers = self._get_headers(payload)
                with httpx.Client(timeout=self.timeout) as client:
                    if method.upper() == "GET":
                        response = client.get(url, headers=headers)
                    else:
                        response = client.post(url, headers=headers, content=payload)

                    # Authentication failure - not retryable
                    if response.status_code == 401:
                        raise AuthenticationError("Invalid API key")

                    if response.status_code == 426:
                        error_payload: dict[str, Any] = {}
                        try:
                            error_payload = response.json()
                        except Exception:
                            error_payload = {}

                        latest_build_id = error_payload.get("latest_build_id") or response.headers.get(LATEST_RUNNER_BUILD_ID_HEADER)
                        runner_build_id = error_payload.get("runner_build_id") or response.headers.get(RUNNER_BUILD_ID_HEADER) or get_runner_build_id()
                        latest_build_sha = error_payload.get("latest_build_sha") or response.headers.get(LATEST_RUNNER_BUILD_SHA_HEADER)
                        message = error_payload.get("message") or error_payload.get("error") or "Runner image update required"
                        if latest_build_sha:
                            message = f"{message} Latest build SHA: {latest_build_sha}."

                        raise RunnerBuildMismatchError(
                            str(message),
                            runner_build_id=str(runner_build_id) if runner_build_id else None,
                            latest_build_id=str(latest_build_id) if latest_build_id else None,
                        )

                    # Raise for status on HTTP errors
                    response.raise_for_status()
                    return response.json()

            except httpx.HTTPStatusError as e:
                status_code = e.response.status_code
                is_retryable = _is_retryable_error(status_code, e)

                if not is_retryable or attempt >= self.max_retries:
                    # Non-retryable error or max retries exceeded
                    raise

                last_exception = e
                logger.warning(
                    f"API request failed (attempt {attempt + 1}/{self.max_retries + 1}): {status_code} - {e.response.text[:200]}. Retrying in {delay:.1f}s..."
                )

            except (httpx.NetworkError, httpx.TimeoutException) as e:
                if attempt >= self.max_retries:
                    raise

                last_exception = e
                logger.warning(
                    f"API request failed (attempt {attempt + 1}/{self.max_retries + 1}): {type(e).__name__} - {str(e)[:200]}. Retrying in {delay:.1f}s..."
                )

            except Exception as e:
                # Other exceptions (e.g., JSON decode errors) - not retryable
                raise

            # Wait before retrying with exponential backoff
            if attempt < self.max_retries:
                time.sleep(delay)
                delay *= RETRY_BACKOFF_MULTIPLIER

        # This should not be reached, but just in case
        if last_exception:
            raise last_exception
        raise Exception("Unexpected error in retry loop")

    def claim_enrichment(self, runner_name: str | None = None) -> ClaimedEnrichment | None:
        """
        Claim the next pending enrichment attempt.

        Returns:
            ClaimedEnrichment if an attempt was claimed, None if none available.
        """
        if not self.api_url:
            logger.error("API client not configured - missing URL")
            return None

        payload_dict: dict[str, Any] = {
            "runner_name": runner_name or self.runner_name,
            "max_attempts": 1,
        }
        payload = json.dumps(payload_dict)

        try:
            data = self._make_request("POST", "/api/scraper/v1/claim-enrichment", payload=payload)

            attempts = data.get("attempts", [])
            if not attempts or not isinstance(attempts, list) or len(attempts) == 0:
                logger.info("No pending enrichment attempts available")
                return None

            first = attempts[0]
            logger.info(f"Claimed enrichment attempt {first.get('id')} for SKU {first.get('sku')}")
            return ClaimedEnrichment(
                attempt_id=first.get("id", ""),
                job_id=first.get("job_id", ""),
                sku=first.get("sku", ""),
                target_url=first.get("source_url", ""),
                domain=first.get("domain"),
                model=first.get("model"),
                mode=first.get("mode", "mixed"),
                target_id=first.get("target_id"),
                job_config=first.get("config"),
                ai_credentials=first.get("ai_credentials"),
                lease_token=first.get("lease_token"),
                lease_expires_at=first.get("lease_expires_at"),
                test_mode=first.get("test_mode", False),
                source_plan=first.get("source_plan"),
            )

        except AuthenticationError as e:
            logger.error(f"Authentication failed: {e}")
            return None
        except RunnerBuildMismatchError:
            raise
        except httpx.HTTPStatusError as e:
            if e.response.status_code in {404, 204}:
                logger.debug("No pending enrichment attempts available")
                return None
            logger.error(f"Failed to claim enrichment: {e.response.status_code} - {e.response.text}")
            return None
        except Exception as e:
            logger.error(f"Error claiming enrichment: {e}")
            return None

    def submit_enrichment_result(
        self,
        attempt_id: str,
        status: str,
        result_json: str | None = None,
        error_message: str | None = None,
        lease_token: str | None = None,
    ) -> bool:
        """Submit the result of an enrichment attempt.

        Sends the full EnrichmentResultV1 JSON as the request body with
        transport metadata (_attempt_id, _lease_token) embedded in the body.
        The web endpoint strips these extra fields before Zod validation.

        Args:
            attempt_id: The attempt ID from claim_enrichment.
            status: "success", "partial", or "failed".
            result_json: JSON string of the full EnrichmentResultV1 payload.
            error_message: Error message if failed.
            lease_token: Lease token from claim_enrichment.

        Returns:
            True if accepted, False otherwise.
        """
        if not self.api_url:
            logger.error("API client not configured - missing URL")
            return False

        if result_json:
            # Parse the full EnrichmentResultV1 result, add transport metadata
            result_dict = json.loads(result_json)
            result_dict["_attempt_id"] = attempt_id
            result_dict["_status"] = status
            if lease_token:
                result_dict["_lease_token"] = lease_token
            if error_message:
                result_dict.setdefault("validation", {})
                existing_warnings = result_dict["validation"].get("warnings", [])
                if error_message not in existing_warnings:
                    existing_warnings.append(error_message)
                    result_dict["validation"]["warnings"] = existing_warnings
            payload = json.dumps(result_dict)
        else:
            # No result - build a minimal failure payload
            payload_dict: dict[str, Any] = {
                "_attempt_id": attempt_id,
                "_status": status,
                "schema_version": "v1",
                "sku": "",
                "source": {"url": ""},
                "status": "failed",
                "extracted_at": datetime.utcnow().isoformat() if "datetime" in dir() else "",
                "mode": "llm",
                "product": {},
                "confidence": {"overall": 0.0, "fields": {}},
                "validation": {"warnings": [error_message] if error_message else []},
                "attempts": [],
            }
            if error_message:
                payload_dict["_error_message"] = error_message
            payload = json.dumps(payload_dict)

        try:
            self._make_request("POST", "/api/scraper/v1/enrichment-callback", payload=payload)
            logger.info(f"Submitted enrichment result for attempt {attempt_id}: status={status}")
            return True

        except AuthenticationError as e:
            logger.error(f"Authentication failed: {e}")
            return False
        except RunnerBuildMismatchError:
            raise
        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to submit enrichment result: {e.response.status_code} - {e.response.text}")
            return False
        except Exception as e:
            logger.error(f"Error submitting enrichment result: {e}")
            return False


    def heartbeat(
        self,
        current_job_id: str | None = None,
        lease_token: str | None = None,
        status: str | None = None,
    ) -> bool:
        """
        Send a heartbeat to the coordinator to indicate the runner is alive.

        The coordinator uses heartbeats to track runner health. If a runner
        misses too many heartbeats (e.g., 5 minutes), it's marked as lost
        and any in-progress jobs may be re-queued.

        Returns:
            True if heartbeat was acknowledged, False on error.
        """
        if not self.api_url:
            logger.error("API client not configured - missing URL")
            return False

        payload_dict: dict[str, Any] = {
            "runner_name": self.runner_name,
        }
        if current_job_id:
            payload_dict["current_job_id"] = current_job_id
        if lease_token:
            payload_dict["lease_token"] = lease_token
        if status:
            payload_dict["status"] = status

        payload = json.dumps(payload_dict)

        try:
            response_data = self._make_request("POST", "/api/scraper/v1/heartbeat", payload=payload)

            enforced_name = response_data.get("enforced_runner_name")
            if enforced_name and self.runner_name != enforced_name:
                logger.info(f"Runner name sync: '{self.runner_name}' -> '{enforced_name}'")
                self.runner_name = enforced_name

            logger.debug(f"Heartbeat sent for {self.runner_name}")
            return True

        except AuthenticationError as e:
            logger.error(f"Heartbeat auth failed: {e}")
            return False
        except RunnerBuildMismatchError:
            raise
        except httpx.HTTPStatusError as e:
            logger.error(f"Heartbeat failed: {e.response.status_code} - {e.response.text}")
            return False
        except Exception as e:
            logger.error(f"Heartbeat error: {e}")
            return False

    def post_logs(self, job_id: str, logs: list[dict[str, Any]]) -> bool:
        """
        Send a batch of logs to the API.

        Note: This method intentionally avoids using self.logger to prevent
        infinite recursion loops since this client is used by the logging handler.
        """
        if not self.api_url:
            return False

        payload = json.dumps({"job_id": job_id, "logs": logs})

        try:
            self._make_request("POST", "/api/scraper/v1/logs", payload=payload)
            return True

        except (httpx.HTTPError, AuthenticationError) as e:
            # Specific HTTP and authentication exceptions from _make_request
            logger.exception(f"Failed to send logs for job {job_id}")
            raise

    def post_progress(self, payload: dict[str, Any]) -> bool:
        """Persist the latest durable progress snapshot for a job."""
        if not self.api_url:
            return False

        job_id = str(payload.get("job_id") or "")

        try:
            self._make_request("POST", "/api/scraper/v1/progress", payload=json.dumps(payload))
            return True
        except (httpx.HTTPError, AuthenticationError):
            logger.exception(f"Failed to send progress for job {job_id or 'unknown'}")
            raise

    def get_published_config(self, slug: str) -> dict[str, Any]:
        if not self.api_url:
            raise ConfigFetchError(
                "API client not configured - missing URL",
                config_slug=slug,
            )

        try:
            return self._make_request("GET", f"/api/internal/scraper-configs/{slug}")
        except Exception as e:
            raise ConfigFetchError(
                f"Failed to fetch config for slug '{slug}': {e}",
                config_slug=slug,
                original_error=e,
            ) from e

    def list_published_configs(self) -> list[dict[str, Any]]:
        use_yaml_configs = False

        if use_yaml_configs:
            # Phase 10: YAML config listing deactivated
            raise ConfigFetchError("YAML config listing deactivated in Phase 10 — use API to list configs")

        if not self.api_url:
            raise ConfigFetchError("API client not configured - missing URL")

        try:
            response = self._make_request("GET", "/api/internal/scraper-configs")
            data = response.get("data", [])
            if not isinstance(data, list):
                raise ConfigFetchError("Invalid scraper config list payload from API")
            return data
        except Exception as e:
            raise ConfigFetchError(f"Failed to list scraper configs: {e}", original_error=e) from e

    @staticmethod
    def get_credentials_from_env(scraper_slug: str) -> dict[str, str] | None:
        """
        Resolve credentials from environment variables for local/offline use.

        Convention: For slug "phillips", checks PHILLIPS_USERNAME / PHILLIPS_PASSWORD.

        Args:
            scraper_slug: Slug/ID of the scraper (e.g., "petfoodex", "phillips")

        Returns:
            Dict with 'username', 'password', and 'type' keys, or None if not set.
        """
        prefix = scraper_slug.upper().replace("-", "_")
        username = os.environ.get(f"{prefix}_USERNAME")
        password = os.environ.get(f"{prefix}_PASSWORD")
        if username and password:
            logger.info(f"Resolved credentials for {scraper_slug} from environment variables")
            return {
                "username": username,
                "password": password,
                "type": "basic",
                "_credential_source": "env",
                "_credential_ref": scraper_slug,
            }
        return None

    @staticmethod
    def _resolve_supabase_credentials() -> tuple[str | None, str | None]:
        url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = (
            os.environ.get("SUPABASE_SECRET_KEY")
            or os.environ.get("SUPABASE_KEY")
            or os.environ.get("SUPABASE_PUBLISHABLE_KEY")
            or os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        )
        return url, key

    @staticmethod
    def _resolve_encryption_key() -> bytes | None:
        raw = os.environ.get("AI_CREDENTIALS_ENCRYPTION_KEY")
        if not raw:
            return None

        trimmed = raw.strip()
        if not trimmed:
            return None

        try:
            maybe_base64 = base64.b64decode(trimmed, validate=True)
            if len(maybe_base64) == 32:
                return maybe_base64
        except Exception:
            pass

        key_bytes = trimmed.encode("utf-8")
        if len(key_bytes) == 32:
            return key_bytes
        return None

    @classmethod
    def _decrypt_supabase_secret(cls, encrypted_value: str, iv: str, auth_tag: str) -> str:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        key = cls._resolve_encryption_key()
        if not key:
            raise ValueError("Missing or invalid AI_CREDENTIALS_ENCRYPTION_KEY")

        aesgcm = AESGCM(key)
        nonce = base64.b64decode(iv)
        ciphertext = base64.b64decode(encrypted_value)
        tag = base64.b64decode(auth_tag)
        decrypted = aesgcm.decrypt(nonce, ciphertext + tag, None)
        return decrypted.decode("utf-8")

    @classmethod
    def get_credentials_from_supabase(cls, scraper_slug: str) -> dict[str, str] | None:
        url, key = cls._resolve_supabase_credentials()
        if not url or not key:
            return None

        try:
            from supabase import create_client
        except Exception as exc:
            logger.warning(f"Supabase client unavailable for credential lookup: {exc}")
            return None

        try:
            client = create_client(url, key)
            response = client.table("scraper_credentials").select("encrypted_value,iv,auth_tag,credential_type").eq("scraper_slug", scraper_slug).execute()
        except Exception as exc:
            logger.warning(f"Failed to fetch credentials for {scraper_slug} from Supabase: {exc}")
            return None

        rows = getattr(response, "data", None) or []
        if not rows:
            return None

        resolved: dict[str, str] = {}

        for row in rows:
            encrypted_value = row.get("encrypted_value")
            iv = row.get("iv")
            auth_tag = row.get("auth_tag")
            credential_type = str(row.get("credential_type", "")).strip().lower()

            if not encrypted_value or not iv or not auth_tag or not credential_type:
                continue

            try:
                decrypted = cls._decrypt_supabase_secret(encrypted_value, iv, auth_tag)
            except Exception as exc:
                logger.warning(f"Failed to decrypt credential '{credential_type}' for {scraper_slug}: {exc}")
                return None

            parsed_payload: dict[str, Any] | None = None
            try:
                parsed = json.loads(decrypted)
                if isinstance(parsed, dict):
                    parsed_payload = parsed
            except json.JSONDecodeError:
                parsed_payload = None

            if parsed_payload:
                username = parsed_payload.get("username")
                password = parsed_payload.get("password")
                api_key = parsed_payload.get("api_key")
                cred_type = parsed_payload.get("type")

                if isinstance(username, str) and username:
                    resolved["username"] = username
                if isinstance(password, str) and password:
                    resolved["password"] = password
                if isinstance(api_key, str) and api_key:
                    resolved["api_key"] = api_key
                if isinstance(cred_type, str) and cred_type:
                    resolved["type"] = cred_type
                continue

            if credential_type == "login":
                resolved["username"] = decrypted
            elif credential_type == "password":
                resolved["password"] = decrypted
            elif credential_type == "api_key":
                resolved["api_key"] = decrypted

        if "username" in resolved and "password" in resolved:
            resolved.setdefault("type", "basic")
            resolved["_credential_source"] = "supabase"
            resolved["_credential_ref"] = scraper_slug
            logger.info(f"Resolved credentials for {scraper_slug} from Supabase")
            return resolved

        if "api_key" in resolved:
            resolved.setdefault("type", "api_key")
            resolved["_credential_source"] = "supabase"
            resolved["_credential_ref"] = scraper_slug
            logger.info(f"Resolved API credential for {scraper_slug} from Supabase")
            return resolved

        return None

    def get_credentials(self, scraper_slug: str) -> dict[str, str] | None:
        """
        Fetch credentials for a specific scraper from the coordinator.
        Credentials are fetched on-demand and cached for the duration of the job.
        The coordinator returns credentials over HTTPS to authenticated runners.

        Falls back to environment variables (SLUG_USERNAME / SLUG_PASSWORD) when
        the API is unavailable or returns no credentials.

        Args:
            scraper_slug: Slug/ID of the scraper (e.g., "petfoodex", "phillips")

        Returns:
            Dict with 'username', 'password', and 'type' keys, or None if not available.
        """
        # Check cache first
        if scraper_slug in self._credential_cache:
            logger.debug(f"Using cached credentials for {scraper_slug}")
            return self._credential_cache[scraper_slug]

        # If no API URL, try environment variables directly
        if not self.api_url:
            supabase_creds = self.get_credentials_from_supabase(scraper_slug)
            if supabase_creds:
                self._credential_cache[scraper_slug] = supabase_creds
                return supabase_creds
            env_creds = self.get_credentials_from_env(scraper_slug)
            if env_creds:
                self._credential_cache[scraper_slug] = env_creds
                return env_creds
            logger.error("API client not configured - missing URL and no Supabase/env credentials")
            return None

        try:
            data = self._make_request("GET", f"/api/scraper/v1/credentials/{scraper_slug}")

            if data.get("username") and data.get("password"):
                credentials = {
                    "username": data["username"],
                    "password": data["password"],
                    "type": data.get("type", "basic"),
                }
                if data.get("api_key"):
                    credentials["api_key"] = data["api_key"]
                credentials["_credential_source"] = "api"
                credentials["_credential_ref"] = scraper_slug
                # Cache credentials for job duration
                self._credential_cache[scraper_slug] = credentials
                logger.debug(f"Retrieved and cached credentials for {scraper_slug}")
                return credentials

            logger.warning(f"No credentials available for {scraper_slug}")
            return None

        except AuthenticationError as e:
            logger.error(f"Credentials auth failed for {scraper_slug}: {e}")
            return None
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.warning(f"No credentials configured for {scraper_slug}")
                return None
            elif e.response.status_code == 401:
                logger.error(f"Unauthorized to fetch credentials for {scraper_slug}")
                return None
            elif e.response.status_code == 403:
                logger.error(f"Forbidden to fetch credentials for {scraper_slug} - scraper may not be allowed")
                return None
            logger.error(f"Failed to fetch credentials for {scraper_slug}: {e.response.status_code}")
            return None
        except Exception as e:
            logger.error(f"Error fetching credentials for {scraper_slug}: {e}")

        supabase_creds = self.get_credentials_from_supabase(scraper_slug)
        if supabase_creds:
            self._credential_cache[scraper_slug] = supabase_creds
            return supabase_creds

        # Fallback to environment variables when API fails
        env_creds = self.get_credentials_from_env(scraper_slug)
        if env_creds:
            self._credential_cache[scraper_slug] = env_creds
            return env_creds
        return None

    def resolve_credentials(self, credential_refs: list[str]) -> dict[str, dict[str, str]]:
        """
        Resolve multiple credential references into a credential map.

        Args:
            credential_refs: List of credential reference IDs (scraper slugs)

        Returns:
            Dict mapping scraper_slug to credential dict with username/password/type.
            Failed resolutions are logged but not included in the result.
        """
        resolved: dict[str, dict[str, str]] = {}

        for ref in credential_refs:
            creds = self.get_credentials(ref)
            if creds:
                resolved[ref] = creds
            else:
                logger.warning(f"Failed to resolve credential reference: {ref}")

        return resolved

    def clear_credential_cache(self) -> None:
        """Clear the credential cache. Call this when a job completes."""
        self._credential_cache.clear()
        logger.debug("Credential cache cleared")

    def get_supabase_config(self) -> dict[str, Any] | None:
        try:
            try:
                data = self._make_request("GET", "/api/scraper/v1/supabase-config")
            except httpx.HTTPStatusError as get_error:
                if get_error.response.status_code in {404, 405}:
                    data = self._make_request("POST", "/api/scraper/v1/supabase-config")
                else:
                    raise

            return {
                "supabase_url": data.get("supabase_url"),
                "supabase_realtime_key": data.get("supabase_realtime_key"),
            }
        except Exception as e:
            logger.warning(f"Failed to fetch Supabase config from API: {e}")
            return None


# Global instance for convenience
api_client = ScraperAPIClient()
