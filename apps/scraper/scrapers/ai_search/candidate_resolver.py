"""Candidate URL resolution helpers for AI search results."""

import json
from typing import Optional

from .extraction import ExtractionUtils
from .models import ResolvedCandidate


class CandidateResolver:
    """Resolve direct and official-family search results into candidate URLs."""

    def __init__(self, scoring_module):
        self._scoring = scoring_module
        self._extraction = ExtractionUtils(scoring_module)

    def _build_candidate(
        self, url: str, *, source_url: str, source_type: str, family_url: Optional[str] = None, resolved_variant: Optional[dict] = None
    ) -> ResolvedCandidate:
        resolved_url = url
        canonical_url = self._extraction.canonicalize_url(resolved_url)
        resolved_canonical_url = self._extraction.canonicalize_url(resolved_url)
        return ResolvedCandidate(
            url=resolved_url,
            canonical_url=canonical_url,
            source_url=source_url,
            source_domain=self._scoring.domain_from_url(source_url),
            source_type=source_type,
            resolved_url=resolved_url,
            resolved_canonical_url=resolved_canonical_url,
            family_url=family_url,
            resolved_variant=resolved_variant,
        )

    def _normalized_resolved_variant(self, payload_text: str, extracted: dict, sku: str) -> Optional[dict]:
        resolved_variant = extracted.get("resolved_variant") if isinstance(extracted.get("resolved_variant"), dict) else None
        if not resolved_variant:
            return None

        variant_id = str(resolved_variant.get("variant_id") or "").strip()
        if variant_id:
            return resolved_variant

        try:
            payload = json.loads(payload_text)
        except json.JSONDecodeError:
            payload = {}

        normalized_variant_id = self._extraction.selected_demandware_variant_id(payload) or sku
        return {**resolved_variant, "variant_id": normalized_variant_id}

    def _resolve_official_family_candidate(
        self,
        *,
        result: dict,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        html_by_url: dict[str, str],
        resolved_payload_by_url: dict[str, str],
    ) -> ResolvedCandidate:
        source_url = str(result.get("url") or "").strip()
        html = html_by_url.get(source_url, "")
        variant_candidates = self._extraction.extract_demandware_variant_candidates(
            html_text=html,
            source_url=source_url,
            expected_name=product_name,
        )
        for variant_candidate in variant_candidates:
            candidate_url = str(variant_candidate.get("url") or "").strip()
            if not candidate_url:
                continue
            payload = resolved_payload_by_url.get(candidate_url, "")
            extracted = self._extraction.extract_product_from_html_jsonld(
                html_text=payload,
                source_url=source_url,
                sku=sku,
                product_name=product_name,
                brand=brand,
                matching_utils=self._scoring._matching,
            )
            if not extracted:
                continue
            resolved_url = str(extracted.get("url") or "").strip()
            if not resolved_url:
                continue
            return self._build_candidate(
                resolved_url,
                source_url=source_url,
                source_type="official_family",
                family_url=source_url,
                resolved_variant=self._normalized_resolved_variant(payload, extracted, sku),
            )

        return self._build_candidate(source_url, source_url=source_url, source_type="official_family", family_url=source_url)

    def resolve_candidates(
        self,
        *,
        search_results: list[dict],
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        html_by_url: dict[str, str],
        resolved_payload_by_url: dict[str, str],
    ) -> list[ResolvedCandidate]:
        candidates: list[ResolvedCandidate] = []
        seen: set[str] = set()

        for result in search_results:
            source_url = str(result.get("url") or "").strip()
            if not source_url:
                continue

            source_class = self._scoring.classify_result_source(result, sku, brand, product_name)
            if source_class == "official_family":
                candidate = self._resolve_official_family_candidate(
                    result=result,
                    sku=sku,
                    product_name=product_name,
                    brand=brand,
                    html_by_url=html_by_url,
                    resolved_payload_by_url=resolved_payload_by_url,
                )
            else:
                candidate = self._build_candidate(source_url, source_url=source_url, source_type="direct")

            dedupe_key = candidate.resolved_canonical_url or candidate.canonical_url
            if not dedupe_key or dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            candidates.append(candidate)

        return candidates
