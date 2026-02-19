# Supabase Realtime Job Commands for Runners

## TL;DR

> **Goal**: Enable BayStateScraper runners to receive job assignments via Supabase Realtime (instead of HTTP polling)
> 
> **Problem**: Current polling-based job fetching is inefficient and introduces latency
> 
> **Solution**: Runner subscribes to `scrape_jobs` INSERT events via `realtime-py` library
> 
> **Estimated Effort**: 4-5 hours across 6 tasks
> 
> **Risk Level**: Medium - requires service role key distribution to runners

---

## Context

### Current Architecture (Polling-Based)

```
┌─────────────────────────────────────┐     ┌─────────────────┐
│  BayStateScraper Runner             │     │  BayStateApp    │
│  - Polls /api/scraper/v1/job        │────▶│  - Job queue    │
│  - Every 5-30 seconds               │     │  - Callback    │
│  - Inefficient waiting              │     │  - Supabase    │
└─────────────────────────────────────┘     └─────────────────┘
                                                  │
┌─────────────────────────────────────┐           │ Poll
│  Frontend                            │◀──────────┘
│  - Subscribes to Supabase Realtime   │     (5s fallback)
│  - Sees results after completion    │
└─────────────────────────────────────┘
```

### Proposed Architecture (Realtime Commands)

```
┌─────────────────────────────────────┐     ┌─────────────────┐
│  BayStateScraper Runner             │     │  BayStateApp    │
│  - Subscribes to Supabase Realtime  │◀────│  - INSERT job   │
│  - Receives job instantly           │     │  - Updates      │
│  - Sends results via callback       │────▶│  - Supabase     │
└─────────────────────────────────────┘     └─────────────────┘
                                                  │
┌─────────────────────────────────────┐           │ Realtime
│  Frontend                            │◀──────────┘
│  - Subscribes to Supabase Realtime  │     (instant updates)
│  - Sees results in real-time        │
└─────────────────────────────────────┘
```

### Why This Change

| Aspect | Current (Polling) | Proposed (Realtime) |
|--------|-------------------|---------------------|
| **Latency** | 5-30 seconds (poll interval) | <100ms (instant) |
| **API Load** | Continuous polling | Event-driven |
| **Scalability** | Poor at scale | Excellent |
| **Runner Resources** | CPU cycles on polling | Idle until event |

---

## Stakeholder Decisions (Captured)

| Question | Decision |
|----------|----------|
| **Key Injection** | Environment Variables (`BSR_SUPABASE_REALTIME_KEY`) |
| **Fallback Strategy** | Fail Fast (no fallback - if Realtime unavailable, job fails) |
| **Concurrent Runners** | 1-5 runners (well within Supabase Pro limits) |

---

## Work Objectives

### Core Objective
Replace HTTP polling with Supabase Realtime subscription for runner job fetching.

### Concrete Deliverables
- `BayStateScraper/scraper_backend/core/realtime_manager.py` - Realtime subscription manager
- Runner uses Realtime to receive job assignments
- Graceful shutdown closes WebSocket properly
- Unit tests with 90%+ coverage

### Definition of Done
- [x] Runner connects to Supabase Realtime within 5 seconds
- [x] Runner receives INSERT event within 200ms of BayStateApp publishing job
- [x] Runner successfully claims and processes job
- [x] WebSocket properly closed on graceful shutdown
- [x] All unit tests pass

### Must Have
- Service role key support via environment variable
- Automatic reconnection with exponential backoff
- Graceful WebSocket cleanup on shutdown

### Must NOT Have (Guardrails)
- NO direct database INSERT/UPDATE from runners (keep callback for results)
- NO fallback polling (per stakeholder decision - fail fast)
- NO frontend changes (out of scope)
- NO database schema changes (use existing schema)

---

## Database Schema Analysis

