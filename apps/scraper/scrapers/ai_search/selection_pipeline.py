"""Shared resolved-candidate selection pipeline."""

from dataclasses import dataclass
from typing import Any, Optional

from .models import ResolvedCandidate


@dataclass
class SelectionPipelineResult:
    """Ranked resolved candidates and selected URL metadata."""

    ranked_candidates: list[ResolvedCandidate]
    prioritized_url: str | None
    selector_cost_usd: float = 0.0
    selection_method: str = "heuristic"


def _candidate_to_selector_result(candidate: ResolvedCandidate, source_result: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "url": candidate.resolved_url,
        "title": str((source_result or {}).get("title") or ""),
        "description": str((source_result or {}).get("description") or ""),
        "source_url": candidate.source_url,
        "source_type": candidate.source_type,
        "source_domain": candidate.source_domain,
        "family_url": candidate.family_url,
        "resolved_variant": candidate.resolved_variant,
    }


async def run_selection_pipeline(
    *,
    search_results: list[dict[str, Any]],
    sku: str,
    product_name: Optional[str],
    brand: Optional[str],
    category: Optional[str],
    resolver: Any,
    scoring: Any,
    html_by_url: dict[str, str],
    resolved_payload_by_url: dict[str, str],
    selector: Any | None = None,
    prefer_manufacturer: bool = False,
    preferred_domains: list[str] | None = None,
) -> SelectionPipelineResult:
    """Resolve, rank, and optionally LLM-select candidate URLs."""
    resolved_candidates = resolver.resolve_candidates(
        search_results=search_results,
        sku=sku,
        product_name=product_name,
        brand=brand,
        html_by_url=html_by_url,
        resolved_payload_by_url=resolved_payload_by_url,
    )
    source_results_by_url = {str(result.get("url") or "").strip(): result for result in search_results if str(result.get("url") or "").strip()}
    ranked_candidates = scoring.rank_resolved_candidates(
        resolved_candidates,
        source_results_by_url=source_results_by_url,
        sku=sku,
        brand=brand,
        product_name=product_name,
        category=category,
        prefer_manufacturer=prefer_manufacturer,
        preferred_domains=preferred_domains,
    )

    prioritized_url = ranked_candidates[0].resolved_url if ranked_candidates else None
    selector_cost_usd = 0.0
    selection_method = "heuristic"

    if selector and ranked_candidates:
        selector_results = [_candidate_to_selector_result(candidate, source_results_by_url.get(candidate.source_url)) for candidate in ranked_candidates]
        selected_url, selector_cost_usd = await selector.select_best_url(
            results=selector_results,
            sku=sku,
            product_name=product_name or "",
            brand=brand,
            preferred_domains=preferred_domains,
        )
        if selected_url:
            prioritized_url = selected_url
            selection_method = "llm"
        else:
            selection_method = "heuristic_fallback"

    return SelectionPipelineResult(
        ranked_candidates=ranked_candidates,
        prioritized_url=prioritized_url,
        selector_cost_usd=float(selector_cost_usd or 0.0),
        selection_method=selection_method,
    )
