"""
Supabase Realtime subscription manager for scrape job notifications.

Features:
- Subscribe to scrape_jobs INSERT events
- Track runner presence (online/offline status)
- Optionally broadcast transient progress, log, and runner-status diagnostics
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Callable, Protocol, cast


logger = logging.getLogger(__name__)

# Reconnection configuration
RECONNECT_DELAYS = [1, 2, 4, 8, 16]
MAX_RECONNECT_ATTEMPTS = len(RECONNECT_DELAYS)

# Broadcast channel names
CHANNEL_RUNNER_PRESENCE = "runner-presence"
CHANNEL_JOB_BROADCAST = "job-broadcast"
BROADCAST_CIRCUIT_BREAKER_THRESHOLD = 5
BROADCAST_CIRCUIT_BREAKER_TIMEOUT_SECONDS = 60.0
TRANSIENT_REALTIME_ERROR_MARKERS = (
    "1006",
    "broadcast channel is not connected",
    "channel error",
    "connection closed",
    "join push timeout",
    "not connected",
    "set of coroutines/futures is empty",
    "timed out",
    "timeout",
    "websocket",
)


class RealtimeError(Exception):
    pass


class BroadcastCircuitBreakerOpenError(RealtimeError):
    pass


class RealtimeChannelProtocol(Protocol):
    def on_close(self) -> None: ...

    def on_error(self, payload: dict[str, Any]) -> None: ...

    def on_postgres_changes(
        self,
        event: str,
        callback: Callable[[dict[str, Any]], Any],
        table: str | None = None,
        schema: str | None = None,
        filter: str | None = None,
    ) -> RealtimeChannelProtocol: ...

    async def subscribe(
        self,
        callback: Callable[[Any, Exception | None], None] | None = None,
    ) -> RealtimeChannelProtocol: ...

    def on_presence_sync(self, callback: Callable[[], None]) -> RealtimeChannelProtocol: ...

    def on_presence_join(self, callback: Callable[[dict[str, Any]], None]) -> RealtimeChannelProtocol: ...

    def on_presence_leave(self, callback: Callable[[dict[str, Any]], None]) -> RealtimeChannelProtocol: ...

    async def track(self, payload: dict[str, Any]) -> None: ...

    async def send_broadcast(self, event: str, payload: dict[str, Any]) -> None: ...

    async def unsubscribe(self) -> Any: ...


class RealtimeManager:
    """
    Manages Supabase Realtime WebSocket connections for job notifications.

    Features:
    - Async WebSocket connection management
    - Automatic reconnection with exponential backoff
    - Subscribe to scrape_jobs INSERT events with status=eq.pending filter
    - Thread-safe job queuing via asyncio.Queue
    - Graceful shutdown via asyncio.Event
    - Presence tracking for runner online/offline status
    - Optional transient broadcast capabilities for diagnostics only
    """

    RECONNECT_DELAYS: list[int] = RECONNECT_DELAYS
    MAX_RECONNECT_ATTEMPTS: int = MAX_RECONNECT_ATTEMPTS

    def __init__(
        self,
        supabase_url: str,
        service_key: str,
        runner_name: str,
        runner_id: str | None = None,
    ):
        """
        Initialize the RealtimeManager.

        Args:
            supabase_url: Full Supabase project URL (e.g., https://xyz.supabase.co)
            service_key: Supabase service role key or anon key
            runner_name: Unique identifier for this runner instance
            runner_id: Optional runner ID for presence tracking
        """
        # Normalize URL: convert http(s) to ws(s) and append realtime path if needed
        normalized_url = supabase_url
        if normalized_url.startswith("https://"):
            normalized_url = normalized_url.replace("https://", "wss://")
        elif normalized_url.startswith("http://"):
            normalized_url = normalized_url.replace("http://", "ws://")

        if "/realtime/v1" not in normalized_url:
            normalized_url = normalized_url.rstrip("/") + "/realtime/v1"

        self.supabase_url: str = normalized_url
        self.service_key: str = service_key
        self.runner_name: str = runner_name
        self.runner_id: str = runner_id or runner_name
        self.logger: logging.Logger = logger

        self.client: Any | None = None
        self._connected: bool = False
        self._reconnect_task: asyncio.Task[Any] | None = None
        self._shutdown_event: asyncio.Event = asyncio.Event()
        self._pending_jobs: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._job_callback: Callable[[dict[str, Any]], None] | None = None

        # Presence tracking
        self._presence_task: asyncio.Task[Any] | None = None
        self._presence_interval: int = 30  # seconds between presence updates

        # Broadcast channels
        self._job_channel: RealtimeChannelProtocol | None = None
        self._broadcast_channel: RealtimeChannelProtocol | None = None
        self._presence_channel: RealtimeChannelProtocol | None = None
        self._broadcast_enabled: bool = False
        self._presence_enabled: bool = False
        self._broadcast_consecutive_failures: int = 0
        self._broadcast_circuit_opened_at: float | None = None
        self._broadcast_circuit_open_until: float | None = None
        self._last_broadcast_error: RealtimeError | None = None

    @property
    def is_connected(self) -> bool:
        """Check if the WebSocket connection is active."""
        return self._connected

    async def connect(self) -> bool:
        """
        Establish WebSocket connection to Supabase Realtime.

        Returns:
            True if connection successful, False otherwise
        """
        try:
            from realtime._async.client import AsyncRealtimeClient as _AsyncRealtimeClient

            self._shutdown_event.clear()

            should_restore_channels = any(
                [
                    self._job_callback is not None,
                    self._presence_enabled,
                    self._broadcast_enabled,
                ]
            )

            self.client = _AsyncRealtimeClient(
                self.supabase_url,
                self.service_key,
                auto_reconnect=False,
            )

            await self.client.connect()
            self._connected = True

            if should_restore_channels:
                await self._restore_channels()

            logger.info(f"[{self.runner_name}] Connected to Supabase Realtime")
            return True

        except Exception as e:
            logger.error(f"[{self.runner_name}] Failed to connect to Supabase Realtime: {self._summarize_realtime_error(e)}")
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """
        Gracefully close WebSocket connection and stop reconnection.

        Sets shutdown event, cancels reconnection task, and closes all channel
        subscriptions.
        """
        logger.info(f"[{self.runner_name}] Disconnecting from Supabase Realtime...")

        # Signal shutdown to stop reconnection attempts
        self._shutdown_event.set()

        # Stop presence tracking
        if self._presence_task and not self._presence_task.done():
            _ = self._presence_task.cancel()
            try:
                await self._presence_task
            except asyncio.CancelledError:
                pass

        # Cancel any pending reconnection task
        if self._reconnect_task and not self._reconnect_task.done():
            _ = self._reconnect_task.cancel()
            try:
                await self._reconnect_task
            except asyncio.CancelledError:
                pass

        # Close all channel subscriptions
        if self.client:
            channels = cast(list[RealtimeChannelProtocol], self.client.get_channels())
            for channel in channels:
                await channel.unsubscribe()
            await self.client.close()

        self._connected = False
        self._job_channel = None
        self._broadcast_channel = None
        self._presence_channel = None
        self._presence_task = None
        logger.info(f"[{self.runner_name}] Disconnected from Supabase Realtime")

    async def subscribe_to_jobs(self, callback: Callable[[dict[str, Any]], None]) -> None:
        """
        Subscribe to INSERT events on the scrape_jobs table.

        Filters for jobs where status='pending'. When a matching INSERT is
        detected, the job data is placed on the internal queue and the callback
        is invoked.

        Args:
            callback: Async or sync callable that accepts job data dict
        """
        if not self.client:
            logger.error(f"[{self.runner_name}] Cannot subscribe: client not initialized")
            return

        self._job_callback = callback

        channel = cast(RealtimeChannelProtocol, self.client.channel(f"runner:{self.runner_name}"))
        self._job_channel = channel
        self._wire_disconnect_handler(channel, role="job", label=f"runner:{self.runner_name}")

        channel.on_postgres_changes(
            event="INSERT",
            schema="public",
            table="scrape_jobs",
            filter="status=eq.pending",
            callback=self._handle_job_insert,
        )

        def _on_subscribe(status: Any, err: Exception | None):
            if str(status) == "SUBSCRIBED":
                logger.info(f"[{self.runner_name}] Subscribed to scrape_jobs INSERT events")
            elif str(status) == "CHANNEL_ERROR":
                logger.warning(f"[{self.runner_name}] Error subscribing to jobs: {self._summarize_realtime_error(err)}")
            elif str(status) == "TIMED_OUT":
                logger.warning(f"[{self.runner_name}] Job subscription timed out")

        await channel.subscribe(_on_subscribe)

    async def _handle_job_insert(self, payload: dict[str, Any]) -> None:
        """
        Handle INSERT event from scrape_jobs table.

        Args:
            payload: Realtime payload containing 'new' key with inserted row
        """
        try:
            job_data = payload.get("new")
            if not job_data:
                logger.warning(f"[{self.runner_name}] Received INSERT with no 'new' data")
                return

            await self._pending_jobs.put(job_data)
            logger.info(f"[{self.runner_name}] Queued pending job: {job_data.get('job_id')}")

            # Invoke callback if registered
            if self._job_callback:
                try:
                    if asyncio.iscoroutinefunction(self._job_callback):
                        await self._job_callback(job_data)
                    else:
                        self._job_callback(job_data)
                except Exception as e:
                    logger.error(f"[{self.runner_name}] Job callback error: {e}")

        except Exception as e:
            logger.error(f"[{self.runner_name}] Error handling job INSERT: {e}")

    async def enable_presence(self) -> bool:
        """
        Enable presence tracking for this runner.

        Tracks runner online/offline status in the admin dashboard.

        Returns:
            True if presence was enabled successfully
        """
        if not self.client:
            logger.error(f"[{self.runner_name}] Cannot enable presence: client not initialized")
            return False

        try:
            self._presence_enabled = True
            self._presence_channel = cast(
                RealtimeChannelProtocol,
                self.client.channel(CHANNEL_RUNNER_PRESENCE, {"config": {"presence": {"key": self.runner_id}}}),
            )
            presence_channel = self._presence_channel
            self._wire_disconnect_handler(presence_channel, role="presence", label=CHANNEL_RUNNER_PRESENCE)

            # Set up presence tracking using v2.x API
            self._presence_channel.on_presence_sync(lambda: self._handle_presence_sync(getattr(presence_channel, "presence_state", lambda: {})()))
            self._presence_channel.on_presence_join(lambda new_presences: self._handle_presence_join(new_presences))
            self._presence_channel.on_presence_leave(lambda left_presences: self._handle_presence_leave(left_presences))

            def _on_subscribe(status: Any, err: Exception | None):
                if str(status) == "SUBSCRIBED":
                    logger.info(f"[{self.runner_name}] Presence channel subscribed")
                elif str(status) == "CHANNEL_ERROR":
                    logger.warning(f"[{self.runner_name}] Error subscribing to presence: {self._summarize_realtime_error(err)}")
                elif str(status) == "TIMED_OUT":
                    logger.warning(f"[{self.runner_name}] Presence subscription timed out")

            await self._presence_channel.subscribe(_on_subscribe)

            # Track self as online
            await self._presence_channel.track(
                {
                    "runner_id": self.runner_id,
                    "runner_name": self.runner_name,
                    "status": "online",
                    "last_seen": time.time(),
                }
            )
            logger.info(f"[{self.runner_name}] Presence tracking enabled")

            # Start background task to send periodic heartbeats
            self._presence_task = asyncio.create_task(self._presence_heartbeat_loop())

            return True

        except Exception as e:
            logger.error(f"[{self.runner_name}] Failed to enable presence: {self._summarize_realtime_error(e)}")
            return False

    async def _presence_heartbeat_loop(self) -> None:
        """Send periodic presence updates to keep runner marked as online."""
        try:
            while not self._shutdown_event.is_set():
                await asyncio.sleep(self._presence_interval)

                if self._presence_channel and self._connected:
                    try:
                        await self._presence_channel.track(
                            {
                                "runner_id": self.runner_id,
                                "runner_name": self.runner_name,
                                "status": "online",
                                "last_seen": time.time(),
                            }
                        )
                        logger.debug(f"[{self.runner_name}] Presence heartbeat sent")
                    except Exception as e:
                        if self._is_transient_realtime_error(e):
                            self._handle_disconnect(
                                CHANNEL_RUNNER_PRESENCE,
                                {
                                    "error": self._summarize_realtime_error(e),
                                },
                            )
                            return
                        logger.warning(f"[{self.runner_name}] Failed to send presence heartbeat: {self._summarize_realtime_error(e)}")

        except asyncio.CancelledError:
            logger.info(f"[{self.runner_name}] Presence heartbeat loop cancelled")
        except Exception as e:
            logger.error(f"[{self.runner_name}] Presence heartbeat error: {e}")

    def _handle_presence_sync(self, payload: dict[str, Any]) -> None:
        """Handle presence sync event."""
        logger.debug(f"[{self.runner_name}] Presence sync: {payload}")

    def _handle_presence_join(self, payload: dict[str, Any]) -> None:
        """Handle presence join event."""
        logger.debug(f"[{self.runner_name}] Presence join: {payload}")

    def _handle_presence_leave(self, payload: dict[str, Any]) -> None:
        """Handle presence leave event."""
        logger.debug(f"[{self.runner_name}] Presence leave: {payload}")

    async def enable_broadcast(self) -> bool:
        """
        Enable broadcast channels for sending job progress and logs.

        Returns:
            True if broadcast was enabled successfully
        """
        if not self.client:
            logger.error(f"[{self.runner_name}] Cannot enable broadcast: client not initialized")
            return False

        try:
            self._broadcast_enabled = True
            # Job progress broadcast channel
            self._broadcast_channel = cast(
                RealtimeChannelProtocol,
                self.client.channel(CHANNEL_JOB_BROADCAST, {"config": {"broadcast": {"ack": False, "self": False}}}),
            )
            self._wire_disconnect_handler(self._broadcast_channel, role="broadcast", label=CHANNEL_JOB_BROADCAST)

            def _on_subscribe(status: Any, err: Exception | None):
                if str(status) == "SUBSCRIBED":
                    logger.info(f"[{self.runner_name}] Broadcast channel enabled")
                elif str(status) == "CHANNEL_ERROR":
                    logger.warning(f"[{self.runner_name}] Error subscribing to broadcast: {self._summarize_realtime_error(err)}")
                elif str(status) == "TIMED_OUT":
                    logger.warning(f"[{self.runner_name}] Broadcast subscription timed out")

            await self._broadcast_channel.subscribe(_on_subscribe)

            return True

        except Exception as e:
            logger.error(f"[{self.runner_name}] Failed to enable broadcast: {self._summarize_realtime_error(e)}")
            return False

    async def broadcast_job_progress(
        self,
        job_id: str,
        status: str,
        progress: int,
        message: str | None = None,
        details: dict[str, Any] | None = None,
        phase: str | None = None,
        current_sku: str | None = None,
        items_processed: int | None = None,
        items_total: int | None = None,
    ) -> None:
        """
        Broadcast job progress to the admin dashboard.

        Args:
            job_id: The job ID being processed
            status: Current status (started, running, completed, failed)
            progress: Progress percentage (0-100)
            message: Optional status message
            details: Optional additional details
        """
        payload = {
            "job_id": job_id,
            "runner_id": self.runner_id,
            "runner_name": self.runner_name,
            "status": status,
            "progress": progress,
            "message": message,
            "phase": phase,
            "details": details or {},
            "current_sku": current_sku,
            "items_processed": items_processed,
            "items_total": items_total,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        await self.broadcast_job_progress_update(payload)

    async def broadcast_job_progress_update(self, payload: dict[str, Any]) -> None:
        """Broadcast a normalized job progress payload."""
        await self._send_broadcast(
            "job_progress",
            payload,
            log_message=f"[{self.runner_name}] Broadcast job progress: {payload.get('job_id')} {payload.get('status')}",
        )

    async def broadcast_job_log(
        self,
        job_id: str,
        level: str,
        message: str,
        details: dict[str, Any] | None = None,
        event_id: str | None = None,
        source: str | None = None,
        scraper_name: str | None = None,
        sku: str | None = None,
        phase: str | None = None,
        sequence: int | None = None,
    ) -> None:
        """
        Broadcast a log message to the admin dashboard.

        Args:
            job_id: The job ID this log is for
            level: Log level (info, warning, error, debug)
            message: Log message
            details: Optional additional details
        """
        payload = {
            "id": event_id,
            "event_id": event_id,
            "job_id": job_id,
            "runner_id": self.runner_id,
            "runner_name": self.runner_name,
            "level": level,
            "message": message,
            "source": source,
            "scraper_name": scraper_name,
            "sku": sku,
            "phase": phase,
            "sequence": sequence,
            "details": details or {},
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        await self.broadcast_job_log_entry(payload)

    async def broadcast_job_log_entry(self, payload: dict[str, Any]) -> None:
        """Broadcast a normalized runner log payload."""
        await self._send_broadcast(
            "runner_log",
            payload,
            log_message=f"[{self.runner_name}] Broadcast log: {payload.get('level')} {payload.get('message')}",
        )

    async def broadcast_runner_status(
        self,
        status: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        """
        Broadcast runner status update (e.g., starting, stopping, error).

        Args:
            status: Status string (starting, stopping, error, idle)
            details: Optional additional details
        """
        await self._send_broadcast(
            "runner_status",
            {
                "runner_id": self.runner_id,
                "runner_name": self.runner_name,
                "status": status,
                "details": details or {},
                "timestamp": time.time(),
            },
            log_message=f"[{self.runner_name}] Broadcast runner status: {status}",
        )

    @property
    def last_broadcast_error(self) -> RealtimeError | None:
        return self._last_broadcast_error

    def broadcast_circuit_state(self) -> dict[str, Any]:
        retry_after_seconds = self._broadcast_retry_after_seconds()
        return {
            "consecutive_failures": self._broadcast_consecutive_failures,
            "circuit_open": retry_after_seconds > 0,
            "retry_after_seconds": retry_after_seconds,
            "opened_at": self._broadcast_circuit_opened_at,
            "last_error": str(self._last_broadcast_error) if self._last_broadcast_error else None,
            "last_error_type": type(self._last_broadcast_error).__name__ if self._last_broadcast_error else None,
        }

    async def get_pending_job(self) -> dict[str, Any] | None:
        """
        Get the next pending job from the queue.

        Returns:
            Job data dict, or None if queue is empty
        """
        try:
            return await asyncio.wait_for(self._pending_jobs.get(), timeout=0.1)
        except asyncio.TimeoutError:
            return None

    def clear_pending_jobs(self) -> None:
        """Clear all pending jobs from the queue."""
        while not self._pending_jobs.empty():
            try:
                _ = self._pending_jobs.get_nowait()
            except asyncio.QueueEmpty:
                break
        logger.info(f"[{self.runner_name}] Cleared pending jobs queue")

    def _broadcast_retry_after_seconds(self) -> float:
        if self._broadcast_circuit_open_until is None:
            return 0.0

        return max(0.0, self._broadcast_circuit_open_until - time.monotonic())

    def _is_broadcast_circuit_open(self) -> bool:
        retry_after_seconds = self._broadcast_retry_after_seconds()
        if retry_after_seconds > 0:
            return True

        if self._broadcast_circuit_open_until is not None:
            self._broadcast_circuit_open_until = None
            self._broadcast_circuit_opened_at = None
            self._broadcast_consecutive_failures = 0

        return False

    def _record_broadcast_success(self) -> None:
        self._broadcast_consecutive_failures = 0
        self._broadcast_circuit_open_until = None
        self._broadcast_circuit_opened_at = None
        self._last_broadcast_error = None

    def _record_broadcast_failure(self, error: RealtimeError) -> None:
        self._last_broadcast_error = error
        self._broadcast_consecutive_failures += 1

        if self._broadcast_consecutive_failures >= BROADCAST_CIRCUIT_BREAKER_THRESHOLD:
            self._broadcast_circuit_opened_at = time.monotonic()
            self._broadcast_circuit_open_until = self._broadcast_circuit_opened_at + BROADCAST_CIRCUIT_BREAKER_TIMEOUT_SECONDS

    @staticmethod
    def _summarize_realtime_error(error: Exception | str | None) -> str:
        text = " ".join(str(error or "").split())
        if not text:
            return "unknown realtime error"
        if len(text) <= 240:
            return text
        return f"{text[:237]}..."

    def _is_transient_realtime_error(self, error: Exception | str | None) -> bool:
        message = self._summarize_realtime_error(error).lower()
        return any(marker in message for marker in TRANSIENT_REALTIME_ERROR_MARKERS)

    def _broadcast_log_extra(self, event: str, payload: dict[str, Any], error: Exception | None = None) -> dict[str, Any]:
        retry_after_seconds = self._broadcast_retry_after_seconds()
        return {
            "runner_id": self.runner_id,
            "runner_name": self.runner_name,
            "job_id": payload.get("job_id"),
            "phase": "realtime_broadcast",
            "event": event,
            "error": str(error) if error else None,
            "error_type": type(error).__name__ if error else None,
            "retry_after_seconds": retry_after_seconds,
            "consecutive_failures": self._broadcast_consecutive_failures,
            "circuit_open": retry_after_seconds > 0,
            "details": {
                "event": event,
                "channel": CHANNEL_JOB_BROADCAST,
                "status": payload.get("status"),
                "level": payload.get("level"),
                "message": payload.get("message"),
            },
        }

    async def _send_broadcast(self, event: str, payload: dict[str, Any], *, log_message: str) -> None:
        if not self._broadcast_channel or not self._connected:
            error = RealtimeError("Broadcast channel is not connected")
            self._last_broadcast_error = error
            raise error

        if self._is_broadcast_circuit_open():
            error = BroadcastCircuitBreakerOpenError(
                f"Realtime broadcast circuit is open for {self.runner_name}; retry after {self._broadcast_retry_after_seconds():.1f}s"
            )
            self._last_broadcast_error = error
            raise error

        try:
            await self._broadcast_channel.send_broadcast(event, payload)
        except Exception as exc:
            error = RealtimeError(f"Failed to broadcast {event}: {exc}")
            self._record_broadcast_failure(error)
            if self._is_transient_realtime_error(exc):
                self._handle_disconnect(
                    CHANNEL_JOB_BROADCAST,
                    {
                        "event": event,
                        "error": self._summarize_realtime_error(exc),
                    },
                )
            else:
                logger.warning(
                    f"[{self.runner_name}] Failed to broadcast realtime event",
                    extra=self._broadcast_log_extra(event, payload, error),
                )
            raise error from exc

        self._record_broadcast_success()
        logger.debug(log_message)

    def _wire_disconnect_handler(self, channel: RealtimeChannelProtocol, role: str, label: str) -> None:
        if getattr(channel, "_baystate_disconnect_handler_wired", False):
            return

        original_on_close = cast(Callable[[], None], getattr(channel, "on_close"))
        original_on_error = cast(Callable[[dict[str, Any]], None], getattr(channel, "on_error"))

        def on_close() -> None:
            original_on_close()
            if self._get_channel_for_role(role) is not channel:
                return
            self._handle_disconnect(label)

        def on_error(payload: dict[str, Any]) -> None:
            original_on_error(payload)
            if self._get_channel_for_role(role) is not channel:
                return
            self._handle_disconnect(label, payload)

        setattr(channel, "on_close", on_close)
        setattr(channel, "on_error", on_error)
        setattr(channel, "_baystate_disconnect_handler_wired", True)

    def _get_channel_for_role(self, role: str) -> RealtimeChannelProtocol | None:
        if role == "job":
            return self._job_channel
        if role == "presence":
            return self._presence_channel
        if role == "broadcast":
            return self._broadcast_channel
        return None

    def _handle_disconnect(self, label: str, payload: dict[str, Any] | None = None) -> None:
        if self._shutdown_event.is_set():
            self.logger.info(f"[{self.runner_name}] Ignoring disconnect for {label} during shutdown")
            return

        if self._reconnect_task and not self._reconnect_task.done():
            self.logger.debug(f"[{self.runner_name}] Reconnect already running after {label} disconnect")
            return

        self._connected = False
        self._job_channel = None
        self._broadcast_channel = None
        self._presence_channel = None

        try:
            current_task = asyncio.current_task()
        except RuntimeError:
            current_task = None
        if self._presence_task and not self._presence_task.done():
            if self._presence_task is not current_task:
                _ = self._presence_task.cancel()
        self._presence_task = None

        self.logger.warning(
            f"[{self.runner_name}] Realtime channel disconnected: {label}; starting reconnect",
            extra={
                "runner_name": self.runner_name,
                "phase": "reconnect",
                "details": {
                    "channel": label,
                    "payload": payload or {},
                },
            },
        )
        self.start_reconnection_loop()

    async def _restore_channels(self) -> None:
        self.logger.info(f"[{self.runner_name}] Restoring realtime channel subscriptions")

        if self._presence_enabled:
            await self.enable_presence()

        if self._broadcast_enabled:
            await self.enable_broadcast()

        if self._job_callback is not None:
            await self.subscribe_to_jobs(self._job_callback)

    async def _auto_reconnect(self) -> None:
        """
        Attempt reconnection with exponential backoff.

        Stops when:
        - Connection succeeds
        - Shutdown event is set
        - All reconnect attempts exhausted
        """
        logger.info(f"[{self.runner_name}] Starting auto-reconnect sequence...")

        for attempt, delay in enumerate(self.RECONNECT_DELAYS, start=1):
            if self._shutdown_event.is_set():
                logger.info(f"[{self.runner_name}] Shutdown requested, skipping reconnect")
                return

            logger.info(f"[{self.runner_name}] Reconnect attempt {attempt}/{len(self.RECONNECT_DELAYS)} in {delay}s")

            await asyncio.sleep(delay)

            if await self.connect():
                logger.info(f"[{self.runner_name}] Reconnection successful!")
                return

        logger.error(f"[{self.runner_name}] Max reconnect attempts ({self.MAX_RECONNECT_ATTEMPTS}) exhausted")
        self._connected = False

    def start_reconnection_loop(self) -> None:
        """Start the background auto-reconnection loop."""
        if self._reconnect_task and not self._reconnect_task.done():
            logger.debug(f"[{self.runner_name}] Reconnection loop already running")
            return

        self._reconnect_task = asyncio.create_task(self._auto_reconnect())
        logger.info(f"[{self.runner_name}] Started reconnection loop")

    async def wait_for_job(self, timeout: float | None = None) -> dict[str, Any] | None:
        """
        Wait for a pending job to arrive in the queue.

        Args:
            timeout: Maximum seconds to wait, None for indefinite

        Returns:
            Job data dict, or None if timeout reached
        """
        try:
            if timeout:
                return await asyncio.wait_for(self._pending_jobs.get(), timeout=timeout)
            else:
                return await self._pending_jobs.get()
        except asyncio.TimeoutError:
            return None

    def queue_size(self) -> int:
        """Return the current number of pending jobs in queue."""
        return self._pending_jobs.qsize()
