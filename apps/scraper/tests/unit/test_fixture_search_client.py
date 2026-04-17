import pytest
import json
from pathlib import Path

from scrapers.ai_search.fixture_search_client import (
    FixtureSearchClient, CacheMissError, SchemaVersionMismatchError
)

@pytest.fixture
def tmp_cache(tmp_path):
    client = FixtureSearchClient(cache_dir=str(tmp_path))
    return client

def test_query_normalization():
    assert FixtureSearchClient._normalize_cache_key("  some   query ") == "some query"
    assert FixtureSearchClient._normalize_cache_key("UPPER case") == "upper case"
    assert FixtureSearchClient._normalize_cache_key("") == ""
    assert FixtureSearchClient._normalize_cache_key(None) == ""

def test_cache_key_generation(tmp_cache):
    key = tmp_cache._normalize_cache_key("test")
    path = tmp_cache._get_cache_path(key)
    assert path.name.endswith(".json")
    hash_val = tmp_cache._compute_cache_hash("test")
    assert path.name == f"{hash_val}.json"

@pytest.mark.asyncio
async def test_search_cache_hit(tmp_cache):
    query = "foo bar"
    results_data = [{"title": "test", "url": "http://test", "provider": "serper", "result_type": "organic"}]
    path = tmp_cache.write_cache_entry(query, results_data)
    
    results, err = await tmp_cache.search(query)
    assert err is None
    assert results == results_data

@pytest.mark.asyncio
async def test_search_cache_miss_allow_api_false(tmp_cache):
    tmp_cache._allow_real_api = False
    with pytest.raises(CacheMissError, match="Cache miss for query"):
        await tmp_cache.search("missing query")

@pytest.mark.asyncio
async def test_search_cache_miss_allow_api_true(tmp_cache):
    # In FixtureSearchClient's current implementation, allow_real_api=True 
    # just returns empty results to prevent throwing. It doesn't actually call Serper.
    # We test that here.
    tmp_cache._allow_real_api = True
    
    results, err = await tmp_cache.search("missing query")
    assert results == []
    assert err is None

@pytest.mark.asyncio
async def test_search_many(tmp_cache):
    query1 = "foo"
    query2 = "bar"
    tmp_cache.write_cache_entry(query1, [{"url": "1"}])
    tmp_cache.write_cache_entry(query2, [{"url": "2"}])
    
    res = await tmp_cache.search_many([query1, query2])
    assert len(res) == 2
    assert res[0][0][0]["url"] == "1"
    assert res[1][0][0]["url"] == "2"

def test_clear_cache(tmp_cache):
    tmp_cache.write_cache_entry("foo", [])
    assert len(list(tmp_cache._cache_dir.glob("*.json"))) == 1
    tmp_cache.clear_cache()
    assert len(list(tmp_cache._cache_dir.glob("*.json"))) == 0

@pytest.mark.asyncio
async def test_invalid_schema_version(tmp_cache):
    path = tmp_cache.write_cache_entry("foo", [])
    # Corrupt schema version
    with open(path, "r") as f:
        data = json.load(f)
    data["schema_version"] = 999
    with open(path, "w") as f:
        json.dump(data, f)
        
    with pytest.raises(SchemaVersionMismatchError, match="Schema version mismatch"):
        await tmp_cache.search("foo")

@pytest.mark.asyncio
async def test_corrupt_json(tmp_cache):
    path = tmp_cache.write_cache_entry("foo", [])
    with open(path, "w") as f:
        f.write("{corrupt json")
        
    # Should catch JSONDecodeError, log warning, and either raise CacheMiss or return []
    with pytest.raises(CacheMissError):
        await tmp_cache.search("foo")
        
    tmp_cache._allow_real_api = True
    res, err = await tmp_cache.search("foo")
    assert res == []

def test_resolve_cache_dir():
    assert FixtureSearchClient._resolve_cache_dir(None) == Path(".cache/ai_search")
    assert FixtureSearchClient._resolve_cache_dir(Path("/tmp/foo")) == Path("/tmp/foo").resolve()

def test_preload_cache_dummy(tmp_cache):
    # Just calls pass
    tmp_cache.preload_cache({})
