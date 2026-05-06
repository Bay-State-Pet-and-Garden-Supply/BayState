from scrapers.ai_search.llm_runtime import (
    DEFAULT_LLM_MODEL,
    DEFAULT_OPENAI_COMPATIBLE_MODEL,
    LOCAL_OPENAI_COMPATIBLE_API_KEY,
    resolve_llm_runtime,
)


def test_resolve_llm_runtime_maps_legacy_gemini_provider_to_openai() -> None:
    runtime = resolve_llm_runtime(provider="gemini", api_key="gemini-test-key")

    assert runtime.provider == "openai"
    assert runtime.model == DEFAULT_LLM_MODEL
    assert runtime.api_key == "gemini-test-key"


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
