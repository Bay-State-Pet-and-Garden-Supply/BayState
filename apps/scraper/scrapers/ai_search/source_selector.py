"""LLM-powered source selection and ranking."""

import logging
from typing import Any, Optional

from ..ai_cost_tracker import AICostTracker
from .llm_runtime import resolve_llm_runtime
from ..providers.factory import create_llm_provider

logger = logging.getLogger(__name__)


class LLMSourceSelector:
    """Uses LLM to identify the best source URL from search results."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gpt-4o-mini",
        provider: str = "openai",
        base_url: str | None = None,
    ):
        """Initialize the source selector."""
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

    async def select_best_url(
        self,
        results: list[dict[str, Any]],
        sku: str,
        product_name: str,
        brand: Optional[str] = None,
        preferred_domains: list[str] | None = None,
    ) -> tuple[str | None, float]:
        """Use LLM to select the best source URL from results.

        Args:
            results: List of search result dictionaries (url, title, description)
            sku: Target product SKU
            product_name: Target product name (potentially abbreviated)

        Returns:
            Tuple of (Selected URL or None, Cost in USD)
        """
        if not self.provider:
            logger.warning("[LLM Source Selector] LLM client is not configured, skipping")
            return None, 0.0

        if not results:
            return None, 0.0

        # Limit to top 5 results to control cost and context window
        candidates = results[:5]

        # Build prompt
        prompt = self._build_prompt(
            sku=sku,
            product_name=product_name,
            brand=brand,
            candidates=candidates,
            preferred_domains=preferred_domains,
        )

        try:
            response = await self.provider.generate_text(
                system_prompt=(
                    "You are a product sourcing expert. Your task is to identify the official manufacturer's product detail page from a list of search results."
                ),
                user_prompt=prompt,
                temperature=0.0,
                max_output_tokens=100,
            )

            content = response.text.strip()

            # Record cost
            if response.usage:
                input_tokens = response.usage.prompt_tokens
                output_tokens = response.usage.completion_tokens
                cost = self._cost_tracker.calculate_cost(self.model, input_tokens, output_tokens)
            else:
                cost = 0.0

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

    def _build_prompt(
        self,
        sku: str,
        product_name: str,
        brand: Optional[str],
        candidates: list[dict[str, Any]],
        preferred_domains: list[str] | None,
    ) -> str:
        """Build the selection prompt."""
        result_list = []
        for i, res in enumerate(candidates):
            result_lines = [
                f"Result [{i}]:",
                f"URL: {str(res.get('url') or '')}",
                f"Title: {str(res.get('title') or '')}",
                f"Description: {str(res.get('description') or '')}",
            ]

            source_url = str(res.get("source_url") or "").strip()
            if source_url:
                result_lines.append(f"Source URL: {source_url}")

            source_type = str(res.get("source_type") or "").strip()
            if source_type:
                result_lines.append(f"Source Type: {source_type}")

            source_domain = str(res.get("source_domain") or res.get("source_tier") or "").strip()
            if source_domain:
                result_lines.append(f"Source Tier/Domain: {source_domain}")

            family_url = str(res.get("family_url") or "").strip()
            if family_url:
                result_lines.append(f"Family URL: {family_url}")

            resolved_variant = res.get("resolved_variant")
            if resolved_variant:
                result_lines.append(f"Resolved Variant: {resolved_variant}")

            resolver = str(res.get("resolver") or (resolved_variant or {}).get("resolver") or "").strip()
            if resolver:
                result_lines.append(f"Resolver: {resolver}")

            result_list.append("\n".join(result_lines) + "\n")

        results_text = "\n".join(result_list)
        preferred_domains_text = ", ".join(preferred_domains or []) or "None"

        return f"""Analyze the following search results for a product.
TARGET PRODUCT:
- SKU: {sku}
- Name: {product_name}
- Brand: {brand or "Unknown"}
- Preferred cohort domains: {preferred_domains_text}

INSTRUCTIONS:
1. Identify which URL is most likely the OFFICIAL manufacturer's product detail page (PDP) for this exact product.
2. Prioritize official brand domains (e.g., if the product is 'Advantage II' by Elanco, prioritize elanco.com).
3. If sibling SKUs already validated on one of the preferred cohort domains, prefer that same domain when it contains the exact target variant.
4. If no official manufacturer page is present, but a high-quality trusted retailer PDP \
   (like Chewy, Amazon, or Petco) is available for the EXACT product, you may select it.
5. Treat marketplaces such as eBay as last-resort options, and only pick them when the result clearly proves the exact SKU/variant.
6. If multiple official pages exist, pick the one that most closely matches the SKU or specific variant.
7. If none of the results are a clear product detail page for the target product, return "NONE".
8. Return ONLY the URL of the best result, or "NONE". No other text.

SEARCH RESULTS:
{results_text}

BEST URL:"""
