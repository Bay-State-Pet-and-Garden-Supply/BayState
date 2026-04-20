import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/types/supabase';
import type { RunnerPresence } from './types';
import {
  coerceRunnerMetadata,
  getRunnerBuildCheckReason,
  getRunnerLabels,
  getRunnerLastSeen,
  getRunnerOs,
  getRunnerPresenceStatus,
  getRunnerVersion,
  getStoredRunnerStatus,
  isRunnerStale,
  type RunnerDurableStatus,
} from '@/lib/scraper-runners';

const CHANNEL_RUNNER_PRESENCE = 'scraper-runners';
const RUNNER_STALENESS_CHECK_INTERVAL_MS = 30_000;

type RunnerRealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED' | 'TIMED_OUT';
type ScraperRunnerRow = Database['public']['Tables']['scraper_runners']['Row'];
type RunnerRealtimePayload = RealtimePostgresChangesPayload<ScraperRunnerRow>;

type RunnerRowSnapshot = Pick<
  ScraperRunnerRow,
  | 'name'
  | 'last_seen_at'
  | 'created_at'
  | 'status'
  | 'current_job_id'
  | 'enabled'
  | 'metadata'
  | 'jobs_completed'
  | 'memory_usage_mb'
>;

interface SharedRunnerChannelEntry {
  channel: RealtimeChannel;
  listeners: Set<(payload: RunnerRealtimePayload) => void>;
  statusListeners: Set<(status: RunnerRealtimeStatus) => void>;
  lastStatus: RunnerRealtimeStatus | null;
}

interface ApiRunnerData {
  id: string;
  name: string;
  os: string;
  status: 'online' | 'offline';
  raw_status?: RunnerDurableStatus | null;
  busy: boolean;
  labels: Array<string | { name: string }>;
  last_seen?: string;
  active_jobs?: number;
  enabled: boolean;
  version?: string | null;
  build_check_reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

const sharedRunnerChannels = new Map<string, SharedRunnerChannelEntry>();

function ensureSharedRunnerChannel(baseChannelName: string): SharedRunnerChannelEntry {
  const pgChannelName = `${baseChannelName}-pg`;
  const existingEntry = sharedRunnerChannels.get(pgChannelName);

  if (existingEntry) {
    return existingEntry;
  }

  const channel = createClient().channel(pgChannelName);
  const entry: SharedRunnerChannelEntry = {
    channel,
    listeners: new Set(),
    statusListeners: new Set(),
    lastStatus: null,
  };

  channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'scraper_runners',
      },
      (payload) => {
        for (const listener of Array.from(entry.listeners)) {
          listener(payload as RunnerRealtimePayload);
        }
      },
    )
    .subscribe((status) => {
      entry.lastStatus = status;

      for (const listener of Array.from(entry.statusListeners)) {
        listener(status);
      }
    });

  sharedRunnerChannels.set(pgChannelName, entry);
  return entry;
}

function cleanupSharedRunnerChannel(baseChannelName: string, entry: SharedRunnerChannelEntry) {
  const pgChannelName = `${baseChannelName}-pg`;

  if (entry.listeners.size > 0 || entry.statusListeners.size > 0) {
    return;
  }

  if (sharedRunnerChannels.get(pgChannelName) !== entry) {
    return;
  }

  createClient().removeChannel(entry.channel);
  sharedRunnerChannels.delete(pgChannelName);
}

function createOnlineIds(runners: Record<string, RunnerPresence>): Set<string> {
  return new Set(
    Object.values(runners)
      .filter((runner) => runner.status !== 'offline')
      .map((runner) => runner.runner_id),
  );
}

function runnerPresenceEquals(left: RunnerPresence | undefined, right: RunnerPresence | undefined): boolean {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.runner_id === right.runner_id &&
    left.runner_name === right.runner_name &&
    left.status === right.status &&
    left.raw_status === right.raw_status &&
    left.active_jobs === right.active_jobs &&
    left.last_seen === right.last_seen &&
    left.enabled === right.enabled &&
    left.version === right.version &&
    left.build_check_reason === right.build_check_reason &&
    left.metadata === right.metadata
  );
}

