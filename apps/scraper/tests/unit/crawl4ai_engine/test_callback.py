"""Tests for crawl4ai callback delivery."""

import hashlib
import hmac
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.crawl4ai_engine.callback import (
    CallbackDelivery,
    CallbackDeliveryError,
)


class TestCallbackDelivery:
    """Test suite for CallbackDelivery."""

    @pytest.fixture
    def callback_delivery(self):
        """Create a callback delivery instance."""
        return CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-api-key",
            runner_name="test-runner",
            scraper_name="test-scraper",
        )

    @pytest.fixture
    def sample_raw_results(self):
        """Sample raw crawl4ai results."""
        return {
            "data": {
                "SKU123": {"title": "Product 1", "price": 29.99},
                "SKU456": {"title": "Product 2", "price": 49.99},
            }
        }

    def test_init(self, callback_delivery):
        """Test callback delivery initialization."""
        assert callback_delivery.callback_url == "https://example.com/callback"
        assert callback_delivery.api_key == "test-api-key"
        assert callback_delivery.runner_name == "test-runner"
        assert callback_delivery.scraper_name == "test-scraper"
        assert callback_delivery.max_retries == 3
        assert callback_delivery.timeout_seconds == 60.0


class TestHMACSignature:
    """Test suite for HMAC signature generation."""

    def test_generate_signature(self):
        """Test HMAC signature generation."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="secret-key",
            runner_name="runner",
            scraper_name="scraper",
        )

        payload = b'{"test": "data"}'
        signature = delivery._generate_signature(payload)

        # Verify signature format (hex string)
        assert isinstance(signature, str)
        assert len(signature) == 64  # SHA256 produces 64 hex chars

        # Verify HMAC is correct
        expected = hmac.new(b"secret-key", payload, hashlib.sha256).hexdigest()
        assert signature == expected

    def test_signature_changes_with_payload(self):
        """Test signature changes with different payloads."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="secret-key",
            runner_name="runner",
            scraper_name="scraper",
        )

        sig1 = delivery._generate_signature(b'{"data": 1}')
        sig2 = delivery._generate_signature(b'{"data": 2}')

        assert sig1 != sig2

    def test_signature_changes_with_key(self):
        """Test signature changes with different keys."""
        delivery1 = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="key1",
            runner_name="runner",
            scraper_name="scraper",
        )
        delivery2 = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="key2",
            runner_name="runner",
            scraper_name="scraper",
        )

        payload = b'{"test": "data"}'
        sig1 = delivery1._generate_signature(payload)
        sig2 = delivery2._generate_signature(payload)

        assert sig1 != sig2


