"""Playwright tracing collector for debugging scraper failures.

This module provides the TracingCollector class to collect Playwright traces
for debugging purposes. Traces are only collected on failures to minimize
storage and performance impact.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from playwright.async_api import BrowserContext

logger = logging.getLogger(__name__)

DEFAULT_RETENTION_DAYS = 7
MAX_RETENTION_DAYS = 30


class TracingCollector:
    """Collect Playwright traces for debugging scraper failures.

    This collector integrates with Playwright's tracing API to capture
    screenshots, DOM snapshots, and network logs. Traces are only saved
    on failures to minimize storage impact.

    Attributes:
        traces_dir: Directory where trace files are stored
        retention_days: Number of days to retain trace files
        enabled: Whether tracing is enabled
        _current_trace_path: Path to the currently active trace file

    Example:
        collector = TracingCollector(traces_dir="traces", retention_days=7)

        # Using context manager (recommended)
        async with collect_traces(collector, browser.context, "amazon", sku="ABC123"):
            # Execute scraper logic here
            await scrape_page()

        # Or using start/stop directly
        await collector.start(browser.context, "amazon", sku="ABC123")
        try:
            await scrape_page()
        except Exception:
            await collector.stop(browser.context, save=True)  # Save on failure
            raise
        else:
            await collector.stop(browser.context, save=False)  # Discard on success
    """

    def __init__(
        self,
        traces_dir: str | Path = "traces",
        retention_days: int = DEFAULT_RETENTION_DAYS,
        enabled: bool = True,
    ) -> None:
        """Initialize the tracing collector.

        Args:
            traces_dir: Directory to store trace files. Created if it doesn't exist.
            retention_days: Days to retain trace files. Clamped to 1-30 days.
            enabled: Whether tracing is enabled. When disabled, all operations
                become no-ops for zero performance impact.
        """
        self.traces_dir = Path(traces_dir)
        self.traces_dir.mkdir(parents=True, exist_ok=True)

        # Clamp retention days to valid range
        self.retention_days = max(1, min(retention_days, MAX_RETENTION_DAYS))
        self.enabled = enabled
        self._current_trace_path: Optional[Path] = None
        self._is_collecting: bool = False

        logger.debug(f"[TRACING] Initialized: enabled={enabled}, retention={self.retention_days}d, dir={self.traces_dir}")

    async def start(
        self,
        context: BrowserContext,
        site_name: str,
        sku: Optional[str] = None,
        job_id: Optional[str] = None,
    ) -> None:
        """Start collecting traces for the given browser context.

        Args:
            context: Playwright BrowserContext to trace
            site_name: Name of the site being scraped
            sku: Optional SKU identifier for the scrape
            job_id: Optional job ID for the scrape

        Raises:
            RuntimeError: If tracing is already in progress for this collector.
        """
        if not self.enabled:
            logger.debug("[TRACING] Disabled, skipping start")
            return

        if self._is_collecting:
            raise RuntimeError("Tracing already in progress. Call stop() first.")

        # Clean up old traces before starting new collection
        self._cleanup_old_traces()

        # Generate trace filename with timestamp for uniqueness
        timestamp = int(time.time())
        parts = [site_name]
        if sku:
            parts.append(sku)
        if job_id:
            parts.append(job_id)
        parts.append(str(timestamp))

        filename = f"{'_'.join(parts)}.zip"
        self._current_trace_path = self.traces_dir / filename

        # Start Playwright tracing with all debugging features enabled
        try:
            await context.tracing.start(
                screenshots=True,  # Capture screenshots at key points
                snapshots=True,  # Capture DOM snapshots
                sources=True,  # Capture source code for debugging
            )
            self._is_collecting = True
            logger.info(f"[TRACING] Started trace collection: {filename}")
        except Exception as e:
            logger.error(f"[TRACING] Failed to start tracing: {e}")
            self._current_trace_path = None
            raise

    async def stop(
        self,
        context: BrowserContext,
        save: bool = True,
    ) -> Optional[Path]:
        """Stop collecting traces.

        Args:
            context: Playwright BrowserContext being traced
            save: Whether to save the trace file. If False, trace is discarded.

        Returns:
            Path to the saved trace file if save=True, None otherwise.

        Raises:
            RuntimeError: If tracing is not currently in progress.
        """
        if not self.enabled:
            logger.debug("[TRACING] Disabled, skipping stop")
            return None

        if not self._is_collecting:
            logger.debug("[TRACING] Not collecting, skipping stop")
            return None

        saved_path: Optional[Path] = None

        try:
            if save and self._current_trace_path:
                await context.tracing.stop(path=str(self._current_trace_path))

                # Verify the trace file was created
                if self._current_trace_path.exists():
                    size_kb = self._current_trace_path.stat().st_size / 1024
                    logger.info(f"[TRACING] Trace saved: {self._current_trace_path.name} ({size_kb:.1f} KB)")
                    saved_path = self._current_trace_path
                else:
                    logger.warning(f"[TRACING] Trace file not found after save: {self._current_trace_path}")
            else:
                await context.tracing.stop()
                logger.debug("[TRACING] Trace discarded (success)")

        except Exception as e:
            logger.error(f"[TRACING] Failed to stop tracing: {e}")
            raise
        finally:
            self._is_collecting = False
            self._current_trace_path = None

        return saved_path

    def _cleanup_old_traces(self) -> int:
        """Remove trace files older than the retention period.

        Returns:
            Number of files removed.
        """
        if not self.traces_dir.exists():
            return 0

        cutoff = time.time() - (self.retention_days * 24 * 60 * 60)
        removed_count = 0

        for trace_file in self.traces_dir.glob("*.zip"):
            try:
                if trace_file.stat().st_mtime < cutoff:
                    trace_file.unlink()
                    removed_count += 1
                    logger.debug(f"[TRACING] Cleaned up old trace: {trace_file.name}")
            except OSError as e:
                logger.warning(f"[TRACING] Failed to remove old trace {trace_file}: {e}")

        if removed_count > 0:
            logger.info(f"[TRACING] Cleaned up {removed_count} old trace(s)")

        return removed_count

    def get_trace_info(self) -> dict:
        """Get information about the current trace state.

        Returns:
            Dictionary with trace collection status and current trace details.
        """
        info = {
            "enabled": self.enabled,
            "is_collecting": self._is_collecting,
            "retention_days": self.retention_days,
            "traces_dir": str(self.traces_dir),
            "current_trace_path": (str(self._current_trace_path) if self._current_trace_path else None),
            "stored_traces": [],
        }

        if self.traces_dir.exists():
            for trace_file in self.traces_dir.glob("*.zip"):
                stat = trace_file.stat()
                info["stored_traces"].append(
                    {
                        "filename": trace_file.name,
                        "size_kb": round(stat.st_size / 1024, 2),
                        "created_at": stat.st_mtime,
                    }
                )

        return info

    def cleanup_all_traces(self) -> int:
        """Remove all stored traces.

        Returns:
            Number of files removed.
        """
        if not self.traces_dir.exists():
            return 0

        removed_count = 0
        for trace_file in self.traces_dir.glob("*.zip"):
            try:
                trace_file.unlink()
                removed_count += 1
            except OSError as e:
                logger.warning(f"[TRACING] Failed to remove trace {trace_file}: {e}")

        logger.info(f"[TRACING] Cleaned up all {removed_count} trace(s)")
        return removed_count

    async def __aenter__(self):
        """Async context manager entry - not supported directly.

        Use collect_traces() context manager instead.
        """
        raise NotImplementedError("Use collect_traces() context manager instead of direct async with")

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        pass


@asynccontextmanager
async def collect_traces(
    collector: TracingCollector,
    context: BrowserContext,
    site_name: str,
    sku: Optional[str] = None,
    job_id: Optional[str] = None,
):
    """Context manager for trace collection.

    Automatically saves traces on exception and discards them on success.

    Args:
        collector: TracingCollector instance
        context: Playwright BrowserContext to trace
        site_name: Name of the site being scraped
        sku: Optional SKU identifier
        job_id: Optional job ID

    Yields:
        TracingCollector: The collector instance for reference

    Example:
        collector = TracingCollector()

        async with collect_traces(collector, browser.context, "amazon", "SKU123"):
            # If an exception occurs here, trace will be saved
            await scrape_page()
        # If no exception, trace is discarded
    """
    await collector.start(context, site_name, sku, job_id)
    try:
        yield collector
    except Exception:
        # Save trace on any exception
        await collector.stop(context, save=True)
        raise
    else:
        # Discard trace on successful completion
        await collector.stop(context, save=False)


class TracingConfig:
    """Configuration for trace collection.

    This class provides a convenient way to configure tracing behavior
    and create TracingCollector instances.
    """

    def __init__(
        self,
        enabled: bool = True,
        traces_dir: str | Path = "traces",
        retention_days: int = DEFAULT_RETENTION_DAYS,
        save_on_success: bool = False,
    ):
        """Initialize tracing configuration.

        Args:
            enabled: Whether tracing is enabled by default
            traces_dir: Directory for trace files
            retention_days: Days to retain traces (1-30)
            save_on_success: Whether to save traces on successful scrapes
                (default: False to save storage)
        """
        self.enabled = enabled
        self.traces_dir = Path(traces_dir)
        self.retention_days = retention_days
        self.save_on_success = save_on_success

    def create_collector(self) -> TracingCollector:
        """Create a TracingCollector with this configuration."""
        return TracingCollector(
            traces_dir=self.traces_dir,
            retention_days=self.retention_days,
            enabled=self.enabled,
        )


def get_default_traces_dir() -> Path:
    """Get the default traces directory.

    Returns:
        Path to the default traces directory (project_root/traces)
    """
    # Find project root by looking for common markers
    current = Path.cwd()

    # Walk up the directory tree looking for project markers
    for parent in [current, *current.parents]:
        if any((parent / marker).exists() for marker in [".git", "requirements.txt", "package.json"]):
            return parent / "traces"

    # Fallback to current working directory
    return current / "traces"
