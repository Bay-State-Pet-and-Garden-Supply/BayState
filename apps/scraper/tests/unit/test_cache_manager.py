"""Unit tests for cache_manager module."""

from __future__ import annotations

import json
import time
from pathlib import Path


from scrapers.ai_search.cache_manager import (
    CacheManager,
    CacheStats,
    ValidationResult,
)
from scrapers.ai_search.fixture_search_client import CACHE_SCHEMA_VERSION


class TestCacheManagerInit:
    """Tests for CacheManager initialization."""

    def test_default_cache_dir(self, tmp_path: Path) -> None:
        """Test default cache directory is .cache/ai_search relative to cwd."""
        manager = CacheManager()
        assert manager.cache_dir == Path(".cache/ai_search")

    def test_custom_cache_dir(self, tmp_path: Path) -> None:
        """Test custom cache directory is resolved correctly."""
        manager = CacheManager(cache_dir=tmp_path / "custom_cache")
        assert manager.cache_dir == (tmp_path / "custom_cache").resolve()

    def test_default_ttl(self, tmp_path: Path) -> None:
        """Test default TTL is 30 days."""
        manager = CacheManager()
        assert manager.ttl_days == 30

    def test_custom_ttl(self, tmp_path: Path) -> None:
        """Test custom TTL is set correctly."""
        manager = CacheManager(ttl_days=7)
        assert manager.ttl_days == 7


class TestCacheKeyNormalization:
    """Tests for cache key normalization."""

    def test_normalize_lowercase(self, tmp_path: Path) -> None:
        """Test queries are lowercased."""
        manager = CacheManager(cache_dir=tmp_path)
        assert manager._normalize_cache_key("HELLO WORLD") == "hello world"

    def test_normalize_whitespace(self, tmp_path: Path) -> None:
        """Test multiple whitespace is collapsed."""
        manager = CacheManager(cache_dir=tmp_path)
        assert manager._normalize_cache_key("hello   world") == "hello world"

    def test_normalize_strip(self, tmp_path: Path) -> None:
        """Test leading/trailing whitespace is stripped."""
        manager = CacheManager(cache_dir=tmp_path)
        assert manager._normalize_cache_key("  hello world  ") == "hello world"

    def test_normalize_empty(self, tmp_path: Path) -> None:
        """Test empty query handling."""
        manager = CacheManager(cache_dir=tmp_path)
        assert manager._normalize_cache_key("") == ""
        assert manager._normalize_cache_key("   ") == ""


class TestCacheHash:
    """Tests for cache hash computation."""

    def test_hash_consistency(self, tmp_path: Path) -> None:
        """Test same key produces same hash."""
        manager = CacheManager(cache_dir=tmp_path)
        hash1 = manager._compute_cache_hash("hello world")
        hash2 = manager._compute_cache_hash("hello world")
        assert hash1 == hash2

    def test_hash_different_inputs(self, tmp_path: Path) -> None:
        """Test different keys produce different hashes."""
        manager = CacheManager(cache_dir=tmp_path)
        hash1 = manager._compute_cache_hash("hello world")
        hash2 = manager._compute_cache_hash("hello world!")
        assert hash1 != hash2


class TestCachePath:
    """Tests for cache path generation."""

    def test_cache_path_format(self, tmp_path: Path) -> None:
        """Test cache path is in correct format."""
        manager = CacheManager(cache_dir=tmp_path)
        cache_key = manager._normalize_cache_key("hello world")
        cache_path = manager._get_cache_path(cache_key)
        assert cache_path.parent == tmp_path
        assert cache_path.suffix == ".json"

    def test_same_query_same_path(self, tmp_path: Path) -> None:
        """Test same normalized query maps to same path."""
        manager = CacheManager(cache_dir=tmp_path)
        path1 = manager._get_cache_path(manager._normalize_cache_key("hello world"))
        path2 = manager._get_cache_path(manager._normalize_cache_key("  HELLO   WORLD  "))
        assert path1 == path2


