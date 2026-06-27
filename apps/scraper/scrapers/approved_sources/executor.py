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
        import sys
        is_testing = "pytest" in sys.modules or "unittest" in sys.modules
        self.inter_source_delay: tuple[float, float] = (0.0, 0.0) if is_testing else (1.0, 3.0)

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

        Legacy mode (default):
          Phase 1: Run ALL distributor entries (run all, keep all).
          Phase 2: Classify outcomes — errors block SERP, success skips SERP.
          Phase 3: Conditionally run non-distributor entries (SERP/official brand)
                   only when ALL distributors were clean not_stocked.

        V2 mode (upc_resolution_v2 in job_config):
          Phase 1: Run ALL distributor entries.
          Phase 2: V2 stage routing:
            - Any distributor 'found' → skip official_brand and serp stages.
            - Any non-Amazon 'source_error' (no 'found') → skip all, fail closed.
            - All 'not_stocked' → run official_brand stage entries.
          Phase 3: If still unconfirmed after official_brand, run serp stage.
        """
        is_v2 = bool(self.job_config and self.job_config.get("upc_resolution_v2"))

        if is_v2:
            return await self._try_source_entries_v2(entries)
        else:
            return await self._try_source_entries_legacy(entries)

    async def _try_source_entries_legacy(
        self,
        entries: list[ApprovedSourcePlanEntry],
    ) -> EnrichmentResultV1 | None:
        """
        Legacy cascade: distributors first, then SERP/official brand fallback.
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

        all_results = await self._execute_entries_with_throttle(distributor_entries)

        # ---- Classify distributor outcomes ----
        distributor_outcomes_with_slugs = self._collect_source_outcomes_with_slugs(all_results)
        has_found = any(o == "found" for o, _ in distributor_outcomes_with_slugs)
        # Amazon is prone to bot blocks; treat its source_error as non-blocking
        has_source_error = any(
            o == "source_error" and slug != "amazon"
            for o, slug in distributor_outcomes_with_slugs
        )

        # ---- Conditionally run SERP/official brand ----
        serp_policy_disabled = bool(
            self.job_config
            and self.job_config.get("serp_fallback_policy") == "disabled"
        )
        run_serp = (
            not serp_policy_disabled
            and (
                (not has_source_error and not has_found and len(distributor_entries) > 0)
                or len(distributor_entries) == 0
            )
        )

        if run_serp:
            fallback_reason = (
                "all distributors clean (not_stocked)" if len(distributor_entries) > 0
                else "no distributors in plan"
            )
            logger.info(
                "[Executor] %s, running SERP/official brand fallback for UPC=%s",
                fallback_reason, upc,
            )
            fallback_results = await self._execute_entries_with_throttle(other_entries)
            all_results.extend(fallback_results)
        elif other_entries:
            reason = (
                "source error" if has_source_error
                else "product found" if has_found
                else "no distributors in plan"
            )
            logger.info(
                "[Executor] Skipping %d non-distributor source(s) "
                "due to %s for UPC=%s",
                len(other_entries), reason, upc,
            )

        return self._combine_results(all_results)

    async def _try_source_entries_v2(
        self,
        entries: list[ApprovedSourcePlanEntry],
    ) -> EnrichmentResultV1 | None:
        """
        V2 staged cascade: distributors → official_brand → serp.
        """
        upc = self.plan.upc

        # Group entries by resolutionStage
        distributor_entries: list[ApprovedSourcePlanEntry] = []
        official_brand_entries: list[ApprovedSourcePlanEntry] = []
        serp_entries: list[ApprovedSourcePlanEntry] = []
        other_entries: list[ApprovedSourcePlanEntry] = []

        for e in entries:
            stage = (e.resolutionStage or "").lower()
            if e.sourceType == "distributor" or stage == "distributor":
                distributor_entries.append(e)
            elif stage == "official_brand":
                official_brand_entries.append(e)
            elif stage == "serp":
                serp_entries.append(e)
            else:
                other_entries.append(e)

        # Sort each group by priority
        for group in (distributor_entries, official_brand_entries, serp_entries, other_entries):
            group.sort(key=lambda e: e.priority)

        all_results: list[EnrichmentResultV1] = []

        # ---- Phase 1: Run ALL distributor entries ----
        logger.info(
            "[Executor V2] Phase 1: Running %d distributor(s) for UPC=%s",
            len(distributor_entries), upc,
        )
        all_results.extend(
            await self._execute_entries_with_throttle(distributor_entries)
        )

        # ---- Phase 2: Classify distributor outcomes ----
        dist_outcomes = self._collect_source_outcomes_with_slugs(all_results)
        has_dist_found = any(o == "found" for o, _ in dist_outcomes)
        # Non-Amazon source_error blocks fallback
        has_blocking_error = any(
            o == "source_error" and slug != "amazon"
            for o, slug in dist_outcomes
        )

        if has_dist_found:
            logger.info(
                "[Executor V2] Distributor found product for UPC=%s, "
                "skipping official_brand and serp stages",
                upc,
            )
            return self._combine_results(all_results)

        if has_blocking_error and len(distributor_entries) > 0:
            logger.info(
                "[Executor V2] Distributor source_error (no found) for UPC=%s, "
                "blocking official_brand and serp stages",
                upc,
            )
            return self._combine_results(all_results)

        # ---- Phase 3: Run official_brand stage ----
        if official_brand_entries:
            logger.info(
                "[Executor V2] Phase 3: Running %d official_brand crawl(s) for UPC=%s",
                len(official_brand_entries), upc,
            )
            ob_results = await self._execute_entries_with_throttle(official_brand_entries)
            all_results.extend(ob_results)

            ob_outcomes = self._collect_source_outcomes_with_slugs(ob_results)
            has_ob_found = any(o == "found" for o, _ in ob_outcomes)

            if has_ob_found:
                logger.info(
                    "[Executor V2] Official brand found UPC for UPC=%s, skipping serp stage",
                    upc,
                )
                # Still run other_entries (licensed, etc.) if present
                if other_entries:
                    other_results = await self._execute_entries_with_throttle(other_entries)
                    all_results.extend(other_results)
                return self._combine_results(all_results)

        # ---- Phase 4: Run SERP candidate stage ----
        if serp_entries:
            logger.info(
                "[Executor V2] Phase 4: Running %d SERP candidate(s) for UPC=%s",
                len(serp_entries), upc,
            )
            serp_results = await self._execute_entries_with_throttle(serp_entries)
            all_results.extend(serp_results)

        # ---- Run any remaining other entries (licensed feeds, etc.) ----
        if other_entries:
            other_results = await self._execute_entries_with_throttle(other_entries)
            all_results.extend(other_results)

        return self._combine_results(all_results)

    async def _execute_entries_with_throttle(
        self,
        entries: list[ApprovedSourcePlanEntry],
    ) -> list[EnrichmentResultV1]:
        """Execute multiple entries with inter-source throttling."""
        results: list[EnrichmentResultV1] = []
        for i, entry in enumerate(entries):
            result = await self._execute_single_entry(entry)
            if result:
                result.requested_extraction_mode = self.plan.extractionMode
                results.append(result)
            if i < len(entries) - 1 and self.inter_source_delay[1] > 0:
                delay = random.uniform(*self.inter_source_delay)
                logger.debug(
                    "[Executor] Inter-source throttle: %.1fs before next source",
                    delay,
                )
                await asyncio.sleep(delay)
        return results

    def _combine_results(
        self,
        all_results: list[EnrichmentResultV1],
    ) -> EnrichmentResultV1 | None:
        """Combine multiple extraction results into one final result.

        Shared across legacy and V2 modes.
        """
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

    def _lookup_profile_snapshot(self, entry: ApprovedSourcePlanEntry) -> dict[str, Any] | None:
        """Look up the profile snapshot for a given entry from job_config.

        Searches by brand-scoped key (brandId:sourceSlug:domain) combinations.
        Validates that the snapshot's brand_id matches the plan's brand to prevent
        cross-brand misrouting.
        Returns the first matching snapshot dict, or None.
        """
        if not self.job_config:
            return None
        profile_snapshots = self.job_config.get("profile_snapshots", {})
        if not profile_snapshots or not isinstance(profile_snapshots, dict):
            return None

        # Determine brand ID from the plan
        plan_brand_id = None
        if hasattr(self, "plan") and self.plan:
            plan_brand = getattr(self.plan, "brand", None) or {}
            if isinstance(plan_brand, dict):
                plan_brand_id = plan_brand.get("id")

        for domain in entry.domains:
            # Use brand-scoped key to prevent cross-brand misrouting
            key = f"{plan_brand_id}:{entry.sourceSlug}:{domain}" if plan_brand_id else f"{entry.sourceSlug}:{domain}"
            snapshot = profile_snapshots.get(key)
            if snapshot and isinstance(snapshot, dict):
                # Validate brand_id in scope matches the plan's brand
                scope = snapshot.get("scope", {})
                snapshot_brand_id = scope.get("brand_id") if isinstance(scope, dict) else None
                if plan_brand_id and snapshot_brand_id and snapshot_brand_id != plan_brand_id:
                    logger.warning(
                        "[Executor] Snapshot brand_id %s does not match plan brand_id %s — skipping",
                        snapshot_brand_id, plan_brand_id,
                    )
                    continue
                return snapshot
        return None

    def _attach_profile_status(
        self,
        result: EnrichmentResultV1 | None,
        snapshot: dict[str, Any] | None,
    ) -> None:
        """Attach ProfileExtractionStatus to source_results if a snapshot matched."""
        if not snapshot or not result or not result.source_results:
            return
        from scrapers.ai_search.enrichment_models import ProfileExtractionStatus

        profile_status = ProfileExtractionStatus(
            profile_used=True,
            profile_id=snapshot.get("profile_id"),
            version_id=snapshot.get("version_id"),
            version_hash=snapshot.get("version_hash"),
        )
        for sr in result.source_results:
            sr.profile_extraction_status = profile_status

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

        # ---- Look up profile snapshot for this entry ----
        profile_snapshot = self._lookup_profile_snapshot(entry)

        try:
            adapter = adapter_cls(entry, self.plan)
            adapter.ai_credentials = getattr(self, "ai_credentials", None)

            # If a profile snapshot with compiled schema exists, pass it to
            # the adapter's extractor for schema-based extraction.
            # The extractor (ProductPageExtractor) has a profile_snapshot property
            # that propagates to Crawl4AIExtractor._profile_snapshot.
            if profile_snapshot and self.extractor is not None:
                self.extractor.profile_snapshot = profile_snapshot

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
        finally:
            # Reset profile_snapshot on the extractor after each entry
            if self.extractor is not None:
                self.extractor.profile_snapshot = None

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

        # ---- Attach profile extraction status if snapshot matched ----
        self._attach_profile_status(result, profile_snapshot)

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

    def _collect_source_outcomes_with_slugs(
        self,
        results: list[EnrichmentResultV1],
    ) -> list[tuple[str, str]]:
        """Collect (outcome, source_slug) pairs from results.

        Falls back to inferring outcome from result status when
        individual source_results don't have explicit outcome set.
        Source slug defaults to "unknown" if not present.
        """
        pairs: list[tuple[str, str]] = []
        for result in results:
            if result.source_results:
                for sr in result.source_results:
                    slug = sr.sourceSlug or "unknown"
                    if sr.outcome:
                        pairs.append((sr.outcome, slug))
                    else:
                        # Infer from result status
                        if result.status in ("success", "partial"):
                            pairs.append(("found", slug))
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
                            pairs.append(
                                ("not_stocked" if is_no_match else "source_error", slug)
                            )
        return pairs

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
