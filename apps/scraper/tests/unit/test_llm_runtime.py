from scrapers.ai_search.llm_runtime import (
    DEFAULT_LLM_MODEL,
    DEFAULT_OPENAI_COMPATIBLE_MODEL,
    LOCAL_OPENAI_COMPATIBLE_API_KEY,
    resolve_llm_runtime,
)


def test_resolve_llm_runtime_maps_legacy_gemini_provider_to_deepseek() -> None:
    runtime = resolve_llm_runtime(provider="gemini", api_key="deepseek-test-key")

    assert runtime.provider == "deepseek"
    assert runtime.model == DEFAULT_LLM_MODEL
    assert runtime.api_key == "deepseek-test-key"


def test_resolve_llm_runtime_openai_compatible_uses_local_defaults(
    monkeypatch,
) -> None:
    monkeypatch.setenv("OPENAI_COMPATIBLE_BASE_URL", "http://localhost:1234/v1/")
    monkeypatch.delenv("OPENAI_COMPATIBLE_API_KEY", raising=False)

    runtime = resolve_llm_runtime(provider="openai_compatible")

    assert runtime.provider == "openai_compatible"
    assert runtime.model == DEFAULT_OPENAI_COMPATIBLE_MODEL
    assert runtime.base_url == "http://localhost:1234/v1"
    assert runtime.api_key == LOCAL_OPENAI_COMPATIBLE_API_KEY


def test_resolve_llm_runtime_with_llm_provider_and_model_overrides(
    monkeypatch,
) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "openai_compatible")
    monkeypatch.setenv("LLM_MODEL", "local-llama3")
    monkeypatch.setenv("OPENAI_COMPATIBLE_BASE_URL", "http://localhost:1234/v1")

    # Call resolve_llm_runtime with no arguments; it should read from the env variables
    runtime = resolve_llm_runtime()

    assert runtime.provider == "openai_compatible"
    assert runtime.model == "local-llama3"
    assert runtime.base_url == "http://localhost:1234/v1"
    assert runtime.api_key == LOCAL_OPENAI_COMPATIBLE_API_KEY

    # Test that deepseek-chat is overridden by LLM_MODEL when provider is openai_compatible
    runtime_overridden = resolve_llm_runtime(model="deepseek-chat")
    assert runtime_overridden.model == "local-llama3"


def test_extractor_constructors_respect_env_overrides(monkeypatch) -> None:
    from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor
    from scrapers.ai_search.scoring import SearchScorer
    from scrapers.ai_search.matching import MatchingUtils
    from scrapers.product_url_extraction.extractor import ProductPageExtractor

    monkeypatch.setenv("LLM_PROVIDER", "openai_compatible")
    monkeypatch.setenv("LLM_MODEL", "google/gemma-4-e4b")
    monkeypatch.setenv("OPENAI_COMPATIBLE_BASE_URL", "http://localhost:1234/v1")

    # Verify Crawl4AIExtractor resolves env variables when provider parameter is omitted
    extractor = Crawl4AIExtractor(
        headless=True,
        llm_model="deepseek-chat",
        scoring=SearchScorer(),
        matching=MatchingUtils(),
    )
    assert extractor._llm_runtime.provider == "openai_compatible"
    assert extractor._llm_runtime.model == "google/gemma-4-e4b"
    assert extractor._llm_runtime.base_url == "http://localhost:1234/v1"

    # Verify ProductPageExtractor resolves env variables when provider parameter is omitted
    pp_extractor = ProductPageExtractor(headless=True)
    assert pp_extractor._extractor._llm_runtime.provider == "openai_compatible"
    assert pp_extractor._extractor._llm_runtime.model == "google/gemma-4-e4b"
    assert pp_extractor._extractor._llm_runtime.base_url == "http://localhost:1234/v1"

