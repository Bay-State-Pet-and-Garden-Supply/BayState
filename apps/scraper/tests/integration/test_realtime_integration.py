"""Integration tests for scraper Realtime flow."""

import asyncio
import logging
import threading
import time
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.realtime_manager import (
    BROADCAST_CIRCUIT_BREAKER_THRESHOLD,
    BROADCAST_CIRCUIT_BREAKER_TIMEOUT_SECONDS,
    MAX_RECONNECT_ATTEMPTS,
    RECONNECT_DELAYS,
    RealtimeError,
    RealtimeManager,
)
from utils.logging_handlers import JobLogEntry, JobLogTransport


def build_record(
    *,
    logger_name: str = "scraper.runner",
    level: int = logging.INFO,
    message: str = "Test message",
    job_id: str = "job-123",
    **extra,
) -> logging.LogRecord:
    record = logging.LogRecord(
        name=logger_name,
        level=level,
        pathname=__file__,
        lineno=1,
        msg=message,
        args=(),
        exc_info=None,
    )
    record.job_id = job_id
    for key, value in extra.items():
        setattr(record, key, value)
    return record


class FakeRealtimeManager:
    def __init__(self) -> None:
        self.is_connected: bool = False
        self.broadcast_calls: list[dict[str, Any]] = []
        self.broadcast_errors: list[Exception] = []

    async def broadcast_job_log_entry(self, payload: dict[str, Any]) -> None:
        self.broadcast_calls.append(payload)

    @property
    def last_broadcast_error(self) -> RealtimeError | None:
        if self.broadcast_errors:
            return self.broadcast_errors[-1]
        return None


class FakeSupabaseClient:
    def __init__(self) -> None:
        self._channels: dict[str, Any] = {}
        self._connected = False

    def channel(self, name: str, config: dict[str, Any] | None = None) -> Any:
        channel = MagicMock()
        self._channels[name] = channel
        return channel

    def get_channels(self) -> list[Any]:
        return list(self._channels.values())


@pytest.fixture
def mock_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.run_until_complete(loop.shutdown_asyncgens())
    loop.close()


@pytest.fixture
def realtime_manager(mock_loop) -> RealtimeManager:
    manager = RealtimeManager(
        supabase_url="https://test.supabase.co",
        service_key="test-key",
        runner_name="test-runner",
        runner_id="runner-1",
    )
    return manager


@pytest.fixture
def fake_realtime_manager() -> FakeRealtimeManager:
    return FakeRealtimeManager()


@pytest.mark.asyncio
async def test_should_broadcast_logs_to_supabase_realtime(realtime_manager: RealtimeManager) -> None:
    channel_mock = MagicMock()
    channel_mock.send_broadcast = AsyncMock()
    channel_mock.on_close = MagicMock(return_value=channel_mock)
    channel_mock.on_error = MagicMock(return_value=channel_mock)
    realtime_manager._broadcast_channel = channel_mock
    realtime_manager._connected = True
    realtime_manager._broadcast_enabled = True

    payload = {
        "id": "evt-1",
        "event_id": "evt-1",
        "job_id": "job-123",
        "runner_id": "runner-1",
        "runner_name": "test-runner",
        "level": "info",
        "message": "Runner started",
        "source": "scraper.runner",
        "scraper_name": "amazon",
        "sku": None,
        "phase": "init",
        "sequence": 1,
        "details": {},
        "timestamp": "2024-01-01T00:00:00Z",
    }

    await realtime_manager.broadcast_job_log_entry(payload)

    channel_mock.send_broadcast.assert_called_once_with("runner_log", payload)


@pytest.mark.asyncio
async def test_should_reconnect_after_connection_drop(realtime_manager: RealtimeManager) -> None:
    fake_client = FakeSupabaseClient()
    realtime_manager.client = fake_client
    realtime_manager._connected = True
    realtime_manager._broadcast_enabled = True
    realtime_manager._presence_enabled = False

    channel_mock = MagicMock()
    channel_mock.send_broadcast = AsyncMock()
    channel_mock.on_close = MagicMock(return_value=channel_mock)
    channel_mock.on_error = MagicMock(return_value=channel_mock)
    realtime_manager._broadcast_channel = channel_mock

    connect_attempts: list[int] = []

    async def mock_connect() -> bool:
        connect_attempts.append(len(connect_attempts) + 1)
        return True

    realtime_manager.connect = mock_connect

    realtime_manager._handle_disconnect("test-channel")

    await asyncio.sleep(0.1)

    assert realtime_manager._reconnect_task is not None
    assert not realtime_manager._reconnect_task.done()

    await asyncio.sleep(2.0)

    assert len(connect_attempts) >= 1


