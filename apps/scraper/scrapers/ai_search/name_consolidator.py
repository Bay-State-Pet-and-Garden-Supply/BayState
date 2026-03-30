"""LLM-powered product name consolidation."""

import logging
import os
from typing import Any

from openai import AsyncOpenAI

from scrapers.ai_cost_tracker import AICostTracker

logger = logging.getLogger(__name__)


class NameConsolidator:
    """Uses LLM to infer a canonical product name from search results."""

    def __init__(self, api_key: str | None = None, model: str = "gpt-4o-mini"):
        """Initialize the name consolidator."""
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        self.client = AsyncOpenAI(api_key=self.api_key) if self.api_key else None
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
        if not self.client or not search_snippets:
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
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a product data expert specializing in name canonicalization."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.0,
                max_tokens=60,
            )

            content = str(response.choices[0].message.content or "").strip()

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
