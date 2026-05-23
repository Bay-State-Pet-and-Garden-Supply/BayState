import pytest
from scrapers.ai_search.llm_runtime import (
    DEFAULT_LLM_MODEL,
    resolve_llm_runtime,
)


def test_resolve_llm_runtime_with_required_key(monkeypatch) -> None:
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    runtime = resolve_llm_runtime()

    assert runtime.model == DEFAULT_LLM_MODEL
    assert runtime.api_key == "test-key"
    assert runtime.base_url is None


def test_resolve_llm_runtime_fails_without_key(monkeypatch) -> None:
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    with pytest.raises(ValueError, match="Missing LLM_API_KEY"):
        resolve_llm_runtime()


def test_resolve_llm_runtime_with_overrides(monkeypatch) -> None:
    monkeypatch.setenv("LLM_API_KEY", "env-key")
    monkeypatch.setenv("LLM_MODEL", "env-model")
    monkeypatch.setenv("LLM_BASE_URL", "http://env-url/v1")

    # Explicit arguments override env vars
    runtime = resolve_llm_runtime(
        model="passed-model",
        base_url="http://passed-url/v1",
        api_key="passed-key"
    )

    assert runtime.model == "passed-model"
    assert runtime.base_url == "http://passed-url/v1"
    assert runtime.api_key == "passed-key"

    # Reading from env vars when arguments are missing
    runtime_env = resolve_llm_runtime()
    assert runtime_env.model == "env-model"
    assert runtime_env.base_url == "http://env-url/v1"
    assert runtime_env.api_key == "env-key"


def test_resolve_llm_runtime_normalizes_base_url() -> None:
    runtime = resolve_llm_runtime(
        api_key="test",
        base_url="http://localhost:1234/v1/"
    )
    assert runtime.base_url == "http://localhost:1234/v1"


def test_extractor_respects_global_llm_vars(monkeypatch) -> None:
    from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor
    from scrapers.ai_search.scoring import SearchScorer
    from scrapers.ai_search.matching import MatchingUtils

    monkeypatch.setenv("LLM_API_KEY", "global-key")
    monkeypatch.setenv("LLM_MODEL", "global-model")
    monkeypatch.setenv("LLM_BASE_URL", "http://global-url/v1")

    extractor = Crawl4AIExtractor(
        headless=True,
        llm_model="unused-model",
        scoring=SearchScorer(),
        matching=MatchingUtils(),
    )
    # Argument wins for model, but global env wins for API key and base URL
    assert extractor._llm_runtime.model == "unused-model"
    assert extractor._llm_runtime.api_key == "global-key"
    assert extractor._llm_runtime.base_url == "http://global-url/v1"

    # Test without passing model to extractor (if possible)
    # Currently Crawl4AIExtractor requires llm_model in __init__.