class TestGetCachedResult:
    """Tests for get_cached_result method."""

    def test_cache_miss_empty_dir(self, tmp_path: Path) -> None:
        """Test cache miss when directory is empty."""
        manager = CacheManager(cache_dir=tmp_path)
        results, found = manager.get_cached_result("test query")
        assert results == []
        assert found is False

    def test_cache_miss_nonexistent_file(self, tmp_path: Path) -> None:
        """Test cache miss when file doesn't exist."""
        manager = CacheManager(cache_dir=tmp_path)
        results, found = manager.get_cached_result("test query")
        assert results == []
        assert found is False

    def test_cache_hit(self, tmp_path: Path) -> None:
        """Test cache hit returns results."""
        manager = CacheManager(cache_dir=tmp_path)

        cache_key = manager._normalize_cache_key("test query")
        cache_path = manager._get_cache_path(cache_key)
        cache_path.parent.mkdir(parents=True, exist_ok=True)

        test_results = [{"url": "https://example.com", "title": "Example", "description": "Test"}]
        cache_data = {
            "schema_version": CACHE_SCHEMA_VERSION,
            "query": "test query",
            "results": test_results,
        }
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache_data, f)

        results, found = manager.get_cached_result("test query")
        assert found is True
        assert results == test_results

    def test_cache_miss_wrong_schema_version(self, tmp_path: Path) -> None:
        """Test cache miss when schema version is wrong."""
        manager = CacheManager(cache_dir=tmp_path)

        cache_key = manager._normalize_cache_key("test query")
        cache_path = manager._get_cache_path(cache_key)
        cache_path.parent.mkdir(parents=True, exist_ok=True)

        cache_data = {
            "schema_version": 999,
            "query": "test query",
            "results": [],
        }
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache_data, f)

        results, found = manager.get_cached_result("test query")
        assert found is False
        assert results == []

    def test_cache_miss_corrupt_json(self, tmp_path: Path) -> None:
        """Test cache miss when file contains invalid JSON."""
        manager = CacheManager(cache_dir=tmp_path)

        cache_key = manager._normalize_cache_key("test query")
        cache_path = manager._get_cache_path(cache_key)
        cache_path.parent.mkdir(parents=True, exist_ok=True)

        cache_path.write_text("not valid json {{{", encoding="utf-8")

        results, found = manager.get_cached_result("test query")
        assert found is False
        assert results == []


class TestClearExpiredCache:
    """Tests for clear_expired_cache method."""

    def test_clear_expired_no_files(self, tmp_path: Path) -> None:
        """Test clear with no cache files."""
        manager = CacheManager(cache_dir=tmp_path)
        deleted = manager.clear_expired_cache(ttl_days=30)
        assert deleted == []

    def test_clear_expired_none_expired(self, tmp_path: Path) -> None:
        """Test clear when no files are expired."""
        manager = CacheManager(cache_dir=tmp_path)
        cache_path = tmp_path / "test.json"
        cache_path.write_text("{}", encoding="utf-8")

        deleted = manager.clear_expired_cache(ttl_days=30)
        assert deleted == []
        assert cache_path.exists()

    def test_clear_expired_deletes_old(self, tmp_path: Path) -> None:
        """Test clear deletes expired files."""
        manager = CacheManager(cache_dir=tmp_path)
        cache_path = tmp_path / "old.json"
        cache_path.write_text("{}", encoding="utf-8")

        old_time = time.time() - (31 * 86400)
        cache_path.touch()
        import os

        os.utime(cache_path, (old_time, old_time))

        deleted = manager.clear_expired_cache(ttl_days=30)
        assert len(deleted) == 1
        assert deleted[0] == cache_path
        assert not cache_path.exists()

    def test_clear_expired_preserves_recent(self, tmp_path: Path) -> None:
        """Test clear preserves recent files."""
        manager = CacheManager(cache_dir=tmp_path)

        old_path = tmp_path / "old.json"
        old_path.write_text("{}", encoding="utf-8")
        import os

        old_time = time.time() - (31 * 86400)
        os.utime(old_path, (old_time, old_time))

        recent_path = tmp_path / "recent.json"
        recent_path.write_text("{}", encoding="utf-8")

        deleted = manager.clear_expired_cache(ttl_days=30)
        assert len(deleted) == 1
        assert deleted[0] == old_path
        assert recent_path.exists()
        assert not old_path.exists()


class TestClearAllCache:
    """Tests for clear_all_cache method."""

    def test_clear_all_no_files(self, tmp_path: Path) -> None:
        """Test clear with no cache files."""
        manager = CacheManager(cache_dir=tmp_path)
        count = manager.clear_all_cache()
        assert count == 0

    def test_clear_all_deletes_everything(self, tmp_path: Path) -> None:
        """Test clear deletes all cache files."""
        manager = CacheManager(cache_dir=tmp_path)
        (tmp_path / "file1.json").write_text("{}", encoding="utf-8")
        (tmp_path / "file2.json").write_text("{}", encoding="utf-8")

        count = manager.clear_all_cache()
        assert count == 2
        assert len(list(tmp_path.glob("*.json"))) == 0


