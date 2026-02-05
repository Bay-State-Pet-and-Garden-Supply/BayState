/**
 * useRunnerPresence - Supabase Presence API hook for tracking runner online/offline status
 *
 * This hook manages real-time presence tracking for scraper runners using Supabase Realtime.
 * Runners "track" their presence state, and the admin panel subscribes to presence sync events
 * to maintain a live view of which runners are online, busy, or offline.
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { RunnerPresence } from './types';

/**
 * Runner presence state managed by the hook
 */
export interface RunnerPresenceState {
  /** Map of runner_id -> RunnerPresence data */
  runners: Record<string, RunnerPresence>;
  /** Set of currently online runner IDs */
  onlineIds: Set<string>;
  /** Whether the presence channel is currently subscribed */
  isConnected: boolean;
  /** Connection error if any */
  error: Error | null;
}

/**
 * Configuration options for the presence hook
 */
export interface UseRunnerPresenceOptions {
  /** Channel name for presence (default: 'runners-presence') */
  channelName?: string;
  /** Whether to automatically connect on mount (default: true) */
  autoConnect?: boolean;
  /** Callback when a runner comes online */
  onJoin?: (runnerId: string, presence: RunnerPresence) => void;
  /** Callback when a runner goes offline */
  onLeave?: (runnerId: string) => void;
  /** Callback when presence sync completes */
  onSync?: (runners: Record<string, RunnerPresence>) => void;
}

/**
 * Default configuration values
 */
const DEFAULT_OPTIONS: Partial<UseRunnerPresenceOptions> = {
  channelName: 'runners-presence',
  autoConnect: true,
};

/**
 * Hook return type
 */
export interface UseRunnerPresenceReturn extends RunnerPresenceState {
  /** Connect to the presence channel */
  connect: () => void;
  /** Disconnect from the presence channel */
  disconnect: () => void;
  /** Manually trigger a presence sync */
  sync: () => void;
  /** Get a specific runner's presence data */
  getRunner: (runnerId: string) => RunnerPresence | undefined;
  /** Get count of online runners */
  getOnlineCount: () => number;
  /** Get count of busy runners */
  getBusyCount: () => number;
  /** Check if a specific runner is online */
  isOnline: (runnerId: string) => boolean;
}

/**
 * useRunnerPresence - Hook for tracking runner presence in real-time
 *
 * @example
 * ```typescript
 * const {
 *   runners,
 *   onlineIds,
 *   isConnected,
 *   isOnline,
 *   connect,
 *   disconnect,
 * } = useRunnerPresence({
 *   onJoin: (id, presence) => console.log(`${id} joined`),
 *   onLeave: (id) => console.log(`${id} left`),
 * });
 * ```
 */
export function useRunnerPresence(options: UseRunnerPresenceOptions = {}): UseRunnerPresenceReturn {
  const {
    channelName = 'runners-presence',
    autoConnect = true,
    onJoin,
    onLeave,
    onSync,
  } = { ...DEFAULT_OPTIONS, ...options };

  const [state, setState] = useState<RunnerPresenceState>({
    runners: {},
    onlineIds: new Set(),
    isConnected: false,
    error: null,
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

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
   * Connect to the presence channel and subscribe to events
   */
  const connect = useCallback(() => {
    const supabase = getSupabase();

    // Don't create duplicate channels
    if (channelRef.current) {
      return;
    }

    try {
      const channel = supabase.channel(channelName, {
        config: {
          presence: {
            key: 'admin-dashboard',
          },
        },
      });

      // Set up presence event handlers
      channel
        .on('presence', { event: 'sync' }, () => {
          const presenceState = channel.presenceState();
          const newRunners: Record<string, RunnerPresence> = {};
          const newOnlineIds = new Set<string>();

          // Process presence state
          Object.entries(presenceState).forEach(([key, presences]) => {
            // key is typically the runner_id or 'admin-dashboard'
            // We only care about actual runner presence data
            if (Array.isArray(presences) && presences.length > 0) {
              const presence = presences[0] as RunnerPresence;
              if (presence && typeof presence === 'object' && 'runner_id' in presence) {
                newRunners[presence.runner_id] = presence;
                newOnlineIds.add(presence.runner_id);

                // Track join events
                if (state.runners[presence.runner_id] === undefined) {
                  onJoin?.(presence.runner_id, presence);
                }
              }
            }
          });

          // Track leave events
          const previousIds = state.onlineIds;
          previousIds.forEach((id) => {
            if (!newOnlineIds.has(id)) {
              onLeave?.(id);
            }
          });

          setState((prev) => ({
            ...prev,
            runners: newRunners,
            onlineIds: newOnlineIds,
            isConnected: true,
            error: null,
          }));

          onSync?.(newRunners);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          console.log('[useRunnerPresence] Runner joined:', key, newPresences);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          console.log('[useRunnerPresence] Runner left:', key, leftPresences);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Track our own presence (admin dashboard)
            await channel.track({
              user: 'admin-dashboard',
              online_at: new Date().toISOString(),
            });
          }
        });

      channelRef.current = channel;

      setState((prev) => ({ ...prev, isConnected: true, error: null }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to connect');
      console.error('[useRunnerPresence] Connection error:', error);
      setState((prev) => ({ ...prev, error, isConnected: false }));
    }
  }, [channelName, getSupabase, onJoin, onLeave, onSync, state.runners, state.onlineIds]);

  /**
   * Disconnect from the presence channel
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
   * Manually trigger a presence sync
   */
  const sync = useCallback(() => {
    if (channelRef.current) {
      // Trigger sync by tracking current state again
      channelRef.current.track({
        user: 'admin-dashboard',
        synced_at: new Date().toISOString(),
      });
    }
  }, []);

  /**
   * Get a specific runner's presence data
   */
  const getRunner = useCallback(
    (runnerId: string): RunnerPresence | undefined => {
      return state.runners[runnerId];
    },
    [state.runners]
  );

  /**
   * Get count of online runners
   */
  const getOnlineCount = useCallback((): number => {
    return state.onlineIds.size;
  }, [state.onlineIds]);

  /**
   * Get count of busy runners
   */
  const getBusyCount = useCallback((): number => {
    return Object.values(state.runners).filter((r) => r.status === 'busy').length;
  }, [state.runners]);

  /**
   * Check if a specific runner is online
   */
  const isOnline = useCallback(
    (runnerId: string): boolean => {
      return state.onlineIds.has(runnerId);
    },
    [state.onlineIds]
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
    sync,
    getRunner,
    getOnlineCount,
    getBusyCount,
    isOnline,
  };
}
