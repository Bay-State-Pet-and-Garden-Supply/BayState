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
        ai_credentials: dict[str, Any] | None = None,
        job_config: dict[str, Any] | None = None,
    ):
        self.plan = plan
        self.extractor = extractor
        self.api_client = api_client
        self.ai_credentials = ai_credentials
        self.job_config = job_config
        self.policy = plan.sourcePolicy

        if api_client is not None:
            extractor.api_client = api_client

    async def execute(self) -> EnrichmentResultV1:
        """Execute the full extraction plan."""
        from scrapers.approved_sources.result_builder import build_failed_result

        upc = self.plan.upc
        logger.info(
            "[Executor] Starting execution for UPC=%s with %d source(s)",
            upc,
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
                upc=upc,
                error_message=error_message,
                requested_extraction_mode=self.plan.extractionMode,
            )

        # Run OCR Vision processing if enabled in config
        await self._run_ocr_if_enabled(result)

        return result

    async def _run_ocr_if_enabled(self, result: EnrichmentResultV1) -> None:
        """Run OCR on the best product image if enabled in job config."""
        if not result or not result.product:
            return

        job_config = self.job_config or {}
        ocr_config = job_config.get("ocr")
        
        # Check if OCR is enabled (default to True unless explicitly disabled)
        ocr_enabled = True
        ocr_model = "gpt-4o-mini"
        ocr_prompt = None
        ocr_max_tokens = 500

        if ocr_config is not None:
            if isinstance(ocr_config, bool):
                ocr_enabled = ocr_config
            elif isinstance(ocr_config, dict):
                ocr_enabled = ocr_config.get("enabled", True)
                ocr_model = ocr_config.get("model", ocr_model)
                ocr_prompt = ocr_config.get("prompt", ocr_prompt)
                ocr_max_tokens = ocr_config.get("max_tokens", ocr_max_tokens)

        if not ocr_enabled:
            logger.info("[Executor] OCR is disabled in job configuration.")
            return

        image_urls = result.product.image_urls
        if not image_urls:
            logger.info("[Executor] OCR enabled but no images found on product.")
            return

        # Select the best image
        from src.ocr.image_selector import select_ocr_images
        best_images = select_ocr_images(image_urls, max_images=1, upc=self.plan.upc)
        if not best_images:
            logger.info("[Executor] OCR enabled but no suitable image selected by heuristics.")
            return

        best_image = best_images[0]
        logger.info("[Executor] Selected image for OCR: %s (UPC=%s)", best_image, self.plan.upc)

        # Resolve credentials:
        import os
        credentials = self.ai_credentials or {}
        
        # 1. Prefer explicit openai_api_key from coordinator
        api_key = credentials.get("openai_api_key")
        base_url = None
        
        # 2. Check for process environment OPENAI_API_KEY
        if not api_key:
            api_key = os.getenv("OPENAI_API_KEY")
            
        # 3. Fallback to llm_api_key if the provider is openai or openai_compatible
        if not api_key:
            llm_provider = credentials.get("llm_provider")
            if llm_provider in ("openai", "openai_compatible"):
                api_key = credentials.get("llm_api_key")
                base_url = credentials.get("llm_base_url")
                
        # 4. Fallback to default LLM_API_KEY if model/provider is openai
        if not api_key:
            if os.getenv("LLM_MODEL", "").startswith("gpt-"):
                api_key = os.getenv("LLM_API_KEY")
                base_url = os.getenv("LLM_BASE_URL")

        # Run vision service
        from src.ocr.vision_service import extract_text_from_image_urls
        try:
            ocr_text = await extract_text_from_image_urls(
                [best_image],
                api_key=api_key,
                base_url=base_url,
                model=ocr_model,
                prompt=ocr_prompt,
                max_tokens=ocr_max_tokens,
            )
            
            if ocr_text:
                if result.product.evidence:
                    result.product.evidence.image_text = ocr_text
                else:
                    from scrapers.ai_search.enrichment_models import EvidenceData
                    result.product.evidence = EvidenceData(
                        selected_images=[best_image],
                        image_text=ocr_text,
                    )
                logger.info(
                    "[Executor] OCR extraction succeeded for UPC=%s (%d characters)",
                    self.plan.upc,
                    len(ocr_text),
                )
            else:
                logger.warning("[Executor] OCR extraction returned empty result for UPC=%s", self.plan.upc)
        except Exception as exc:
            logger.error("[Executor] OCR extraction failed: %s", exc, exc_info=True)

    async def _try_source_entries(
        self,
        entries: list[ApprovedSourcePlanEntry],
    ) -> EnrichmentResultV1 | None:
        """Try all entries in order and return the best combined result."""
        from scrapers.approved_sources.result_builder import build_failed_result

        upc = self.plan.upc
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
                adapter.ai_credentials = getattr(self, "ai_credentials", None)
                result = await adapter.extract(self.extractor)
            except Exception as exc:  # pragma: no cover - defensive logging branch
                logger.error(
                    "[Executor] Adapter %s failed with exception: %s",
                    entry.sourceSlug,
                    exc,
                )
                result = build_failed_result(
                    upc=upc,
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
                    upc=upc,
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