function runnerMapsEqual(
  left: Record<string, RunnerPresence>,
  right: Record<string, RunnerPresence>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => runnerPresenceEquals(left[key], right[key]));
}

function isRunnerRowSnapshot(value: unknown): value is RunnerRowSnapshot {
  return typeof value === 'object' && value !== null && typeof (value as { name?: unknown }).name === 'string';
}

function buildRunnerMetadata(
  metadata: Record<string, unknown> | null,
  extras: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const mergedEntries = Object.entries({ ...(metadata ?? {}), ...extras }).filter(
    ([, value]) => value !== undefined,
  );

  if (mergedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(mergedEntries);
}

function getDisplayStatus(rawStatus: RunnerDurableStatus, lastSeen: string): RunnerPresence['status'] {
  if (rawStatus === 'offline' || isRunnerStale(lastSeen)) {
    return 'offline';
  }

  return getRunnerPresenceStatus(rawStatus);
}

function normalizeRunnerPresence(runner: RunnerPresence): RunnerPresence {
  const rawStatus = runner.raw_status ?? runner.status;
  const status = getDisplayStatus(rawStatus, runner.last_seen);

  if (runner.raw_status === rawStatus && runner.status === status) {
    return runner;
  }

  return {
    ...runner,
    raw_status: rawStatus,
    status,
  };
}

function normalizeRunnerRow(row: RunnerRowSnapshot): RunnerPresence {
  const metadata = coerceRunnerMetadata(row.metadata);
  const lastSeen = getRunnerLastSeen(row);
  const rawStatus = getStoredRunnerStatus(row);

  return {
    runner_id: row.name,
    runner_name: row.name,
    status: getDisplayStatus(rawStatus, lastSeen),
    raw_status: rawStatus,
    active_jobs: row.current_job_id ? 1 : 0,
    last_seen: lastSeen,
    enabled: row.enabled,
    version: getRunnerVersion(metadata),
    build_check_reason: getRunnerBuildCheckReason(metadata),
    metadata: buildRunnerMetadata(metadata, {
      jobs_completed: row.jobs_completed ?? undefined,
      memory_usage_mb: row.memory_usage_mb ?? undefined,
      current_job_id: row.current_job_id ?? undefined,
      raw_status: rawStatus,
      os: getRunnerOs(metadata),
      labels: getRunnerLabels(metadata),
    }),
  };
}

function normalizeApiRunner(runner: ApiRunnerData): RunnerPresence {
  const metadata = runner.metadata ?? null;
  const lastSeen = runner.last_seen ?? new Date(0).toISOString();
  const rawStatus = runner.raw_status ?? (runner.busy ? 'busy' : runner.status === 'offline' ? 'offline' : 'online');
  const labels = runner.labels
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter((label): label is string => typeof label === 'string' && label.trim().length > 0);

  return {
    runner_id: runner.id,
    runner_name: runner.name,
    status: getDisplayStatus(rawStatus, lastSeen),
    raw_status: rawStatus,
    active_jobs: runner.active_jobs ?? (runner.busy ? 1 : 0),
    last_seen: lastSeen,
    enabled: runner.enabled,
    version: runner.version ?? null,
    build_check_reason: runner.build_check_reason ?? null,
    metadata: buildRunnerMetadata(metadata, {
      os: runner.os,
      labels,
      raw_status: rawStatus,
    }),
  };
}

export interface RunnerPresenceState {
  runners: Record<string, RunnerPresence>;
  onlineIds: Set<string>;
  isConnected: boolean;
  error: Error | null;
}

export interface UseRunnerPresenceOptions {
  channelName?: string;
  autoConnect?: boolean;
  fetchInitial?: boolean;
  onJoin?: (runnerId: string, presence: RunnerPresence) => void;
  onLeave?: (runnerId: string) => void;
  onSync?: (runners: Record<string, RunnerPresence>) => void;
}

const DEFAULT_OPTIONS: Partial<UseRunnerPresenceOptions> = {
  autoConnect: true,
};

export interface UseRunnerPresenceReturn extends RunnerPresenceState {
  connect: () => void;
  disconnect: () => void;
  sync: () => void;
  getRunner: (runnerId: string) => RunnerPresence | undefined;
  getOnlineCount: () => number;
  getBusyCount: () => number;
  isOnline: (runnerId: string) => boolean;
  isLoading: boolean;
}

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

  const mountedRef = useRef(false);
  const activeRef = useRef(autoConnect);
  const runnersRef = useRef<Record<string, RunnerPresence>>({});
  const sharedChannelRef = useRef<SharedRunnerChannelEntry | null>(null);
  const payloadListenerRef = useRef<((payload: RunnerRealtimePayload) => void) | null>(null);
  const statusListenerRef = useRef<((status: RunnerRealtimeStatus) => void) | null>(null);
  const callbacksRef = useRef({ onJoin, onLeave, onSync });

  callbacksRef.current = { onJoin, onLeave, onSync };

  const setRunnerState = useCallback(
    (updater: (previous: RunnerPresenceState) => RunnerPresenceState) => {
      if (!mountedRef.current) {
        return;
      }

      setState(updater);
    },
    [],
  );

  const applyRunners = useCallback(
    (
      nextRunners: Record<string, RunnerPresence>,
      options: { notify?: boolean; clearError?: boolean } = {},
    ) => {
      const normalizedRunners = Object.fromEntries(
        Object.entries(nextRunners).map(([runnerId, runner]) => [runnerId, normalizeRunnerPresence(runner)]),
      );
      const previousRunners = runnersRef.current;
      const previousOnlineIds = createOnlineIds(previousRunners);
      const nextOnlineIds = createOnlineIds(normalizedRunners);

      if (runnerMapsEqual(previousRunners, normalizedRunners)) {
        if (options.clearError) {
          setRunnerState((previousState) => ({ ...previousState, error: null }));
        }
        return;
      }

      runnersRef.current = normalizedRunners;

      setRunnerState((previousState) => ({
        ...previousState,
        runners: normalizedRunners,
        onlineIds: nextOnlineIds,
        error: options.clearError ? null : previousState.error,
      }));

      if (options.notify === false) {
        return;
      }

      const { onJoin: handleJoin, onLeave: handleLeave, onSync: handleSync } = callbacksRef.current;

      for (const [runnerId, runner] of Object.entries(normalizedRunners)) {
        if (!previousOnlineIds.has(runnerId) && nextOnlineIds.has(runnerId)) {
          handleJoin?.(runnerId, runner);
        }
      }

      for (const runnerId of previousOnlineIds) {
        if (!nextOnlineIds.has(runnerId)) {
          handleLeave?.(runnerId);
        }
      }

      handleSync?.(normalizedRunners);
    },
    [setRunnerState],
  );

  const refetchRunners = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/scraper-network/runners');

      if (!response.ok) {
        throw new Error('Failed to fetch runners');
      }

      const data = (await response.json()) as { runners: ApiRunnerData[] };
      const nextRunners = Object.fromEntries(
        (data.runners ?? []).map((runner) => [runner.id, normalizeApiRunner(runner)]),
      );

      runnersRef.current = nextRunners;
      setRunnerState((previousState) => ({
        ...previousState,
        runners: nextRunners,
        onlineIds: createOnlineIds(nextRunners),
        error: null,
      }));
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error('Failed to fetch runners');
      setRunnerState((previousState) => ({ ...previousState, error: nextError }));
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [setRunnerState]);

  const handleRunnerPayload = useCallback(
    (payload: RunnerRealtimePayload) => {
      if (!activeRef.current) {
        return;
      }

      const nextRunners = { ...runnersRef.current };

      if (payload.eventType === 'DELETE') {
        const oldRow = payload.old;

        if (isRunnerRowSnapshot(oldRow)) {
          delete nextRunners[oldRow.name];
          applyRunners(nextRunners, { clearError: true });
        }
        return;
      }

      const newRow = payload.new;
      if (!isRunnerRowSnapshot(newRow)) {
        return;
      }

      nextRunners[newRow.name] = normalizeRunnerRow(newRow);
      applyRunners(nextRunners, { clearError: true });
    },
    [applyRunners],
  );

  const handleStatusChange = useCallback(
    (status: RunnerRealtimeStatus) => {
      if (!activeRef.current) {
        return;
      }

      if (status === 'SUBSCRIBED') {
        setRunnerState((previousState) => ({
          ...previousState,
          isConnected: true,
          error: null,
        }));
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        const error = new Error(
          status === 'TIMED_OUT'
            ? 'Runner subscription timed out.'
            : 'Runner subscription error.',
        );

        setRunnerState((previousState) => ({
          ...previousState,
          isConnected: false,
          error,
        }));
        return;
      }

      setRunnerState((previousState) => ({
        ...previousState,
        isConnected: false,
      }));
    },
    [setRunnerState],
  );

  const attachSharedChannel = useCallback(() => {
    if (sharedChannelRef.current) {
      return;
    }

    const entry = ensureSharedRunnerChannel(channelName);
    const payloadListener = (payload: RunnerRealtimePayload) => {
      handleRunnerPayload(payload);
    };
    const statusListener = (status: RunnerRealtimeStatus) => {
      handleStatusChange(status);
    };

    entry.listeners.add(payloadListener);
    entry.statusListeners.add(statusListener);
    sharedChannelRef.current = entry;
    payloadListenerRef.current = payloadListener;
    statusListenerRef.current = statusListener;

    if (entry.lastStatus === 'SUBSCRIBED') {
      handleStatusChange('SUBSCRIBED');
    }
  }, [channelName, handleRunnerPayload, handleStatusChange]);

  const detachSharedChannel = useCallback(() => {
    const entry = sharedChannelRef.current;
    const payloadListener = payloadListenerRef.current;
    const statusListener = statusListenerRef.current;

    if (!entry) {
      return;
    }

    if (payloadListener) {
      entry.listeners.delete(payloadListener);
    }

    if (statusListener) {
      entry.statusListeners.delete(statusListener);
    }

    cleanupSharedRunnerChannel(channelName, entry);

    sharedChannelRef.current = null;
    payloadListenerRef.current = null;
    statusListenerRef.current = null;
  }, [channelName]);

  const refreshStaleStatuses = useCallback(() => {
    if (!activeRef.current) {
      return;
    }

    const nextRunners = Object.fromEntries(
      Object.entries(runnersRef.current).map(([runnerId, runner]) => [runnerId, normalizeRunnerPresence(runner)]),
    );

    applyRunners(nextRunners);
  }, [applyRunners]);

  const connect = useCallback(() => {
    activeRef.current = true;
    attachSharedChannel();
  }, [attachSharedChannel]);

  const disconnect = useCallback(() => {
    activeRef.current = false;
    detachSharedChannel();
    setRunnerState((previousState) => ({
      ...previousState,
      isConnected: false,
    }));
  }, [detachSharedChannel, setRunnerState]);

  const sync = useCallback(() => {
    void refetchRunners();
  }, [refetchRunners]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      activeRef.current = false;
      detachSharedChannel();
    };
  }, [detachSharedChannel]);

  useEffect(() => {
    activeRef.current = autoConnect;
  }, [autoConnect]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (fetchInitial) {
        await refetchRunners();
      }

      if (!cancelled && autoConnect) {
        connect();
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [autoConnect, connect, fetchInitial, refetchRunners]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      refreshStaleStatuses();
    }, RUNNER_STALENESS_CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshStaleStatuses]);

  const getRunner = useCallback(
    (runnerId: string): RunnerPresence | undefined => {
      return state.runners[runnerId];
    },
    [state.runners],
  );

  const getOnlineCount = useCallback((): number => {
    return state.onlineIds.size;
  }, [state.onlineIds]);

  const getBusyCount = useCallback((): number => {
    return Object.values(state.runners).filter((runner) => runner.status === 'busy').length;
  }, [state.runners]);

  const isOnline = useCallback(
    (runnerId: string): boolean => {
      return state.onlineIds.has(runnerId);
    },
    [state.onlineIds],
  );

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