class TestValidateCache:
    """Tests for validate_cache method."""

    def test_validate_empty_dir(self, tmp_path: Path) -> None:
        """Test validation with empty directory."""
        manager = CacheManager(cache_dir=tmp_path)
        result = manager.validate_cache()
        assert result.total_files == 0
        assert len(result.valid_files) == 0
        assert len(result.corrupt_files) == 0

    def test_validate_valid_file(self, tmp_path: Path) -> None:
        """Test validation passes for valid cache file."""
        manager = CacheManager(cache_dir=tmp_path)
        cache_data = {
            "schema_version": CACHE_SCHEMA_VERSION,
            "query": "test",
            "results": [],
        }
        cache_path = tmp_path / "valid.json"
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache_data, f)

        result = manager.validate_cache()
        assert result.total_files == 1
        assert len(result.valid_files) == 1
        assert result.ishealthy is True

    def test_validate_corrupt_json(self, tmp_path: Path) -> None:
        """Test validation detects corrupt JSON."""
        manager = CacheManager(cache_dir=tmp_path)
        cache_path = tmp_path / "corrupt.json"
        cache_path.write_text("not valid json {{{", encoding="utf-8")

        result = manager.validate_cache()
        assert len(result.corrupt_files) == 1
        assert result.corrupt_files[0] == cache_path

    def test_validate_missing_schema_version(self, tmp_path: Path) -> None:
        """Test validation detects missing schema version."""
        manager = CacheManager(cache_dir=tmp_path)
        cache_data = {
            "query": "test",
            "results": [],
        }
        cache_path = tmp_path / "no_schema.json"
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache_data, f)

        result = manager.validate_cache()
        assert len(result.missing_schema_version) == 1


class TestGetCacheStats:
    """Tests for get_cache_stats method."""

    def test_stats_empty_dir(self, tmp_path: Path) -> None:
        """Test stats with empty directory."""
        manager = CacheManager(cache_dir=tmp_path)
        stats = manager.get_cache_stats()
        assert stats.total_files == 0
        assert stats.total_size_bytes == 0

    def test_stats_calculates_size(self, tmp_path: Path) -> None:
        """Test stats calculates correct size."""
        manager = CacheManager(cache_dir=tmp_path)
        cache_data = {"schema_version": 1, "query": "test", "results": []}
        cache_path = tmp_path / "test.json"
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache_data, f)

        stats = manager.get_cache_stats()
        assert stats.total_files == 1
        assert stats.total_size_bytes > 0

    def test_stats_age_distribution(self, tmp_path: Path) -> None:
        """Test stats calculates age distribution."""
        manager = CacheManager(cache_dir=tmp_path)

        recent = tmp_path / "recent.json"
        recent.write_text("{}", encoding="utf-8")

        old = tmp_path / "old.json"
        old.write_text("{}", encoding="utf-8")
        old_time = time.time() - (60 * 86400)
        import os

        os.utime(old, (old_time, old_time))

        stats = manager.get_cache_stats()
        assert stats.age_distribution["0-7 days"] >= 1
        assert stats.age_distribution["31-90 days"] >= 1


class TestRecordCacheHitMiss:
    """Tests for cache hit/miss recording."""

    def test_record_hit(self, tmp_path: Path) -> None:
        """Test recording cache hit."""
        manager = CacheManager(cache_dir=tmp_path)
        manager.record_cache_hit()
        manager.record_cache_hit()
        assert manager._stats.cache_hits == 2

    def test_record_miss(self, tmp_path: Path) -> None:
        """Test recording cache miss."""
        manager = CacheManager(cache_dir=tmp_path)
        manager.record_cache_miss()
        assert manager._stats.cache_misses == 1

    def test_hit_rate_calculation(self, tmp_path: Path) -> None:
        """Test hit rate calculation."""
        manager = CacheManager(cache_dir=tmp_path)
        for _ in range(3):
            manager.record_cache_hit()
        for _ in range(1):
            manager.record_cache_miss()
        assert manager._stats.hit_rate == 0.75


class TestCacheStatsProperties:
    """Tests for CacheStats properties."""

    def test_hit_rate_zero_when_empty(self) -> None:
        """Test hit rate is 0 when no lookups."""
        stats = CacheStats()
        assert stats.hit_rate == 0.0

    def test_total_size_mb(self) -> None:
        """Test total_size_mb conversion."""
        stats = CacheStats()
        stats.total_size_bytes = 2 * 1024 * 1024
        assert stats.total_size_mb == 2.0


class TestValidationResultProperties:
    """Tests for ValidationResult properties."""

    def test_ishealthy_true(self) -> None:
        """Test ishealthy when no issues."""
        result = ValidationResult()
        result.valid_files = [Path("file1.json")]
        assert result.ishealthy is True

    def test_ishealthy_false_corrupt(self) -> None:
        """Test ishealthy false with corrupt files."""
        result = ValidationResult()
        result.corrupt_files = [Path("corrupt.json")]
        assert result.ishealthy is False

    def test_ishealthy_false_missing_schema(self) -> None:
        """Test ishealthy false with missing schema."""
        result = ValidationResult()
        result.missing_schema_version = [Path("no_schema.json")]
        assert result.ishealthy is False
