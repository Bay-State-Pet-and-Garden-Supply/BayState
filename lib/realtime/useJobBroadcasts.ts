/**
 * useJobBroadcasts - Supabase Broadcast API hook for receiving transient events from runners
 *
 * This hook subscribes to broadcast events sent by scraper runners. Broadcasts are
 * transient messages that don't persist to the database - perfect for logs, progress
 * updates, and heartbeat events.
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { BroadcastEvent, ScrapeJobLog } from './types';

/**
 * Broadcast subscription state
 */
export interface JobBroadcastState {
  /** All received broadcasts organized by event type */
  broadcasts: Record<string, BroadcastEvent[]>;
  /** Most recent broadcast for each event type */
  latest: Record<string, BroadcastEvent | null>;
  /** Log events from runners */
  logs: ScrapeJobLog[];
  /** Progress updates from runners */
  progress: Record<string, number>;
  /** Whether the broadcast channel is connected */
  isConnected: boolean;
  /** Connection error if any */
  error: Error | null;
}

/**
 * Configuration options for the broadcast hook
 */
export interface UseJobBroadcastOptions {
  /** Channel name for broadcasts (default: 'job-broadcasts') */
  channelName?: string;
  /** Whether to automatically connect on mount (default: true) */
  autoConnect?: boolean;
  /** Maximum number of logs to keep (default: 100) */
  maxLogs?: number;
  /** Callback when a broadcast event is received */
  onBroadcast?: (event: string, payload: unknown) => void;
  /** Callback when a log event is received */
  onLog?: (log: ScrapeJobLog) => void;
  /** Callback when a progress update is received */
  onProgress?: (jobId: string, progress: number) => void;
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
  logLevels?: ('DEBUG' | 'INFO' | 'WARN' | 'ERROR')[];
}

/**
 * Default configuration values
 */
const DEFAULT_OPTIONS: Partial<UseJobBroadcastOptions> = {
  channelName: 'job-broadcasts',
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
  getLogsForJob: (jobId: string) => ScrapeJobLog[];
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
    channelName = 'job-broadcasts',
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
  } = filters;

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
      const broadcast: BroadcastEvent = {
        event,
        payload: payload as Record<string, unknown>,
        timestamp: new Date().toISOString(),
        runner_id: (payload as Record<string, unknown>).runner_id as string || 'unknown',
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
        if (includeLogs && event === 'runner-log') {
          const log = payload as ScrapeJobLog;
          const newLogs = [log, ...prev.logs].slice(0, maxLogs);
          updates.logs = newLogs;
          onLog?.(log);
        }

        // Handle progress events
        if (includeProgress && event === 'job-progress') {
          const { job_id, progress: progressValue } = payload as { job_id: string; progress: number };
          updates.progress = { ...prev.progress, [job_id]: progressValue };
          onProgress?.(job_id, progressValue);
        }

        // Handle custom events
        if (customEvents.includes(event)) {
          onBroadcast?.(event, payload);
        }

        return { ...prev, ...updates };
      });
    },
    [includeLogs, includeProgress, customEvents, maxLogs, onBroadcast, onLog, onProgress]
  );

  /**
   * Connect to the broadcast channel and subscribe to events
   */
  const connect = useCallback(() => {
    const supabase = getSupabase();

    // Don't create duplicate channels
    if (channelRef.current) {
      return;
    }

    try {
      const channel = supabase.channel(channelName);

      // Subscribe to log events
      if (includeLogs) {
        channel.on('broadcast', { event: 'runner-log' }, ({ payload }) => {
          processBroadcast('runner-log', payload);
        });
      }

      // Subscribe to progress events
      if (includeProgress) {
        channel.on('broadcast', { event: 'job-progress' }, ({ payload }) => {
          processBroadcast('job-progress', payload);
        });
      }

      // Subscribe to custom events
      customEvents.forEach((event) => {
        channel.on('broadcast', { event }, ({ payload }) => {
          processBroadcast(event, payload);
        });
      });

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setState((prev) => ({ ...prev, isConnected: true, error: null }));
          console.log('[useJobBroadcasts] Connected to broadcast channel');
        } else if (status === 'CHANNEL_ERROR') {
          const error = new Error('Broadcast channel error');
          console.error('[useJobBroadcasts] Channel error:', error);
          setState((prev) => ({ ...prev, error, isConnected: false }));
        }
      });

      channelRef.current = channel;
      setState((prev) => ({ ...prev, isConnected: true, error: null }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to connect');
      console.error('[useJobBroadcasts] Connection error:', error);
      setState((prev) => ({ ...prev, error, isConnected: false }));
    }
  }, [channelName, getSupabase, includeLogs, includeProgress, customEvents, processBroadcast]);

  /**
   * Disconnect from the broadcast channel
   */
  const disconnect = useCallback(() => {
    if (channelRef.current) {
      const supabase = getSupabase();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      isConnected: false,
    }));
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
        console.log(`[useJobBroadcasts] Subscribed to event: ${event}`);
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
    console.log(`[useJobBroadcasts] Unsubscribed from event: ${event}`);
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
    (jobId: string): ScrapeJobLog[] => {
      return state.logs.filter((log) => log.job_id === jobId);
    },
    [state.logs]
  );

  /**
   * Auto-connect on mount if enabled
   */
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    // Cleanup on unmount
    return () => {
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
