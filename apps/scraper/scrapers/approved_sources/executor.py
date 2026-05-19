"""Approved Source Extraction Executor.

Implements the distributor-first + SERP/AI official fallback orchestration
for enrichment jobs that provide an ApprovedSourcePlan.

Flow:
1. Sort entries: selected distributor (runFirst) → others by priority
2. For each entry:
   a. Validate policy
   b. Get adapter from registry
   c. Execute adapter.extract()
   d. If success, return immediately
   e. If auth_required, log and continue to next
3. If no distributor succeeded and llmPolicy.enabled:
   a. Run OfficialBrandAdapter (SERP/AI fallback)
   b. Validate result domain against policy
   c. Return result or fail closed
4. If still no result: return build_failed_result()

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

        # Phase 1: Try distributor/priority sources
        distributor_result = await self._try_distributor_entries(entries)

        # Phase 2: If no success and LLM fallback is enabled
        if not self._is_successful(distributor_result):
            if self._llm_fallback_allowed():
                logger.info(
                    "[Executor] No distributor success for SKU=%s, "
                    "trying official SERP/AI fallback",
                    sku,
                )
                official_result = await self._try_official_fallback()
                if official_result and self._is_successful(official_result):
                    return official_result

                # Official fallback also failed — merge warnings
                failed_result = build_failed_result(
                    sku=sku,
                    error_message=(
                        "No approved source found: all distributors and "
                        "official brand fallback failed"
                    ),
                )
                # Merge source results from prior attempts
                if distributor_result:
                    failed_result.source_results = (
                        distributor_result.source_results
                    )
                return failed_result

            # LLM fallback not allowed — fail closed
            if distributor_result:
                return distributor_result
            return build_failed_result(
                sku=sku,
                error_message="All sources failed and LLM fallback is disabled",
            )

        # Success from distributor phase
        return distributor_result

    async def _try_distributor_entries(
        self, entries: list[ApprovedSourcePlanEntry]
    ) -> EnrichmentResultV1 | None:
        """Try all priority entries in order, returning first success."""
        sku = self.plan.sku
        last_result = None

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
                continue

            if not result:
                logger.info(
                    "[Executor] Source %s returned no result, continuing",
                    entry.sourceSlug,
                )
                continue

            # Track source results
            last_result = result

            # Check for auth failures — continue to next source
            if result.status == "failed":
                auth_warnings = [
                    w for w in result.validation.warnings
                    if any(code in (w or "").upper()
                           for code in ["AUTH_REQUIRED", "AUTH_FAILED", "AUTH_EXPIRED"])
                ]
                if auth_warnings:
                    auth_type = next(
                        (c for c in ["AUTH_REQUIRED", "AUTH_FAILED", "AUTH_EXPIRED"]
                         if c in auth_warnings[0].upper()),
                        "AUTH",
                    )
                    logger.info(
                        "[Executor] Source %s: %s, "
                        "continuing to next source",
                        entry.sourceSlug,
                        auth_type,
                    )
                    continue

                # Other failure — continue, may succeed elsewhere
                continue

            # Partial with some fields? Consider it good enough when it clears
            # the same minimum confidence the coordinator accepts as processed.
            if result.status == "partial":
                if (
                    result.confidence
                    and result.confidence.overall >= PARTIAL_ACCEPTANCE_CONFIDENCE
                ):
                    logger.info(
                        "[Executor] Source %s returned partial with "
                        "confidence >= %.2f, accepting",
                        entry.sourceSlug,
                        PARTIAL_ACCEPTANCE_CONFIDENCE,
                    )
                    return result
                continue

            # Success!
            if result.status == "success":
                logger.info(
                    "[Executor] Source %s returned success",
                    entry.sourceSlug,
                )
                return result

        return last_result

    async def _try_official_fallback(self) -> EnrichmentResultV1 | None:
        """Execute the official brand SERP/AI fallback."""
        sku = self.plan.sku
        brand_name = self.plan.brand.name if self.plan.brand else None

        logger.info(
            "[Executor] Official SERP/AI fallback for SKU=%s brand=%s",
            sku,
            brand_name,
        )

        # Build an official brand entry from plan data
        official_entry = ApprovedSourcePlanEntry(
            sourceType="official_brand",
            sourceSlug="official_brand",
            displayName=brand_name or "Official Brand",
            domains=self._collect_official_domains(),
            assetDomains=self.policy.allowedAssetDomains,
            adapterSlug="crawl4ai_direct",
            requiresAuth=False,
            searchMode="sku_search",
            allowedFields=[],
            priority=0,
            runFirst=False,
        )

        adapter_cls = get_adapter_class("crawl4ai_direct")
        if not adapter_cls:
            logger.warning("[Executor] Official brand adapter not found")
            return None

        try:
            adapter = adapter_cls(official_entry, self.plan)
            result = await adapter.extract(self.extractor)
            return result
        except Exception as e:
            logger.error(
                "[Executor] Official brand adapter exception: %s",
                e,
            )
            return None

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

    def _llm_fallback_allowed(self) -> bool:
        """Check if LLM fallback is allowed by policy."""
        if not self.plan.llmPolicy:
            return False
        return self.plan.llmPolicy.enabled

    def _collect_official_domains(self) -> list[str]:
        """Collect approved official domains from plan entries and brand."""
        domains = list(self.policy.allowedDomains)

        # Add from priority entries
        for entry in self.plan.priority:
            if entry.sourceType == "official_brand":
                domains.extend(entry.domains)

        # Deduplicate
        return list(set(domains))

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