class TestPayloadTransformation:
    """Test suite for payload transformation."""

    def test_transform_dict_with_nested_data(self):
        """Test transforming dict with nested data."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="test-scraper",
        )

        raw_results = {
            "data": {
                "SKU001": {"title": "Product 1", "price": 29.99},
                "SKU002": {"title": "Product 2"},
            }
        }

        transformed = delivery.transform_results(raw_results)

        assert "SKU001" in transformed
        assert "SKU002" in transformed
        assert transformed["SKU001"]["test-scraper"]["title"] == "Product 1"
        assert transformed["SKU001"]["test-scraper"]["price"] == 29.99
        # Check scraped_at was added
        assert "scraped_at" in transformed["SKU001"]["test-scraper"]

    def test_transform_dict_all_values_are_dicts(self):
        """Test transforming dict where all values are dicts."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="test-scraper",
        )

        raw_results = {
            "product1": {"name": "Widget", "price": 10},
            "product2": {"name": "Gadget", "price": 20},
        }

        transformed = delivery.transform_results(raw_results)

        assert "product1" in transformed
        assert "product2" in transformed

    def test_transform_list_of_dicts(self):
        """Test transforming list of dictionaries."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="test-scraper",
        )

        raw_results = [
            {"sku": "SKU001", "name": "Product 1", "price": 29.99},
            {"sku": "SKU002", "name": "Product 2", "price": 39.99},
        ]

        transformed = delivery.transform_results(raw_results)

        assert "SKU001" in transformed
        assert "SKU002" in transformed
        assert transformed["SKU001"]["test-scraper"]["name"] == "Product 1"

    def test_transform_list_with_uppercase_sku(self):
        """Test transforming list with uppercase SKU key."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="test-scraper",
        )

        raw_results = [
            {"SKU": "ABC123", "name": "Product A"},
            {"sku": "DEF456", "name": "Product B"},
        ]

        transformed = delivery.transform_results(raw_results)

        assert "ABC123" in transformed
        assert "DEF456" in transformed

    def test_transform_list_with_explicit_data(self):
        """Test transforming list with explicit data key."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="test-scraper",
        )

        raw_results = [
            {"sku": "SKU001", "data": {"title": "Product", "price": 29.99}},
        ]

        transformed = delivery.transform_results(raw_results)

        assert "SKU001" in transformed
        assert transformed["SKU001"]["test-scraper"]["title"] == "Product"

    def test_transform_empty_dict(self):
        """Test transforming empty dict."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="test-scraper",
        )

        transformed = delivery.transform_results({})

        assert transformed == {}

    def test_transform_empty_list(self):
        """Test transforming empty list."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="test-scraper",
        )

        transformed = delivery.transform_results([])

        assert transformed == {}

    def test_transform_skips_malformed_list_entries(self):
        """Test that malformed list entries are skipped."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="test-scraper",
        )

        raw_results = [
            {"sku": "SKU001", "name": "Product 1"},
            {"name": "No SKU"},  # Missing SKU
            "not a dict",
        ]

        transformed = delivery.transform_results(raw_results)

        assert "SKU001" in transformed
        assert "No SKU" not in transformed

    def test_transform_non_standard_input(self):
        """Test transforming non-standard input returns empty."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="test-scraper",
        )

        transformed = delivery.transform_results("just a string")
        assert transformed == {}

        transformed = delivery.transform_results(123)
        assert transformed == {}


class TestBuildPayload:
    """Test suite for payload building."""

    def test_build_basic_payload(self):
        """Test building basic payload."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="test-runner",
            scraper_name="test-scraper",
        )

        transformed_results = {
            "SKU001": {"test-scraper": {"title": "Product 1"}},
            "SKU002": {"test-scraper": {"title": "Product 2"}},
        }

        payload = delivery.build_payload(
            job_id="job-123",
            transformed_results=transformed_results,
        )

        assert payload["job_id"] == "job-123"
        assert payload["status"] == "completed"
        assert payload["runner_name"] == "test-runner"
        assert payload["results"]["skus_processed"] == 2
        assert payload["results"]["scrapers_run"] == ["test-scraper"]
        assert payload["results"]["data"] == transformed_results

    def test_build_payload_with_lease_token(self):
        """Test building payload with lease token."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="test-runner",
            scraper_name="test-scraper",
        )

        payload = delivery.build_payload(
            job_id="job-123",
            transformed_results={},
            lease_token="lease-token-123",
        )

        assert payload["lease_token"] == "lease-token-123"

    def test_build_payload_with_error(self):
        """Test building payload with error message."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="test-runner",
            scraper_name="test-scraper",
        )

        payload = delivery.build_payload(
            job_id="job-123",
            transformed_results={},
            error_message="Something went wrong",
        )

        assert payload["error_message"] == "Something went wrong"


class TestHeaders:
    """Test suite for HTTP headers."""

    def test_headers_contain_signature(self):
        """Test headers include HMAC signature."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="scraper",
        )

        payload_bytes = b'{"test": "data"}'
        headers = delivery._headers(payload_bytes)

        assert "X-Signature" in headers
        assert headers["Content-Type"] == "application/json"
        assert headers["X-API-Key"] == "test-key"

    def test_headers_with_idempotency_key(self):
        """Test headers include idempotency key."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="scraper",
        )

        payload_bytes = b'{"test": "data"}'
        headers = delivery._headers(payload_bytes, idempotency_key="unique-id")

        assert headers["X-Idempotency-Key"] == "unique-id"


