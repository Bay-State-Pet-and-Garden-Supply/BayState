"""LLM-powered source selection and ranking."""

import logging
import os
from typing import Any, Optional, Tuple

from openai import OpenAI
from scrapers.ai_cost_tracker import AICostTracker

logger = logging.getLogger(__name__)

class LLMSourceSelector:
    """Uses LLM to identify the best source URL from search results."""

    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4o-mini"):
        """Initialize the source selector."""
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        self.client = OpenAI(api_key=self.api_key) if self.api_key else None
        self._cost_tracker = AICostTracker()

    async def select_best_url(
        self,
        results: list[dict[str, Any]],
        sku: str,
        product_name: str,
    ) -> Tuple[Optional[str], float]:
        """Use LLM to select the best source URL from results.
        
        Args:
            results: List of search result dictionaries (url, title, description)
            sku: Target product SKU
            product_name: Target product name (potentially abbreviated)
            
        Returns:
            Tuple of (Selected URL or None, Cost in USD)
        """
        if not self.client:
            logger.warning("[LLM Source Selector] OpenAI API key not configured, skipping")
            return None, 0.0

        if not results:
            return None, 0.0

        # Limit to top 5 results to control cost and context window
        candidates = results[:5]
        
        # Build prompt
        prompt = self._build_prompt(sku, product_name, candidates)
        
        try:
            # Note: We use the synchronous client here, but it can be wrapped in a thread
            # or use an async client. For now, we'll use synchronous within the async method
            # as a starting point.
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a product sourcing expert. Your task is to identify the official manufacturer's product detail page from a list of search results."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.0,
                max_tokens=100,
            )
            
            content = str(response.choices[0].message.content or "").strip()
            
            # Record cost
            input_tokens = response.usage.prompt_tokens
            output_tokens = response.usage.completion_tokens
            cost = self._cost_tracker.calculate_cost(self.model, input_tokens, output_tokens)
            
            logger.info(f"[LLM Source Selector] LLM suggested: {content} (Cost: ${cost:.4f})")
            
            if content == "NONE" or not content.startswith("http"):
                return None, cost
                
            # Verify the returned URL is actually in our candidates
            selected_url = content
            for res in candidates:
                if res["url"] == selected_url:
                    return selected_url, cost
                    
            logger.warning(f"[LLM Source Selector] LLM returned a URL not in candidates: {selected_url}")
            return None, cost

        except Exception as e:
            logger.error(f"[LLM Source Selector] LLM ranking failed: {e}")
            return None, 0.0

    def _build_prompt(self, sku: str, product_name: str, candidates: list[dict[str, Any]]) -> str:
        """Build the selection prompt."""
        result_list = []
        for i, res in enumerate(candidates):
            result_list.append(f"Result [{i}]:\nURL: {res['url']}\nTitle: {res['title']}\nDescription: {res['description']}\n")

        results_text = "\n".join(result_list)
        
        return f"""Analyze the following search results for a product.
TARGET PRODUCT:
- SKU: {sku}
- Name: {product_name}

INSTRUCTIONS:
1. Identify which URL is most likely the OFFICIAL manufacturer's product detail page (PDP) for this exact product.
2. Prioritize official brand domains (e.g., if the product is 'Advantage II' by Elanco, prioritize elanco.com).
3. If no official manufacturer page is present, but a high-quality trusted retailer PDP (like Chewy, Amazon, or Petco) is available for the EXACT product, you may select it.
4. If multiple official pages exist, pick the one that most closely matches the SKU or specific variant.
5. If none of the results are a clear product detail page for the target product, return "NONE".
6. Return ONLY the URL of the best result, or "NONE". No other text.

SEARCH RESULTS:
{results_text}

BEST URL:"""
