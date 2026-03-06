"""
Unified logging handlers for Bay State Scraper.
Provides HTTP batching and Realtime broadcasting as standard logging handlers.
"""

from __future__ import annotations

import logging
import asyncio
import time
from datetime import datetime
from typing import Any, List

class AsyncHttpLogHandler(logging.Handler):
    """
    Logging handler that batches logs and sends them to the coordinator API via HTTP.
    """
    def __init__(self, api_client: Any, job_id: str | None = None, batch_size: int = 10, flush_interval: float = 5.0):
        super().__init__()
        self.api_client = api_client
        self.job_id = job_id
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.buffer: List[dict[str, Any]] = []
        self.last_flush = time.time()
        self._loop = asyncio.get_event_loop()

    def emit(self, record: logging.LogRecord) -> None:
        if not self.job_id:
            return

        log_entry = {
            "level": record.levelname.lower(),
            "message": self.format(record),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "logger": record.name,
        }
        
        self.buffer.append(log_entry)
        
        if len(self.buffer) >= self.batch_size or (time.time() - self.last_flush >= self.flush_interval):
            self.flush_buffer()

    def flush_buffer(self) -> None:
        if not self.buffer or not self.job_id:
            return

        batch = list(self.buffer)
        self.buffer = []
        self.last_flush = time.time()

        # Send logs asynchronously
        if self._loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self._send_batch(self.job_id, batch),
                self._loop
            )

    async def _send_batch(self, job_id: str, batch: List[dict[str, Any]]) -> None:
        try:
            # We use to_thread because api_client._make_request is synchronous
            await asyncio.to_thread(self.api_client.post_logs, job_id, batch)
        except Exception:
            # Avoid infinite recursion if the API client itself logs an error
            pass

    def close(self) -> None:
        self.flush_buffer()
        super().close()

class RealtimeLogHandler(logging.Handler):
    """
    Logging handler that broadcasts logs via Supabase Realtime.
    """
    def __init__(self, realtime_manager: Any, job_id: str | None = None):
        super().__init__()
        self.realtime_manager = realtime_manager
        self.job_id = job_id
        self._loop = asyncio.get_event_loop()

    def emit(self, record: logging.LogRecord) -> None:
        if not self.job_id or not self.realtime_manager or not self.realtime_manager.is_connected:
            return

        level = record.levelname.lower()
        message = self.format(record)
        
        if self._loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self.realtime_manager.broadcast_job_log(self.job_id, level, message),
                self._loop
            )
