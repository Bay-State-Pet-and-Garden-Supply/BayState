"""Bridge tests for GoldenDatasetFixtureClient.

These tests verify the bridge between golden dataset format and
FixtureSearchClient cache format, ensuring:
- Golden dataset entries are loaded into cache on init
- Cache hits return expected results
- Cache misses fail loudly (CacheMissError) with no fallback to real API
"""

import json
import pytest
from pathlib import Path

from scrapers.ai_search.golden_fixture_client import (
    GoldenDatasetFixtureClient,
    GoldenDatasetLoadError,
)
from scrapers.ai_search.fixture_search_client import (
    CacheMissError,
)


@pytest.fixture
def tmp_golden_dataset(tmp_path):
    """Create a temporary golden dataset file for testing."""
    dataset = {
        "schema_version": 1,
        "entries": [
            {
                "query": "Test Product A",
                "results": [
                    {
                        "url": "https://example.com/a",
                        "title": "Test Product A Title",
                        "description": "Description A",
                        "provider": "serper",
                        "result_type": "organic",
                    }
                ],
            },
            {
                "query": "Test Product B",
                "results": [
                    {
                        "url": "https://example.com/b",
                        "title": "Test Product B Title",
                        "description": "Description B",
                        "provider": "serper",
                        "result_type": "organic",
                    },
                    {
                        "url": "https://example.com/b2",
                        "title": "Test Product B Title 2",
                        "description": "Description B2",
                        "provider": "serper",
                        "result_type": "organic",
                    },
                ],
            },
        ],
    }
    dataset_path = tmp_path / "test_golden_dataset.json"
    with open(dataset_path, "w", encoding="utf-8") as f:
        json.dump(dataset, f)
    return dataset_path


