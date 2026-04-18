from __future__ import annotations

import logging

from core.api_client import JobConfig, ScraperAPIClient
from utils.logging_handlers import JobLoggingSession

from runner import run_job

logger = logging.getLogger(__name__)


def run_chunk_worker_mode(client: ScraperAPIClient, job_id: str, runner_name: str) -> None:
    logger.info(
        f"Chunk worker starting for job {job_id}",
        extra={"job_id": job_id, "runner_name": runner_name, "phase": "starting"},
    )

    chunks_processed = 0
    total_skus_processed = 0
    total_successful = 0

    # Fetch job config ONCE before the loop - don't refetch for every chunk
    base_job_config = client.get_job_config(job_id)
    if not base_job_config:
        raise RuntimeError("Failed to fetch initial job config")

    logger.info(
        f"Loaded base job config: {len(base_job_config.skus)} SKUs, {len(base_job_config.scrapers)} scrapers",
        extra={"job_id": job_id, "runner_name": runner_name, "phase": "configuring"},
    )
    base_scrapers_by_name = {scraper.name: scraper for scraper in base_job_config.scrapers}

    while True:
        chunk = client.claim_chunk(job_id=job_id, runner_name=runner_name)
        if not chunk:
            logger.info(
                f"No more chunks. Processed {chunks_processed} chunks, {total_skus_processed} SKUs",
                extra={"job_id": job_id, "runner_name": runner_name, "phase": "completed"},
            )
            break

        chunk_id = chunk.chunk_id
        chunk_index = chunk.chunk_index
        skus = chunk.skus
        scrapers_filter = chunk.scrapers
        planned_work_units = chunk.planned_work_units or (len(skus) * max(1, len(scrapers_filter or base_job_config.scrapers)))

        if chunk.job_id != job_id:
            logger.info(
                f"Skipping chunk from job {chunk.job_id}; expected {job_id}",
                extra={"job_id": job_id, "runner_name": runner_name, "phase": "claimed"},
            )
            continue

        logger.info(
            f"Processing chunk {chunk_index} with {len(skus)} SKUs",
            extra={
                "job_id": job_id,
                "runner_name": runner_name,
                "phase": "claimed",
                "chunk_id": chunk_id,
                "chunk_index": chunk_index,
            },
        )

        # Track partial results for incremental saving
        partial_results: dict[str, dict[str, dict]] = {}
        successful_skus: set[str] = set()

        def progress_callback(sku: str, scraper_name: str, data: dict) -> bool:
            """Callback invoked after each SKU is processed. Saves progress incrementally."""
            # Store in partial results
            if sku not in partial_results:
                partial_results[sku] = {}
            partial_results[sku][scraper_name] = data
            successful_skus.add(sku)

            # Submit progress to API (fire and forget - don't block on failure)
            try:
                client.submit_chunk_progress(chunk_id, sku, scraper_name, data)
                logger.debug(
                    f"Saved progress for {scraper_name}/{sku}",
                    extra={
                        "job_id": job_id,
                        "runner_name": runner_name,
                        "scraper_name": scraper_name,
                        "sku": sku,
                        "phase": "scraping",
                        "chunk_id": chunk_id,
                        "chunk_index": chunk_index,
                    },
                )
                return True
            except Exception as e:
                logger.warning(
                    f"Failed to save progress for {scraper_name}/{sku}: {e}",
                    extra={
                        "job_id": job_id,
                        "runner_name": runner_name,
                        "scraper_name": scraper_name,
                        "sku": sku,
                        "phase": "scraping",
                        "chunk_id": chunk_id,
                        "chunk_index": chunk_index,
                    },
                )
                return False

        try:
            # Build isolated per-chunk config (do not mutate shared base config)
            selected_scrapers = list(base_job_config.scrapers)
            if scrapers_filter:
                selected_scrapers = [base_scrapers_by_name[name] for name in scrapers_filter if name in base_scrapers_by_name]
                missing_scrapers = [name for name in scrapers_filter if name not in base_scrapers_by_name]
                if missing_scrapers:
                    logger.warning(
                        f"[Chunk Worker] Chunk {chunk_index} referenced unknown scrapers: {missing_scrapers}. "
                        f"Available scrapers: {list(base_scrapers_by_name.keys())}",
                        extra={
                            "job_id": job_id,
                            "runner_name": runner_name,
                            "phase": "configuring",
                            "chunk_id": chunk_id,
                            "chunk_index": chunk_index,
                        },
                    )

            if not selected_scrapers:
                available_scrapers = list(base_scrapers_by_name.keys())
                raise RuntimeError(f"Chunk {chunk_index} resolved to zero scrapers. Requested filter={scrapers_filter}, available={available_scrapers}")

            chunk_job_config = JobConfig(
                job_id=base_job_config.job_id,
                skus=list(skus),
                scrapers=selected_scrapers,
                test_mode=base_job_config.test_mode,
                max_workers=base_job_config.max_workers,
                job_type=base_job_config.job_type,
                job_config=base_job_config.job_config,
                ai_credentials=base_job_config.ai_credentials,
                lease_token=chunk.lease_token or base_job_config.lease_token,
                lease_expires_at=chunk.lease_expires_at or base_job_config.lease_expires_at,
            )

            # Run job with progress callback for incremental saving
            with JobLoggingSession(
                job_id=job_id,
                runner_name=runner_name,
                lease_token=chunk_job_config.lease_token,
                api_client=client,
            ) as job_logging:
                logger.info(
                    f"Running chunk {chunk_index}",
                    extra={
                        "job_id": job_id,
                        "runner_name": runner_name,
                        "phase": "claimed",
                        "chunk_id": chunk_id,
                        "chunk_index": chunk_index,
                        "flush_immediately": True,
                    },
                )
                results = run_job(
                    chunk_job_config,
                    runner_name=runner_name,
                    progress_callback=progress_callback,
                    api_client=client,
                    job_logging=job_logging,
                )

            # Calculate final results (including any SKUs that weren't captured by callback)
            final_data = results.get("data", {})
            for sku, scraper_data in final_data.items():
                if sku not in partial_results:
                    partial_results[sku] = scraper_data
                else:
                    # Merge any missing scraper data
                    for scraper_name, data in scraper_data.items():
                        if scraper_name not in partial_results[sku]:
                            partial_results[sku][scraper_name] = data
                if partial_results[sku]:
                    successful_skus.add(sku)

            skus_processed = len(skus)
            skus_successful = len(successful_skus)
            skus_failed = skus_processed - skus_successful

            chunk_results = {
                "skus_processed": skus_processed,
                "skus_successful": skus_successful,
                "skus_failed": skus_failed,
                "work_units_processed": planned_work_units,
                "work_units_total": planned_work_units,
                "data": partial_results,
                "logs": results.get("logs", []),
            }

            if not client.submit_chunk_results(chunk_id, "completed", results=chunk_results):
                raise RuntimeError(f"Failed to submit results for chunk {chunk_id}")

            chunks_processed += 1
            total_skus_processed += skus_processed
            total_successful += skus_successful

            logger.info(
                f"Completed chunk {chunk_index}: {skus_successful}/{skus_processed} successful",
                extra={
                    "job_id": job_id,
                    "runner_name": runner_name,
                    "phase": "completed",
                    "chunk_id": chunk_id,
                    "chunk_index": chunk_index,
                },
            )
        except Exception as e:
            logger.exception(
                f"Chunk {chunk_index} failed",
                extra={
                    "job_id": job_id,
                    "runner_name": runner_name,
                    "phase": "failed",
                    "chunk_id": chunk_id,
                    "chunk_index": chunk_index,
                    "flush_immediately": True,
                },
            )
            # Even on failure, save any partial results we collected
            if partial_results:
                logger.info(
                    f"Saving {len(partial_results)} partial results before failing",
                    extra={
                        "job_id": job_id,
                        "runner_name": runner_name,
                        "phase": "failed",
                        "chunk_id": chunk_id,
                        "chunk_index": chunk_index,
                    },
                )
                skus_successful = len(successful_skus)
                partial_chunk_results = {
                    "skus_processed": len(skus),
                    "skus_successful": skus_successful,
                    "skus_failed": len(skus) - skus_successful,
                    "work_units_processed": planned_work_units,
                    "work_units_total": planned_work_units,
                    "data": partial_results,
                }
                if not client.submit_chunk_results(chunk_id, "failed", results=partial_chunk_results, error_message=str(e)):
                    logger.error(
                        f"CRITICAL: Failed to submit failure results for chunk {chunk_id}",
                        extra={"job_id": job_id, "runner_name": runner_name, "phase": "failed"},
                    )
            else:
                if not client.submit_chunk_results(chunk_id, "failed", error_message=str(e)):
                    logger.error(
                        f"CRITICAL: Failed to submit failure status for chunk {chunk_id}",
                        extra={"job_id": job_id, "runner_name": runner_name, "phase": "failed"},
                    )

            # Re-raise to stop the worker from claiming more chunks if we can't report status
            raise

    logger.info(
        f"Chunk worker finished. Total: {chunks_processed} chunks, {total_successful}/{total_skus_processed} successful",
        extra={"job_id": job_id, "runner_name": runner_name, "phase": "completed"},
    )
