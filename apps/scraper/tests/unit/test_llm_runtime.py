from scrapers.ai_search.llm_runtime import DEFAULT_LLM_MODEL, resolve_llm_runtime


def test_resolve_llm_runtime_maps_legacy_gemini_provider_to_openai() -> None:
    runtime = resolve_llm_runtime(provider="gemini", api_key="gemini-test-key")

    assert runtime.provider == "openai"
    assert runtime.model == DEFAULT_LLM_MODEL
    assert runtime.api_key == "gemini-test-key"
