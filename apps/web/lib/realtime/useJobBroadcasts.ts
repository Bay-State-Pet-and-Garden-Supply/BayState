/**
 * useJobBroadcasts - Supabase Broadcast API hook for receiving transient events from runners
 *
 * This hook subscribes to broadcast events sent by scraper runners. Broadcasts are
 * transient messages that don't persist to the database - perfect for logs, progress
 * updates, and heartbeat events.
 */

import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import type { BroadcastEvent } from './types';
import {
  mergeScrapeJobLogs,
  normalizeScrapeLogEntry,
  normalizeScrapeProgressUpdate,
  type ScrapeJobLogEntry,
  type ScrapeJobProgressUpdate,
} from '@/lib/scraper-logs';
import { useRealtimeChannel } from './useRealtimeChannel';

type BroadcastEventOverrides = Map<string, boolean>;

interface BroadcastConfigSnapshot {
  includeLogs: boolean;
  includeProgress: boolean;
  customEvents: string[];
  maxLogs: number;
  logLevels?: ('debug' | 'info' | 'warning' | 'error' | 'critical')[];
}

interface BroadcastEnvelope {
  event: string;
  payload: unknown;
}

const RUNNER_LOG_EVENT = 'runner_log';
const JOB_PROGRESS_EVENT = 'job_progress';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLogLevel(value: unknown): value is ScrapeJobLogEntry['level'] {
  return value === 'debug' || value === 'info' || value === 'warning' || value === 'error' || value === 'critical';
}

function inferBroadcastEvent(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (
    typeof payload.job_id === 'string' &&
    typeof payload.level === 'string' &&
    isLogLevel(payload.level) &&
    typeof payload.message === 'string'
  ) {
    return RUNNER_LOG_EVENT;
  }

  if (typeof payload.job_id === 'string' && typeof payload.progress === 'number') {
    return JOB_PROGRESS_EVENT;
  }

  if (
    typeof payload.job_id === 'string' &&
    Array.isArray(payload.scrapers) &&
    typeof payload.skus_count === 'string' &&
    typeof payload.runner_name === 'string'
  ) {
    return 'job_assigned';
  }

  if (
    typeof payload.runner_id === 'string' &&
    typeof payload.runner_name === 'string' &&
    typeof payload.status === 'string'
  ) {
    if (typeof payload.active_jobs === 'number') {
      return 'runner_heartbeat';
    }

    if ('jobs_processed' in payload || 'reason' in payload) {
      return 'runner_status';
    }
  }

  return null;
}

function isEventEnabled(event: string, config: BroadcastConfigSnapshot, overrides: BroadcastEventOverrides): boolean {
  const override = overrides.get(event);

  if (override !== undefined) {
    return override;
  }

  if (event === RUNNER_LOG_EVENT) {
    return config.includeLogs;
  }

  if (event === JOB_PROGRESS_EVENT) {
    return config.includeProgress;
  }

  return config.customEvents.includes(event);
}

function getResolvableCustomEvents(config: BroadcastConfigSnapshot, overrides: BroadcastEventOverrides): string[] {
  const activeCustomEvents = new Set(config.customEvents);

  overrides.forEach((isEnabled, event) => {
    if (event === RUNNER_LOG_EVENT || event === JOB_PROGRESS_EVENT) {
      return;
    }

    if (isEnabled) {
      activeCustomEvents.add(event);
      return;
    }

    activeCustomEvents.delete(event);
  });

  return Array.from(activeCustomEvents);
}

function resolveBroadcastEnvelope(
  message: unknown,
  config: BroadcastConfigSnapshot,
  overrides: BroadcastEventOverrides,
): BroadcastEnvelope | null {
  if (isRecord(message) && typeof message.event === 'string' && 'payload' in message) {
    return {
      event: message.event,
      payload: message.payload,
    };
  }

  const inferredEvent = inferBroadcastEvent(message);

  if (inferredEvent) {
    return {
      event: inferredEvent,
      payload: message,
    };
  }

  const activeCustomEvents = getResolvableCustomEvents(config, overrides);

  if (activeCustomEvents.length === 1) {
    return {
      event: activeCustomEvents[0],
      payload: message,
    };
  }

  return null;
}

/**
 * Broadcast subscription state
 */
