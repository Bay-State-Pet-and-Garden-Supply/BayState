"""LLM-powered product name consolidation."""

import logging
import math
import re
from typing import Any

from scrapers.ai_cost_tracker import AICostTracker
from scrapers.ai_search.llm_runtime import resolve_llm_runtime
from scrapers.providers.factory import create_llm_provider

logger = logging.getLogger(__name__)

TOKEN_RE = re.compile(r"[A-Za-z0-9]+")
PAGE_RE = re.compile(r"\bpage\s+\d+\b", re.IGNORECASE)
CODE_LIKE_RE = re.compile(r"^[A-Z0-9]+(?:\s+[A-Z0-9]+)*$")
RETAILER_NOISE_TOKENS = {
    "amazon",
    "arett",
    "facebook",
    "home",
    "page",
    "sales",
    "shop",
    "store",
}
AUTH_FAILURE_MARKERS = (
    "401",
    "incorrect api key",
    "invalid_api_key",
    "authentication",
    "unauthorized",
)


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
        self._auth_failed = False

    def _normalized_tokens(self, text: str) -> list[str]:
        return [token.lower() for token in TOKEN_RE.findall(str(text or "")) if token]

    def _split_title_segments(self, title: str) -> list[str]:
        segments = [str(title or "").strip()]
        for separator in ("|", "—", "–"):
            next_segments: list[str] = []
            for segment in segments:
                next_segments.extend(part.strip() for part in segment.split(separator))
            segments = next_segments

        next_segments = []
        for segment in segments:
            if " - " in segment:
                next_segments.extend(part.strip() for part in segment.split(" - "))
            else:
                next_segments.append(segment)

        deduped: list[str] = []
        seen: set[str] = set()
        for segment in next_segments:
            cleaned = " ".join(segment.split())
            lowered = cleaned.lower()
            if cleaned and lowered not in seen:
                seen.add(lowered)
                deduped.append(cleaned)
        return deduped

    def _score_snippet_candidate(self, candidate: str, abbreviated_tokens: list[str]) -> int:
        candidate_tokens = self._normalized_tokens(candidate)
        if len(candidate_tokens) < 2:
            return -1
        if PAGE_RE.search(candidate):
            return -1
        if CODE_LIKE_RE.fullmatch(candidate):
            return -1
        if any(token in RETAILER_NOISE_TOKENS for token in candidate_tokens):
            return -1

        overlap = len(set(candidate_tokens) & set(abbreviated_tokens))
        if overlap < min(2, len(abbreviated_tokens)):
            return -1

        return overlap * 10 + min(len(candidate_tokens), 8)

    def _best_snippet_candidate(self, abbreviated_name: str, search_snippets: list[dict[str, Any]]) -> str | None:
        abbreviated_tokens = self._normalized_tokens(abbreviated_name)
        if not abbreviated_tokens:
            return None

        best_candidate: str | None = None
        best_score = -1

        for snippet in search_snippets[:5]:
            title = str(snippet.get("title") or "").strip()
            if not title:
                continue

            for candidate in self._split_title_segments(title):
                score = self._score_snippet_candidate(candidate, abbreviated_tokens)
                if score > best_score:
                    best_candidate = candidate
                    best_score = score

        return best_candidate

    def _is_too_generic(self, candidate: str, abbreviated_name: str) -> bool:
        candidate_tokens = self._normalized_tokens(candidate)
        abbreviated_tokens = self._normalized_tokens(abbreviated_name)
        if not candidate_tokens:
            return True
        if len(abbreviated_tokens) < 3:
            return False

        minimum_specific_tokens = max(2, math.ceil(len(abbreviated_tokens) * 0.6))
        if len(candidate_tokens) < minimum_specific_tokens:
            return True

        if abbreviated_tokens[: len(candidate_tokens)] == candidate_tokens and len(candidate_tokens) < len(abbreviated_tokens):
            return True

        return False

    def _resolve_candidate(
        self,
        abbreviated_name: str,
        llm_candidate: str,
        heuristic_candidate: str | None,
    ) -> str:
        candidate = " ".join(str(llm_candidate or "").split())
        if candidate and not self._is_too_generic(candidate, abbreviated_name):
            return candidate
        if heuristic_candidate:
            return heuristic_candidate
        return abbreviated_name

    @staticmethod
    def _summarize_error(error: Exception, *, max_length: int = 240) -> str:
        text = " ".join(str(error).split())
        if len(text) <= max_length:
            return text
        return f"{text[: max_length - 3]}..."

    @classmethod
    def _is_auth_error(cls, error: Exception) -> bool:
        message = str(error).lower()
        status_code = getattr(error, "status_code", None)
        if status_code == 401:
            return True
        response = getattr(error, "response", None)
        if getattr(response, "status_code", None) == 401:
            return True
        return any(marker in message for marker in AUTH_FAILURE_MARKERS)

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
        if not search_snippets:
            return abbreviated_name, 0.0

        heuristic_candidate = self._best_snippet_candidate(abbreviated_name, search_snippets)
        fallback_candidate = heuristic_candidate or abbreviated_name
        if self._auth_failed:
            return fallback_candidate, 0.0
        if not self.provider:
            return fallback_candidate, 0.0

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
4. Never broaden the result to just a brand, company, catalog, or category. Keep the product-specific terms.
5. If the search results are contradictory or don't provide a clear full name, return the original abbreviated name.
6. Return ONLY the consolidated name. No other text.

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

            resolved_name = self._resolve_candidate(abbreviated_name, content, heuristic_candidate)
            logger.info(
                "[Name Consolidator] Inferred name '%s' -> using '%s' from abbreviation '%s' (Cost: $%.4f)",
                content,
                resolved_name,
                abbreviated_name,
                cost,
            )

            return resolved_name, cost

        except Exception as e:
            if self._is_auth_error(e):
                self._auth_failed = True
                logger.warning("[Name Consolidator] Disabling LLM consolidation after authentication failure")
                return fallback_candidate, 0.0

            logger.warning("[Name Consolidator] Consolidation failed: %s", self._summarize_error(e))
            return fallback_candidate, 0.0
