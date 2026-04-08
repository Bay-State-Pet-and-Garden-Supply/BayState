/**
 * useRealtimeJobs - Backward compatibility shim for legacy WebSocket-based implementation
 *
 * This shim wraps useJobBroadcasts to provide the same interface as the legacy hook,
 * allowing existing code to continue working while logging deprecation warnings.
 *
 * @deprecated Use useJobBroadcasts from lib/realtime/useJobBroadcasts instead
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useJobBroadcasts } from '@/lib/realtime/useJobBroadcasts';
import type { ScrapeJobProgressUpdate, ScrapeJobLogEntry } from '@/lib/scraper-logs';

// =============================================================================
// LEGACY TYPES - preserved for backward compatibility
// =============================================================================

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface JobUpdateMessage {
  type: 'job_update';
  jobId: string;
  status: string;
  progress: number;
  timestamp: string;
}

interface RunnerUpdateMessage {
  type: 'runner_update';
  runnerId: string;
  status: string;
  activeJobs: number;
  timestamp: string;
}

interface UseRealtimeJobsOptions {
  url?: string;
  autoConnect?: boolean;
  maxReconnectAttempts?: number;
  pollingFallback?: boolean;
}

interface UseRealtimeJobsReturn {
  jobs: JobUpdateMessage[];
  runners: RunnerUpdateMessage[];
  connectionStatus: ConnectionStatus;
  lastUpdate: Date | null;
  error: Error | null;
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
}

// =============================================================================
// DEPRECATION WARNING
// =============================================================================

let hasLoggedDeprecationWarning = false;

/**
 * Logs deprecation warning once per session
 */
function logDeprecationWarning(): void {
  if (!hasLoggedDeprecationWarning) {
    console.warn(
      '[DEPRECATED] useRealtimeJobs is deprecated. Use useJobBroadcasts from @/lib/realtime/useJobBroadcasts'
    );
    hasLoggedDeprecationWarning = true;
  }
}

// =============================================================================
// TYPE TRANSFORMATIONS
// =============================================================================

/**
 * Transform ScrapeJobProgressUpdate to legacy JobUpdateMessage format
 */
function transformProgressToJobUpdate(progress: ScrapeJobProgressUpdate): JobUpdateMessage {
  return {
    type: 'job_update',
    jobId: progress.job_id,
    status: progress.status,
    progress: progress.progress,
    timestamp: progress.timestamp,
  };
}

/**
 * Transform ScrapeJobLogEntry to legacy RunnerUpdateMessage format
 * Note: This is an approximation since the new broadcast system doesn't have
 * direct runner presence. Runner updates are derived from log entries.
 */
function transformLogToRunnerUpdate(log: ScrapeJobLogEntry): RunnerUpdateMessage {
  // Extract active jobs from log details if available
  const activeJobs =
    log.details && typeof log.details === 'object'
      ? (log.details.active_jobs as number | undefined) ?? 0
      : 0;

  return {
    type: 'runner_update',
    runnerId: log.runner_id ?? 'unknown',
    status: log.level === 'error' ? 'error' : log.phase ?? 'running',
    activeJobs,
    timestamp: log.timestamp,
  };
}

/**
 * Map boolean isConnected to ConnectionStatus with transition states
 */
function mapConnectionStatus(
  isConnected: boolean,
  wasConnected: boolean
): ConnectionStatus {
  if (isConnected) {
    return 'connected';
  }
  // Small delay to show 'connecting' state on reconnect
  return wasConnected ? 'connecting' : 'disconnected';
}

// =============================================================================
// SHIM IMPLEMENTATION
// =============================================================================

/**
 * useRealtimeJobs - Backward compatible hook wrapping useJobBroadcasts
 *
 * This hook provides the same interface as the legacy WebSocket-based implementation
 * but delegates to the new Supabase Broadcast implementation internally.
 *
 * Note: The legacy WebSocket-based runner tracking is not directly available
 * in the new implementation. Runner updates are approximated from log events.
 *
 * @deprecated Use useJobBroadcasts from @/lib/realtime/useJobBroadcasts instead
 */
