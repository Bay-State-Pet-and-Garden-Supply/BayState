"""Approved Source Extraction Executor.

Executes the prioritized source plan (distributors and official brands)
provided by the coordinator.

Flow:
1. Sort entries: selected distributor (runFirst) → others by priority
2. For each entry:
   a. Validate policy
   b. Get adapter from registry
   c. Execute adapter.extract()
   d. If success, return immediately
   e. If auth_required or failed, log and continue to next
3. If all sources fail, return build_failed_result().

NEVER returns None — always returns valid EnrichmentResultV1.
"""

from __future__ import annotations

import logging
from typing import Any

from scrapers.approved_sources.adapters.registry import (
    get_adapter_class,
)
from scrapers.approved_sources.types import (
    ApprovedSourcePlan,
    ApprovedSourcePlanEntry,
)
from scrapers.ai_search.enrichment_models import EnrichmentResultV1

logger = logging.getLogger(__name__)

PARTIAL_ACCEPTANCE_CONFIDENCE = 0.6


class ApprovedSourceExecutor:
    """Executes an ApprovedSourcePlan with full policy enforcement.

    Owns the complete extraction flow from source plan to EnrichmentResultV1.
    Returns a valid result for every input — never returns None.
    """

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

        # Attach api_client to extractor for distributor credential resolution.
        # ProductPageExtractor does not declare this attribute, but adapters read it
        # dynamically via getattr(extractor, "api_client", None).
        if api_client is not None:
            extractor.api_client = api_client

    async def execute(self) -> EnrichmentResultV1:
        """Execute the full extraction plan.

        Returns:
            EnrichmentResultV1 — always valid, never None.
        """
        from scrapers.approved_sources.result_builder import (
            build_failed_result,
        )

        sku = self.plan.sku
        logger.info(
            "[Executor] Starting execution for SKU=%s with %d source(s)",
            sku,
            len(self.plan.priority),
        )

        # Sort entries: runFirst=True first, then by priority (low to high)
        entries = sorted(
            self.plan.priority,
            key=lambda x: (not x.runFirst, x.priority),
        )

        # Execute prioritized sources
        result = await self._try_source_entries(entries)

        if not self._is_successful(result):
            error_message = "All sources failed"
            if len(entries) == 0:
                error_message = "No sources provided in the plan"
            
            return build_failed_result(
                sku=sku,
                error_message=error_message,
            )

        return result

    async def _try_source_entries(
        self, entries: list[ApprovedSourcePlanEntry]
    ) -> EnrichmentResultV1 | None:
        """Try all entries in order, combining results."""
        sku = self.plan.sku
        all_results: list[EnrichmentResultV1] = []

        for entry in entries:
            logger.info(
                "[Executor] Trying source: %s (%s, adapter=%s)",
                entry.displayName,
                entry.sourceSlug,
                entry.adapterSlug,
            )

            # Policy check at entry level
            if not self._entry_policy_allowed(entry):
                logger.warning(
                    "[Executor] Entry %s blocked by policy",
                    entry.sourceSlug,
                )
                continue

            # Resolve adapter
            adapter_cls = get_adapter_class(entry.adapterSlug)
            if not adapter_cls:
                logger.warning(
                    "[Executor] No adapter for slug: %s",
                    entry.adapterSlug,
                )
                continue

            # Instantiate and run
            try:
                adapter = adapter_cls(entry, self.plan)
                # Pass api_client for credential checks
                if hasattr(adapter, "check_credentials") and self.api_client:
                    pass  # adapter checks internally

                result = await adapter.extract(self.extractor)
            except Exception as e:
                logger.error(
                    "[Executor] Adapter %s failed with exception: %s",
                    entry.sourceSlug,
                    e,
                )
                from scrapers.approved_sources.result_builder import build_failed_result
                result = build_failed_result(
                    sku=sku,
                    source_slug=entry.sourceSlug,
                    source_type=entry.sourceType,
                    error_message=str(e),
                )

            if not result:
                logger.info(
                    "[Executor] Source %s returned no result",
                    entry.sourceSlug,
                )
                from scrapers.approved_sources.result_builder import build_failed_result
                result = build_failed_result(
                    sku=sku,
                    source_slug=entry.sourceSlug,
                    source_type=entry.sourceType,
                    error_message="No result returned from adapter",
                )

            all_results.append(result)

        if not all_results:
            return None

        # Choose the best result:
        # 1. Successes sorted by confidence descending
        # 2. Partials sorted by confidence descending
        # 3. Failures
        successes = [r for r in all_results if r.status == "success"]
        partials = [r for r in all_results if r.status == "partial"]

        if successes:
            best_result = max(successes, key=lambda r: r.confidence.overall if r.confidence else 0.0)
        elif partials:
            best_result = max(partials, key=lambda r: r.confidence.overall if r.confidence else 0.0)
        else:
            best_result = all_results[0]

        # Combine source results and attempts from all results
        combined_source_results = []
        combined_attempts = []
        for r in all_results:
            if r.source_results:
                combined_source_results.extend(r.source_results)
            if r.attempts:
                combined_attempts.extend(r.attempts)

        # Build combined EnrichmentResultV1 based on best_result
        best_result.source_results = combined_source_results
        best_result.attempts = combined_attempts
        best_result.llm_used = any(r.llm_used for r in all_results)

        return best_result


    def _entry_policy_allowed(self, entry: ApprovedSourcePlanEntry) -> bool:
        """Check if an entry is allowed by the source policy."""
        # Always block entries with completely disallowed domains
        from scrapers.approved_sources.policy import check_disallowed_in_allowed

        offenders = check_disallowed_in_allowed(
            entry.domains, self.policy
        )
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
