# Realtime Hooks

Unified Supabase Realtime hooks for BayStateApp. This module provides real-time subscriptions for scraper runner management, job tracking, and log streaming.

## Overview

The realtime system uses Supabase Realtime v2 to provide live updates for:

- **Runner presence** - Track which runners are online, busy, or offline
- **Job broadcasts** - Receive transient events (logs, progress updates) from runners
- **Job subscriptions** - Subscribe to Postgres Changes on the `scrape_jobs` table
- **Log subscriptions** - Stream scrape job logs in real-time
- **Test run subscriptions** - Track scraper test execution progress

## Hooks

### useRealtimeChannel

Core channel management hook with connection pooling and automatic reconnection.

```typescript
import { useRealtimeChannel } from '@/lib/realtime';

function MyComponent() {
  const {
    connectionState,      // 'connecting' | 'connected' | 'disconnected' | 'error'
    lastError,           // Error | null
    reconnectAttempt,    // number
    connect,             // () => void
    disconnect,          // () => void
  } = useRealtimeChannel({
    channelName: 'my-channel',
    onMessage: (payload) => {
      console.log('Received:', payload);
    },
    onError: (error) => {
      console.error('Channel error:', error);
    },
    autoConnect: true,
  });

  return <div>Status: {connectionState}</div>;
}
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `channelName` | `string` | (required) | Unique channel identifier |
| `onMessage` | `(payload: unknown) => void` | (required) | Handler for incoming messages |
| `onError` | `(error: Error) => void` | - | Handler for channel errors |
| `autoConnect` | `boolean` | `true` | Connect on mount |

### useRunnerPresence

Track scraper runner online/offline status using Supabase Presence API.

```typescript
import { useRunnerPresence } from '@/lib/realtime';

function RunnerDashboard() {
  const {
    runners,           // Record<string, RunnerPresence>
    onlineIds,         // Set<string>
    isConnected,       // boolean
    isLoading,         // boolean
    error,             // Error | null
    connect,
    disconnect,
    getRunner,         // (id: string) => RunnerPresence | undefined
    getOnlineCount,    // () => number
    getBusyCount,      // () => number
    isOnline,          // (id: string) => boolean
  } = useRunnerPresence({
    onJoin: (runnerId, presence) => {
      console.log(`${presence.runner_name} came online`);
    },
    onLeave: (runnerId) => {
      console.log(`${runnerId} went offline`);
    },
    fetchInitial: true,  // Fetch initial state from API
    autoConnect: true,
  });

  return (
    <div>
      <p>Online runners: {getOnlineCount()}</p>
      <p>Busy runners: {getBusyCount()}</p>
    </div>
  );
}
```

**RunnerPresence interface:**

```typescript
interface RunnerPresence {
  runner_id: string;
  runner_name: string;
  status: 'online' | 'busy' | 'idle' | 'offline';
  active_jobs: number;
  last_seen: string;  // ISO 8601 timestamp
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}
```

### useJobBroadcasts

Subscribe to broadcast events from runners (transient messages, not persisted).

```typescript
import { useJobBroadcasts } from '@/lib/realtime';

function JobMonitor() {
  const {
    broadcasts,        // Record<string, BroadcastEvent[]>
    latest,            // Record<string, BroadcastEvent | null>
    logs,              // ScrapeJobLogEntry[]
    progress,          // Record<string, ScrapeJobProgressUpdate>
    isConnected,
    error,
    connect,
    disconnect,
    subscribe,         // (event: string) => void
    unsubscribe,       // (event: string) => void
    clear,
    clearLogs,
    getLogsForJob,     // (jobId: string) => ScrapeJobLogEntry[]
  } = useJobBroadcasts(
    {
      channelName: 'job-broadcast',
      maxLogs: 100,
      onLog: (log) => console.log(`[${log.level}] ${log.message}`),
      onProgress: (jobId, progress) => updateProgressBar(jobId, progress),
    },
    {
      includeLogs: true,
      includeProgress: true,
      customEvents: ['custom_event'],
      logLevels: ['info', 'warning', 'error'],  // Filter by level
    }
  );

  return <div>Logs: {logs.length}</div>;
}
```

**Broadcast event types:**

- `runner_log` - Log messages from runners
- `job_progress` - Progress updates (0-100%)
- `job_assigned` - Job claimed by runner
- `runner_heartbeat` - Periodic health checks
- `runner_status` - Status change events

### useJobSubscription

Subscribe to Postgres Changes on the `scrape_jobs` table.

```typescript
import { useJobSubscription } from '@/lib/realtime';