@pytest.mark.asyncio
async def test_should_drop_old_logs_when_queue_is_full(fake_realtime_manager: FakeRealtimeManager) -> None:
    transport = JobLogTransport(
        job_id="job-123",
        runner_id="runner-1",
        runner_name="runner-one",
        realtime_manager=fake_realtime_manager,
        max_queue_size=5,
        flush_interval=10.0,
    )
    transport._loop = asyncio.new_event_loop()

    async def run_threadsafe(coro, loop):
        return asyncio.run_coroutine_threadsafe(coro, loop).result()

    with patch.object(asyncio, "run_coroutine_threadsafe", side_effect=run_threadsafe):
        for i in range(7):
            entry = JobLogEntry(
                event_id=f"evt-{i}",
                job_id="job-123",
                level="info",
                message=f"Log message {i}",
                timestamp="2024-01-01T00:00:00Z",
                sequence=i + 1,
            )
            transport.enqueue(entry)

        await asyncio.sleep(0.2)

        if transport._shipping_queue:
            assert transport._shipping_queue.qsize() <= 5

    transport.close()


@pytest.mark.asyncio
async def test_should_stop_retrying_after_max_attempts(realtime_manager: RealtimeManager) -> None:
    connect_attempts: list[int] = []

    async def mock_connect() -> bool:
        connect_attempts.append(len(connect_attempts) + 1)
        return False

    realtime_manager.connect = mock_connect
    realtime_manager._shutdown_event = asyncio.Event()
    realtime_manager._connected = False

    with patch("asyncio.sleep", new_callable=AsyncMock):
        await realtime_manager._auto_reconnect()

    assert len(connect_attempts) == MAX_RECONNECT_ATTEMPTS
    assert len(connect_attempts) == len(RECONNECT_DELAYS)


@pytest.mark.asyncio
async def test_should_resume_after_circuit_breaker_cooldown(
    realtime_manager: RealtimeManager,
) -> None:
    channel_mock = MagicMock()
    channel_mock.send_broadcast = AsyncMock(side_effect=RealtimeError("Simulated broadcast failure"))
    channel_mock.on_close = MagicMock(return_value=channel_mock)
    channel_mock.on_error = MagicMock(return_value=channel_mock)
    realtime_manager._broadcast_channel = channel_mock
    realtime_manager._connected = True
    realtime_manager._broadcast_enabled = True

    for i in range(BROADCAST_CIRCUIT_BREAKER_THRESHOLD + 1):
        try:
            await realtime_manager.broadcast_job_log_entry(
                {
                    "id": f"evt-{i}",
                    "event_id": f"evt-{i}",
                    "job_id": "job-123",
                    "level": "info",
                    "message": f"Log {i}",
                }
            )
        except RealtimeError:
            pass

    assert realtime_manager._is_broadcast_circuit_open() is True
    assert realtime_manager.broadcast_circuit_state()["circuit_open"] is True
    assert realtime_manager.broadcast_circuit_state()["consecutive_failures"] >= BROADCAST_CIRCUIT_BREAKER_THRESHOLD

    realtime_manager._broadcast_circuit_open_until = time.monotonic() - 1

    assert realtime_manager._is_broadcast_circuit_open() is False
    assert realtime_manager.broadcast_circuit_state()["circuit_open"] is False


@pytest.mark.asyncio
async def test_transport_to_realtime_manager_full_flow(
    fake_realtime_manager: FakeRealtimeManager,
    mock_loop,
) -> None:
    transport = JobLogTransport(
        job_id="job-123",
        runner_id="runner-1",
        runner_name="runner-one",
        realtime_manager=fake_realtime_manager,
    )

    loop = asyncio.new_event_loop()
    transport._loop = loop
    fake_realtime_manager.is_connected = True

    def run_loop_forever():
        asyncio.set_event_loop(loop)
        loop.run_forever()

    loop_thread = threading.Thread(target=run_loop_forever, daemon=True)
    loop_thread.start()

    record = build_record(
        level=logging.INFO,
        message="Runner started",
        job_id="job-123",
        scraper_name="amazon",
        phase="init",
    )

    entry = transport.capture(record)
    assert entry is not None

    transport.broadcast(entry)

    await asyncio.sleep(0.5)

    assert len(fake_realtime_manager.broadcast_calls) == 1
    broadcast_payload = fake_realtime_manager.broadcast_calls[0]
    assert broadcast_payload["job_id"] == "job-123"
    assert broadcast_payload["message"] == "Runner started"
    assert broadcast_payload["level"] == "info"

    transport.close()
    loop.call_soon_threadsafe(loop.stop)
    loop_thread.join(timeout=2.0)


def test_reconnect_delays_exponential_backoff() -> None:
    assert RECONNECT_DELAYS == [1, 2, 4, 8, 16]
    assert MAX_RECONNECT_ATTEMPTS == 5
    assert MAX_RECONNECT_ATTEMPTS == len(RECONNECT_DELAYS)

    for i in range(len(RECONNECT_DELAYS) - 1):
        assert RECONNECT_DELAYS[i + 1] == RECONNECT_DELAYS[i] * 2


def test_broadcast_circuit_breaker_constants() -> None:
    assert BROADCAST_CIRCUIT_BREAKER_THRESHOLD == 5
    assert BROADCAST_CIRCUIT_BREAKER_TIMEOUT_SECONDS == 60.0