class TestGoldenDatasetFixtureClientHappyPath:
    """Happy path tests for GoldenDatasetFixtureClient."""

    @pytest.mark.asyncio
    async def test_search_cache_hit(self, tmp_path, tmp_golden_dataset):
        """Test that search returns results for a query in the golden dataset."""
        client = GoldenDatasetFixtureClient(
            golden_dataset_path=tmp_golden_dataset,
            cache_dir=tmp_path / ".cache",
        )

        results, error = await client.search("Test Product A")

        assert error is None
        assert len(results) == 1
        assert results[0]["url"] == "https://example.com/a"
        assert results[0]["title"] == "Test Product A Title"

    @pytest.mark.asyncio
    async def test_search_cache_hit_multiple_results(self, tmp_path, tmp_golden_dataset):
        """Test that search returns multiple results for a query."""
        client = GoldenDatasetFixtureClient(
            golden_dataset_path=tmp_golden_dataset,
            cache_dir=tmp_path / ".cache",
        )

        results, error = await client.search("Test Product B")

        assert error is None
        assert len(results) == 2
        assert results[0]["url"] == "https://example.com/b"
        assert results[1]["url"] == "https://example.com/b2"

    @pytest.mark.asyncio
    async def test_search_normalized_query_matching(self, tmp_path, tmp_golden_dataset):
        """Test that query normalization works for cache matching."""
        client = GoldenDatasetFixtureClient(
            golden_dataset_path=tmp_golden_dataset,
            cache_dir=tmp_path / ".cache",
        )

        # Query with extra whitespace and mixed case should match
        results, error = await client.search("  test   PRODUCT a  ")

        assert error is None
        assert len(results) == 1
        assert results[0]["url"] == "https://example.com/a"

    @pytest.mark.asyncio
    async def test_search_many_multiple_queries(self, tmp_path, tmp_golden_dataset):
        """Test that search_many returns results for multiple queries."""
        client = GoldenDatasetFixtureClient(
            golden_dataset_path=tmp_golden_dataset,
            cache_dir=tmp_path / ".cache",
        )

        results = await client.search_many(["Test Product A", "Test Product B"])

        assert len(results) == 2
        assert results[0][1] is None  # No error for first query
        assert len(results[0][0]) == 1  # One result for first query
        assert results[1][1] is None  # No error for second query
        assert len(results[1][0]) == 2  # Two results for second query

    def test_get_loaded_queries(self, tmp_path, tmp_golden_dataset):
        """Test that get_loaded_queries returns all loaded query strings."""
        client = GoldenDatasetFixtureClient(
            golden_dataset_path=tmp_golden_dataset,
            cache_dir=tmp_path / ".cache",
        )

        loaded = client.get_loaded_queries()

        assert len(loaded) == 2
        assert "Test Product A" in loaded
        assert "Test Product B" in loaded

    def test_cache_files_created(self, tmp_path, tmp_golden_dataset):
        """Test that cache files are created in the cache directory."""
        cache_dir = tmp_path / ".cache"
        client = GoldenDatasetFixtureClient(
            golden_dataset_path=tmp_golden_dataset,
            cache_dir=cache_dir,
        )

        # Check that cache files exist
        cache_files = list(cache_dir.glob("*.json"))
        assert len(cache_files) == 2

        # Verify cache file format
        for cache_file in cache_files:
            with open(cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            assert data["schema_version"] == 1
            assert "query" in data
            assert "results" in data
            assert isinstance(data["results"], list)


class TestGoldenDatasetFixtureClientCacheMiss:
    """Cache miss tests - ensure failures are loud, never fall back to real API."""

    @pytest.mark.asyncio
    async def test_search_cache_miss_raises_error(self, tmp_path, tmp_golden_dataset):
        """Test that cache miss raises CacheMissError, does not fallback to API."""
        client = GoldenDatasetFixtureClient(
            golden_dataset_path=tmp_golden_dataset,
            cache_dir=tmp_path / ".cache",
        )

        with pytest.raises(CacheMissError, match="Cache miss for query") as exc_info:
            await client.search("Nonexistent Query")

        assert exc_info.value.query == "Nonexistent Query"
        # Verify the normalized cache key is included in error
        assert exc_info.value.cache_key is not None

    @pytest.mark.asyncio
    async def test_search_many_partial_miss_raises_error(self, tmp_path, tmp_golden_dataset):
        """Test that partial cache miss in search_many raises error."""
        client = GoldenDatasetFixtureClient(
            golden_dataset_path=tmp_golden_dataset,
            cache_dir=tmp_path / ".cache",
        )

        # One query exists, one does not - should fail on the missing one
        with pytest.raises(CacheMissError):
            await client.search_many(["Test Product A", "Nonexistent Query"])


class TestGoldenDatasetFixtureClientErrors:
    """Error handling tests for GoldenDatasetFixtureClient."""

    def test_missing_golden_dataset_file(self, tmp_path):
        """Test that missing dataset file raises GoldenDatasetLoadError."""
        with pytest.raises(GoldenDatasetLoadError, match="File does not exist"):
            GoldenDatasetFixtureClient(
                golden_dataset_path=tmp_path / "nonexistent.json",
                cache_dir=tmp_path / ".cache",
            )

    def test_invalid_json_golden_dataset(self, tmp_path):
        """Test that invalid JSON raises GoldenDatasetLoadError."""
        invalid_file = tmp_path / "invalid.json"
        with open(invalid_file, "w") as f:
            f.write("{invalid json")

        with pytest.raises(GoldenDatasetLoadError, match="Invalid JSON"):
            GoldenDatasetFixtureClient(
                golden_dataset_path=invalid_file,
                cache_dir=tmp_path / ".cache",
            )

    def test_golden_dataset_without_entries_field(self, tmp_path):
        """Test that missing 'entries' field is handled gracefully."""
        dataset = {"schema_version": 1}  # No 'entries' field
        dataset_path = tmp_path / "no_entries.json"
        with open(dataset_path, "w") as f:
            json.dump(dataset, f)

        client = GoldenDatasetFixtureClient(
            golden_dataset_path=dataset_path,
            cache_dir=tmp_path / ".cache",
        )

        assert client.get_loaded_queries() == set()

    def test_golden_dataset_with_non_list_entries(self, tmp_path):
        """Test that non-list 'entries' field raises GoldenDatasetLoadError."""
        dataset = {"schema_version": 1, "entries": "not a list"}
        dataset_path = tmp_path / "bad_entries.json"
        with open(dataset_path, "w") as f:
            json.dump(dataset, f)

        with pytest.raises(GoldenDatasetLoadError, match="'entries' field must be a list"):
            GoldenDatasetFixtureClient(
                golden_dataset_path=dataset_path,
                cache_dir=tmp_path / ".cache",
            )


class TestGoldenDatasetFixtureClientRealDataset:
    """Tests using the actual golden dataset file (if available)."""

    @pytest.mark.skipif(
        not (Path.cwd() / "data" / "golden_dataset_v3.search_results.json").exists(),
        reason="Real golden dataset not found"
    )
    def test_load_real_golden_dataset(self):
        """Test loading the actual golden dataset from the default path."""
        client = GoldenDatasetFixtureClient()

        loaded = client.get_loaded_queries()
        assert len(loaded) > 0

    @pytest.mark.skipif(
        not (Path.cwd() / "data" / "golden_dataset_v3.search_results.json").exists(),
        reason="Real golden dataset not found"
    )
    @pytest.mark.asyncio
    async def test_search_real_golden_dataset_query(self):
        """Test searching a query from the real golden dataset."""
        client = GoldenDatasetFixtureClient()

        # Get first query from the dataset
        first_query = next(iter(client.get_loaded_queries()))

        results, error = await client.search(first_query)

        assert error is None
        assert isinstance(results, list)
        assert len(results) > 0
        # Verify result structure
        for result in results:
            assert "url" in result
            assert "title" in result
            assert "provider" in result
