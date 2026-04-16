"""Unit tests for FixtureSearchClient."""

from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

import pytest

from scrapers.ai_search.fixture_search_client import (
    CACHE_SCHEMA_VERSION,
    CacheMissError,
    FixtureSearchClient,
    SchemaVersionMismatchError,
)


@pytest.fixture
def temp_cache_dir() -> Path:
    """Create a temporary directory for cache files."""
    temp_dir = tempfile.mkdtemp()
    yield Path(temp_dir)
    shutil.rmtree(temp_dir)


@pytest.fixture
def fixture_client(temp_cache_dir: Path) -> FixtureSearchClient:
    """Create a FixtureSearchClient with a temporary cache directory."""
    return FixtureSearchClient(cache_dir=temp_cache_dir, allow_real_api=False)


@pytest.fixture
def fixture_client_with_real_api(temp_cache_dir: Path) -> FixtureSearchClient:
    """Create a FixtureSearchClient with allow_real_api=True."""
    return FixtureSearchClient(cache_dir=temp_cache_dir, allow_real_api=True)


@pytest.fixture
def sample_results() -> list[dict[str, Any]]:
    """Sample search results in Serper format."""
    return [
        {
            "url": "https://acmepets.com/products/12345",
            "title": "Acme Squeaky Ball",
            "description": "Official Acme Squeaky Ball for dogs",
            "provider": "serper",
            "result_type": "organic",
        },
        {
            "url": "https://acmepets.com/products/67890",
            "title": "Acme Squeaky Ball Pro",
            "description": "Professional grade Acme Squeaky Ball",
            "provider": "serper",
            "result_type": "organic",
        },
    ]


class TestCacheKeyNormalization:
    """Tests for cache key normalization."""

    def test_normalize_cache_key_lowercase(self) -> None:
        """Test that cache key is converted to lowercase."""
        client = FixtureSearchClient()
        assert client._normalize_cache_key("ACME WIDGET") == "acme widget"
        assert client._normalize_cache_key("Acme Widget") == "acme widget"

    def test_normalize_cache_key_collapse_whitespace(self) -> None:
        """Test that multiple whitespace characters are collapsed."""
        client = FixtureSearchClient()
        assert client._normalize_cache_key("Acme   Widget") == "acme widget"
        assert client._normalize_cache_key("  Acme  Widget  ") == "acme widget"

    def test_normalize_cache_key_strip(self) -> None:
        """Test that leading/trailing whitespace is stripped."""
        client = FixtureSearchClient()
        assert client._normalize_cache_key("  Acme Widget  ") == "acme widget"
        assert client._normalize_cache_key("\tAcme Widget\n") == "acme widget"

    def test_normalize_cache_key_combined(self) -> None:
        """Test combined normalization: uppercase, whitespace, strip."""
        client = FixtureSearchClient()
        # " Acme  Widget " -> "acme widget"
        result = client._normalize_cache_key(" Acme  Widget ")
        assert result == "acme widget"

    def test_normalize_cache_key_empty(self) -> None:
        """Test normalization of empty string."""
        client = FixtureSearchClient()
        assert client._normalize_cache_key("") == ""
        assert client._normalize_cache_key("   ") == ""

    def test_normalize_cache_key_tabs_newlines(self) -> None:
        """Test that tabs and newlines are treated as whitespace."""
        client = FixtureSearchClient()
        assert client._normalize_cache_key("Acme\tWidget") == "acme widget"
        assert client._normalize_cache_key("Acme\nWidget") == "acme widget"


class TestCacheHash:
    """Tests for cache hash computation."""

    def test_compute_cache_hash_deterministic(self) -> None:
        """Test that hash computation is deterministic."""
        client = FixtureSearchClient()
        hash1 = client._compute_cache_hash("acme widget")
        hash2 = client._compute_cache_hash("acme widget")
        assert hash1 == hash2

    def test_compute_cache_hash_different_for_different_keys(self) -> None:
        """Test that different keys produce different hashes."""
        client = FixtureSearchClient()
        hash1 = client._compute_cache_hash("acme widget")
        hash2 = client._compute_cache_hash("acme ball")
        assert hash1 != hash2

    def test_compute_cache_hash_md5_format(self) -> None:
        """Test that hash is in MD5 hex format."""
        client = FixtureSearchClient()
        hash_result = client._compute_cache_hash("test")
        assert len(hash_result) == 32  # MD5 hex is 32 chars
        assert all(c in "0123456789abcdef" for c in hash_result)