export function useRealtimeJobs(
  options: UseRealtimeJobsOptions = {}
): UseRealtimeJobsReturn {
  // Legacy options (used for interface compliance)
  const {
    autoConnect = true,
    maxReconnectAttempts = 5,
    pollingFallback = true, // eslint-disable-line @typescript-eslint/no-unused-vars
  } = options;

  // Legacy state
  const [jobs, setJobs] = useState<JobUpdateMessage[]>([]);
  const [runners, setRunners] = useState<RunnerUpdateMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Track connection state for transition
  const wasConnectedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);

  // Track unique job/runner IDs to match legacy deduplication behavior
  const jobIdsRef = useRef<Set<string>>(new Set());
  const runnerIdsRef = useRef<Set<string>>(new Set());

  // Log deprecation warning on first use
  useEffect(() => {
    logDeprecationWarning();
  }, []);

  // Handle progress updates from the new hook
  const handleProgressUpdate = useCallback(
    (jobId: string, progress: ScrapeJobProgressUpdate) => {
      const message = transformProgressToJobUpdate(progress);

      setJobs((prev) => {
        // Legacy behavior: deduplicate by jobId, keep last 100
        const filtered = prev.filter((j) => j.jobId !== jobId);
        return [...filtered, message].slice(-100);
      });

      jobIdsRef.current.add(jobId);
      setLastUpdate(new Date());
    },
    []
  );

  // Handle log updates from the new hook
  const handleLogUpdate = useCallback((log: ScrapeJobLogEntry) => {
    if (!log.runner_id) return;

    const message = transformLogToRunnerUpdate(log);

    setRunners((prev) => {
      // Legacy behavior: deduplicate by runnerId, keep last 50
      const filtered = prev.filter((r) => r.runnerId !== log.runner_id);
      return [...filtered, message].slice(-50);
    });

    runnerIdsRef.current.add(log.runner_id);
    setLastUpdate(new Date());
  }, []);

  // Connect to the new broadcast system
  const { connect: broadcastConnect, disconnect: broadcastDisconnect, isConnected } =
    useJobBroadcasts(
      {
        autoConnect,
        onProgress: handleProgressUpdate,
        onLog: handleLogUpdate,
      },
      {
        includeLogs: true,
        includeProgress: true,
      }
    );

  // Sync connection status
  useEffect(() => {
    const newStatus = mapConnectionStatus(isConnected, wasConnectedRef.current);

    if (newStatus !== connectionStatus) {
      setConnectionStatus(newStatus);

      if (isConnected) {
        wasConnectedRef.current = true;
        reconnectAttemptsRef.current = 0;
      }
    }
  }, [isConnected, connectionStatus]);

  /**
   * Connect to the realtime system
   */
  const connect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    wasConnectedRef.current = false;
    broadcastConnect();
  }, [broadcastConnect]);

  /**
   * Disconnect from the realtime system
   */
  const disconnect = useCallback(() => {
    wasConnectedRef.current = false;
    broadcastDisconnect();
    setConnectionStatus('disconnected');
  }, [broadcastDisconnect]);

  /**
   * Reconnect with exponential backoff
   * Note: The actual reconnection logic is handled by useJobBroadcasts internally.
   * This provides the legacy reconnection interface.
   */
  const reconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setError(new Error('Max reconnect attempts reached'));
      return;
    }

    reconnectAttemptsRef.current += 1;
    const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);

    disconnect();

    // Schedule reconnect after delay
    setTimeout(() => {
      connect();
    }, delay);
  }, [connect, disconnect, maxReconnectAttempts]);

  return {
    jobs,
    runners,
    connectionStatus,
    lastUpdate,
    error,
    connect,
    disconnect,
    reconnect,
  };
}