"""
Job-scoped logging transport for Bay State Scraper.

This module provides a single structured logging pipeline for scraper jobs:
- persist logs to the coordinator API with low-latency batching
- optionally mirror the same log entries to Realtime for transient diagnostics
- keep an in-memory history so completed jobs can return a stable log timeline

The key rule is that only log records explicitly tagged with a matching job_id
are captured. That keeps concurrent job sessions from leaking logs into one
another when multiple runners share the same Python process.
"""

from __future__ import annotations

import atexit
import asyncio
import contextvars
import logging
import threading
import time
import uuid
from concurrent.futures import Future
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping

from core.api_client import ConnectionError as ApiConnectionError
from core.realtime_manager import RealtimeError

logger = logging.getLogger(__name__)

_ACTIVE_JOB_LOG_CONTEXT: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
    "active_job_log_context",
    default=None,
)

IGNORED_LOGGER_PREFIXES = ("httpx", "httpcore", "urllib3")
LOG_RECORD_RESERVED_KEYS = set(logging.makeLogRecord({}).__dict__.keys()) | {"message", "asctime"}
TRANSPORT_CIRCUIT_BREAKER_THRESHOLD = 5
TRANSPORT_CIRCUIT_BREAKER_TIMEOUT_SECONDS = 60.0

ROOT_CONTEXT_FIELDS = {
    "job_id",
    "runner_id",
    "runner_name",
    "scraper_name",
    "sku",
    "phase",
    "source",
    "details",
    "flush_immediately",
}

DETAIL_CONTEXT_FIELDS = {
    "worker_id",
    "step",
    "trace_id",
    "status",
    "current_sku",
    "items_processed",
    "items_total",
    "chunk_id",
    "chunk_index",
    "lease_token",
}


def _is_empty_context_value(value: Any) -> bool:
    return value is None or value == "" or value == {} or value == []


def _bind_job_log_context(**context: Any) -> contextvars.Token[dict[str, Any] | None]:
    current_context = dict(_ACTIVE_JOB_LOG_CONTEXT.get() or {})
    current_context.update({key: value for key, value in context.items() if not _is_empty_context_value(value)})
    return _ACTIVE_JOB_LOG_CONTEXT.set(current_context or None)


def _reset_job_log_context(token: contextvars.Token[dict[str, Any] | None]) -> None:
    _ACTIVE_JOB_LOG_CONTEXT.reset(token)


class JobLogContextFilter(logging.Filter):
    """Inject active job context into plain log records before handlers see them."""

    def filter(self, record: logging.LogRecord) -> bool:
        if getattr(record, "_job_logging_internal", False):
            return True

        context = _ACTIVE_JOB_LOG_CONTEXT.get()
        if not context:
            return True

        for key, value in context.items():
            if key == "details":
                existing_details = getattr(record, "details", None)
                merged_details: dict[str, Any] = {}

                if isinstance(value, Mapping):
                    merged_details.update(_serialize_json(value) or {})
                if isinstance(existing_details, Mapping):
                    merged_details.update(_serialize_json(existing_details) or {})

                if merged_details:
                    setattr(record, "details", merged_details)
                continue

            if _is_empty_context_value(getattr(record, key, None)):
                setattr(record, key, value)

        return True


_JOB_LOG_CONTEXT_FILTER = JobLogContextFilter()


def _ensure_job_log_context_filter(handler: logging.Handler) -> None:
    if getattr(handler, "_baystate_job_log_context_filter_attached", False):
        return

    handler.addFilter(_JOB_LOG_CONTEXT_FILTER)
    setattr(handler, "_baystate_job_log_context_filter_attached", True)


def _to_iso_timestamp(value: Any = None) -> str:
    """Convert seconds, milliseconds, or strings into an ISO 8601 UTC timestamp."""
    if isinstance(value, str) and value:
        return value

    if isinstance(value, (int, float)):
        seconds = float(value)
        if seconds > 10_000_000_000:
            seconds /= 1000
        return datetime.fromtimestamp(seconds, tz=timezone.utc).isoformat().replace("+00:00", "Z")

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_level_name(level: Any) -> str:
    if isinstance(level, int):
        return logging.getLevelName(level).lower()

    normalized = str(level or "info").lower()
    if normalized == "warn":
        return "warning"
    if normalized == "fatal":
        return "critical"
    return normalized


