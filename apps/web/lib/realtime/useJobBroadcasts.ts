/**
 * useJobBroadcasts - Supabase Broadcast API hook for receiving transient events from runners
 *
 * This hook subscribes to broadcast events sent by scraper runners. Broadcasts are
 * transient messages that don't persist to the database - perfect for logs, progress
 * updates, and heartbeat events.
 */

import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { BroadcastEvent } from './types';
import {
  mergeScrapeJobLogs,
  normalizeScrapeLogEntry,
  normalizeScrapeProgressUpdate,
  type ScrapeJobLogEntry,
  type ScrapeJobProgressUpdate,
} from '@/lib/scraper-logs';

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

  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const subscribedEvents = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const callbacksRef = useRef({ onBroadcast, onLog, onProgress });
  const eventConfigRef = useRef({ includeLogs, includeProgress, customEvents, maxLogs, logLevels });

  useEffect(() => {
    callbacksRef.current = { onBroadcast, onLog, onProgress };
  }, [onBroadcast, onLog, onProgress]);

  useEffect(() => {
    eventConfigRef.current = { includeLogs, includeProgress, customEvents, maxLogs, logLevels };
  }, [includeLogs, includeProgress, customEvents, maxLogs, logLevels]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Get the Supabase client (lazy initialization)
   */
  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }
    return supabaseRef.current;
  }, []);

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
        if (includeLogs && event === 'runner_log') {
          const log = normalizeScrapeLogEntry(payloadRecord, { persisted: false });
          if (!logLevels || logLevels.includes(log.level)) {
            updates.logs = mergeScrapeJobLogs(prev.logs, [log], maxLogs);
            onLog?.(log);
          }
        }

        // Handle progress events
        if (includeProgress && event === 'job_progress') {
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

  /**
   * Connect to the broadcast channel and subscribe to events
   */
  const connect = useCallback(() => {
    const supabase = getSupabase();
    const { includeLogs, includeProgress, customEvents } = eventConfigRef.current;

    try {
      if (channelRef.current) return;

      const channel = supabase.channel(channelName, {
        config: { private: true },
      });

      // Subscribe to log events
      if (includeLogs) {
        channel.on('broadcast', { event: 'runner_log' }, ({ payload }) => {
          processBroadcast('runner_log', payload);
        });
      }

      // Subscribe to progress events
      if (includeProgress) {
        channel.on('broadcast', { event: 'job_progress' }, ({ payload }) => {
          processBroadcast('job_progress', payload);
        });
      }

      // Subscribe to custom events
      customEvents.forEach((event) => {
        channel.on('broadcast', { event }, ({ payload }) => {
          processBroadcast(event, payload);
        });
      });

      channel.subscribe((status) => {
        if (!mountedRef.current) return;

        if (status === 'SUBSCRIBED') {
          setState((prev) => ({ ...prev, isConnected: true, error: null }));
        } else if (status === 'CHANNEL_ERROR') {
          const lowerTopic = String((channel as unknown as { topic?: string }).topic || '').toLowerCase();
          if (lowerTopic.includes('phoenix') || lowerTopic.includes('realtime')) {
            return;
          }

          const error = new Error('Broadcast channel error');
          console.error('[useJobBroadcasts] Channel error:', error, { status, topic: lowerTopic });
          supabase.removeChannel(channel);
          if (channelRef.current === channel) {
            channelRef.current = null;
          }
          setState((prev) => ({ ...prev, error, isConnected: false }));
        }
      });

      channelRef.current = channel;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to connect');
      console.error('[useJobBroadcasts] Connection error:', error);
      setState((prev) => ({ ...prev, error, isConnected: false }));
    }
  }, [channelName, getSupabase, processBroadcast]);

  /**
   * Disconnect from the broadcast channel
   */
  const disconnect = useCallback(() => {
    if (channelRef.current) {
      const supabase = getSupabase();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setState((prev) => (prev.isConnected ? { ...prev, isConnected: false } : prev));
  }, [getSupabase]);

  /**
   * Subscribe to a specific broadcast event
   */
  const subscribe = useCallback(
    (event: string) => {
      if (channelRef.current && !subscribedEvents.current.has(event)) {
        channelRef.current.on('broadcast', { event }, ({ payload }) => {
          processBroadcast(event, payload);
        });
        subscribedEvents.current.add(event);
      }
    },
    [processBroadcast]
  );

  /**
   * Unsubscribe from a specific broadcast event
   */
  const unsubscribe = useCallback((event: string) => {
    // Note: unsubscribing from individual events in Supabase requires re-creating the channel
    // For now, we just track it locally
    subscribedEvents.current.delete(event);
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

  /**
   * Auto-connect on mount if enabled
   */
  useEffect(() => {
    mountedRef.current = true;

    // Use a small delay or just wait for next tick to avoid sync setState in effect
    const connectionTimeout = setTimeout(() => {
      if (autoConnect && mountedRef.current) {
        connect();
      }
    }, 0);

    // Cleanup on unmount
    return () => {
      mountedRef.current = false;
      clearTimeout(connectionTimeout);
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

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
