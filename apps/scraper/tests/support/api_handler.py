from __future__ import annotations

import asyncio
import inspect
import atexit
import logging
import sys
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any

try:
    _module_name = __name__
except NameError:
    _module_name = "api_handler"


class ScraperAPIHandler(logging.Handler):
    """Logging handler that batches log shipping for tests."""

    def __init__(
        self,
        api_client: Any,
        job_id: str,
        buffer_size: int = 20,
        flush_interval: float = 2.0,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        max_queue_size: int = 1000,
    ):
        super().__init__()
        self.api_client = api_client
        self.job_id = job_id
        self.buffer_size = buffer_size
        self.flush_interval = flush_interval
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.max_queue_size = max_queue_size

        self._buffer: deque[dict[str, Any]] = deque(maxlen=max_queue_size)
        self._last_flush_time = time.time()
        self._shipping_thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._flush_event = threading.Event()

        self._start_shipping_thread()
        self._registered_atexit = False
        self._register_atexit()

    def _register_atexit(self) -> None:
        try:
            atexit.register(self.close)
            self._registered_atexit = True
        except Exception:
            pass

    def _start_shipping_thread(self) -> None:
        self._shipping_thread = threading.Thread(
            target=self._shipping_loop,
            daemon=True,
            name="log-shipping",
        )
        self._shipping_thread.start()

    def _shipping_loop(self) -> None:
        while not self._stop_event.is_set():
            flush_waited = self._flush_event.wait(timeout=self.flush_interval)

            if self._stop_event.is_set():
                break

            if self._buffer:
                self._ship_buffer()

            if flush_waited:
                self._flush_event.clear()

    def _ship_buffer(self) -> None:
        if not self._buffer:
            return

        with threading.Lock():
            if not self._buffer:
                return
            logs_to_send = list(self._buffer)
            self._buffer.clear()

        self._send_with_retry(logs_to_send)
        self._last_flush_time = time.time()

    def _send_with_retry(self, logs: list[dict[str, Any]]) -> None:
        if not logs:
            return

        delay = self.retry_delay
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                result = self.api_client.post_logs(self.job_id, logs)
                if inspect.isawaitable(result):
                    asyncio.run(result)
                return
            except Exception as exc:
                last_error = exc
                if attempt < self.max_retries:
                    time.sleep(delay)
                    delay *= 2

        try:
            sys.stderr.write(f"[{_module_name}] Failed to ship {len(logs)} logs after {self.max_retries} retries: {last_error}\n")
        except Exception:
            pass

    def emit(self, record: logging.LogRecord) -> None:
        try:
            log_entry: dict[str, Any] = {
                "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
            }

            for field in ["job_id", "runner_name", "scraper_name", "sku", "step", "worker_id"]:
                value = getattr(record, field, None)
                if value is not None and value != "":
                    log_entry[field] = value

            if record.exc_info:
                log_entry["error_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None
                log_entry["error_message"] = str(record.exc_info[1]) if record.exc_info[1] else None

            try:
                self._buffer.append(log_entry)
            except IndexError:
                try:
                    self._buffer.popleft()
                    self._buffer.append(log_entry)
                except IndexError:
                    pass
        except Exception:
            pass

    def flush(self) -> None:
        self._flush_event.set()

        if self._shipping_thread and self._shipping_thread.is_alive():
            self._shipping_thread.join(timeout=0.5)

    def close(self) -> None:
        if hasattr(self, "_stop_event"):
            self._stop_event.set()
            self._flush_event.set()

            if self._shipping_thread and self._shipping_thread.is_alive():
                try:
                    self._shipping_thread.join(timeout=2.0)
                except Exception:
                    pass

            if self._buffer:
                try:
                    logs_to_send = list(self._buffer)
                    self._buffer.clear()
                    self._send_with_retry(logs_to_send)
                except Exception:
                    pass

        super().close()

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass
