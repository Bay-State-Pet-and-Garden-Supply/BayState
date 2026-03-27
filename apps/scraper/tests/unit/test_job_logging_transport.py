import asyncio
import logging
import time
from dataclasses import dataclass

from utils.logging_handlers import JobLogEntry, JobLogTransport, RunnerLogHandler


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


def test_transport_captures_only_matching_job_logs():
    transport = JobLogTransport(
        job_id="job-123",
        runner_id="runner-1",
        runner_name="runner-one",
    )

    matching = build_record(
        level=logging.WARNING,
        message="Retrying request",
        job_id="job-123",
        scraper_name="amazon",
        sku="SKU-1",
        phase="request",
        details={"attempt": 2},
        current_sku="SKU-1",
    )
    other_job = build_record(message="Ignore me", job_id="job-999")

    entry = transport.capture(matching)

    assert entry is not None
    assert entry.job_id == "job-123"
    assert entry.level == "warning"
    assert entry.runner_id == "runner-1"
    assert entry.runner_name == "runner-one"
    assert entry.scraper_name == "amazon"
    assert entry.sku == "SKU-1"
    assert entry.phase == "request"
    assert entry.source == "scraper.runner"
    assert entry.details == {"attempt": 2, "current_sku": "SKU-1"}
    assert transport.capture(other_job) is None
    assert transport.snapshot() == [entry.to_result_payload()]


@dataclass
class StubTransport:
    entry: JobLogEntry
    broadcasted: list[JobLogEntry]
    enqueued: list[tuple[JobLogEntry, bool]]
    flushed: int = 0
    closed: int = 0

    def capture(self, record: logging.LogRecord) -> JobLogEntry:
        return self.entry

    def broadcast(self, entry: JobLogEntry) -> None:
        self.broadcasted.append(entry)

    def enqueue(self, entry: JobLogEntry, *, flush_immediately: bool = False) -> None:
        self.enqueued.append((entry, flush_immediately))

    def flush(self) -> None:
        self.flushed += 1

    def close(self) -> None:
        self.closed += 1


def test_runner_log_handler_flushes_warnings_immediately():
    entry = JobLogEntry(
        event_id="evt-1",
        job_id="job-123",
        level="warning",
        message="Need immediate flush",
        timestamp="2024-01-01T00:00:00Z",
        sequence=1,
    )
    transport = StubTransport(entry=entry, broadcasted=[], enqueued=[])
    handler = RunnerLogHandler(transport)  # type: ignore[arg-type]

    handler.emit(build_record(level=logging.WARNING))
    handler.flush()
    handler.close()

    assert transport.broadcasted == [entry]
    assert transport.enqueued == [(entry, True)]
    assert transport.flushed == 1
    assert transport.closed == 1


class FakeRealtimeManager:
    def __init__(self) -> None:
        self.is_connected = True
        self.log_payloads: list[dict] = []
        self.progress_payloads: list[dict] = []

    async def broadcast_job_log_entry(self, payload: dict) -> None:
        self.log_payloads.append(payload)

    async def broadcast_job_progress_update(self, payload: dict) -> None:
        self.progress_payloads.append(payload)


def test_transport_broadcasts_normalized_log_and_progress(monkeypatch):
    realtime_manager = FakeRealtimeManager()
    transport = JobLogTransport(
        job_id="job-123",
        runner_id="runner-1",
        runner_name="runner-one",
        realtime_manager=realtime_manager,
    )
    transport._loop = object()

    def run_now(coro, _loop):
        asyncio.run(coro)
        return None

    monkeypatch.setattr(asyncio, "run_coroutine_threadsafe", run_now)

    entry = transport.capture(
      build_record(
          level=logging.INFO,
          message="Runner started",
          job_id="job-123",
          scraper_name="amazon",
      )
    )
    assert entry is not None

    transport.broadcast(entry)
    transport.emit_progress(
        status="running",
        progress=35,
        message="Processing SKU-35",
        phase="scraping",
        current_sku="SKU-35",
        items_processed=7,
        items_total=20,
        details={"chunk_index": 1},
    )

    assert realtime_manager.log_payloads == [
        {
            "event_id": entry.event_id,
            "job_id": "job-123",
            "level": "info",
            "message": "Runner started",
            "timestamp": entry.timestamp,
            "sequence": 1,
            "runner_id": "runner-1",
            "runner_name": "runner-one",
            "source": "scraper.runner",
            "scraper_name": "amazon",
            "id": entry.event_id,
        }
    ]
    assert realtime_manager.progress_payloads[0]["job_id"] == "job-123"
    assert realtime_manager.progress_payloads[0]["runner_id"] == "runner-1"
    assert realtime_manager.progress_payloads[0]["progress"] == 35
    assert realtime_manager.progress_payloads[0]["phase"] == "scraping"
    assert realtime_manager.progress_payloads[0]["current_sku"] == "SKU-35"
    assert realtime_manager.progress_payloads[0]["items_processed"] == 7
    assert realtime_manager.progress_payloads[0]["items_total"] == 20
    assert realtime_manager.progress_payloads[0]["details"] == {"chunk_index": 1}


class FakeApiClient:
    def __init__(self) -> None:
        self.log_batches: list[tuple[str, list[dict]]] = []
        self.progress_payloads: list[dict] = []

    def post_logs(self, job_id: str, payload: list[dict]) -> bool:
        self.log_batches.append((job_id, payload))
        return True

    def post_progress(self, payload: dict) -> bool:
        self.progress_payloads.append(payload)
        return True


def test_transport_persists_latest_progress_snapshot():
    api_client = FakeApiClient()
    transport = JobLogTransport(
        job_id="job-123",
        runner_id="runner-1",
        runner_name="runner-one",
        lease_token="lease-123",
        api_client=api_client,
        flush_interval=0.01,
    )

    entry = transport.capture(
        build_record(
            level=logging.INFO,
            message="Runner started",
            job_id="job-123",
        )
    )
    assert entry is not None

    transport.enqueue(entry, flush_immediately=True)
    transport.emit_progress(
        status="running",
        progress=60,
        message="Processing SKU-60",
        phase="scraping",
        current_sku="SKU-60",
        items_processed=6,
        items_total=10,
    )
    transport.flush()
    time.sleep(0.05)
    transport.close()

    assert api_client.log_batches
    assert api_client.log_batches[0][0] == "job-123"
    assert api_client.progress_payloads[-1]["job_id"] == "job-123"
    assert api_client.progress_payloads[-1]["lease_token"] == "lease-123"
    assert api_client.progress_payloads[-1]["progress"] == 60