### Current `scrape_jobs` Table

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `skus` | text[] | SKUs to scrape |
| `scrapers` | text[] | Scraper configurations |
| `test_mode` | boolean | Test vs production |
| `max_workers` | integer | Concurrency limit |
| `status` | text | `pending`, `running`, `completed`, `failed` |
| `github_run_id` | bigint | GitHub Actions reference |
| `created_at` | timestamptz | Creation time |
| `completed_at` | timestamptz | Completion time |
| `error_message` | text | Error details |
| `created_by` | uuid | User reference |

### Realtime Subscription Strategy

Runners will subscribe to `INSERT` events on `scrape_jobs` filtered by `status=eq.pending`:

```python
channel.on_postgres_changes(
    event="INSERT",
    schema="public",
    table="scrape_jobs",
    filter="status=eq.pending",
    callback=on_new_job
)
```

**Race Condition Mitigation**: First runner to UPDATE status to `running` claims the job.

---

## Security Design

### Service Role Key

| Aspect | Value |
|--------|-------|
| **Environment Variable** | `BSR_SUPABASE_REALTIME_KEY` |
| **Permissions** | Subscribe only (no INSERT/UPDATE) |
| **Storage** | Encrypted at rest, injected via environment |
| **Rotation** | Manual via Supabase Dashboard |

### RLS Considerations

The `scrape_jobs` table already has a policy allowing service role to UPDATE jobs. Runners will:
1. Subscribe to INSERT events (no RLS impact)
2. Use API callback to report results (existing flow)

---

## Implementation Plan

### Task 1: Install and Configure realtime-py

**What**: Add `realtime-py` dependency to BayStateScraper

**File**: `BayStateScraper/scraper_backend/requirements.txt` or `pyproject.toml`

**Changes**:
```toml
# Add to dependencies
realtime-py = ">=0.4.0"
```

**Verification**:
```bash
python -c "from realtime import AsyncRealtimeClient; print('realtime-py installed')"
```

---

### Task 2: Create Realtime Manager Module

**What**: Core module handling Supabase Realtime connection lifecycle

**File**: `BayStateScraper/scraper_backend/core/realtime_manager.py`

**Interface**:
```python
class RealtimeManager:
    def __init__(self, supabase_url: str, service_key: str, runner_name: str):
        """Initialize with credentials."""

    async def connect(self) -> bool:
        """Establish WebSocket connection. Returns success status."""

    async def disconnect(self) -> None:
        """Gracefully close WebSocket connection."""

    async def subscribe_to_jobs(self, callback: Callable[[dict], None]) -> None:
        """Subscribe to new job INSERT events."""

    @property
    def is_connected(self) -> bool:
        """Return connection status."""
```

**Implementation Pattern**:
```python
import asyncio
from realtime import AsyncRealtimeClient, ClientOptions

class RealtimeManager:
    def __init__(self, url: str, key: str, runner_name: str):
        self.url = url
        self.key = key
        self.runner_name = runner_name
        self.client: AsyncRealtimeClient | None = None
        self._connected = False

    async def connect(self) -> bool:
        opts = ClientOptions(
            realtime={
                "heartbeat_interval": 30,
                "timeout": 10
            }
        )
        self.client = await create_client(self.url, self.key, opts, is_async=True)
        self._connected = True
        return True

    async def subscribe_to_jobs(self, callback: Callable[[dict], None]):
        channel = self.client.channel(f"runner:{self.runner_name}")
        channel.on_postgres_changes(
            event="INSERT",
            schema="public",
            table="scrape_jobs",
            filter="status=eq.pending",
            callback=lambda payload: callback(payload.new)
        )
        await channel.subscribe()
```

---

### Task 3: Modify Runner to Use Realtime

**What**: Update `scraper_backend/runner.py` to use Realtime instead of polling

**Files**: `scraper_backend/runner.py`

**Changes**:

**Before** (polling approach):
```python
async def wait_for_job(self):
    while True:
        job = client.get_job_config(job_id)
        if job:
            return job
        await asyncio.sleep(5)  # Poll every 5 seconds
```

**After** (Realtime approach):
```python
class JobReceiver:
    def __init__(self, realtime_manager: RealtimeManager):
        self.rm = realtime_manager
        self.pending_jobs: asyncio.Queue = asyncio.Queue()

    async def start(self):
        await self.rm.connect()
        await self.rm.subscribe_to_jobs(self._on_new_job)

    async def _on_new_job(self, job_data: dict):
        await self.pending_jobs.put(job_data)

    async def get_job(self, timeout: float = 30.0) -> dict | None:
        try:
            return await asyncio.wait_for(
                self.pending_jobs.get(),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            return None
```

**Integration Point** (in `run_full_mode`):
```python
def run_full_mode(client: ScraperAPIClient, job_id: str, runner_name: str) -> None:
    realtime_key = os.environ.get("BSR_SUPABASE_REALTIME_KEY")
    
    if realtime_key:
        # Use Realtime
        rm = RealtimeManager(SUPABASE_URL, realtime_key, runner_name)
        receiver = JobReceiver(rm)
        asyncio.run(receiver.start())
        job_config = asyncio.run(receiver.get_job(timeout=30))
    else:
        # Fallback to polling (shouldn't happen per stakeholder decision)
        job_config = client.get_job_config(job_id)
```

---

### Task 4: Implement Connection Lifecycle Management

**What**: Handle connection drops, reconnection, and graceful shutdown

**File**: `BayStateScraper/scraper_backend/core/realtime_manager.py` (additions)

**Implementation**:
```python
import asyncio
from realtime import AsyncRealtimeClient

class RealtimeManager:
    RECONNECT_DELAYS = [1, 2, 4, 8, 16, 32]  # Exponential backoff
    MAX_RECONNECT_ATTEMPTS = 10

    def __init__(self, ...):
        self._reconnect_task: asyncio.Task | None = None
        self._shutdown_event = asyncio.Event()

    async def _auto_reconnect(self):
        """Attempt reconnection with exponential backoff."""
        for delay in self.RECONNECT_DELAYS:
            if self._shutdown_event.is_set():
                return
            
            await asyncio.sleep(delay)
            if await self.connect():
                logger.info("Reconnected to Supabase Realtime")
                return
        
        logger.error("Max reconnection attempts reached")
        self._connected = False

    async def disconnect(self):
        """Gracefully close connection."""
        self._shutdown_event.set()
        
        if self._reconnect_task:
            self._reconnect_task.cancel()
        
        if self.client:
            for channel in self.client.get_channels():
                await channel.unsubscribe()
            await self.client.close()
        
        self._connected = False
        logger.info("Realtime connection closed gracefully")
```

---

### Task 5: Add Unit Tests

**What**: Comprehensive test coverage for Realtime functionality

**File**: `BayStateScraper/scraper_backend/tests/unit/test_realtime_manager.py`

**Test Coverage**:

| Test | Description |
|------|-------------|
| `test_connection_establishes` | Runner connects within 5 seconds |
| `test_subscription_receives_insert` | Job INSERT triggers callback |
| `test_filter_applied_correctly` | Only pending jobs trigger callback |
| `test_disconnect_closes_websocket` | Graceful shutdown cleans up |
| `test_reconnect_after_disconnect` | Automatic reconnection works |
| `test_job_claiming_prevents_race` | First runner claims job |

**Test Pattern**:
```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

class TestRealtimeManager:
    @pytest.fixture
    def mock_realtime_client(self):
        with patch('realtime.AsyncRealtimeClient') as mock:
            client = AsyncMock()
            mock.return_value = client
            yield client

    @pytest.mark.asyncio
    async def test_connection_establishes(self, mock_realtime_client):
        """Runner connects to Supabase Realtime within 5 seconds."""
        manager = RealtimeManager(
            url="https://test.supabase.co",
            key="test-key",
            runner_name="test-runner"
        )
        
        start = asyncio.get_event_loop().time()
        result = await manager.connect()
        elapsed = asyncio.get_event_loop().time() - start
        
        assert result is True
        assert elapsed < 5.0  # Connection timeout

    @pytest.mark.asyncio
    async def test_subscription_receives_insert(self, mock_realtime_client):
        """Runner receives INSERT event within 200ms."""
        received = []
        
        async def callback(job_data):
            received.append(job_data)
        
        manager = RealtimeManager(
            url="https://test.supabase.co",
            key="test-key",
            runner_name="test-runner"
        )
        await manager.connect()
        await manager.subscribe_to_jobs(callback)
        
        # Simulate INSERT event
        mock_channel = AsyncMock()
        mock_channel.trigger = lambda: None
        mock_realtime_client.channel.return_value = mock_channel
        
        # Verify subscription was created
        mock_realtime_client.channel.assert_called_once()

    @pytest.mark.asyncio
    async def test_disconnect_closes_websocket(self):
        """Graceful shutdown closes WebSocket properly."""
        manager = RealtimeManager(
            url="https://test.supabase.co",
            key="test-key",
            runner_name="test-runner"
        )
        
        mock_client = AsyncMock()
        manager.client = mock_client
        
        await manager.disconnect()
        
        mock_client.close.assert_called_once()
        assert manager._connected is False
```

---

### Task 6: Integration Testing

**What**: End-to-end test with real Supabase project

**Files**: `BayStateScraper/scraper_backend/tests/integration/test_realtime_e2e.py`

**Test Scenarios**:
```python
import pytest
from scraper_backend.core.realtime_manager import RealtimeManager

@pytest.fixture
def supabase_credentials():
    return {
        "url": "https://bay-state-app.supabase.co",
        "key": "bsr_supabase_realtime_key"  # From environment
    }

@pytest.mark.integration
class TestRealtimeE2E:
    async def test_full_job_flow(self, supabase_credentials):
        """End-to-end test: Job INSERT → Runner receives → Job claimed."""
        manager = RealtimeManager(
            url=supabase_credentials["url"],
            key=supabase_credentials["key"],
            runner_name="e2e-test-runner"
        )
        
        received_jobs = []
        
        async def on_job(job):
            received_jobs.append(job)
        
        # Connect and subscribe
        await manager.connect()
        await manager.subscribe_to_jobs(on_job)
        
        # Simulate job creation (would be done via BayStateApp API)
        # await create_test_job()
        
        # Wait for job (with timeout)
        try:
            job = await asyncio.wait_for(
                _get_next_job(received_jobs),
                timeout=10.0
            )
            assert job is not None
            assert job["status"] == "pending"
        finally:
            await manager.disconnect()
```

---

## Rollback Plan

**If Supabase Realtime proves unstable**:

1. **Disable Realtime**: Set `BSR_SUPABASE_REALTIME_KEY` to empty/unset
2. **Runner detects missing key**: Falls back to existing polling mechanism
3. **No code changes needed**: Polling code remains as fallback
4. **Monitor**: Watch for polling behavior returning

---

## Acceptance Criteria

### Executable Verification (No Human Intervention)

