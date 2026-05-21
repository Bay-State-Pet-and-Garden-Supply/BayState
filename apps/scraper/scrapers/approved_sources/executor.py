"""Approved Source Extraction Executor.

Executes the prioritized source plan (distributors and official brands)
provided by the coordinator.

Flow:
1. Sort entries: selected distributor (runFirst) → others by priority
2. For each entry:
   a. Validate policy
   b. Get adapter from registry
   c. Execute adapter.extract()
   d. Accumulate source-level evidence/results
3. Return the best acceptable result with aggregated source_results/attempts
4. If all sources fail, return build_failed_result().

NEVER returns None — always returns valid EnrichmentResultV1.
"""

from __future__ import annotations

import logging
from typing import Any

from scrapers.approved_sources.adapters.registry import get_adapter_class
from scrapers.approved_sources.types import ApprovedSourcePlan, ApprovedSourcePlanEntry
from scrapers.ai_search.enrichment_models import EnrichmentResultV1, SourceResultInfo

logger = logging.getLogger(__name__)

PARTIAL_ACCEPTANCE_CONFIDENCE = 0.6


class ApprovedSourceExecutor:
    """Executes an ApprovedSourcePlan with full policy enforcement."""

    def __init__(
        self,
        plan: ApprovedSourcePlan,
        extractor: Any,
        api_client: Any | None = None,
    ):
        self.plan = plan
        self.extractor = extractor
        self.api_client = api_client
        self.policy = plan.sourcePolicy

        if api_client is not None:
            extractor.api_client = api_client

    async def execute(self) -> EnrichmentResultV1:
        """Execute the full extraction plan."""
        from scrapers.approved_sources.result_builder import build_failed_result

        sku = self.plan.sku
        logger.info(
            "[Executor] Starting execution for SKU=%s with %d source(s)",
            sku,
            len(self.plan.priority),
        )

        entries = sorted(
            self.plan.priority,
            key=lambda entry: (not entry.runFirst, entry.priority),
        )

        result = await self._try_source_entries(entries)

        if result:
            result.requested_extraction_mode = self.plan.extractionMode

        if not self._is_successful(result):
            if result:
                return result

            error_message = "All sources failed"
            if len(entries) == 0:
                error_message = "No sources provided in the plan"

            return build_failed_result(
                sku=sku,
                error_message=error_message,
                requested_extraction_mode=self.plan.extractionMode,
            )

        return result

    async def _try_source_entries(
        self,
        entries: list[ApprovedSourcePlanEntry],
    ) -> EnrichmentResultV1 | None:
        """Try all entries in order and return the best combined result."""
        from scrapers.approved_sources.result_builder import build_failed_result

        sku = self.plan.sku
        all_results: list[EnrichmentResultV1] = []

        for entry in entries:
            logger.info(
                "[Executor] Trying source: %s (%s, adapter=%s)",
                entry.displayName,
                entry.sourceSlug,
                entry.adapterSlug,
            )

            if not self._entry_policy_allowed(entry):
                logger.warning(
                    "[Executor] Entry %s blocked by policy",
                    entry.sourceSlug,
                )
                continue

            adapter_cls = get_adapter_class(entry.adapterSlug)
            if not adapter_cls:
                logger.warning(
                    "[Executor] No adapter for slug: %s",
                    entry.adapterSlug,
                )
                continue

            try:
                adapter = adapter_cls(entry, self.plan)
                result = await adapter.extract(self.extractor)
            except Exception as exc:  # pragma: no cover - defensive logging branch
                logger.error(
                    "[Executor] Adapter %s failed with exception: %s",
                    entry.sourceSlug,
                    exc,
                )
                result = build_failed_result(
                    sku=sku,
                    source_slug=entry.sourceSlug,
                    source_type=entry.sourceType,
                    error_message=str(exc),
                    requested_extraction_mode=self.plan.extractionMode,
                )

            if not result:
                logger.info(
                    "[Executor] Source %s returned no result",
                    entry.sourceSlug,
                )
                result = build_failed_result(
                    sku=sku,
                    source_slug=entry.sourceSlug,
                    source_type=entry.sourceType,
                    error_message="No result returned from adapter",
                    requested_extraction_mode=self.plan.extractionMode,
                )

            result.requested_extraction_mode = self.plan.extractionMode
            all_results.append(result)

        if not all_results:
            return None

        successes = [result for result in all_results if result.status == "success"]
        partials = [result for result in all_results if result.status == "partial"]

        if successes:
            best_result = max(
                successes,
                key=lambda result: result.confidence.overall if result.confidence else 0.0,
            )
        elif partials:
            best_result = max(
                partials,
                key=lambda result: result.confidence.overall if result.confidence else 0.0,
            )
        else:
            best_result = all_results[0]

        combined_source_results: list[SourceResultInfo] = []
        combined_attempts = []
        for result in all_results:
            if result.source_results:
                combined_source_results = self._merge_source_results(
                    combined_source_results,
                    list(result.source_results),
                )
            if result.attempts:
                combined_attempts.extend(result.attempts)

        best_result.source_results = combined_source_results
        best_result.attempts = combined_attempts
        best_result.llm_used = any(bool(result.llm_used) for result in all_results)
        best_result.requested_extraction_mode = self.plan.extractionMode

        return best_result

    def _entry_policy_allowed(self, entry: ApprovedSourcePlanEntry) -> bool:
        """Check if an entry is allowed by the source policy."""
        from scrapers.approved_sources.policy import check_disallowed_in_allowed

        offenders = check_disallowed_in_allowed(entry.domains, self.policy)
        if offenders:
            logger.warning(
                "[Executor] Entry %s has disallowed domains: %s",
                entry.sourceSlug,
                offenders,
            )
            return False

        return True

    def _is_successful(self, result: EnrichmentResultV1 | None) -> bool:
        """Check if a result is good enough to return as final."""
        if not result:
            return False
        if result.status == "success":
            return True
        if result.status == "partial":
            if (
                result.confidence
                and result.confidence.overall >= PARTIAL_ACCEPTANCE_CONFIDENCE
            ):
                return True
        return False

    def _merge_source_results(
        self,
        existing: list[SourceResultInfo],
        incoming: list[SourceResultInfo],
    ) -> list[SourceResultInfo]:
        merged: dict[str, SourceResultInfo] = {}

        for result in [*(existing or []), *(incoming or [])]:
            current = merged.get(result.sourceSlug)
            if current is None:
                merged[result.sourceSlug] = result
                continue

            current_matched_fields = len(current.matchedFields or [])
            next_matched_fields = len(result.matchedFields or [])
            should_replace = (
                result.confidence > current.confidence
                or (
                    result.confidence == current.confidence
                    and next_matched_fields >= current_matched_fields
                )
            )
            if should_replace:
                merged[result.sourceSlug] = result

        return sorted(
            merged.values(),
            key=lambda item: (-item.confidence, item.sourceSlug),
        )