def _serialize_json(value: Any) -> Any:
    """Best-effort JSON-safe serialization for log details."""
    if value is None:
        return None

    if isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, datetime):
        return _to_iso_timestamp(value.timestamp())

    if isinstance(value, Mapping):
        return {str(key): serialized for key, raw in value.items() if (serialized := _serialize_json(raw)) is not None}

    if isinstance(value, (list, tuple, set)):
        return [_serialize_json(item) for item in value]

    return str(value)


def _compact_dict(data: Mapping[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in data.items() if value is not None and value != "" and value != {} and value != []}


@dataclass(frozen=True)
class JobLogEntry:
    event_id: str
    job_id: str
    level: str
    message: str
    timestamp: str
    sequence: int
    runner_id: str | None = None
    runner_name: str | None = None
    source: str | None = None
    scraper_name: str | None = None
    sku: str | None = None
    phase: str | None = None
    details: dict[str, Any] | None = None

    def to_api_payload(self) -> dict[str, Any]:
        payload = {
            "event_id": self.event_id,
            "job_id": self.job_id,
            "level": self.level,
            "message": self.message,
            "timestamp": self.timestamp,
            "sequence": self.sequence,
            "runner_id": self.runner_id,
            "runner_name": self.runner_name,
            "source": self.source,
            "scraper_name": self.scraper_name,
            "sku": self.sku,
            "phase": self.phase,
            "details": self.details or None,
        }
        return _compact_dict(payload)

    def to_result_payload(self) -> dict[str, Any]:
        return self.to_api_payload()

    def to_broadcast_payload(self) -> dict[str, Any]:
        payload = self.to_api_payload()
        payload["id"] = self.event_id
        return payload


class JobLogTransport:
    """Shared job log transport used by the logging handler and progress emitter."""

    def __init__(
        self,
        *,
        job_id: str,
        runner_name: str | None = None,
        runner_id: str | None = None,
        lease_token: str | None = None,
        api_client: Any | None = None,
        realtime_manager: Any | None = None,
        batch_size: int = 25,
        flush_interval: float = 0.75,
        max_retries: int = 3,
        retry_delay: float = 0.5,
        max_queue_size: int = 2000,
        history_limit: int = 5000,
    ) -> None:
        self.job_id = job_id
        self.runner_name = runner_name
        self.runner_id = runner_id or runner_name
        self.lease_token = lease_token
        self.api_client = api_client
        self.realtime_manager = realtime_manager
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.max_queue_size = min(max_queue_size, 1000)
        self.history_limit = history_limit

        self._history: list[JobLogEntry] = []
        self._history_lock = threading.Lock()
        self._pending_progress: dict[str, Any] | None = None
        self._progress_lock = threading.Lock()
        self._sequence_lock = threading.Lock()
        self._sequence = 0
        self._stop_event: asyncio.Event | None = None
        self._flush_event: asyncio.Event | None = None
        self._thread_local = threading.local()
        self._shipping_thread: threading.Thread | None = None
        self._shipping_loop_ref: asyncio.AbstractEventLoop | None = None
        self._shipping_queue: asyncio.Queue[JobLogEntry] | None = None
        self._shipping_ready = threading.Event()
        self._closed = False
        self._transport_consecutive_failures = 0
        self._transport_circuit_open_until: float | None = None
        self._transport_circuit_opened_at: float | None = None
        self._last_transport_error: Exception | None = None
        self._last_realtime_error: Exception | None = None

        try:
            self._loop: asyncio.AbstractEventLoop | None = asyncio.get_running_loop()
        except RuntimeError:
            try:
                self._loop = asyncio.get_event_loop()
            except RuntimeError:
                self._loop = None

        if self.api_client:
            self._shipping_thread = threading.Thread(
                target=self._run_shipping_loop,
                daemon=True,
                name=f"job-log-{job_id[:8]}",
            )
            self._shipping_thread.start()
            self._shipping_ready.wait(timeout=1.0)

        atexit.register(self.close)

    def should_capture(self, record: logging.LogRecord) -> bool:
        if getattr(self._thread_local, "shipping", False):
            return False

        if getattr(record, "_job_logging_internal", False):
            return False

        if record.name.startswith(IGNORED_LOGGER_PREFIXES):
            return False

        record_job_id = getattr(record, "job_id", None)
        if record_job_id is None:
            return False

        return str(record_job_id) == self.job_id

    def _build_details(self, record: logging.LogRecord) -> dict[str, Any] | None:
        details: dict[str, Any] = {}

        raw_details = getattr(record, "details", None)
        if isinstance(raw_details, Mapping):
            details.update(_serialize_json(raw_details))

        for field in sorted(DETAIL_CONTEXT_FIELDS):
            value = getattr(record, field, None)
            serialized = _serialize_json(value)
            if serialized is not None and serialized != "":
                details[field] = serialized

        if record.exc_info:
            exc_type = record.exc_info[0].__name__ if record.exc_info[0] else None
            exc_message = str(record.exc_info[1]) if record.exc_info[1] else None
            if exc_type:
                details["error_type"] = exc_type
            if exc_message:
                details["error_message"] = exc_message

        ignored_fields = (
            LOG_RECORD_RESERVED_KEYS
            | ROOT_CONTEXT_FIELDS
            | DETAIL_CONTEXT_FIELDS
            | {
                "_job_log_entry",
            }
        )
        for key, value in record.__dict__.items():
            if key in ignored_fields or key.startswith("_"):
                continue
            serialized = _serialize_json(value)
            if serialized is not None and serialized != "":
                details[key] = serialized

        return details or None

    def capture(self, record: logging.LogRecord) -> JobLogEntry | None:
        if not self.should_capture(record):
            return None

        cached_entry = getattr(record, "_job_log_entry", None)
        if isinstance(cached_entry, JobLogEntry) and cached_entry.job_id == self.job_id:
            return cached_entry

        with self._sequence_lock:
            self._sequence += 1
            sequence = self._sequence

        entry = JobLogEntry(
            event_id=str(getattr(record, "event_id", None) or uuid.uuid4()),
            job_id=self.job_id,
            level=_normalize_level_name(record.levelname),
            message=record.getMessage(),
            timestamp=_to_iso_timestamp(record.created),
            sequence=sequence,
            runner_id=str(getattr(record, "runner_id", None) or self.runner_id or "") or None,
            runner_name=str(getattr(record, "runner_name", None) or self.runner_name or "") or None,
            source=str(getattr(record, "source", None) or record.name or "") or None,
            scraper_name=str(getattr(record, "scraper_name", None) or "") or None,
            sku=str(getattr(record, "sku", None) or "") or None,
            phase=str(getattr(record, "phase", None) or "") or None,
            details=self._build_details(record),
        )

        with self._history_lock:
            self._history.append(entry)
            if len(self._history) > self.history_limit:
                self._history = self._history[-self.history_limit :]

        setattr(record, "_job_log_entry", entry)
        return entry

    def enqueue(self, entry: JobLogEntry, *, flush_immediately: bool = False) -> None:
        if not self.api_client:
            return

        if not self._shipping_ready.wait(timeout=1.0):
            logger.error(
                "Job log transport queue was not ready before enqueue",
                extra={"transport_job_id": self.job_id},
            )
            return

        if not self._shipping_loop_ref:
            logger.error(
                "Job log transport loop unavailable during enqueue",
                extra={"transport_job_id": self.job_id},
            )
            return

        self._shipping_loop_ref.call_soon_threadsafe(self._enqueue_on_loop, entry, flush_immediately)

    def _enqueue_on_loop(self, entry: JobLogEntry, flush_immediately: bool) -> None:
        if not self._shipping_queue:
            logger.error(
                "Job log transport queue unavailable during enqueue",
                extra={"transport_job_id": self.job_id},
            )
            return

        if self._shipping_queue.full():
            try:
                dropped = self._shipping_queue.get_nowait()
                logger.warning(
                    "Queue full, dropped oldest log: %s",
                    dropped.message[:50],
                    extra={
                        "transport_job_id": self.job_id,
                        "queue_maxsize": self.max_queue_size,
                        "dropped_sequence": dropped.sequence,
                    },
                )
            except asyncio.QueueEmpty:
                logger.warning(
                    "Queue reported full but oldest log was unavailable for eviction",
                    extra={"transport_job_id": self.job_id, "queue_maxsize": self.max_queue_size},
                )

        try:
            self._shipping_queue.put_nowait(entry)
        except asyncio.QueueFull:
            logger.error(
                "Failed to enqueue job log after eviction",
                extra={"transport_job_id": self.job_id, "queue_maxsize": self.max_queue_size},
            )
            return

        should_flush = flush_immediately or self._shipping_queue.qsize() >= self.batch_size
        if should_flush and self._flush_event:
            self._flush_event.set()

    def _queue_progress(self, payload: dict[str, Any]) -> None:
        if not self.api_client:
            return

        with self._progress_lock:
            self._pending_progress = payload

        if self._shipping_loop_ref:
            self._shipping_loop_ref.call_soon_threadsafe(self._set_flush_event)

    def _drain_progress(self) -> dict[str, Any] | None:
        with self._progress_lock:
            payload = self._pending_progress
            self._pending_progress = None
            return payload

    def _transport_retry_after_seconds(self) -> float:
        if self._transport_circuit_open_until is None:
            return 0.0

        return max(0.0, self._transport_circuit_open_until - time.monotonic())

    def _is_transport_circuit_open(self) -> bool:
        retry_after_seconds = self._transport_retry_after_seconds()
        if retry_after_seconds > 0:
            return True

        if self._transport_circuit_open_until is not None:
            self._transport_circuit_open_until = None
            self._transport_circuit_opened_at = None
            self._transport_consecutive_failures = 0

        return False

    def _record_transport_success(self) -> None:
        self._transport_consecutive_failures = 0
        self._transport_circuit_open_until = None
        self._transport_circuit_opened_at = None
        self._last_transport_error = None

    def _record_transport_failure(self, error: Exception) -> None:
        self._last_transport_error = error
        self._transport_consecutive_failures += 1

        if self._transport_consecutive_failures >= TRANSPORT_CIRCUIT_BREAKER_THRESHOLD:
            self._transport_circuit_opened_at = time.monotonic()
            self._transport_circuit_open_until = self._transport_circuit_opened_at + TRANSPORT_CIRCUIT_BREAKER_TIMEOUT_SECONDS

    def _transport_log_extra(
        self,
        *,
        operation: str,
        error: Exception,
        will_retry: bool,
        attempts: int,
        item_count: int,
    ) -> dict[str, Any]:
        retry_after_seconds = self._transport_retry_after_seconds()
        return {
            "job_id": self.job_id,
            "runner_id": self.runner_id,
            "runner_name": self.runner_name,
            "phase": "job_logging",
            "operation": operation,
            "error": str(error),
            "error_type": type(error).__name__,
            "will_retry": will_retry,
            "attempts": attempts,
            "consecutive_failures": self._transport_consecutive_failures,
            "circuit_open": retry_after_seconds > 0,
            "retry_after_seconds": retry_after_seconds,
            "_job_logging_internal": True,
            "details": {
                "operation": operation,
                "item_count": item_count,
                "opened_at": self._transport_circuit_opened_at,
            },
        }

    async def _requeue_batch(self, batch: list[JobLogEntry]) -> None:
        if not batch or not self._shipping_queue:
            return

        for entry in batch:
            try:
                self._shipping_queue.put_nowait(entry)
            except asyncio.QueueFull:
                logger.error(
                    "Failed to requeue job log batch entry",
                    extra={
                        "job_id": self.job_id,
                        "runner_id": self.runner_id,
                        "runner_name": self.runner_name,
                        "phase": "job_logging",
                        "operation": "requeue_log_batch",
                        "error": "shipping queue full",
                        "error_type": "QueueFull",
                        "will_retry": False,
                        "_job_logging_internal": True,
                        "details": {
                            "event_id": entry.event_id,
                            "sequence": entry.sequence,
                            "max_queue_size": self.max_queue_size,
                        },
                    },
                )

    def _requeue_progress(self, payload: dict[str, Any]) -> None:
        with self._progress_lock:
            if self._pending_progress is None:
                self._pending_progress = payload

    def _handle_realtime_future(self, future: Future[Any], *, operation: str, payload: dict[str, Any]) -> None:
        try:
            future.result()
            self._last_realtime_error = None
        except RealtimeError as exc:
            self._last_realtime_error = exc
            logger.debug(
                "Realtime %s skipped for job %s: %s",
                operation,
                self.job_id,
                exc,
            )
        except Exception as exc:  # noqa: BLE001 - preserve future executor failures in structured logs
            self._last_realtime_error = exc
            logger.error(
                f"Unexpected realtime {operation} failure for job {self.job_id}",
                extra={
                    "job_id": self.job_id,
                    "runner_id": self.runner_id,
                    "runner_name": self.runner_name,
                    "phase": "job_logging",
                    "operation": operation,
                    "error": str(exc),
                    "error_type": type(exc).__name__,
                    "will_retry": False,
                    "_job_logging_internal": True,
                    "details": {
                        "payload_keys": sorted(payload.keys()),
                        "realtime_error": str(exc),
                    },
                },
            )

    async def _send_batch(self, batch: list[JobLogEntry]) -> None:
        if not batch or not self.api_client:
            return

        payload = [entry.to_api_payload() for entry in batch]
        if self._is_transport_circuit_open():
            await self._requeue_batch(batch)
            circuit_error = ApiConnectionError(f"Job log transport circuit is open for {self.job_id}; retry after {self._transport_retry_after_seconds():.1f}s")
            logger.error(
                f"Skipping job log batch shipment while circuit breaker is open for {self.job_id}",
                extra=self._transport_log_extra(
                    operation="post_logs",
                    error=circuit_error,
                    will_retry=True,
                    attempts=0,
                    item_count=len(batch),
                ),
            )
            return

        delay = self.retry_delay
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                self._thread_local.shipping = True
                await asyncio.to_thread(self.api_client.post_logs, self.job_id, payload)
                self._record_transport_success()
                return
            except ApiConnectionError as exc:
                last_error = exc
                if attempt < self.max_retries:
                    await asyncio.sleep(delay)
                    delay *= 2
            except Exception as exc:  # noqa: BLE001 - preserve backwards compatibility around API client failures
                last_error = exc
                if attempt < self.max_retries:
                    await asyncio.sleep(delay)
                    delay *= 2
            finally:
                self._thread_local.shipping = False

        if last_error is None:
            last_error = ApiConnectionError(f"Unknown job log shipping failure for {self.job_id}")

        self._record_transport_failure(last_error)
        await self._requeue_batch(batch)
        logger.error(
            f"Failed to ship {len(batch)} log(s) for job {self.job_id}",
            extra=self._transport_log_extra(
                operation="post_logs",
                error=last_error,
                will_retry=True,
                attempts=self.max_retries + 1,
                item_count=len(batch),
            ),
        )
        self._set_flush_event()

    def _run_shipping_loop(self) -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        self._shipping_loop_ref = loop
        self._shipping_queue = asyncio.Queue(maxsize=self.max_queue_size)
        self._stop_event = asyncio.Event()
        self._flush_event = asyncio.Event()
        self._shipping_ready.set()

        try:
            loop.run_until_complete(self._shipping_loop())
        finally:
            pending_tasks = [task for task in asyncio.all_tasks(loop) if not task.done()]
            for task in pending_tasks:
                task.cancel()
            if pending_tasks:
                loop.run_until_complete(asyncio.gather(*pending_tasks, return_exceptions=True))
            loop.close()

    async def _shipping_loop(self) -> None:
        while True:
            batch = await self._next_batch()
            if batch:
                await self._send_batch(batch)

            progress_payload = self._drain_progress()
            if progress_payload:
                await self._send_progress(progress_payload)

            if self._stop_event and self._stop_event.is_set():
                final_batch = await self._drain_pending_async()
                if final_batch:
                    await self._send_batch(final_batch)
                final_progress = self._drain_progress()
                if final_progress:
                    await self._send_progress(final_progress)
                return

    async def _next_batch(self) -> list[JobLogEntry]:
        if not self._shipping_queue:
            return []

        wait_tasks: set[asyncio.Task[Any]] = {asyncio.create_task(self._shipping_queue.get())}
        flush_wait: asyncio.Task[bool] | None = None
        stop_wait: asyncio.Task[bool] | None = None

        if self._flush_event:
            flush_wait = asyncio.create_task(self._flush_event.wait())
            wait_tasks.add(flush_wait)

        if self._stop_event:
            stop_wait = asyncio.create_task(self._stop_event.wait())
            wait_tasks.add(stop_wait)

        try:
            done, pending = await asyncio.wait(wait_tasks, timeout=self.flush_interval, return_when=asyncio.FIRST_COMPLETED)
        finally:
            batch: list[JobLogEntry] = []

        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

        queue_get = next(task for task in wait_tasks if task not in {flush_wait, stop_wait})
        if queue_get in done and not queue_get.cancelled():
            batch.append(queue_get.result())

        if self._flush_event and self._flush_event.is_set():
            self._flush_event.clear()

        while self._shipping_queue and len(batch) < self.batch_size:
            try:
                batch.append(self._shipping_queue.get_nowait())
            except asyncio.QueueEmpty:
                break

        return batch

    async def _drain_pending_async(self) -> list[JobLogEntry]:
        if not self._shipping_queue:
            return []

        batch: list[JobLogEntry] = []
        while True:
            try:
                batch.append(self._shipping_queue.get_nowait())
            except asyncio.QueueEmpty:
                break
        return batch

    def _set_flush_event(self) -> None:
        if self._flush_event:
            self._flush_event.set()

    def broadcast(self, entry: JobLogEntry) -> Future[Any] | None:
        if not self.realtime_manager or not self._loop or not getattr(self.realtime_manager, "is_connected", False):
            return

        try:
            future = asyncio.run_coroutine_threadsafe(
                self.realtime_manager.broadcast_job_log_entry(entry.to_broadcast_payload()),
                self._loop,
            )
            if future is not None:
                future.add_done_callback(
                    lambda done: self._handle_realtime_future(
                        done,
                        operation="broadcast job log",
                        payload=entry.to_broadcast_payload(),
                    )
                )
            return future
        except RuntimeError as exc:
            self._last_realtime_error = exc
            logger.error(
                f"Failed to schedule job log broadcast for job {self.job_id}",
                extra={
                    "job_id": self.job_id,
                    "runner_id": self.runner_id,
                    "runner_name": self.runner_name,
                    "phase": "job_logging",
                    "operation": "broadcast job log",
                    "error": str(exc),
                    "error_type": type(exc).__name__,
                    "will_retry": False,
                    "_job_logging_internal": True,
                    "details": {"event_id": entry.event_id, "level": entry.level},
                },
            )
            return None

    def emit_progress(
        self,
        *,
        status: str,
        progress: int,
        message: str | None = None,
        phase: str | None = None,
        details: dict[str, Any] | None = None,
        current_sku: str | None = None,
        items_processed: int | None = None,
        items_total: int | None = None,
    ) -> None:
        payload = _compact_dict(
            {
                "job_id": self.job_id,
                "lease_token": self.lease_token,
                "runner_id": self.runner_id,
                "runner_name": self.runner_name,
                "status": status,
                "progress": max(0, min(100, int(progress))),
                "message": message,
                "phase": phase,
                "details": _serialize_json(details or {}) or None,
                "current_sku": current_sku,
                "items_processed": items_processed,
                "items_total": items_total,
                "timestamp": _to_iso_timestamp(),
            }
        )

        self._queue_progress(payload)

        if not self.realtime_manager or not self._loop or not getattr(self.realtime_manager, "is_connected", False):
            return

        try:
            future = asyncio.run_coroutine_threadsafe(
                self.realtime_manager.broadcast_job_progress_update(payload),
                self._loop,
            )
            if future is not None:
                future.add_done_callback(
                    lambda done: self._handle_realtime_future(
                        done,
                        operation="broadcast job progress",
                        payload=payload,
                    )
                )
        except RuntimeError as exc:
            self._last_realtime_error = exc
            logger.error(
                f"Failed to schedule job progress broadcast for job {self.job_id}",
                extra={
                    "job_id": self.job_id,
                    "runner_id": self.runner_id,
                    "runner_name": self.runner_name,
                    "phase": "job_logging",
                    "operation": "broadcast job progress",
                    "error": str(exc),
                    "error_type": type(exc).__name__,
                    "will_retry": False,
                    "_job_logging_internal": True,
                    "details": {"status": payload.get("status"), "progress": payload.get("progress")},
                },
            )

    async def _send_progress(self, payload: dict[str, Any]) -> None:
        if not payload or not self.api_client:
            return

        if self._is_transport_circuit_open():
            self._requeue_progress(payload)
            circuit_error = ApiConnectionError(
                f"Job progress transport circuit is open for {self.job_id}; retry after {self._transport_retry_after_seconds():.1f}s"
            )
            logger.error(
                f"Skipping job progress shipment while circuit breaker is open for {self.job_id}",
                extra=self._transport_log_extra(
                    operation="post_progress",
                    error=circuit_error,
                    will_retry=True,
                    attempts=0,
                    item_count=1,
                ),
            )
            return

        delay = self.retry_delay
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                self._thread_local.shipping = True
                await asyncio.to_thread(self.api_client.post_progress, payload)
                self._record_transport_success()
                return
            except ApiConnectionError as exc:
                last_error = exc
                if attempt < self.max_retries:
                    await asyncio.sleep(delay)
                    delay *= 2
            except Exception as exc:  # noqa: BLE001 - preserve backwards compatibility around API client failures
                last_error = exc
                if attempt < self.max_retries:
                    await asyncio.sleep(delay)
                    delay *= 2
            finally:
                self._thread_local.shipping = False

        if last_error is None:
            last_error = ApiConnectionError(f"Unknown job progress shipping failure for {self.job_id}")

        self._record_transport_failure(last_error)
        self._requeue_progress(payload)
        logger.error(
            f"Failed to ship progress for job {self.job_id}",
            extra=self._transport_log_extra(
                operation="post_progress",
                error=last_error,
                will_retry=True,
                attempts=self.max_retries + 1,
                item_count=1,
            ),
        )
        self._set_flush_event()

    def snapshot(self) -> list[dict[str, Any]]:
        with self._history_lock:
            return [entry.to_result_payload() for entry in self._history]

    def flush(self) -> None:
        if self._shipping_loop_ref:
            self._shipping_loop_ref.call_soon_threadsafe(self._set_flush_event)
        else:
            self._set_flush_event()
        if not self._shipping_thread:
            progress_payload = self._drain_progress()
            if progress_payload:
                asyncio.run(self._send_progress(progress_payload))

    def close(self) -> None:
        if self._closed:
            return

        self._closed = True
        if self._shipping_loop_ref and self._stop_event:
            self._shipping_loop_ref.call_soon_threadsafe(self._stop_event.set)
        if self._shipping_loop_ref:
            self._shipping_loop_ref.call_soon_threadsafe(self._set_flush_event)

        if self._shipping_thread and self._shipping_thread.is_alive():
            self._shipping_thread.join(timeout=3.0)


class RunnerLogHandler(logging.Handler):
    """Logging handler that persists and broadcasts job-scoped structured logs."""

    def __init__(self, transport: JobLogTransport):
        super().__init__(level=logging.INFO)
        self.transport = transport
        _ensure_job_log_context_filter(self)

    def emit(self, record: logging.LogRecord) -> None:
        entry = self.transport.capture(record)
        if not entry:
            return

        self.transport.broadcast(entry)

        flush_immediately = bool(getattr(record, "flush_immediately", False)) or entry.level in {
            "warning",
            "error",
            "critical",
        }
        self.transport.enqueue(entry, flush_immediately=flush_immediately)

    def flush(self) -> None:
        self.transport.flush()

    def close(self) -> None:
        self.transport.close()
        super().close()


class JobLoggingSession:
    """Context manager that attaches a job-scoped structured log handler."""

    def __init__(
        self,
        *,
        job_id: str,
        runner_name: str | None = None,
        runner_id: str | None = None,
        lease_token: str | None = None,
        api_client: Any | None = None,
        realtime_manager: Any | None = None,
        logger_instance: logging.Logger | None = None,
        batch_size: int = 25,
        flush_interval: float = 0.75,
    ) -> None:
        self.logger = logger_instance or logging.getLogger()
        self._context_token: contextvars.Token[dict[str, Any] | None] | None = None
        self.transport = JobLogTransport(
            job_id=job_id,
            runner_name=runner_name,
            runner_id=runner_id,
            lease_token=lease_token,
            api_client=api_client,
            realtime_manager=realtime_manager,
            batch_size=batch_size,
            flush_interval=flush_interval,
        )
        self.handler = RunnerLogHandler(self.transport)
        self._attached = False

    def attach(self) -> JobLoggingSession:
        if not self._attached:
            for handler in self.logger.handlers:
                _ensure_job_log_context_filter(handler)

            self._context_token = _bind_job_log_context(
                job_id=self.transport.job_id,
                runner_id=self.transport.runner_id,
                runner_name=self.transport.runner_name,
                details={"lease_token": self.transport.lease_token} if self.transport.lease_token else None,
            )
            self.logger.addHandler(self.handler)
            self._attached = True
        return self

    def detach(self) -> None:
        if self._attached:
            self.logger.removeHandler(self.handler)
            self._attached = False
        if self._context_token is not None:
            _reset_job_log_context(self._context_token)
            self._context_token = None
        self.handler.close()

    def emit_progress(
        self,
        *,
        status: str,
        progress: int,
        message: str | None = None,
        phase: str | None = None,
        details: dict[str, Any] | None = None,
        current_sku: str | None = None,
        items_processed: int | None = None,
        items_total: int | None = None,
    ) -> None:
        self.transport.emit_progress(
            status=status,
            progress=progress,
            message=message,
            phase=phase,
            details=details,
            current_sku=current_sku,
            items_processed=items_processed,
            items_total=items_total,
        )

    def snapshot(self) -> list[dict[str, Any]]:
        return self.transport.snapshot()

    def __enter__(self) -> JobLoggingSession:
        return self.attach()

    def __exit__(self, exc_type, exc, tb) -> None:
        self.detach()


class AsyncHttpLogHandler(RunnerLogHandler):
    """Compatibility wrapper for older call sites that only need API shipping."""

    def __init__(
        self,
        api_client: Any,
        job_id: str | None = None,
        batch_size: int = 25,
        flush_interval: float = 0.75,
    ) -> None:
        if not job_id:
            raise ValueError("job_id is required for AsyncHttpLogHandler")

        super().__init__(
            JobLogTransport(
                job_id=job_id,
                api_client=api_client,
                batch_size=batch_size,
                flush_interval=flush_interval,
            )
        )


class RealtimeLogHandler(RunnerLogHandler):
    """Compatibility wrapper for older call sites that only need realtime broadcasting."""

    def __init__(
        self,
        realtime_manager: Any,
        job_id: str | None = None,
        runner_name: str | None = None,
        runner_id: str | None = None,
    ) -> None:
        if not job_id:
            raise ValueError("job_id is required for RealtimeLogHandler")

        super().__init__(
            JobLogTransport(
                job_id=job_id,
                runner_name=runner_name,
                runner_id=runner_id,
                realtime_manager=realtime_manager,
            )
        )


__all__ = [
    "AsyncHttpLogHandler",
    "JobLogEntry",
    "JobLoggingSession",
    "JobLogTransport",
    "RealtimeLogHandler",
    "RunnerLogHandler",
]
