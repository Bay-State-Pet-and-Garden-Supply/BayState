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

import asyncio
import logging
import random
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
        ai_credentials: dict[str, Any] | None = None,
        job_config: dict[str, Any] | None = None,
    ):
        self.plan = plan
        self.extractor = extractor
        self.api_client = api_client
        self.ai_credentials = ai_credentials
        self.job_config = job_config
        self.policy = plan.sourcePolicy
        # Random delay (seconds) between source executions to avoid rapid-fire
        # requests from the same IP. Set to (0, 0) to disable throttling.
        self.inter_source_delay: tuple[float, float] = (1.0, 3.0)

        if api_client is not None:
            extractor.api_client = api_client

    async def execute(self) -> EnrichmentResultV1:
        """Execute the full extraction plan."""
        from scrapers.approved_sources.result_builder import build_failed_result

        upc = self.plan.upc
        logger.info(
            "[Executor] Starting cascade execution for UPC=%s with %d source(s)",
            upc,
            len(self.plan.priority),
        )

        result = await self._try_source_entries(self.plan.priority)

        if result:
            result.requested_extraction_mode = self.plan.extractionMode

        if not self._is_successful(result):
            if result:
                return result

            error_message = "All sources failed"
            if len(self.plan.priority) == 0:
                error_message = "No sources provided in the plan"

            return build_failed_result(
                upc=upc,
                error_message=error_message,
                requested_extraction_mode=self.plan.extractionMode,
            )

        return result

    async def _try_source_entries(
        self,
        entries: list[ApprovedSourcePlanEntry],
    ) -> EnrichmentResultV1 | None:
        """
        Execute sources in cascade order.

        Phase 1: Run ALL distributor entries (run all, keep all).
        Phase 2: Classify outcomes — errors block SERP, success skips SERP.
        Phase 3: Conditionally run non-distributor entries (SERP/official brand)
                 only when ALL distributors were clean not_stocked.
        """
        upc = self.plan.upc

        # Separate distributors from other entries
        distributor_entries = [
            e for e in entries if e.sourceType == "distributor"
        ]
        other_entries = [
            e for e in entries if e.sourceType != "distributor"
        ]

        # Sort each group by priority only (runFirst is no longer used)
        distributor_entries.sort(key=lambda e: e.priority)
        other_entries.sort(key=lambda e: e.priority)

        all_results: list[EnrichmentResultV1] = []

        # ---- Phase 1: Execute ALL distributors ----
        for i, entry in enumerate(distributor_entries):
            result = await self._execute_single_entry(entry)
            if result:
                result.requested_extraction_mode = self.plan.extractionMode
                all_results.append(result)
            # Inter-source throttle: add a random delay between sources
            if i < len(distributor_entries) - 1 and self.inter_source_delay[1] > 0:
                delay = random.uniform(*self.inter_source_delay)
                logger.debug(
                    "[Executor] Inter-source throttle: %.1fs before next source",
                    delay,
                )
                await asyncio.sleep(delay)

        # ---- Phase 2: Classify distributor outcomes ----
        distributor_outcomes = self._collect_source_outcomes(all_results)
        has_source_error = any(o == "source_error" for o in distributor_outcomes)
        has_found = any(o == "found" for o in distributor_outcomes)

        # ---- Phase 3: Conditionally run SERP/official brand ----
        # SERP runs when:
        #   - Distributors exist, all clean not_stocked, none found (standard cascade)
        #   - No distributors in plan (run non-distributor entries directly)
        run_serp = (
            (not has_source_error and not has_found and len(distributor_entries) > 0)
            or len(distributor_entries) == 0
        )

        if run_serp:
            if len(distributor_entries) > 0:
                logger.info(
                    "[Executor] All distributors clean (not_stocked), "
                    "running SERP/official brand fallback for UPC=%s",
                    upc,
                )
            else:
                logger.info(
                    "[Executor] No distributors in plan, "
                    "running non-distributor source(s) for UPC=%s",
                    upc,
                )
            for entry in other_entries:
                result = await self._execute_single_entry(entry)
                if result:
                    result.requested_extraction_mode = self.plan.extractionMode
                    all_results.append(result)
        elif other_entries:
            reason = (
                "source error" if has_source_error
                else "product found" if has_found
                else "no distributors in plan"
            )
            logger.info(
                "[Executor] Skipping %d non-distributor source(s) "
                "due to %s for UPC=%s",
                len(other_entries),
                reason,
                upc,
            )

        # ---- Phase 4: Combine all results ----
        if not all_results:
            return None

        successes = [r for r in all_results if r.status == "success"]
        partials = [r for r in all_results if r.status == "partial"]

        if successes:
            best_result = max(
                successes,
                key=lambda r: r.confidence.overall if r.confidence else 0.0,
            )
        elif partials:
            best_result = max(
                partials,
                key=lambda r: r.confidence.overall if r.confidence else 0.0,
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

        # Normalize missing outcomes: infer from result status when not explicitly set
        for sr in combined_source_results:
            if not sr.outcome:
                # Check if this source had a successful or partial extraction
                matching = [
                    r for r in all_results
                    if r.source_results and any(
                        s.sourceSlug == sr.sourceSlug
                        for s in r.source_results
                    )
                ]
                if matching:
                    match_status = matching[0].status
                    if match_status in ("success", "partial"):
                        sr.outcome = "found"
                    elif match_status == "failed":
                        # Try to distinguish no-match from genuine error
                        has_no_match_warning = (
                            matching[0].validation
                            and matching[0].validation.warnings
                            and any("No match" in (w or "") for w in matching[0].validation.warnings)
                        )
                        sr.outcome = "not_stocked" if has_no_match_warning else "source_error"

        best_result.source_results = combined_source_results
        best_result.attempts = combined_attempts
        best_result.llm_used = any(bool(r.llm_used) for r in all_results)
        best_result.requested_extraction_mode = self.plan.extractionMode

        return best_result

    async def _execute_single_entry(
        self,
        entry: ApprovedSourcePlanEntry,
    ) -> EnrichmentResultV1 | None:
        """Execute a single plan entry and return the result."""
        from scrapers.approved_sources.result_builder import build_failed_result

        logger.info(
            "[Executor] Trying source: %s (%s, adapter=%s)",
            entry.displayName,
            entry.sourceSlug,
            entry.adapterSlug,
        )

        if not self._entry_policy_allowed(entry):
            from scrapers.approved_sources.result_builder import build_policy_blocked_result
            logger.warning(
                "[Executor] Entry %s blocked by policy",
                entry.sourceSlug,
            )
            return build_policy_blocked_result(
                upc=self.plan.upc,
                source_slug=entry.sourceSlug,
                blocked_url=entry.domains[0] if entry.domains else "",
                reason="Domain is not allowed by source policy",
                requested_extraction_mode=self.plan.extractionMode,
            )

        adapter_cls = get_adapter_class(entry.adapterSlug)
        if not adapter_cls:
            logger.warning(
                "[Executor] No adapter for slug: %s",
                entry.adapterSlug,
            )
            return build_failed_result(
                upc=self.plan.upc,
                source_slug=entry.sourceSlug,
                source_type=entry.sourceType,
                error_message=f"No adapter found for slug: {entry.adapterSlug}",
                requested_extraction_mode=self.plan.extractionMode,
            )

        try:
            adapter = adapter_cls(entry, self.plan)
            adapter.ai_credentials = getattr(self, "ai_credentials", None)
            result = await adapter.extract(self.extractor)
        except Exception as exc:
            logger.error(
                "[Executor] Adapter %s failed with exception: %s",
                entry.sourceSlug,
                exc,
            )
            result = build_failed_result(
                upc=self.plan.upc,
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
                upc=self.plan.upc,
                source_slug=entry.sourceSlug,
                source_type=entry.sourceType,
                error_message="No result returned from adapter",
                requested_extraction_mode=self.plan.extractionMode,
            )

        result.requested_extraction_mode = self.plan.extractionMode
        return result

    def _collect_source_outcomes(
        self,
        results: list[EnrichmentResultV1],
    ) -> list[str]:
        """Collect source-level outcome classifications from results.

        Falls back to inferring outcome from result status when
        individual source_results don't have explicit outcome set.
        """
        outcomes: list[str] = []
        for result in results:
            if result.source_results:
                for sr in result.source_results:
                    if sr.outcome:
                        outcomes.append(sr.outcome)
                    else:
                        # Infer from result status
                        if result.status in ("success", "partial"):
                            outcomes.append("found")
                        elif result.status == "failed":
                            # Check if this was a clean no-match vs error
                            has_warnings = (
                                result.validation
                                and result.validation.warnings
                            )
                            is_no_match = any(
                                "No match" in (w or "")
                                for w in (has_warnings or [])
                            )
                            outcomes.append(
                                "not_stocked" if is_no_match else "source_error"
                            )
        return outcomes

    def _entry_policy_allowed(self, entry: ApprovedSourcePlanEntry) -> bool:
        """Check if an entry is allowed by the source policy."""
        # Generic scrapers are strictly limited by domain policy.
        # Specific custom adapters are explicitly requested and allowed.
        generic_adapters = {"crawl4ai_direct", "serp_discovery"}
        if entry.adapterSlug not in generic_adapters:
            return True

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
