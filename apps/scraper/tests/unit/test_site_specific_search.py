"""Unit tests for SiteSpecificSearchClient."""

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from scrapers.ai_discovery.site_search import SiteSpecificSearchClient


class TestSiteSpecificSearchClient:
    """Tests for SiteSpecificSearchClient."""

    def setup_method(self):
        """Set up test client."""
        self.client = SiteSpecificSearchClient(
            max_results=5,
            max_concurrent=3,
            cache_max=500,
        )

    @pytest.mark.asyncio
    async def test_init_sets_attributes(self):
        """Test that __init__ sets all attributes correctly."""
        assert self.client.max_results == 5
        assert self.client.max_concurrent == 3
        assert self.client._cache_max == 500
        assert self.client._cache == {}
        assert self.client._semaphore._value == 3

    @pytest.mark.asyncio
    async def test_search_across_retailers_empty_list(self):
        """Test that empty retailer list returns empty results."""
        results, error = await self.client.search_across_retailers("dog food", [])
        assert results == []
        assert error is None

    @pytest.mark.asyncio
    async def test_search_across_retailers_single_retailer_query_format(self):
        """Test that single retailer search builds correct site: query."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "web": {
                "results": [
                    {
                        "url": "https://amazon.com/product/123",
                        "title": "Dog Food Product",
                        "description": "Great dog food",
                        "extra_snippets": ["snippet1"],
                    }
                ]
            }
        }

        with patch.dict("os.environ", {"BRAVE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                mock_client.get = AsyncMock(return_value=mock_response)
                mock_client_class.return_value = mock_client

                results, error = await self.client.search_across_retailers(
                    "dog food",
                    ["amazon.com"],
                )

                # Verify site: query format
                call_args = mock_client.get.call_args
                params = call_args[1]["params"]
                assert params["q"] == '"dog food" site:amazon.com'

                assert error is None
                assert len(results) == 1
                assert results[0]["url"] == "https://amazon.com/product/123"
                assert results[0]["source_retailer"] == "amazon.com"

    @pytest.mark.asyncio
    async def test_search_across_retailers_parallel_faster_than_sequential(self):
        """Test that parallel search completes faster than sequential would."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"web": {"results": []}}

        async def mock_get_with_delay(*args, **kwargs):
            await asyncio.sleep(0.1)  # 100ms delay per request
            return mock_response

        with patch.dict("os.environ", {"BRAVE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                mock_client.get = mock_get_with_delay
                mock_client_class.return_value = mock_client

                start_time = time.time()
                results, error = await self.client.search_across_retailers(
                    "cat toy",
                    ["amazon.com", "walmart.com", "target.com"],
                )
                elapsed = time.time() - start_time

                # With max_concurrent=3 and 3 retailers, all run in parallel
                # Should complete in ~0.1s, not 0.3s
                assert elapsed < 0.25  # Allow some overhead
                assert error is None
                assert len(results) == 0  # Empty mock results

    @pytest.mark.asyncio
    async def test_search_across_retailers_semaphore_limits_concurrency(self):
        """Test that semaphore properly limits concurrent requests."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"web": {"results": []}}

        concurrent_count = 0
        max_concurrent_observed = 0

        async def mock_get_with_tracking(*args, **kwargs):
            nonlocal concurrent_count, max_concurrent_observed
            concurrent_count += 1
            max_concurrent_observed = max(max_concurrent_observed, concurrent_count)
            await asyncio.sleep(0.1)
            concurrent_count -= 1
            return mock_response

        with patch.dict("os.environ", {"BRAVE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                mock_client.get = mock_get_with_tracking
                mock_client_class.return_value = mock_client

                await self.client.search_across_retailers(
                    "pet toy",
                    ["amazon.com", "walmart.com", "target.com", "chewy.com", "petco.com"],
                )

                # With max_concurrent=3, should never exceed 3 concurrent
                assert max_concurrent_observed <= 3

    @pytest.mark.asyncio
    async def test_search_across_retailers_deduplicates_urls(self):
        """Test that duplicate URLs across retailers are deduplicated."""
        # Same URL appearing for different retailers
        mock_response_amazon = MagicMock()
        mock_response_amazon.status_code = 200
        mock_response_amazon.json.return_value = {
            "web": {
                "results": [
                    {
                        "url": "https://example.com/product/123",
                        "title": "Product 123",
                        "description": "Description",
                        "extra_snippets": [],
                    }
                ]
            }
        }

        mock_response_walmart = MagicMock()
        mock_response_walmart.status_code = 200
        mock_response_walmart.json.return_value = {
            "web": {
                "results": [
                    {
                        "url": "https://example.com/product/123",  # Same URL
                        "title": "Product 123 - Walmart",
                        "description": "Description",
                        "extra_snippets": [],
                    }
                ]
            }
        }

        response_map = {
            "amazon.com": mock_response_amazon,
            "walmart.com": mock_response_walmart,
        }

        async def mock_get_sequential(*args, **kwargs):
            params = kwargs.get("params", {})
            query = params.get("q", "")
            # Extract domain from site: query
            if "site:amazon.com" in query:
                return response_map["amazon.com"]
            elif "site:walmart.com" in query:
                return response_map["walmart.com"]
            return MagicMock(status_code=200, json=lambda: {"web": {"results": []}})

        with patch.dict("os.environ", {"BRAVE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                mock_client.get = mock_get_sequential
                mock_client_class.return_value = mock_client

                results, error = await self.client.search_across_retailers(
                    "product 123",
                    ["amazon.com", "walmart.com"],
                )

                # Should only have 1 result (duplicate URL removed)
                assert len(results) == 1
                assert results[0]["url"] == "https://example.com/product/123"
                assert error is None

    @pytest.mark.asyncio
    async def test_cache_hit_returns_cached_results(self):
        """Test that cache hit returns cached results without API call."""
        # Pre-populate cache
        cache_key = ("dog food", "amazon.com")
        cached_data = [
            {
                "url": "https://amazon.com/cached",
                "title": "Cached Product",
                "description": "Cached",
                "extra_snippets": [],
            }
        ]
        self.client._cache_set(cache_key, cached_data)

        with patch.dict("os.environ", {"BRAVE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value = mock_client

                results, error = await self.client.search_across_retailers(
                    "dog food",
                    ["amazon.com"],
                )

                # API should not be called
                mock_client.assert_not_called()

                # Should return cached results
                assert len(results) == 1
                assert results[0]["url"] == "https://amazon.com/cached"
                assert results[0]["source_retailer"] == "amazon.com"
                assert error is None

    @pytest.mark.asyncio
    async def test_cache_miss_calls_api(self):
        """Test that cache miss results in API call."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "web": {
                "results": [
                    {
                        "url": "https://amazon.com/product",
                        "title": "Product",
                        "description": "Description",
                        "extra_snippets": [],
                    }
                ]
            }
        }

        with patch.dict("os.environ", {"BRAVE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                mock_client.get = AsyncMock(return_value=mock_response)
                mock_client_class.return_value = mock_client

                # First call - cache miss
                results1, _ = await self.client.search_across_retailers(
                    "new query",
                    ["amazon.com"],
                )

                assert len(results1) == 1
                assert mock_client.get.call_count == 1

                # Reset mock to verify second call uses cache
                mock_client.get.reset_mock()

                # Second call - should be cache hit
                results2, _ = await self.client.search_across_retailers(
                    "new query",
                    ["amazon.com"],
                )

                assert len(results2) == 1
                # API should NOT be called again
                mock_client.get.assert_not_called()

    @pytest.mark.asyncio
    async def test_api_error_returns_empty_results_with_error(self):
        """Test that API error returns empty results with error message."""
        with patch.dict("os.environ", {"BRAVE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                mock_client.get = AsyncMock(
                    side_effect=httpx.HTTPStatusError(
                        "500 Server Error",
                        request=MagicMock(),
                        response=MagicMock(status_code=500),
                    )
                )
                mock_client_class.return_value = mock_client

                results, error = await self.client.search_across_retailers(
                    "pet food",
                    ["amazon.com"],
                )

                assert results == []
                assert error is not None
                assert "Error searching amazon.com" in error

    @pytest.mark.asyncio
    async def test_missing_api_key_returns_error(self):
        """Test that missing BRAVE_API_KEY returns error message."""
        with patch.dict("os.environ", {}, clear=True):
            results, error = await self.client.search_across_retailers(
                "pet food",
                ["amazon.com"],
            )

            assert results == []
            assert error is not None
            assert "BRAVE_API_KEY not set" in error

    @pytest.mark.asyncio
    async def test_search_across_retailers_partial_failure(self):
        """Test that partial failures return results from successful retailers."""
        mock_response_success = MagicMock()
        mock_response_success.status_code = 200
        mock_response_success.json.return_value = {
            "web": {
                "results": [
                    {
                        "url": "https://amazon.com/product",
                        "title": "Amazon Product",
                        "description": "Description",
                        "extra_snippets": [],
                    }
                ]
            }
        }

        call_count = 0

        async def mock_get_with_failure(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            params = kwargs.get("params", {})
            query = params.get("q", "")

            if "site:walmart.com" in query:
                raise httpx.HTTPStatusError(
                    "500 Server Error",
                    request=MagicMock(),
                    response=MagicMock(status_code=500),
                )
            return mock_response_success

        with patch.dict("os.environ", {"BRAVE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                mock_client.get = mock_get_with_failure
                mock_client_class.return_value = mock_client

                results, error = await self.client.search_across_retailers(
                    "pet food",
                    ["amazon.com", "walmart.com"],
                )

                # Should have results from amazon.com
                assert len(results) == 1
                assert results[0]["source_retailer"] == "amazon.com"
                # Should have error for walmart.com
                assert error is not None
                assert "walmart.com" in error

    @pytest.mark.asyncio
    async def test_multiple_retailers_return_combined_results(self):
        """Test that results from multiple retailers are combined."""
        mock_response_amazon = MagicMock()
        mock_response_amazon.status_code = 200
        mock_response_amazon.json.return_value = {
            "web": {
                "results": [
                    {
                        "url": "https://amazon.com/product1",
                        "title": "Amazon Product 1",
                        "description": "Description 1",
                        "extra_snippets": [],
                    }
                ]
            }
        }

        mock_response_walmart = MagicMock()
        mock_response_walmart.status_code = 200
        mock_response_walmart.json.return_value = {
            "web": {
                "results": [
                    {
                        "url": "https://walmart.com/product2",
                        "title": "Walmart Product 2",
                        "description": "Description 2",
                        "extra_snippets": [],
                    }
                ]
            }
        }

        response_map = {
            "amazon.com": mock_response_amazon,
            "walmart.com": mock_response_walmart,
        }

        async def mock_get_sequential(*args, **kwargs):
            params = kwargs.get("params", {})
            query = params.get("q", "")
            if "site:amazon.com" in query:
                return response_map["amazon.com"]
            elif "site:walmart.com" in query:
                return response_map["walmart.com"]
            return MagicMock(status_code=200, json=lambda: {"web": {"results": []}})

        with patch.dict("os.environ", {"BRAVE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                mock_client.get = mock_get_sequential
                mock_client_class.return_value = mock_client

                results, error = await self.client.search_across_retailers(
                    "pet food",
                    ["amazon.com", "walmart.com"],
                )

                assert len(results) == 2
                retailers = {r["source_retailer"] for r in results}
                assert retailers == {"amazon.com", "walmart.com"}
                assert error is None

    @pytest.mark.asyncio
    async def test_lru_cache_eviction(self):
        """Test that LRU cache properly evicts oldest entries."""
        client = SiteSpecificSearchClient(cache_max=3)

        # Add 3 entries
        client._cache_set(("query1", "domain1"), [{"url": "1"}])
        client._cache_set(("query2", "domain2"), [{"url": "2"}])
        client._cache_set(("query3", "domain3"), [{"url": "3"}])

        assert len(client._cache) == 3

        # Add 4th entry - should evict oldest (query1, domain1)
        client._cache_set(("query4", "domain4"), [{"url": "4"}])

        assert len(client._cache) == 3
        assert ("query1", "domain1") not in client._cache
        assert ("query2", "domain2") in client._cache
        assert ("query3", "domain3") in client._cache
        assert ("query4", "domain4") in client._cache

    @pytest.mark.asyncio
    async def test_cache_get_moves_to_end(self):
        """Test that accessing cache entry moves it to end (LRU behavior)."""
        client = SiteSpecificSearchClient(cache_max=3)

        # Add 3 entries
        client._cache_set(("query1", "domain1"), [{"url": "1"}])
        client._cache_set(("query2", "domain2"), [{"url": "2"}])
        client._cache_set(("query3", "domain3"), [{"url": "3"}])

        # Access first entry - should move it to end
        client._cache_get(("query1", "domain1"))

        # Add 4th entry - should evict query2 (now oldest)
        client._cache_set(("query4", "domain4"), [{"url": "4"}])

        assert ("query1", "domain1") in client._cache  # Accessed recently
        assert ("query2", "domain2") not in client._cache  # Evicted

    @pytest.mark.asyncio
    async def test_result_structure(self):
        """Test that results have expected structure."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "web": {
                "results": [
                    {
                        "url": "https://amazon.com/product",
                        "title": "Product Title",
                        "description": "Product Description",
                        "extra_snippets": ["Snippet 1", "Snippet 2"],
                    }
                ]
            }
        }

        with patch.dict("os.environ", {"BRAVE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                mock_client.get = AsyncMock(return_value=mock_response)
                mock_client_class.return_value = mock_client

                results, _ = await self.client.search_across_retailers(
                    "pet food",
                    ["amazon.com"],
                )

                assert len(results) == 1
                result = results[0]
                assert "url" in result
                assert "title" in result
                assert "description" in result
                assert "extra_snippets" in result
                assert "source_retailer" in result
                assert result["url"] == "https://amazon.com/product"
                assert result["title"] == "Product Title"
                assert result["extra_snippets"] == ["Snippet 1", "Snippet 2"]

    @pytest.mark.asyncio
    async def test_brave_api_params(self):
        """Test that correct parameters are passed to Brave API."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"web": {"results": []}}

        with patch.dict(
            "os.environ",
            {
                "BRAVE_API_KEY": "test-key",
                "BRAVE_COUNTRY": "CA",
                "BRAVE_SEARCH_LANG": "fr",
                "BRAVE_FRESHNESS": "d30",
            },
        ):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                mock_client.get = AsyncMock(return_value=mock_response)
                mock_client_class.return_value = mock_client

                await self.client.search_across_retailers(
                    "cat food",
                    ["chewy.com"],
                )

                call_args = mock_client.get.call_args
                params = call_args[1]["params"]
                headers = call_args[1]["headers"]

                # Check params
                assert params["q"] == '"cat food" site:chewy.com'
                assert params["count"] == 5
                assert params["country"] == "CA"
                assert params["search_lang"] == "fr"
                assert params["ui_lang"] == "fr-CA"
                assert params["safesearch"] == "moderate"
                assert params["extra_snippets"] == "true"
                assert params["freshness"] == "d30"

                # Check headers
                assert headers["Accept"] == "application/json"
                assert headers["X-Subscription-Token"] == "test-key"


class TestSemaphoreBehavior:
    """Tests specifically for semaphore concurrency limiting."""

    @pytest.mark.asyncio
    async def test_semaphore_limits_concurrent_requests(self):
        """Test that semaphore properly limits concurrent requests within one search."""
        client = SiteSpecificSearchClient(max_concurrent=2)

        active_count = 0
        max_active = 0
        lock = asyncio.Lock()

        async def slow_execute(*args, **kwargs):
            """Simulate slow API call with concurrency tracking."""
            nonlocal active_count, max_active
            async with lock:
                active_count += 1
                max_active = max(max_active, active_count)
            await asyncio.sleep(0.05)
            async with lock:
                active_count -= 1
            return []

        # Patch _execute_brave_search (called after semaphore acquire)
        client._execute_brave_search = slow_execute

        with patch.dict("os.environ", {"BRAVE_API_KEY": "test-key"}):
            # Search across 5 retailers with max_concurrent=2
            await client.search_across_retailers(
                "pet food",
                ["amazon.com", "walmart.com", "target.com", "chewy.com", "petco.com"],
            )

        # With max_concurrent=2, should never exceed 2 concurrent
        assert max_active <= 2
        assert max_active > 0  # Should have some concurrency


class TestErrorHandling:
    """Tests for error handling scenarios."""

    @pytest.mark.asyncio
    async def test_network_error_handling(self):
        """Test handling of network errors."""
        client = SiteSpecificSearchClient()

        with patch.dict("os.environ", {"BRAVE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                mock_client.get = AsyncMock(side_effect=httpx.NetworkError("Connection failed"))
                mock_client_class.return_value = mock_client

                results, error = await client.search_across_retailers(
                    "pet toy",
                    ["amazon.com"],
                )

                assert results == []
                assert error is not None
                assert "Connection failed" in error

    @pytest.mark.asyncio
    async def test_timeout_error_handling(self):
        """Test handling of timeout errors."""
        client = SiteSpecificSearchClient()

        with patch.dict("os.environ", {"BRAVE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("Request timed out"))
                mock_client_class.return_value = mock_client

                results, error = await client.search_across_retailers(
                    "pet toy",
                    ["amazon.com"],
                )

                assert results == []
                assert error is not None
                assert "Request timed out" in error

    @pytest.mark.asyncio
    async def test_mixed_success_and_failure(self):
        """Test that successes are returned even with some failures."""
        client = SiteSpecificSearchClient()

        mock_success_response = MagicMock()
        mock_success_response.status_code = 200
        mock_success_response.json.return_value = {
            "web": {
                "results": [
                    {
                        "url": "https://target.com/product",
                        "title": "Target Product",
                        "description": "Description",
                        "extra_snippets": [],
                    }
                ]
            }
        }

        call_count = 0

        async def mock_get_mixed(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            params = kwargs.get("params", {})
            query = params.get("q", "")

            if "site:amazon.com" in query:
                raise httpx.NetworkError("Network error")
            elif "site:walmart.com" in query:
                raise httpx.TimeoutException("Timeout")
            elif "site:target.com" in query:
                return mock_success_response
            return MagicMock(status_code=200, json=lambda: {"web": {"results": []}})

        with patch.dict("os.environ", {"BRAVE_API_KEY": "test-key"}):
            with patch("httpx.AsyncClient") as mock_client_class:
                mock_client = MagicMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=None)
                mock_client.get = mock_get_mixed
                mock_client_class.return_value = mock_client

                results, error = await client.search_across_retailers(
                    "pet toy",
                    ["amazon.com", "walmart.com", "target.com"],
                )

                # Should have results from target.com
                assert len(results) == 1
                assert results[0]["source_retailer"] == "target.com"
                # Should have errors for amazon and walmart
                assert error is not None
                assert "amazon.com" in error
                assert "walmart.com" in error