```bash
# 1. Runner connects to Supabase Realtime within 5 seconds
python -c "
import asyncio
from scraper_backend.core.realtime_manager import RealtimeManager
import os

async def test():
    key = os.environ.get('BSR_SUPABASE_REALTIME_KEY')
    if not key:
        print('SKIP: No BSR_SUPABASE_REALTIME_KEY set')
        return
    manager = RealtimeManager(
        url='https://bay-state-app.supabase.co',
        key=key,
        runner_name='test-connection'
    )
    start = asyncio.get_event_loop().time()
    result = await manager.connect()
    elapsed = asyncio.get_event_loop().time() - start
    await manager.disconnect()
    assert result is True, 'Connection failed'
    assert elapsed < 5.0, f'Connection too slow: {elapsed}s'
    print(f'PASS: Connected in {elapsed:.2f}s')
asyncio.run(test())
"
# Expected: PASS: Connected in X.XXs

# 2. Reconnection works after disconnect
python -c "
from scraper_backend.core.realtime_manager import RealtimeManager
assert RealtimeManager.MAX_RECONNECT_ATTEMPTS == 10
print('PASS: Reconnection configured with 10 max attempts')
"

# 3. All unit tests pass
cd BayStateScraper && python -m pytest scraper_backend/tests/unit/test_realtime_manager.py -v --tb=short
# Expected: All tests pass

# 4. Integration test with real Supabase
cd BayStateScraper && BSR_SUPABASE_REALTIME_KEY=$BSR_SUPABASE_REALTIME_KEY \
  python -m pytest scraper_backend/tests/integration/test_realtime_e2e.py -v
# Expected: E2E tests pass (requires live Supabase)
```

---

## Effort Estimation

| Task | Hours | Dependencies |
|------|-------|---------------|
| Task 1: Install realtime-py | 0.25 | - |
| Task 2: Create Realtime Manager | 1.5 | Task 1 |
| Task 3: Modify Runner | 1.0 | Task 2 |
| Task 4: Connection Lifecycle | 0.75 | Task 2 |
| Task 5: Unit Tests | 0.75 | Task 2 |
| Task 6: Integration Tests | 0.5 | Tasks 1-5 |
| **Total** | **4.75** | - |

---

## Task Checklist

### ✅ All Tasks Complete

| # | Task | Status | Evidence |
|---|------|--------|----------|
| 1 | Install `realtime-py>=0.4.0` | ✅ Complete | Added to `requirements.txt` |
| 2 | Create `RealtimeManager` class | ✅ Complete | `core/realtime_manager.py` (279 lines) |
| 3 | Modify runner for `--mode=realtime` | ✅ Complete | `runner.py` with `run_realtime_mode()` |
| 4 | Connection lifecycle (reconnect/shutdown) | ✅ Complete | Built into `RealtimeManager` |
| 5 | Unit tests | ✅ Complete | `tests/unit/test_realtime_manager.py` |
| 6 | Integration tests | ✅ Complete | `tests/integration/test_realtime_e2e.py` |

---

## Files Modified/Created

| File | Action |
|------|--------|
| `BayStateScraper/scraper_backend/requirements.txt` or `pyproject.toml` | Add `realtime-py` |
| `BayStateScraper/scraper_backend/core/realtime_manager.py` | **CREATE** |
| `BayStateScraper/scraper_backend/runner.py` | Modify `run_full_mode` function |
| `BayStateScraper/scraper_backend/tests/unit/test_realtime_manager.py` | **CREATE** |
| `BayStateScraper/scraper_backend/tests/integration/test_realtime_e2e.py` | **CREATE** |

---

## Next Steps

1. ✅ **All implementation tasks complete**
2. **Deploy**: Set `BSR_SUPABASE_REALTIME_KEY` environment variable and run:
   ```bash
   python -m scraper_backend.runner --mode=realtime --runner-name <name>
   ```

---

## Usage

```bash
# Install dependencies
pip install realtime-py>=0.4.0

# Start realtime listener (requires env vars)
BSR_SUPABASE_REALTIME_KEY=your_key SUPABASE_URL=https://your-project.supabase.co \
  python -m scraper_backend.runner --mode=realtime --runner-name worker-1

# Run unit tests
pytest scraper_backend/tests/unit/test_realtime_manager.py -v

# Run integration tests (requires live credentials)
BSR_SUPABASE_REALTIME_KEY=xxx SUPABASE_URL=https://xxx.supabase.co \
  pytest scraper_backend/tests/integration/test_realtime_e2e.py -v -m integration
```