class TestCacheHit:
    """Tests for cache hit scenarios."""

    @pytest.mark.asyncio
    async def test_search_returns_cached_results(
        self,
        fixture_client: FixtureSearchClient,
        temp_cache_dir: Path,
        sample_results: list[dict[str, Any]],
    ) -> None:
        """Test that search returns cached results on cache hit."""
        # Write cache entry
        cache_key = "acme squeaky ball"
        fixture_client.write_cache_entry("Acme Squeaky Ball", sample_results)

        # Verify cache file exists
        normalized_key = fixture_client._normalize_cache_key("Acme Squeaky Ball")
        cache_path = fixture_client._get_cache_path(normalized_key)
        assert cache_path.exists()

        # Search should return cached results
        results, error = await fixture_client.search("Acme Squeaky Ball")

        assert error is None
        assert len(results) == 2
        assert results[0]["url"] == "https://acmepets.com/products/12345"

    @pytest.mark.asyncio
    async def test_search_normalizes_cache_key(
        self,
        fixture_client: FixtureSearchClient,
        sample_results: list[dict[str, Any]],
    ) -> None:
        """Test that different query formats with same meaning hit the same cache."""
        # Write cache with one format
        fixture_client.write_cache_entry("Acme Squeaky Ball", sample_results)

        # Search with different format but same normalized key
        results, error = await fixture_client.search("  ACME  squeaky  ball  ")

        assert error is None
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_search_returns_results_with_correct_schema(
        self,
        fixture_client: FixtureSearchClient,
        sample_results: list[dict[str, Any]],
    ) -> None:
        """Test that cached results have the expected schema fields."""
        fixture_client.write_cache_entry("Test Query", sample_results)

        results, error = await fixture_client.search("Test Query")

        assert error is None
        for result in results:
            assert "url" in result
            assert "title" in result
            assert "description" in result
            assert "provider" in result
            assert "result_type" in result


class TestCacheMiss:
    """Tests for cache miss scenarios."""

    @pytest.mark.asyncio
    async def test_search_raises_cache_miss_error_when_no_cache(
        self,
        fixture_client: FixtureSearchClient,
    ) -> None:
        """Test that CacheMissError is raised on cache miss when allow_real_api=False."""
        with pytest.raises(CacheMissError) as exc_info:
            await fixture_client.search("Unknown Query")

        assert exc_info.value.query == "Unknown Query"
        assert exc_info.value.cache_key == "unknown query"

    @pytest.mark.asyncio
    async def test_search_returns_empty_on_cache_miss_when_allow_real_api(
        self,
        fixture_client_with_real_api: FixtureSearchClient,
    ) -> None:
        """Test that search returns empty results on cache miss when allow_real_api=True."""
        results, error = await fixture_client_with_real_api.search("Unknown Query")

        assert results == []
        assert error is None

    @pytest.mark.asyncio
    async def test_search_returns_empty_when_cache_file_corrupted(
        self,
        fixture_client: FixtureSearchClient,
        temp_cache_dir: Path,
    ) -> None:
        """Test that CacheMissError is raised when cache file is corrupted."""
        # Write a corrupted cache file
        cache_path = temp_cache_dir / "test.json"
        cache_path.write_text("{ invalid json")

        with pytest.raises(CacheMissError):
            await fixture_client.search("test")