export interface JobBroadcastState {
  /** All received broadcasts organized by event type */
  broadcasts: Record<string, BroadcastEvent[]>;
  /** Most recent broadcast for each event type */
  latest: Record<string, BroadcastEvent | null>;
  /** Log events from runners */
  logs: ScrapeJobLogEntry[];
  /** Progress updates from runners */
  progress: Record<string, ScrapeJobProgressUpdate>;
  /** Whether the broadcast channel is connected */
  isConnected: boolean;
  /** Connection error if any */
  error: Error | null;
}

/**
 * Configuration options for the broadcast hook
 */
export interface UseJobBroadcastOptions {
  /** Optional custom channel name for broadcasts */
  channelName?: string;
  /** Whether to automatically connect on mount (default: true) */
  autoConnect?: boolean;
  /** Maximum number of logs to keep (default: 100) */
  maxLogs?: number;
  /** Callback when a broadcast event is received */
  onBroadcast?: (event: string, payload: unknown) => void;
  /** Callback when a log event is received */
  onLog?: (log: ScrapeJobLogEntry) => void;
  /** Callback when a progress update is received */
  onProgress?: (jobId: string, progress: ScrapeJobProgressUpdate) => void;
}

/**
 * Event type filters for subscribing to specific broadcast events
 */
export interface BroadcastEventFilters {
  /** Subscribe to log events */
  includeLogs?: boolean;
  /** Subscribe to progress events */
  includeProgress?: boolean;
  /** Subscribe to custom runner events */
  customEvents?: string[];
  /** Filter logs by level */
  logLevels?: ('debug' | 'info' | 'warning' | 'error' | 'critical')[];
}

/**
 * Default configuration values
 */
const DEFAULT_OPTIONS: Partial<UseJobBroadcastOptions> = {
  channelName: 'job-broadcast',
  autoConnect: true,
  maxLogs: 100,
};

/**
 * Hook return type
 */
export interface UseJobBroadcastsReturn extends JobBroadcastState {
  /** Connect to the broadcast channel */
  connect: () => void;
  /** Disconnect from the broadcast channel */
  disconnect: () => void;
  /** Subscribe to specific event types */
  subscribe: (event: string) => void;
  /** Unsubscribe from specific event types */
  unsubscribe: (event: string) => void;
  /** Clear all broadcasts */
  clear: () => void;
  /** Clear logs */
  clearLogs: () => void;
  /** Get logs for a specific job */
  getLogsForJob: (jobId: string) => ScrapeJobLogEntry[];
}

/**
 * useJobBroadcasts - Hook for receiving broadcast events from runners
 *
 * @example
 * ```typescript
 * const {
 *   logs,
 *   progress,
 *   isConnected,
 *   connect,
 *   disconnect,
 * } = useJobBroadcasts({
 *   onLog: (log) => console.log(`[${log.level}] ${log.message}`),
 *   onProgress: (jobId, progress) => updateProgressBar(jobId, progress),
 * });
 * ```
 */