function JobQueue() {
  const {
    jobs,              // { pending, running, completed, failed, cancelled }
    latestJob,         // JobAssignment | null
    counts,            // { pending, running, completed, failed, cancelled, total }
    isConnected,
    error,
    connect,
    disconnect,
    refetch,           // () => Promise<void>
    getJob,            // (id: string) => JobAssignment | undefined
    getJobsForRunner,  // (runnerId: string) => JobAssignment[]
  } = useJobSubscription(
    {
      scraperNames: ['petco', 'chewy'],  // Filter by scraper
      testModeOnly: false,
      maxJobsPerStatus: 50,
      onJobCreated: (job) => console.log('New job:', job.id),
      onJobUpdated: (job) => console.log('Updated:', job.status),
      onJobDeleted: (jobId) => console.log('Deleted:', jobId),
    },
    {
      includeInsert: true,
      includeUpdate: true,
      includeDelete: false,
    }
  );

  return (
    <div>
      <p>Pending: {counts.pending}</p>
      <p>Running: {counts.running}</p>
    </div>
  );
}
```

### useLogSubscription

Stream scrape job logs in real-time from both broadcasts and database.

```typescript
import { useLogSubscription } from '@/lib/realtime';

function LogViewer({ jobId }: { jobId: string }) {
  const {
    logs,              // ScrapeJobLogEntry[] (newest first)
    isConnected,
    error,
    connect,
    disconnect,
    clearLogs,
  } = useLogSubscription({
    jobId,             // Filter to specific job (optional)
    maxEntries: 200,
    onLog: (log) => console.log(log.message),
  });

  return (
    <div>
      {logs.map((log) => (
        <div key={log.id} className={`log-${log.level}`}>
          [{log.level}] {log.message}
        </div>
      ))}
    </div>
  );
}
```

**Log entry structure:**

```typescript
interface ScrapeJobLogEntry {
  id: string;
  job_id: string;
  level: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: string;
  runner_id?: string;
  runner_name?: string;
  scraper_name?: string;
  sku?: string;
  phase?: string;
  source?: string;
  sequence?: number;
  details?: Record<string, unknown>;
}
```

### useTestRunSubscription

Track scraper test execution progress with telemetry steps.

```typescript
import { useTestRunSubscription } from '@/lib/realtime';

function TestRunViewer({ testRunId }: { testRunId: string }) {
  const {
    steps,             // TestRunStep[]
    isConnected,
    error,
    connect,
    disconnect,
  } = useTestRunSubscription({
    testRunId,         // The job ID for the test run
    initialSteps: [],
    autoConnect: true,
    debounceMs: 100,   // Debounce updates for performance
  });

  return (
    <div>
      {steps.map((step) => (
        <div key={step.id}>
          Step {step.step_index}: {step.status}
        </div>
      ))}
    </div>
  );
}
```

## Configuration

### Environment Variables

These environment variables configure the realtime system:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |

### Supabase Realtime Setup

The following database tables must be enabled for realtime:

```sql
-- Enable realtime on scrape_jobs
alter publication supabase_realtime add table scrape_jobs;

-- Enable realtime on scrape_job_logs
alter publication supabase_realtime add table scrape_job_logs;

-- Enable realtime on scrape_job_chunks
alter publication supabase_realtime add table scrape_job_chunks;
```

## Best Practices

### Connection Management

- Always use `autoConnect: true` for simple cases
- Call `disconnect()` in cleanup functions when manually managing connections
- Check `connectionState` before sending messages

### Performance

- Use `maxLogs` and `maxEntries` options to prevent memory growth
- Filter by `jobId` when possible to reduce data transfer
- Use `debounceMs` in `useTestRunSubscription` for high-frequency updates

### Error Handling

- Always check `error` state after connection attempts
- Use `reconnectAttempt` to show retry status to users
- Implement exponential backoff for manual reconnections

### Channel Pooling

Channels are automatically pooled by name. Multiple components using the same channel name will share the underlying connection while maintaining independent message handlers.

```typescript
// These two components share the same channel
function ComponentA() {
  const { connectionState } = useRealtimeChannel({
    channelName: 'shared-channel',
    onMessage: handleA,
  });
}

function ComponentB() {
  const { connectionState } = useRealtimeChannel({
    channelName: 'shared-channel',
    onMessage: handleB,
  });
}
```

## Architecture

The realtime system uses a layered architecture:

```
┌─────────────────────────────────────────┐
│  React Components (Hooks)               │
│  - useRunnerPresence                    │
│  - useJobBroadcasts                     │
│  - useJobSubscription                   │
│  - useLogSubscription                   │
├─────────────────────────────────────────┤
│  Channel Management (useRealtimeChannel)│
│  - Connection pooling                   │
│  - Auto-reconnection (exponential backoff)
│  - Status tracking                      │
├─────────────────────────────────────────┤
│  Supabase Realtime Client               │
│  - WebSocket connection                 │
│  - Presence, Broadcast, Postgres Changes│
└─────────────────────────────────────────┘
```

## Types

All types are exported from the module:

```typescript
import {
  // Presence types
  RunnerPresence,
  
  // Job types
  JobAssignment,
  
  // Broadcast types
  BroadcastEvent,
  JobAssignedPayload,
  JobProgressPayload,
  RunnerHeartbeatPayload,
  RunnerLogPayload,
  RunnerStatusPayload,
  
  // Log types
  ScrapeJobLog,
  
  // Hook return types
  UseRunnerPresenceReturn,
  UseJobBroadcastsReturn,
  UseJobSubscriptionReturn,
  UseLogSubscriptionReturn,
} from '@/lib/realtime';
```
