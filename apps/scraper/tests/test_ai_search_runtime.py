"""Tests for provider-aware LLM runtime resolution."""

from scrapers.ai_search.llm_runtime import resolve_llm_runtime


def test_resolve_llm_runtime_preserves_openai_provider() -> None:
    runtime = resolve_llm_runtime(
        provider="openai",
        model="gpt-4o-mini",
        api_key="test-openai-key",
    )

    assert runtime.provider == "openai"
    assert runtime.model == "gpt-4o-mini"
    assert runtime.api_key == "test-openai-key"
    assert runtime.crawl4ai_provider == "openai/gpt-4o-mini"