export function useJobBroadcasts(
  options: UseJobBroadcastOptions = {},
  filters: BroadcastEventFilters = {}
): UseJobBroadcastsReturn {
  const {
    channelName: providedChannelName,
    autoConnect = true,
    maxLogs = 100,
    onBroadcast,
    onLog,
    onProgress,
  } = { ...DEFAULT_OPTIONS, ...options };

  const {
    includeLogs = true,
    includeProgress = true,
    customEvents = [],
    logLevels,
  } = filters;

  const channelName = useMemo(() => providedChannelName ?? 'job-broadcast', [providedChannelName]);

  const [state, setState] = useState<JobBroadcastState>({
    broadcasts: {},
    latest: {},
    logs: [],
    progress: {},
    isConnected: false,
    error: null,
  });

  const eventOverridesRef = useRef<BroadcastEventOverrides>(new Map());
  const callbacksRef = useRef({ onBroadcast, onLog, onProgress });
  const eventConfigRef = useRef({ includeLogs, includeProgress, customEvents, maxLogs, logLevels });

  useEffect(() => {
    callbacksRef.current = { onBroadcast, onLog, onProgress };
  }, [onBroadcast, onLog, onProgress]);

  useEffect(() => {
    eventConfigRef.current = { includeLogs, includeProgress, customEvents, maxLogs, logLevels };
  }, [includeLogs, includeProgress, customEvents, maxLogs, logLevels]);

  /**
   * Process an incoming broadcast event
   */
  const processBroadcast = useCallback(
    (event: string, payload: unknown) => {
      const { includeLogs, includeProgress, customEvents, maxLogs, logLevels } = eventConfigRef.current;
      const { onBroadcast, onLog, onProgress } = callbacksRef.current;
      const payloadRecord = payload as Record<string, unknown>;

      const broadcast: BroadcastEvent = {
        event,
        payload: payloadRecord,
        timestamp: new Date().toISOString(),
        runner_id: String(payloadRecord.runner_id || 'unknown'),
      };

      setState((prev) => {
        const newBroadcasts = { ...prev.broadcasts };
        const newLatest = { ...prev.latest };

        // Add to broadcasts list
        if (!newBroadcasts[event]) {
          newBroadcasts[event] = [];
        }
        newBroadcasts[event] = [broadcast, ...newBroadcasts[event]].slice(0, 50); // Keep last 50 per event

        // Update latest
        newLatest[event] = broadcast;

        const updates: Partial<JobBroadcastState> = {
          broadcasts: newBroadcasts,
          latest: newLatest,
        };

        // Handle log events
        if (includeLogs && event === RUNNER_LOG_EVENT) {
          const log = normalizeScrapeLogEntry(payloadRecord, { persisted: false });
          if (!logLevels || logLevels.includes(log.level)) {
            updates.logs = mergeScrapeJobLogs(prev.logs, [log], maxLogs);
            onLog?.(log);
          }
        }

        // Handle progress events
        if (includeProgress && event === JOB_PROGRESS_EVENT) {
          const progressUpdate = normalizeScrapeProgressUpdate(payloadRecord);
          updates.progress = { ...prev.progress, [progressUpdate.job_id]: progressUpdate };
          onProgress?.(progressUpdate.job_id, progressUpdate);
        }

        // Handle custom events
        if (customEvents.includes(event)) {
          onBroadcast?.(event, payload);
        }

        return { ...prev, ...updates };
      });
    },
    []
  );

  const handleRealtimeMessage = useCallback(
    (message: unknown) => {
      const config = eventConfigRef.current;
      const envelope = resolveBroadcastEnvelope(message, config, eventOverridesRef.current);

      if (!envelope) {
        return;
      }

      if (!isEventEnabled(envelope.event, config, eventOverridesRef.current)) {
        return;
      }

      processBroadcast(envelope.event, envelope.payload);
    },
    [processBroadcast]
  );

  const handleRealtimeError = useCallback((error: Error) => {
    console.error('[useJobBroadcasts] Channel error:', error);
  }, []);

  const { connectionState, lastError, connect, disconnect } = useRealtimeChannel({
    channelName,
    autoConnect,
    onMessage: handleRealtimeMessage,
    onError: handleRealtimeError,
  });

  useEffect(() => {
    const isConnected = connectionState === 'connected';

    setState((prev) => {
      if (prev.isConnected === isConnected && prev.error === lastError) {
        return prev;
      }

      return {
        ...prev,
        isConnected,
        error: lastError,
      };
    });
  }, [connectionState, lastError]);

  /**
   * Subscribe to a specific broadcast event
   */
  const subscribe = useCallback((event: string) => {
    eventOverridesRef.current.set(event, true);
  }, []);

  /**
   * Unsubscribe from a specific broadcast event
   */
  const unsubscribe = useCallback((event: string) => {
    eventOverridesRef.current.set(event, false);
  }, []);

  /**
   * Clear all broadcasts
   */
  const clear = useCallback(() => {
    setState({
      broadcasts: {},
      latest: {},
      logs: [],
      progress: {},
      isConnected: state.isConnected,
      error: null,
    });
  }, [state.isConnected]);

  /**
   * Clear logs
   */
  const clearLogs = useCallback(() => {
    setState((prev) => ({ ...prev, logs: [] }));
  }, []);

  /**
   * Get logs for a specific job
   */
  const getLogsForJob = useCallback(
    (jobId: string): ScrapeJobLogEntry[] => {
      return state.logs.filter((log) => log.job_id === jobId);
    },
    [state.logs]
  );

  return {
    ...state,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    clear,
    clearLogs,
    getLogsForJob,
  };
}