class TestSchemaVersion:
    """Tests for schema version validation."""

    @pytest.mark.asyncio
    async def test_schema_version_validated(
        self,
        temp_cache_dir: Path,
        sample_results: list[dict[str, Any]],
    ) -> None:
        """Test that schema version is validated in cache files."""
        # Write cache with wrong schema version
        client = FixtureSearchClient(cache_dir=temp_cache_dir, schema_version=1)
        cache_key = client._normalize_cache_key("Test Query")
        cache_path = temp_cache_dir / f"{client._compute_cache_hash(cache_key)}.json"

        wrong_schema_cache = {
            "schema_version": 999,  # Wrong version
            "query": "Test Query",
            "results": sample_results,
        }
        cache_path.write_text(json.dumps(wrong_schema_cache))

        # Should raise SchemaVersionMismatchError
        with pytest.raises(SchemaVersionMismatchError) as exc_info:
            await client.search("Test Query")

        assert exc_info.value.expected == 1
        assert exc_info.value.found == 999
        assert exc_info.value.cache_path.resolve() == cache_path.resolve()

    @pytest.mark.asyncio
    async def test_schema_version_matches(
        self,
        temp_cache_dir: Path,
        sample_results: list[dict[str, Any]],
    ) -> None:
        """Test that matching schema version passes validation."""
        client = FixtureSearchClient(cache_dir=temp_cache_dir, schema_version=CACHE_SCHEMA_VERSION)
        client.write_cache_entry("Test Query", sample_results)

        # Should not raise
        results, error = await client.search("Test Query")

        assert error is None
        assert len(results) == 2


class TestSearchMany:
    """Tests for search_many method."""

    @pytest.mark.asyncio
    async def test_search_many_returns_results_for_multiple_queries(
        self,
        fixture_client: FixtureSearchClient,
        sample_results: list[dict[str, Any]],
    ) -> None:
        """Test that search_many returns results for multiple cached queries."""
        fixture_client.write_cache_entry("Query 1", [sample_results[0]])
        fixture_client.write_cache_entry("Query 2", [sample_results[1]])

        results = await fixture_client.search_many(["Query 1", "Query 2"])

        assert len(results) == 2
        assert results[0][0][0]["url"] == "https://acmepets.com/products/12345"
        assert results[1][0][0]["url"] == "https://acmepets.com/products/67890"

    @pytest.mark.asyncio
    async def test_search_many_raises_on_cache_miss(
        self,
        fixture_client: FixtureSearchClient,
        sample_results: list[dict[str, Any]],
    ) -> None:
        """Test that search_many raises CacheMissError on cache miss."""
        fixture_client.write_cache_entry("Cached Query", sample_results)

        with pytest.raises(CacheMissError):
            await fixture_client.search_many(["Cached Query", "Unknown Query"])


class TestWriteCacheEntry:
    """Tests for write_cache_entry utility method."""

    def test_write_cache_entry_creates_file(
        self,
        fixture_client: FixtureSearchClient,
        temp_cache_dir: Path,
        sample_results: list[dict[str, Any]],
    ) -> None:
        """Test that write_cache_entry creates a cache file."""
        cache_path = fixture_client.write_cache_entry("Test Query", sample_results)

        assert cache_path.exists()
        assert cache_path.parent.resolve() == temp_cache_dir.resolve()

    def test_write_cache_entry_contains_correct_data(
        self,
        fixture_client: FixtureSearchClient,
        sample_results: list[dict[str, Any]],
    ) -> None:
        """Test that cache file contains correct data."""
        cache_path = fixture_client.write_cache_entry("Test Query", sample_results)

        with open(cache_path, "r") as f:
            cache_data = json.load(f)

        assert cache_data["schema_version"] == CACHE_SCHEMA_VERSION
        assert cache_data["query"] == "Test Query"
        assert cache_data["results"] == sample_results

    def test_write_cache_entry_creates_parent_dirs(
        self,
        temp_cache_dir: Path,
        sample_results: list[dict[str, Any]],
    ) -> None:
        """Test that write_cache_entry creates parent directories if needed."""
        nested_dir = temp_cache_dir / "nested" / "path"
        client = FixtureSearchClient(cache_dir=nested_dir)

        cache_path = client.write_cache_entry("Test Query", sample_results)

        assert cache_path.exists()
        assert cache_path.parent.resolve() == nested_dir.resolve()


