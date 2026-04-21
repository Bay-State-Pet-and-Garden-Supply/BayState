from __future__ import annotations

import statistics
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class OperationType(Enum):
    BROWSER_INIT = "browser_init"
    NAVIGATION = "navigation"
    WAIT = "wait"
    EXTRACTION = "extraction"
    CLICK = "click"
    INPUT = "input"
    WORKFLOW_STEP = "workflow_step"
    TOTAL_SKU = "total_sku"
    TOTAL_WORKFLOW = "total_workflow"


@dataclass
class TimingRecord:
    operation_type: OperationType
    duration_ms: float
    timestamp: float
    operation_name: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    success: bool = True


@dataclass
class OperationStats:
    operation_type: OperationType
    count: int
    total_ms: float
    min_ms: float
    max_ms: float
    avg_ms: float
    std_dev_ms: float
    p50_ms: float
    p95_ms: float
    p99_ms: float
    success_rate: float


class PerformanceProfiler:
    def __init__(self, session_id: str | None = None):
        self.session_id = session_id or f"profile_{int(time.time() * 1000)}"
        self._records: list[TimingRecord] = []
        self._lock = threading.Lock()
        self._start_time: float | None = None
        self._end_time: float | None = None

    def start_session(self) -> None:
        with self._lock:
            self._start_time = time.time()
            self._end_time = None
            self._records.clear()

    def end_session(self) -> None:
        with self._lock:
            self._end_time = time.time()

    def record(
        self,
        operation_type: OperationType,
        duration_ms: float,
        operation_name: str = "",
        metadata: dict[str, Any] | None = None,
        success: bool = True,
    ) -> None:
        record = TimingRecord(
            operation_type=operation_type,
            duration_ms=duration_ms,
            timestamp=time.time(),
            operation_name=operation_name or operation_type.value,
            metadata=metadata or {},
            success=success,
        )
        with self._lock:
            self._records.append(record)

    def get_stats(self) -> dict[OperationType, OperationStats]:
        with self._lock:
            records = self._records.copy()

        grouped: dict[OperationType, list[TimingRecord]] = defaultdict(list)
        for record in records:
            grouped[record.operation_type].append(record)

        stats: dict[OperationType, OperationStats] = {}
        for operation_type, operation_records in grouped.items():
            durations = [record.duration_ms for record in operation_records]
            success_count = sum(1 for record in operation_records if record.success)
            if not durations:
                continue

            ordered = sorted(durations)
            count = len(ordered)
            stats[operation_type] = OperationStats(
                operation_type=operation_type,
                count=count,
                total_ms=sum(ordered),
                min_ms=min(ordered),
                max_ms=max(ordered),
                avg_ms=statistics.mean(ordered),
                std_dev_ms=statistics.stdev(ordered) if count > 1 else 0.0,
                p50_ms=ordered[count // 2],
                p95_ms=ordered[int(count * 0.95)] if count >= 20 else ordered[-1],
                p99_ms=ordered[int(count * 0.99)] if count >= 100 else ordered[-1],
                success_rate=success_count / count if count else 0.0,
            )

        return stats
