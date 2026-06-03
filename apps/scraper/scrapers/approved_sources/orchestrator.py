"""Approved Source Extraction Orchestrator.

Thin wrapper around ApprovedSourceExecutor for backward compatibility.
Main orchestration logic is in executor.py.
"""

from __future__ import annotations

import logging

from typing import Any

from scrapers.approved_sources.executor import ApprovedSourceExecutor
from scrapers.approved_sources.types import ApprovedSourcePlan
from scrapers.ai_search.enrichment_models import EnrichmentResultV1
from scrapers.product_url_extraction.extractor import ProductPageExtractor

logger = logging.getLogger(__name__)


class ApprovedSourceOrchestrator:
    """Orchestrates multi-source extraction based on an ApprovedSourcePlan.

    Delegates to ApprovedSourceExecutor for actual execution.
    Maintains backward-compatible interface.
    """

    def __init__(
        self,
        plan: ApprovedSourcePlan,
        extractor: ProductPageExtractor,
        ai_credentials: dict[str, Any] | None = None,
        job_config: dict[str, Any] | None = None,
    ):
        self.plan = plan
        self.extractor = extractor
        self.policy = plan.sourcePolicy
        self.ai_credentials = ai_credentials
        self.job_config = job_config

    async def run(self) -> EnrichmentResultV1 | None:
        """Execute the orchestration loop.

        Returns:
            EnrichmentResultV1 (never None — executor always returns a result).
        """
        executor = ApprovedSourceExecutor(
            plan=self.plan,
            extractor=self.extractor,
            ai_credentials=self.ai_credentials,
            job_config=self.job_config,
        )
        result = await executor.execute()
        return result