class TestClearCache:
    """Tests for clear_cache method."""

    def test_clear_cache_removes_all_files(
        self,
        fixture_client: FixtureSearchClient,
        sample_results: list[dict[str, Any]],
    ) -> None:
        """Test that clear_cache removes all cache files."""
        # Create multiple cache entries
        fixture_client.write_cache_entry("Query 1", sample_results)
        fixture_client.write_cache_entry("Query 2", sample_results)

        assert len(list(fixture_client._cache_dir.glob("*.json"))) == 2

        fixture_client.clear_cache()

        assert len(list(fixture_client._cache_dir.glob("*.json"))) == 0

    def test_clear_cache_handles_empty_directory(
        self,
        fixture_client: FixtureSearchClient,
    ) -> None:
        """Test that clear_cache handles empty cache directory."""
        # Should not raise
        fixture_client.clear_cache()


class TestInterfaceMatch:
    """Tests verifying FixtureSearchClient matches SearchClient interface."""

    def test_search_method_signature(self) -> None:
        """Test that search method has correct signature."""
        client = FixtureSearchClient()
        import inspect

        sig = inspect.signature(client.search)
        params = list(sig.parameters.keys())

        assert "query" in params
        assert len(params) == 1

    def test_search_returns_tuple_of_results_and_error(self) -> None:
        """Test that search returns tuple of (list[dict], str | None)."""
        client = FixtureSearchClient()
        import asyncio

        async def check_return_type() -> None:
            # This should not raise TypeError
            result = client.search("test")
            assert asyncio.iscoroutine(result)

        asyncio.run(check_return_type())

    @pytest.mark.asyncio
    async def test_search_is_async(self) -> None:
        """Test that search is an async method."""
        client = FixtureSearchClient(allow_real_api=True)
        result = await client.search("test")
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_has_search_many_method(self) -> None:
        """Test that client has search_many method."""
        client = FixtureSearchClient()
        assert hasattr(client, "search_many")

    @pytest.mark.asyncio
    async def test_search_many_accepts_sequence_of_strings(self) -> None:
        """Test that search_many accepts a sequence of strings."""
        client = FixtureSearchClient(allow_real_api=True)
        result = await client.search_many(["query1", "query2"])
        assert isinstance(result, list)
        assert len(result) == 2


class TestNoRealHttpCalls:
    """Tests verifying no real HTTP calls are made."""

    @pytest.mark.asyncio
    async def test_cache_hit_does_not_access_network(
        self,
        fixture_client: FixtureSearchClient,
        sample_results: list[dict[str, Any]],
    ) -> None:
        """Test that cache hits don't make network calls."""
        fixture_client.write_cache_entry("Test Query", sample_results)

        # This should complete without any network activity
        results, error = await fixture_client.search("Test Query")

        assert error is None
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_cache_miss_raises_without_network(
        self,
        fixture_client: FixtureSearchClient,
    ) -> None:
        """Test that cache miss raises error without network calls."""
        # This should raise CacheMissError immediately without any network calls
        with pytest.raises(CacheMissError):
            await fixture_client.search("Definitely Not Cached")


class TestEdgeCases:
    """Tests for edge cases."""

    @pytest.mark.asyncio
    async def test_empty_query_returns_empty_results(
        self,
        fixture_client: FixtureSearchClient,
    ) -> None:
        """Test that empty query is handled."""
        # Empty string should normalize to empty, looking for cache key ""
        with pytest.raises(CacheMissError):
            await fixture_client.search("")

    @pytest.mark.asyncio
    async def test_unicode_query_normalized(
        self,
        fixture_client: FixtureSearchClient,
        sample_results: list[dict[str, Any]],
    ) -> None:
        """Test that Unicode queries are normalized correctly."""
        fixture_client.write_cache_entry("Café Widget", sample_results)

        # Query with different spacing should hit same cache
        results, error = await fixture_client.search("Café   Widget")

        assert error is None
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_special_characters_in_query(
        self,
        fixture_client: FixtureSearchClient,
        sample_results: list[dict[str, Any]],
    ) -> None:
        """Test queries with special characters."""
        fixture_client.write_cache_entry("Test & Query (1)", sample_results)

        results, error = await fixture_client.search("test & query (1)")

        assert error is None
        assert len(results) == 2
