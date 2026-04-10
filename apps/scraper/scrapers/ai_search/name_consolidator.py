"""LLM-powered product name consolidation."""

import logging
from typing import Any

from scrapers.ai_cost_tracker import AICostTracker
from scrapers.ai_search.llm_runtime import resolve_llm_runtime
from scrapers.providers.factory import create_llm_provider

logger = logging.getLogger(__name__)


class NameConsolidator:
    """Uses LLM to infer a canonical product name from search results."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gpt-4o-mini",
        provider: str = "openai",
        base_url: str | None = None,
    ):
        """Initialize the name consolidator."""
        self.runtime = resolve_llm_runtime(
            provider=provider,
            model=model,
            base_url=base_url,
            api_key=api_key,
        )
        self.api_key = self.runtime.api_key
        self.model = self.runtime.model
        self.provider = create_llm_provider(
            provider=provider,
            model=model,
            base_url=base_url,
            api_key=api_key,
        )
        self.client = getattr(self.provider, "_client", None) if self.provider is not None else None
        self._cost_tracker = AICostTracker()

    async def consolidate_name(
        self,
        sku: str,
        abbreviated_name: str,
        search_snippets: list[dict[str, Any]],
    ) -> tuple[str, float]:
        """Consolidate an abbreviated name into a canonical one using search context.

        Args:
            sku: Product SKU
            abbreviated_name: Initial abbreviated product name
            search_snippets: List of search results (title, description) from initial search

        Returns:
            Tuple of (Consolidated Name, Cost in USD)
        """
        if not self.provider or not search_snippets:
            return abbreviated_name, 0.0

        # Limit snippets to top 5
        candidates = search_snippets[:5]
        snippets_text = "\n".join([f"- Title: {res.get('title')}\n  Desc: {res.get('description')}" for res in candidates])

        prompt = f"""You are a product data specialist. Your task is to decipher an abbreviated product name using search result snippets.

INPUT:
- SKU: {sku}
- Abbreviated Name: {abbreviated_name}

SEARCH CONTEXT:
{snippets_text}

TASK:
1. Analyze the search snippets to identify the actual Brand and full Product Name.
2. Bridge the gap between the abbreviation and the real product (e.g., 'ADVNTG' -> 'Advantage', 'LRG' -> 'Large').
3. Return the canonical 'Brand + Product Name' string.
4. If the search results are contradictory or don't provide a clear name, return the original abbreviated name.
5. Return ONLY the consolidated name. No other text.

        CONSOLIDATED NAME:"""

        try:
            response = await self.provider.generate_text(
                system_prompt="You are a product data expert specializing in name canonicalization.",
                user_prompt=prompt,
                temperature=0.0,
                max_output_tokens=60,
            )

            content = response.text.strip()

            # Record cost
            if response.usage:
                input_tokens = response.usage.prompt_tokens
                output_tokens = response.usage.completion_tokens
                cost = self._cost_tracker.calculate_cost(self.model, input_tokens, output_tokens)
            else:
                cost = 0.0

            logger.info(f"[Name Consolidator] Inferred name: '{content}' from abbreviation '{abbreviated_name}' (Cost: ${cost:.4f})")

            return content or abbreviated_name, cost

        except Exception as e:
            logger.error(f"[Name Consolidator] Consolidation failed: {e}")
            return abbreviated_name, 0.0
