from __future__ import annotations

from collections.abc import AsyncIterator, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
import inspect
import logging
from typing import Literal, Protocol

from .grouping import CohortGroupingConfig, group_products_into_cohorts
from .processor import CohortProcessor, ProductRecord

logger = logging.getLogger(__name__)

ProcessingMode = Literal["auto", "cohort", "individual"]
CohortProcessingMode = Literal["cohort", "individual"]


class BrowserProtocol(Protocol):
    def quit(self) -> object: ...


class WorkflowExecutorProtocol(Protocol):
    browser: BrowserProtocol | None

    async def initialize(self) -> None: ...

    async def execute_workflow(
        self,
        context: dict[str, object] | None = None,
        quit_browser: bool = True,
    ) -> dict[str, object]: ...


@dataclass(slots=True)
class CohortJobResult:
    """Aggregated result for a cohort or single-product job."""

    cohort_id: str
    status: str
    products_processed: int
    products_succeeded: int
    products_failed: int
    results: dict[str, object] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    metadata: dict[str, object] = field(default_factory=dict)


class CohortJobProcessor:
    """Process products in cohort or individual modes with shared executor state."""

    def __init__(
        self,
        workflow_executor: WorkflowExecutorProtocol,
        cohort_config: CohortGroupingConfig | None = None,
    ) -> None:
        self.executor: WorkflowExecutorProtocol = workflow_executor
        self.config: CohortGroupingConfig = cohort_config or CohortGroupingConfig()
        self.processor: CohortProcessor = CohortProcessor(
            grouping_strategy=self.config.strategy,
            prefix_length=self.config.prefix_length,
            upc_field=self.config.upc_field,
        )

    async def process_cohort(
        self,
        cohort_key: str,
        products: Sequence[ProductRecord],
        scraper_config: Mapping[str, object] | None = None,
    ) -> CohortJobResult:
        """Process all products assigned to one cohort using a shared browser session."""
        async with self._executor_session():
            return await self._process_product_batch(
                batch_key=cohort_key,
                products=products,
                scraper_config=scraper_config,
                processing_mode="cohort",
            )

    async def process_individual_product(
        self,
        product: ProductRecord,
        scraper_config: Mapping[str, object] | None = None,
    ) -> CohortJobResult:
        """Process a single product while preserving the cohort-style result contract."""
        sku = self._product_key(product)
        async with self._executor_session():
            return await self._process_product_batch(
                batch_key=sku,
                products=[product],
                scraper_config=scraper_config,
                processing_mode="individual",
            )

    async def process_products(
        self,
        products: Sequence[ProductRecord],
        scraper_config: Mapping[str, object] | None = None,
        mode: ProcessingMode = "auto",
    ) -> dict[str, CohortJobResult]:
        """Process a list of products in cohort, individual, or mixed auto mode."""
        if mode not in {"auto", "cohort", "individual"}:
            raise ValueError(f"Unsupported processing mode: {mode}")

        product_list = list(products)
        if not product_list:
            return {}

        batch_specs = self._build_batch_specs(product_list, mode)
        processed: dict[str, CohortJobResult] = {}

        async with self._executor_session():
            for batch_key, batch_products, processing_mode in batch_specs:
                processed[batch_key] = await self._process_product_batch(
                    batch_key=batch_key,
                    products=batch_products,
                    scraper_config=scraper_config,
                    processing_mode=processing_mode,
                )

        return processed

    async def _process_product_batch(
        self,
        *,
        batch_key: str,
        products: Sequence[ProductRecord],
        scraper_config: Mapping[str, object] | None,
        processing_mode: CohortProcessingMode,
    ) -> CohortJobResult:
        logger.info("Processing %s batch %s with %s products", processing_mode, batch_key, len(products))

        results: dict[str, object] = {}
        errors: list[str] = []
        succeeded = 0
        failed = 0

        for product in products:
            sku = self._product_key(product)
            try:
                result = await self._process_product(product)
                results[sku] = result
                succeeded += 1
            except Exception as exc:
                logger.exception("Failed to process product %s in batch %s", sku, batch_key)
                message = f"{sku}: {exc}"
                results[sku] = {"success": False, "error": str(exc)}
                errors.append(message)
                failed += 1

        status = self._resolve_status(succeeded=succeeded, failed=failed)
        cohort_metadata = self.processor.get_cohort_metadata(batch_key, products) if processing_mode == "cohort" else {}

        return CohortJobResult(
            cohort_id=batch_key,
            status=status,
            products_processed=len(products),
            products_succeeded=succeeded,
            products_failed=failed,
            results=results,
            errors=errors,
            metadata={
                "processing_mode": processing_mode,
                "scraper_name": self._extract_scraper_name(scraper_config),
                "product_skus": [self._product_key(product) for product in products],
                **cohort_metadata,
            },
        )

    async def _process_product(self, product: ProductRecord) -> dict[str, object]:
        context: dict[str, object] = {"sku": self._product_key(product), "product": dict(product)}
        return await self.executor.execute_workflow(context=context, quit_browser=False)

    def _build_batch_specs(
        self,
        products: Sequence[ProductRecord],
        mode: ProcessingMode,
    ) -> list[tuple[str, list[ProductRecord], CohortProcessingMode]]:
        if mode == "individual":
            return [(self._product_key(product), [product], "individual") for product in products]

        grouping_result = group_products_into_cohorts(list(products), self.config)
        batches: list[tuple[str, list[ProductRecord], CohortProcessingMode]] = [
            (cohort_key, list(cohort_products), "cohort") for cohort_key, cohort_products in grouping_result.cohorts.items()
        ]

        assigned_ids = {id(product) for _, cohort_products, _ in batches for product in cohort_products}
        fallback_products = [product for product in products if id(product) not in assigned_ids]

        if fallback_products:
            logger.info(
                "Processing %s ungrouped products individually for backward compatibility",
                len(fallback_products),
            )
            batches.extend((self._product_key(product), [product], "individual") for product in fallback_products)

        if mode == "cohort":
            return batches

        ordered_batches = sorted(
            batches,
            key=lambda batch: (batch[2] != "cohort", batch[0]),
        )
        return ordered_batches

    @asynccontextmanager
    async def _executor_session(self) -> AsyncIterator[None]:
        should_cleanup = getattr(self.executor, "browser", None) is None
        if should_cleanup:
            await self.executor.initialize()

        try:
            yield
        finally:
            if should_cleanup:
                await self._close_browser()

    async def _close_browser(self) -> None:
        browser = self.executor.browser
        if browser is None:
            return

        maybe_awaitable = browser.quit()
        if inspect.isawaitable(maybe_awaitable):
            await maybe_awaitable

    def _resolve_status(self, *, succeeded: int, failed: int) -> str:
        if failed == 0:
            return "success"
        if succeeded > 0:
            return "partial"
        return "failed"

    def _product_key(self, product: ProductRecord) -> str:
        sku = str(product.get(self.config.upc_field) or "").strip()
        return sku or "unknown-sku"

    def _extract_scraper_name(self, scraper_config: Mapping[str, object] | None) -> str:
        if scraper_config is None:
            return "unknown"
        name = scraper_config.get("name")
        return str(name) if name else "unknown"
