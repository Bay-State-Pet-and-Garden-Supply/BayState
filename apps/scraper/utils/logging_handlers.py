"""
Job-scoped logging transport for Bay State Scraper.

This module provides a single structured logging pipeline for scraper jobs:
- persist logs to the coordinator API with low-latency batching
- broadcast the same log entries to Realtime for optimistic UI updates
- keep an in-memory history so completed jobs can return a stable log timeline

The key rule is that only log records explicitly tagged with a matching job_id
are captured. That keeps concurrent job sessions from leaking logs into one
another when multiple runners share the same Python process.
"""

from __future__ import annotations

import atexit
import asyncio
import logging
import sys
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping

IGNORED_LOGGER_PREFIXES = ("httpx", "httpcore", "urllib3")
LOG_RECORD_RESERVED_KEYS = set(logging.makeLogRecord({}).__dict__.keys()) | {"message", "asctime"}

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
        return {
            str(key): serialized
            for key, raw in value.items()
            if (serialized := _serialize_json(raw)) is not None
        }

    if isinstance(value, (list, tuple, set)):
        return [_serialize_json(item) for item in value]

    return str(value)


def _compact_dict(data: Mapping[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in data.items()
        if value is not None and value != "" and value != {} and value != []
    }


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
        self.max_queue_size = max_queue_size
        self.history_limit = history_limit

        self._history: list[JobLogEntry] = []
        self._pending: deque[JobLogEntry] = deque(maxlen=max_queue_size)
        self._pending_progress: dict[str, Any] | None = None
        self._lock = threading.Lock()
        self._sequence = 0
        self._stop_event = threading.Event()
        self._flush_event = threading.Event()
        self._thread_local = threading.local()
        self._shipping_thread: threading.Thread | None = None
        self._closed = False

        try:
            self._loop: asyncio.AbstractEventLoop | None = asyncio.get_running_loop()
        except RuntimeError:
            try:
                self._loop = asyncio.get_event_loop()
            except RuntimeError:
                self._loop = None

        if self.api_client:
            self._shipping_thread = threading.Thread(
                target=self._shipping_loop,
                daemon=True,
                name=f"job-log-{job_id[:8]}",
            )
            self._shipping_thread.start()

        atexit.register(self.close)

    def should_capture(self, record: logging.LogRecord) -> bool:
        if getattr(self._thread_local, "shipping", False):
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

        ignored_fields = LOG_RECORD_RESERVED_KEYS | ROOT_CONTEXT_FIELDS | DETAIL_CONTEXT_FIELDS | {
            "_job_log_entry",
        }
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

        with self._lock:
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

        with self._lock:
            self._history.append(entry)
            if len(self._history) > self.history_limit:
                self._history = self._history[-self.history_limit :]

        setattr(record, "_job_log_entry", entry)
        return entry

    def enqueue(self, entry: JobLogEntry, *, flush_immediately: bool = False) -> None:
        if not self.api_client:
            return

        with self._lock:
            self._pending.append(entry)
            pending_count = len(self._pending)

        if flush_immediately or pending_count >= self.batch_size:
            self._flush_event.set()

    def _drain_pending(self) -> list[JobLogEntry]:
        with self._lock:
            if not self._pending:
                return []
            batch = list(self._pending)
            self._pending.clear()
            return batch

    def _queue_progress(self, payload: dict[str, Any]) -> None:
        if not self.api_client:
            return

        with self._lock:
            self._pending_progress = payload

        self._flush_event.set()

    def _drain_progress(self) -> dict[str, Any] | None:
        with self._lock:
            payload = self._pending_progress
            self._pending_progress = None
            return payload

    def _send_batch(self, batch: list[JobLogEntry]) -> None:
        if not batch or not self.api_client:
            return

        payload = [entry.to_api_payload() for entry in batch]
        delay = self.retry_delay
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                self._thread_local.shipping = True
                self.api_client.post_logs(self.job_id, payload)
                return
            except Exception as exc:  # noqa: PERF203 - clearer retry loop
                last_error = exc
                if attempt < self.max_retries:
                    time.sleep(delay)
                    delay *= 2
            finally:
                self._thread_local.shipping = False

        try:
            sys.stderr.write(
                f"[job-logging] Failed to ship {len(batch)} log(s) for job {self.job_id} "
                f"after {self.max_retries + 1} attempt(s): {last_error}\n"
            )
        except Exception:
            pass

    def _shipping_loop(self) -> None:
        while True:
            self._flush_event.wait(timeout=self.flush_interval)
            self._flush_event.clear()

            batch = self._drain_pending()
            if batch:
                self._send_batch(batch)

            progress_payload = self._drain_progress()
            if progress_payload:
                self._send_progress(progress_payload)

            if self._stop_event.is_set():
                final_batch = self._drain_pending()
                if final_batch:
                    self._send_batch(final_batch)
                final_progress = self._drain_progress()
                if final_progress:
                    self._send_progress(final_progress)
                return

    def broadcast(self, entry: JobLogEntry) -> None:
        if not self.realtime_manager or not self._loop or not getattr(self.realtime_manager, "is_connected", False):
            return

        try:
            asyncio.run_coroutine_threadsafe(
                self.realtime_manager.broadcast_job_log_entry(entry.to_broadcast_payload()),
                self._loop,
            )
        except Exception:
            # Best effort only; coordinator persistence is the source of truth.
            pass

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
            asyncio.run_coroutine_threadsafe(
                self.realtime_manager.broadcast_job_progress_update(payload),
                self._loop,
            )
        except Exception:
            pass

    def _send_progress(self, payload: dict[str, Any]) -> None:
        if not payload or not self.api_client:
            return

        delay = self.retry_delay
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                self._thread_local.shipping = True
                self.api_client.post_progress(payload)
                return
            except Exception as exc:  # noqa: PERF203 - clearer retry loop
                last_error = exc
                if attempt < self.max_retries:
                    time.sleep(delay)
                    delay *= 2
            finally:
                self._thread_local.shipping = False

        try:
            sys.stderr.write(
                f"[job-logging] Failed to ship progress for job {self.job_id} "
                f"after {self.max_retries + 1} attempt(s): {last_error}\n"
            )
        except Exception:
            pass

    def snapshot(self) -> list[dict[str, Any]]:
        with self._lock:
            return [entry.to_result_payload() for entry in self._history]

    def flush(self) -> None:
        self._flush_event.set()
        if not self._shipping_thread:
            batch = self._drain_pending()
            if batch:
                self._send_batch(batch)
            progress_payload = self._drain_progress()
            if progress_payload:
                self._send_progress(progress_payload)

    def close(self) -> None:
        if self._closed:
            return

        self._closed = True
        self._stop_event.set()
        self._flush_event.set()

        if self._shipping_thread and self._shipping_thread.is_alive():
            self._shipping_thread.join(timeout=3.0)

        final_batch = self._drain_pending()
        if final_batch:
            self._send_batch(final_batch)


class RunnerLogHandler(logging.Handler):
    """Logging handler that persists and broadcasts job-scoped structured logs."""

    def __init__(self, transport: JobLogTransport):
        super().__init__(level=logging.INFO)
        self.transport = transport

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
            self.logger.addHandler(self.handler)
            self._attached = True
        return self

    def detach(self) -> None:
        if self._attached:
            self.logger.removeHandler(self.handler)
            self._attached = False
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