class TestCallbackDeliveryHttp:
    """Test suite for HTTP callback delivery."""

    @pytest.mark.asyncio
    async def test_post_payload_success(self):
        """Test successful callback delivery."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="scraper",
            max_retries=3,
        )

        payload = {"job_id": "123", "status": "completed", "results": {}}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            await delivery.post_payload(payload)

            mock_client.post.assert_called_once()

    @pytest.mark.asyncio
    async def test_post_payload_retries_on_429(self):
        """Test retry on 429 status code."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="scraper",
            max_retries=3,
        )

        payload = {"job_id": "123", "status": "completed", "results": {}}

        with patch("httpx.AsyncClient") as mock_client_class:
            import httpx

            mock_response = MagicMock()
            error = httpx.HTTPStatusError(
                "429 Too Many Requests",
                request=MagicMock(),
                response=MagicMock(status_code=429),
            )
            mock_response.raise_for_status = MagicMock(side_effect=error)
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            with pytest.raises(CallbackDeliveryError):
                await delivery.post_payload(payload)

    @pytest.mark.asyncio
    async def test_post_payload_raises_on_5xx(self):
        """Test raises on 5xx errors."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="scraper",
            max_retries=1,
        )

        payload = {"job_id": "123", "status": "completed", "results": {}}

        with patch("httpx.AsyncClient") as mock_client_class:
            import httpx

            mock_response = MagicMock()
            error = httpx.HTTPStatusError(
                "500",
                request=MagicMock(),
                response=MagicMock(status_code=500),
            )
            mock_response.raise_for_status = MagicMock(side_effect=error)
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            with pytest.raises(CallbackDeliveryError):
                await delivery.post_payload(payload)

    def test_is_retryable_network_error(self):
        """Test network errors are retryable."""
        import httpx

        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="scraper",
        )

        network_error = httpx.ConnectError("Network error", request=MagicMock())
        assert delivery._is_retryable_http_error(network_error) is True

        timeout_error = httpx.TimeoutException("Timeout", request=MagicMock())
        assert delivery._is_retryable_http_error(timeout_error) is True

    def test_is_retryable_status_codes(self):
        """Test status codes that are retryable."""
        import httpx

        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="scraper",
        )

        # 429
        error_429 = httpx.HTTPStatusError(
            "429",
            request=MagicMock(),
            response=MagicMock(status_code=429),
        )
        assert delivery._is_retryable_http_error(error_429) is True

        # 500
        error_500 = httpx.HTTPStatusError(
            "500",
            request=MagicMock(),
            response=MagicMock(status_code=500),
        )
        assert delivery._is_retryable_http_error(error_500) is True

        # 503
        error_503 = httpx.HTTPStatusError(
            "503",
            request=MagicMock(),
            response=MagicMock(status_code=503),
        )
        assert delivery._is_retryable_http_error(error_503) is True

        # 400 - not retryable
        error_400 = httpx.HTTPStatusError(
            "400",
            request=MagicMock(),
            response=MagicMock(status_code=400),
        )
        assert delivery._is_retryable_http_error(error_400) is False


class TestSendCallback:
    """Test suite for send_callback method."""

    @pytest.mark.asyncio
    async def test_send_callback_success(self):
        """Test successful callback send."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="scraper",
        )

        raw_results = {"data": {"SKU001": {"title": "Product"}}}

        with patch.object(delivery, "post_payload", new_callable=AsyncMock) as mock_post:
            result = await delivery.send_callback(
                job_id="job-123",
                crawl4ai_results=raw_results,
            )

            assert result["job_id"] == "job-123"
            assert result["status"] == "completed"
            mock_post.assert_called_once()

    @pytest.mark.asyncio
    async def test_send_callback_with_error(self):
        """Test callback send with error."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="scraper",
        )

        with patch.object(delivery, "post_payload", new_callable=AsyncMock) as mock_post:
            result = await delivery.send_callback(
                job_id="job-123",
                crawl4ai_results={},
                error_message="Extraction failed",
            )

            assert result["status"] == "failed"
            assert result["error_message"] == "Extraction failed"

    @pytest.mark.asyncio
    async def test_send_callback_with_lease_token(self):
        """Test callback send with lease token."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="scraper",
        )

        with patch.object(delivery, "post_payload", new_callable=AsyncMock) as mock_post:
            await delivery.send_callback(
                job_id="job-123",
                crawl4ai_results={},
                lease_token="lease-123",
            )

            call_args = mock_post.call_args
            payload = call_args[0][0]
            assert payload["lease_token"] == "lease-123"


class TestScrapedAtTimestamp:
    """Test suite for scraped_at timestamp addition."""

    def test_with_scraped_at_adds_timestamp(self):
        """Test _with_scraped_at adds timestamp."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="scraper",
        )

        source = {"name": "Product", "price": 29.99}
        result = delivery._with_scraped_at(source)

        assert "scraped_at" in result
        assert result["name"] == "Product"

    def test_with_scraped_at_preserves_existing(self):
        """Test _with_scraped_at preserves existing timestamp."""
        delivery = CallbackDelivery(
            callback_url="https://example.com/callback",
            api_key="test-key",
            runner_name="runner",
            scraper_name="scraper",
        )

        existing_time = "2024-01-01T00:00:00Z"
        source = {"name": "Product", "scraped_at": existing_time}
        result = delivery._with_scraped_at(source)

        assert result["scraped_at"] == existing_time
