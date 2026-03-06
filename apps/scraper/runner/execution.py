"""
Execution Engine for Scraper Runner

Extracted key execution functions from runtime.py:
- ThreadPoolExecutor usage
- Work-stealing queue implementation
- Excel SKU loading functions
- Browser batch restart logic
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from queue import Empty, Queue
from threading import Barrier, BrokenBarrierError, Lock
from typing import Any, Callable, Dict, List, Optional, Tuple

# Ensure project root is in path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from core.events import *
from core.settings_manager import *
from scrapers.sku_loader import SKULoader

logger = logging.getLogger(__name__)

# Type aliases
ScraperConfig = Any
WorkflowExecutor = Any
ResultCollector = Any


@dataclass
class ExecutionResult:
    """Result of a single worker execution."""

    success: int
    failed: int
    processed: int
    duration: float
    avg_sku_time: float
    worker_id: str
    scraper: str
    test_details: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class WorkerConfig:
    """Configuration for a worker."""

    config: ScraperConfig
    sku_queue: Queue[str]
    worker_id: str
    start_delay: float
    total_skus: int


def load_skus_from_excel(
    file_path: str,
    log_callback: Optional[Callable[[str], None]] = None,
) -> Tuple[List[str], Dict[str, Any]]:
    """
    Load SKUs from an Excel file.

    Args:
        file_path: Path to the Excel file
        log_callback: Optional callback for logging

    Returns:
        Tuple of (sku_list, price_metadata_dict)
    """
    price_metadata: Dict[str, Any] = {}

    def log(msg: str, level: str = "INFO") -> None:
        """Log helper."""
        formatted = f"[{level}] {msg}"
        if level == "INFO":
            logger.info(formatted)
        elif level == "ERROR":
            logger.error(formatted)
        elif level == "WARNING":
            logger.warning(formatted)

        if log_callback:
            try:
                log_callback(formatted)
            except Exception:
                pass

    try:
        loader = SKULoader()
        records = loader.load_with_context(file_path)
        skus = [r["SKU"] for r in records]

        # Extract Price metadata for preservation
        for record in records:
            sku = record.get("SKU", "")
            # Check for Price in various column names
            price = record.get("Price", record.get("LIST_PRICE", record.get("price", "")))
            if price:
                price_metadata[sku] = price

        log(f"Loaded {len(skus)} SKUs from {file_path}", "INFO")
        if price_metadata:
            log(f"Found prices for {len(price_metadata)} products", "INFO")

        return skus, price_metadata

    except FileNotFoundError:
        log(f"Excel file not found: {file_path}", "ERROR")
        raise
    except Exception as e:
        log(f"Failed to load Excel file: {e}", "ERROR")
        raise


def load_skus_with_metadata(
    file_path: Optional[str] = None,
    skus: Optional[List[str]] = None,
) -> Tuple[List[str], Dict[str, Any]]:
    """
    Load SKUs with metadata from file or direct input.

    Args:
        file_path: Path to Excel file (optional)
        skus: List of SKUs (alternative to file_path)

    Returns:
        Tuple of (sku_list, metadata_dict)
    """
    price_metadata: Dict[str, Any] = {}

    if skus:
        # Use provided SKUs
        logger.info(f"Processing {len(skus)} SKUs (Direct Input)")
        return skus, price_metadata
    elif file_path:
        # Load SKUs from Excel file
        skus, price_metadata = load_skus_from_excel(file_path)
        return skus, price_metadata
    else:
        raise ValueError("No SKUs or file_path provided")


def create_work_stealing_queues(
    configs: List[ScraperConfig],
    skus: List[str],
    scraper_workers: Optional[Dict[str, int]] = None,
    max_workers: Optional[int] = None,
    test_mode: bool = False,
) -> Tuple[List[Tuple[ScraperConfig, Queue[str], str, float, int]], int, Dict[str, Queue[str]]]:
    """
    Create work-stealing queues for parallel scraping.

    Instead of pre-splitting SKUs among workers, each scraper gets a shared queue.
    Workers pull from the queue until empty - fast workers automatically take more work.

    Args:
        configs: List of scraper configurations
        skus: List of SKUs to process
        scraper_workers: Dict mapping scraper name to worker count
        max_workers: Maximum total concurrent workers
        test_mode: If True, enforces single worker per scraper

    Returns:
        Tuple of (tasks, workers_used, scraper_queues)
    """
    scraper_queues: Dict[str, Queue[str]] = {}
    tasks = []
    workers_used = 0

    # Calculate default workers per scraper
    default_workers_per_scraper = max(1, (max_workers or 2) // len(configs)) if configs else 1

    for config in configs:
        # Start with distributed default
        count = default_workers_per_scraper

        if test_mode:
            count = 1
            logger.info(f"{config.name}: Enforcing 1 worker (Test Mode)")

        if scraper_workers:
            # Normalize keys for comparison (title case)
            normalized_workers = {k.title(): v for k, v in scraper_workers.items()}
            config_name_title = config.name.title()

            if config_name_title in normalized_workers:
                count = normalized_workers[config_name_title]
                logger.debug(f"{config.name}: Matched worker count {count}")

        # CRITICAL: Enforce single-threading for login sites
        if hasattr(config, "requires_login") and config.requires_login():
            if count > 1:
                logger.warning(f"{config.name}: Enforcing single-thread (Login Required)")
                count = 1
            else:
                logger.debug(f"{config.name}: Login required, keeping single-thread")

        # Create a shared queue for this scraper's SKUs
        sku_queue: Queue[str] = Queue()

        # Get SKUs for this scraper
        scraper_skus = skus if skus else (config.test_skus if test_mode and hasattr(config, "test_skus") and config.test_skus else [])

        if not scraper_skus:
            logger.warning(f"{config.name}: No SKUs to process")
            continue

        for sku in scraper_skus:
            sku_queue.put(sku)
        scraper_queues[config.name] = sku_queue

        if count > 1:
            logger.info(f"{config.name}: {count} workers (shared queue with work-stealing)")

            for i in range(count):
                # Stagger start times to prevent browser launch storms
                delay = workers_used * 2.0
                tasks.append((config, sku_queue, f"W{i + 1}", delay, len(scraper_skus)))
                workers_used += 1
        else:
            # Single worker
            delay = workers_used * 2.0
            tasks.append((config, sku_queue, "Main", delay, len(scraper_skus)))
            workers_used += 1
            logger.info(f"{config.name}: 1 worker (sequential)")

    logger.info(f"Total active workers: {workers_used}")
    return tasks, workers_used, scraper_queues


def should_restart_browser(skus_processed: int, batch_size: int = 20) -> bool:
    """
    Determine if browser should be restarted based on batch size.

    Args:
        skus_processed: Number of SKUs processed so far
        batch_size: Number of SKUs before restart (default: 20)

    Returns:
        True if browser should be restarted
    """
    return skus_processed > 1 and (skus_processed - 1) % batch_size == 0


def process_sku_with_batch_restart(
    executor: WorkflowExecutor,
    loop: asyncio.AbstractEventLoop,
    sku: str,
    skus_processed: int,
    config: ScraperConfig,
    worker_id: str,
    batch_size: int = 20,
    headless: bool = True,
    browser_timeout: Optional[int] = None,
    stop_event: Optional[Any] = None,
    debug_mode: bool = False,
    job_id: Optional[str] = None,
    event_emitter: Optional[EventEmitter] = None,
) -> Tuple[WorkflowExecutor, bool]:
    """
    Process a single SKU with automatic browser batch restart.

    Args:
        executor: Current WorkflowExecutor instance
        loop: Asyncio event loop
        sku: SKU to process
        skus_processed: Count of processed SKUs
        config: Scraper configuration
        worker_id: Worker identifier
        batch_size: SKUs per browser restart batch
        headless: Run browser headless
        browser_timeout: Browser timeout in seconds
        stop_event: Optional stop event for cancellation
        debug_mode: Enable debug mode
        job_id: Job identifier
        event_emitter: Optional event emitter

    Returns:
        Tuple of (executor, should_continue)
    """
    prefix = f"[{config.name}:{worker_id}]"

    # Restart browser every batch_size items
    if should_restart_browser(skus_processed, batch_size):
        logger.info(f"{prefix} Restarting browser (batch limit {batch_size} reached)...")
        try:
            if executor and hasattr(executor, "browser") and executor.browser and loop:
                loop.run_until_complete(executor.browser.quit())

            # Re-initialize executor (which creates new browser)
            from scrapers.executor.workflow_executor import WorkflowExecutor as WFE

            executor = WFE(
                config,
                headless=headless,
                timeout=browser_timeout,
                worker_id=worker_id,
                stop_event=stop_event,
                debug_mode=debug_mode,
                job_id=job_id or "",
                event_emitter=event_emitter,
            )
            if loop:
                loop.run_until_complete(executor.initialize())
        except Exception as e:
            logger.error(f"{prefix} Failed to restart browser: {e}")

    return executor, True


def run_worker_thread(
    args: Tuple[Any, ...],
    emitter: EventEmitter,
    collector: ResultCollector,
    total_operations: int,
    progress_lock: Lock,
    progress_callback: Optional[Callable[[int], None]] = None,
    scraper_progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    status_callback: Optional[Callable[[str], None]] = None,
    log_callback: Optional[Callable[[str], None]] = None,
    stop_event: Optional[Any] = None,
    test_mode: bool = False,
    debug_mode: bool = False,
    browser_timeout: Optional[int] = None,
    job_id: Optional[str] = None,
    batch_size: int = 20,
) -> ExecutionResult:
    """
    Worker thread function for processing SKUs from a shared queue.

    This implements the work-stealing pattern where multiple workers
    pull from the same queue until it's empty.

    Args:
        args: Tuple of (config, sku_queue, worker_id, start_delay, total_skus, barrier)
        emitter: Event emitter for progress events
        collector: Result collector for storing results
        total_operations: Total operations across all workers
        progress_lock: Lock for thread-safe progress updates
        progress_callback: Callback for overall progress percentage
        scraper_progress_callback: Callback for per-scraper progress
        status_callback: Callback for status updates
        log_callback: Callback for log messages
        stop_event: Event for cancellation
        test_mode: If True, runs in test mode
        debug_mode: If True, enables debug output
        browser_timeout: Browser timeout in seconds
        job_id: Job identifier
        batch_size: SKUs per browser restart

    Returns:
        ExecutionResult with statistics
    """
    config, sku_queue, worker_id, start_delay, total_skus, barrier = args

    scraper_success = 0
    scraper_failed = 0
    skus_processed = 0
    sku_timings: List[float] = []
    test_details: List[Dict[str, Any]] = []

    worker_start_time = time.time()
    prefix = f"[{config.name}:{worker_id}]"

    def log(msg: str, level: str = "INFO", essential: bool = False) -> None:
        """Log a message."""
        if emitter:
            if level == "INFO":
                emitter.info(msg, essential=essential)
            elif level == "WARNING":
                emitter.warning(msg)
            elif level == "ERROR":
                emitter.error(msg)

        formatted_msg = f"[{level}] {msg}"
        if level == "INFO":
            logger.info(formatted_msg)
        elif level == "WARNING":
            logger.warning(formatted_msg)
        elif level == "ERROR":
            logger.error(formatted_msg)
        else:
            logger.debug(formatted_msg)

        if log_callback:
            try:
                log_callback(formatted_msg)
            except Exception:
                pass

    def update_status(msg: str) -> None:
        """Update status callback."""
        if status_callback:
            try:
                status_callback(msg)
            except Exception:
                pass

    def update_scraper_progress(data: Dict[str, Any]) -> None:
        """Update scraper progress callback."""
        if scraper_progress_callback:
            try:
                scraper_progress_callback(data)
            except Exception:
                pass

    # Staggered startup wait
    if start_delay > 0:
        log(f"{prefix} Waiting {start_delay:.1f}s to stagger startup...", "INFO")
        time.sleep(start_delay)

    # Emit SCRAPER_STARTED event
    emitter.scraper_started(
        scraper=config.name,
        worker_id=worker_id,
        total_skus=total_skus,
    )

    log(f"\n{'=' * 60}", "INFO")
    log(f"Starting scraper: {config.name} ({worker_id}) - pulling from shared queue ({total_skus} total SKUs)", "INFO", essential=True)
    log(f"{'=' * 60}", "INFO")

    update_status(f"Running {config.name} ({worker_id})...")
    update_scraper_progress(
        {
            "scraper": config.name,
            "worker_id": worker_id,
            "status": "running",
            "completed": 0,
            "failed": 0,
            "current_item": "Starting...",
        }
    )

    # Initialize executor for this scraper
    executor = None
    loop = None

    try:
        init_start = time.time()
        log(f"{prefix} Initializing browser/executor...", "INFO", essential=True)

        # Create a new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        from scrapers.executor.workflow_executor import WorkflowExecutor as WFE

        executor = WFE(
            config,
            headless=True,
            timeout=browser_timeout or 30,
            worker_id=worker_id,
            stop_event=stop_event,
            debug_mode=debug_mode,
            job_id=job_id or "",
            event_emitter=emitter,
        )

        # Run async initialization
        loop.run_until_complete(executor.initialize())

        init_duration = time.time() - init_start
        log(f"{prefix} Browser initialized in {init_duration:.2f}s", "INFO")

        # Emit browser init event
        emitter.browser_init(
            scraper=config.name,
            worker_id=worker_id,
            duration_seconds=init_duration,
        )
    except Exception as e:
        log(f"{prefix} Failed to initialize: {e}", "ERROR")

    # Wait for all workers to be ready
    try:
        log(f"{prefix} Waiting for other workers to initialize...", "INFO")
        barrier.wait()

        # Post-barrier staggered delay to prevent thundering herd
        try:
            if worker_id.startswith("W"):
                worker_index = int(worker_id[1:]) - 1
            else:
                worker_index = 0
        except (ValueError, IndexError):
            worker_index = 0

        post_barrier_delay = worker_index * 0.5
        if post_barrier_delay > 0:
            log(f"{prefix} Post-barrier stagger: {post_barrier_delay:.1f}s", "DEBUG")
            time.sleep(post_barrier_delay)

        log(f"{prefix} All workers ready! Starting scrape...", "INFO")
    except BrokenBarrierError:
        log(f"{prefix} Barrier broken, proceeding anyway...", "WARNING")

    # If initialization failed, return now
    if not executor:
        drained = 0
        while not sku_queue.empty():
            try:
                sku_queue.get_nowait()
                drained += 1
            except Empty:
                break
        return ExecutionResult(0, drained, 0, 0.0, 0.0, worker_id, config.name, [])

    # Process SKUs from the shared queue (work-stealing pattern)
    log(f"{prefix} Starting to pull SKUs from shared queue...", "INFO")
    completed_operations = 0

    while True:
        # Check for cancellation
        if stop_event and stop_event.is_set():
            log(f"{prefix} Cancellation requested. Stopping...", "WARNING")
            break

        # Try to get next SKU from queue
        try:
            sku = sku_queue.get(timeout=0.5)
        except Empty:
            log(f"{prefix} Queue empty, finishing up...", "INFO")
            break

        skus_processed += 1
        sku_start_time = time.time()

        # Handle browser batch restart
        try:
            executor, _ = process_sku_with_batch_restart(
                executor=executor,
                loop=loop,
                sku=sku,
                skus_processed=skus_processed,
                config=config,
                worker_id=worker_id,
                batch_size=batch_size,
                headless=True,
                browser_timeout=browser_timeout,
                stop_event=stop_event,
                debug_mode=debug_mode,
                job_id=job_id,
                event_emitter=emitter,
            )
        except Exception as e:
            log(f"{prefix} Error during browser restart: {e}", "ERROR")

        update_scraper_progress(
            {
                "scraper": config.name,
                "worker_id": worker_id,
                "current_item": f"Processing {sku}",
            }
        )

        # Emit SKU_PROCESSING event
        emitter.sku_processing(scraper=config.name, worker_id=worker_id, sku=sku)

        try:
            # Execute workflow with SKU context
            if loop:
                result = loop.run_until_complete(
                    executor.execute_workflow(
                        context={"sku": sku, "test_mode": test_mode},
                        quit_browser=False,
                    )
                )

                if result.get("success"):
                    scraper_success += 1
                    emitter.sku_success(
                        scraper=config.name,
                        worker_id=worker_id,
                        sku=sku,
                        data=result.get("results", {}),
                        duration_seconds=time.time() - sku_start_time,
                    )
                else:
                    scraper_failed += 1
                    emitter.sku_failed(
                        scraper=config.name,
                        worker_id=worker_id,
                        sku=sku,
                        error="Workflow execution failed",
                    )
            else:
                log(f"{prefix} Event loop not initialized, skipping SKU {sku}", "ERROR")
                continue

        except Exception as e:
            scraper_failed += 1
            log(f"{prefix} Error scraping SKU {sku}: {e}", "ERROR")
            emitter.sku_failed(
                scraper=config.name,
                worker_id=worker_id,
                sku=sku,
                error=str(e),
            )

        sku_duration = time.time() - sku_start_time
        sku_timings.append(sku_duration)
        log(f"{prefix} SKU {sku} took {sku_duration:.2f}s (processed: {skus_processed})", "DEBUG")

        # Update progress (thread-safe)
        with progress_lock:
            completed_operations += 1
            current_ops = completed_operations

        if progress_callback and total_operations > 0:
            progress_pct = int((current_ops / total_operations) * 100)
            try:
                progress_callback(progress_pct)
            except Exception:
                pass

        # Emit PROGRESS_UPDATE event
        progress_pct = int((current_ops / total_operations) * 100) if total_operations > 0 else 100
        emitter.progress_update(
            scraper=config.name,
            current=current_ops,
            total=total_operations,
            percentage=progress_pct,
            skus_processed=skus_processed,
        )

        update_scraper_progress(
            {
                "scraper": config.name,
                "worker_id": worker_id,
                "completed": scraper_success,
                "failed": scraper_failed,
                "current_item": f"Processed {sku}",
            }
        )

    # Cleanup browser for this scraper
    try:
        if executor and hasattr(executor, "browser") and executor.browser and loop:
            loop.run_until_complete(executor.browser.quit())
        if loop:
            loop.close()
    except Exception as e:
        log(f"Error closing browser: {e}", "WARNING")

    worker_duration = time.time() - worker_start_time
    avg_sku_time = sum(sku_timings) / len(sku_timings) if sku_timings else 0.0

    log(f"Completed task: {config.name} ({worker_id}) - Processed {skus_processed} SKUs in {worker_duration:.1f}s (avg: {avg_sku_time:.2f}s/SKU)", "INFO")

    # Emit SCRAPER_COMPLETED event
    emitter.scraper_completed(
        scraper=config.name,
        worker_id=worker_id,
        processed=skus_processed,
        successful=scraper_success,
        failed=scraper_failed,
        duration_seconds=worker_duration,
    )

    update_scraper_progress(
        {
            "scraper": config.name,
            "worker_id": worker_id,
            "status": "completed",
            "current_item": f"Done ({skus_processed} SKUs)",
        }
    )

    return ExecutionResult(
        success=scraper_success,
        failed=scraper_failed,
        processed=skus_processed,
        duration=worker_duration,
        avg_sku_time=avg_sku_time,
        worker_id=worker_id,
        scraper=config.name,
        test_details=test_details,
    )


def execute_with_thread_pool(
    configs: List[ScraperConfig],
    skus: List[str],
    emitter: EventEmitter,
    collector: ResultCollector,
    max_workers: Optional[int] = None,
    scraper_workers: Optional[Dict[str, int]] = None,
    test_mode: bool = False,
    debug_mode: bool = False,
    browser_timeout: Optional[int] = None,
    job_id: Optional[str] = None,
    stop_event: Optional[Any] = None,
    progress_callback: Optional[Callable[[int], None]] = None,
    scraper_progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    status_callback: Optional[Callable[[str], None]] = None,
    log_callback: Optional[Callable[[str], None]] = None,
    batch_size: int = 20,
) -> List[ExecutionResult]:
    """
    Execute scraping using ThreadPoolExecutor with work-stealing queues.

    Args:
        configs: List of scraper configurations
        skus: List of SKUs to process
        emitter: Event emitter for progress events
        collector: Result collector for storing results
        max_workers: Maximum concurrent workers
        scraper_workers: Dict mapping scraper name to worker count
        test_mode: If True, runs in test mode
        debug_mode: If True, enables debug output
        browser_timeout: Browser timeout in seconds
        job_id: Job identifier
        stop_event: Event for cancellation
        progress_callback: Callback for overall progress percentage
        scraper_progress_callback: Callback for per-scraper progress
        status_callback: Callback for status updates
        log_callback: Callback for log messages
        batch_size: SKUs per browser restart

    Returns:
        List of ExecutionResult for each worker
    """
    # Create work-stealing queues
    tasks, workers_used, _ = create_work_stealing_queues(
        configs=configs,
        skus=skus,
        scraper_workers=scraper_workers,
        max_workers=max_workers,
        test_mode=test_mode,
    )

    if not tasks:
        logger.warning("No tasks to execute")
        return []

    total_operations = len(skus) * len(configs)

    # Thread-safe progress tracking
    progress_lock = Lock()

    # Synchronization barrier to ensure all browsers launch before scraping starts
    start_barrier = Barrier(workers_used)

    # Inject barrier into tasks
    final_tasks = [(*t, start_barrier) for t in tasks]

    worker_stats: List[ExecutionResult] = []

    # Run in thread pool
    with ThreadPoolExecutor(max_workers=workers_used) as thread_executor:
        futures = [
            thread_executor.submit(
                run_worker_thread,
                task,
                emitter,
                collector,
                total_operations,
                progress_lock,
                progress_callback,
                scraper_progress_callback,
                status_callback,
                log_callback,
                stop_event,
                test_mode,
                debug_mode,
                browser_timeout,
                job_id,
                batch_size,
            )
            for task in final_tasks
        ]

        for future in as_completed(futures):
            try:
                result = future.result()
                worker_stats.append(result)
            except Exception as exc:
                logger.error(f"Scraper task error: {exc}")

    return worker_stats


__all__ = [
    # Data classes
    "ExecutionResult",
    "WorkerConfig",
    # Excel loading
    "load_skus_from_excel",
    "load_skus_with_metadata",
    # Work-stealing queues
    "create_work_stealing_queues",
    # Browser batch restart
    "should_restart_browser",
    "process_sku_with_batch_restart",
    # Thread pool execution
    "run_worker_thread",
    "execute_with_thread_pool",
]
