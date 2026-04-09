/**
 * useRunnerPresence - Supabase Presence API hook for tracking runner online/offline status
 *
 * This hook manages real-time presence tracking for scraper runners using Supabase Realtime.
 * Runners "track" their presence state, and the admin panel subscribes to presence sync events
 * to maintain a live view of which runners are online, busy, or offline.
 */

import { useEffect, useMemo, useCallback, useState, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { RunnerPresence } from "./types";
import {
  useRealtimeChannel,
  type RealtimePresenceState,
} from "./useRealtimeChannel";

const CHANNEL_RUNNER_PRESENCE = "runner-presence";

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
  /** Optional custom channel name for presence */
  channelName?: string;
  /** Whether to automatically connect on mount (default: true) */
  autoConnect?: boolean;
  /** Whether to fetch initial runners from API (default: true) */
  fetchInitial?: boolean;
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
  autoConnect: true,
};

/**
 * Runner data from API endpoint
 */
interface ApiRunnerData {
  id: string;
  name: string;
  os: string;
  status: "online" | "offline" | "busy" | "idle";
  busy: boolean;
  labels: string[];
  last_seen?: string;
  active_jobs?: number;
  enabled: boolean;
  version?: string | null;
  build_check_reason?: string | null;
}

function isRunnerStatus(value: unknown): value is RunnerPresence["status"] {
  return value === "online" || value === "busy" || value === "idle" || value === "offline";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRunnerPresence(value: unknown): value is RunnerPresence {
  return (
    isRecord(value) &&
    typeof value.runner_id === "string" &&
    typeof value.runner_name === "string" &&
    isRunnerStatus(value.status) &&
    typeof value.active_jobs === "number" &&
    typeof value.last_seen === "string"
  );
}

function extractRunnersFromPresenceState(
  presenceState: RealtimePresenceState,
): Record<string, RunnerPresence> {
  const runners: Record<string, RunnerPresence> = {};

  Object.values(presenceState).forEach((presences) => {
    if (!Array.isArray(presences) || presences.length === 0) {
      return;
    }

    const presence = presences[0];

    if (isRunnerPresence(presence)) {
      runners[presence.runner_id] = presence;
    }
  });

  return runners;
}

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
  /** Whether initial runners are being fetched */
  isLoading: boolean;
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
export function useRunnerPresence(
  options: UseRunnerPresenceOptions = {},
): UseRunnerPresenceReturn {
  const {
    channelName: providedChannelName,
    autoConnect = true,
    fetchInitial = true,
    onJoin,
    onLeave,
    onSync,
  } = { ...DEFAULT_OPTIONS, ...options };

  const channelName = useMemo(
    () => providedChannelName ?? CHANNEL_RUNNER_PRESENCE,
    [providedChannelName],
  );

  const [state, setState] = useState<RunnerPresenceState>({
    runners: {},
    onlineIds: new Set(),
    isConnected: false,
    error: null,
  });

  const [isLoading, setIsLoading] = useState(false);

  const callbacksRef = useRef({ onJoin, onLeave, onSync });
  const trackedChannelRef = useRef<RealtimeChannel | null>(null);
  callbacksRef.current.onJoin = onJoin;
  callbacksRef.current.onLeave = onLeave;
  callbacksRef.current.onSync = onSync;

  /**
   * Fetch initial runners from the API endpoint
   */
  const fetchInitialRunners = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/admin/scraper-network/runners");

      if (!response.ok) {
        throw new Error("Failed to fetch runners");
      }

      const data = (await response.json()) as { runners: ApiRunnerData[] };

      // Convert API data to RunnerPresence format
      const initialRunners: Record<string, RunnerPresence> = {};

      data.runners.forEach((runner) => {
        initialRunners[runner.id] = {
          runner_id: runner.id,
          runner_name: runner.name,
          status: runner.status === "offline" ? "offline" : "online",
          active_jobs: runner.active_jobs ?? (runner.busy ? 1 : 0),
          last_seen: runner.last_seen ?? new Date(0).toISOString(),
          enabled: runner.enabled,
          version: runner.version,
          build_check_reason: runner.build_check_reason,
          metadata: {
            os: runner.os,
            labels: runner.labels,
          },
        };
      });

      setState((prev) => ({
        ...prev,
        runners: initialRunners,
      }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to fetch initial runners");
      setState((prev) => ({ ...prev, error }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Process presence sync events from the unified realtime channel
   */
  const handlePresenceSync = useCallback((presenceState: RealtimePresenceState) => {
    setState((prev) => {
      const syncedRunners = extractRunnersFromPresenceState(presenceState);
      const nextOnlineIds = new Set(Object.keys(syncedRunners));
      const nextRunners = { ...prev.runners };
      const joined: Array<{ runnerId: string; presence: RunnerPresence }> = [];
      const leftIds: string[] = [];
      const { onJoin, onLeave, onSync } = callbacksRef.current;

      Object.entries(syncedRunners).forEach(([runnerId, presence]) => {
        nextRunners[runnerId] = presence;

        if (!prev.onlineIds.has(runnerId)) {
          joined.push({ runnerId, presence });
        }
      });

      prev.onlineIds.forEach((runnerId) => {
        if (nextOnlineIds.has(runnerId)) {
          return;
        }

        leftIds.push(runnerId);

        const previousRunner = nextRunners[runnerId];

        if (!previousRunner) {
          return;
        }

        nextRunners[runnerId] = {
          ...previousRunner,
          status: "offline",
          active_jobs: 0,
          last_seen: new Date().toISOString(),
        };
      });

      joined.forEach(({ runnerId, presence }) => {
        onJoin?.(runnerId, presence);
      });

      leftIds.forEach((runnerId) => {
        onLeave?.(runnerId);
      });

      onSync?.(syncedRunners);

      return {
        ...prev,
        runners: nextRunners,
        onlineIds: nextOnlineIds,
        error: null,
      };
    });
  }, []);

  const {
    connectionState,
    lastError,
    connect: connectToChannel,
    disconnect: disconnectFromChannel,
    getChannel,
  } = useRealtimeChannel({
    channelName,
    autoConnect: false,
    onMessage: () => undefined,
    onPresenceSync: handlePresenceSync,
  });

  /**
   * Connect to the presence channel through the unified realtime hook
   */
  const connect = useCallback(() => {
    connectToChannel();
    setState((prev) =>
      prev.isConnected ? prev : { ...prev, isConnected: true, error: null },
    );
  }, [connectToChannel]);

  /**
   * Disconnect from the presence channel through the unified realtime hook
   */
  const disconnect = useCallback(() => {
    trackedChannelRef.current = null;
    disconnectFromChannel();
    setState((prev) =>
      prev.isConnected ? { ...prev, isConnected: false } : prev,
    );
  }, [disconnectFromChannel]);

  /**
   * Manually trigger a presence sync
   */
  const sync = useCallback(() => {
    const channel = getChannel();

    if (channel) {
      void channel.track({
        user: "admin-dashboard",
        synced_at: new Date().toISOString(),
      });
    }
  }, [getChannel]);

  const fetchInitialRunnersRef = useRef(fetchInitialRunners);
  const connectRef = useRef(connect);

  fetchInitialRunnersRef.current = fetchInitialRunners;
  connectRef.current = connect;

  useEffect(() => {
    const isConnected = connectionState === "connecting" || connectionState === "connected";

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

  useEffect(() => {
    if (connectionState !== "connected") {
      trackedChannelRef.current = null;
      return;
    }

    const channel = getChannel();

    if (!channel || trackedChannelRef.current === channel) {
      return;
    }

    trackedChannelRef.current = channel;

    void channel.track({
      user: "admin-dashboard",
      online_at: new Date().toISOString(),
    });
  }, [connectionState, getChannel]);

  /**
   * Get a specific runner's presence data
   */
  const getRunner = useCallback(
    (runnerId: string): RunnerPresence | undefined => {
      return state.runners[runnerId];
    },
    [state.runners],
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
    return Object.values(state.runners).filter((r) => r.status === "busy")
      .length;
  }, [state.runners]);

  /**
   * Check if a specific runner is online
   */
  const isOnline = useCallback(
    (runnerId: string): boolean => {
      return state.onlineIds.has(runnerId);
    },
    [state.onlineIds],
  );

  /**
   * Auto-connect on mount if enabled
   */
  useEffect(() => {
    let isActive = true;

    const init = async () => {
      // Fetch initial runners from API first
      if (fetchInitial) {
        await fetchInitialRunnersRef.current();
      }

      if (!isActive) {
        return;
      }

      // Then connect to presence channel
      if (autoConnect) {
        connectRef.current();
      }
    };

    void init();

    return () => {
      isActive = false;
    };
  }, [autoConnect, fetchInitial]);

  return {
    ...state,
    connect,
    disconnect,
    sync,
    getRunner,
    getOnlineCount,
    getBusyCount,
    isOnline,
    isLoading,
  };
}
