'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export type RealtimeConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';
export type RealtimePresenceState = ReturnType<RealtimeChannel['presenceState']>;

type RealtimeChannelStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED' | 'TIMED_OUT';
type SupabaseClientFactory = typeof import('@/lib/supabase/client')['createClient'];
type SupabaseBrowserClient = ReturnType<SupabaseClientFactory>;

interface PooledChannelEntry {
  channelName: string;
  client: SupabaseBrowserClient;
  channel: RealtimeChannel;
  refCount: number;
  destroyed: boolean;
  lastStatus: RealtimeChannelStatus | null;
  messageListeners: Set<(payload: unknown) => void>;
  presenceSyncListeners: Set<(presenceState: RealtimePresenceState) => void>;
  statusListeners: Set<(status: RealtimeChannelStatus) => void>;
}

const channelPool = new Map<string, PooledChannelEntry>();

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY_MS = 1000;

function destroyPooledChannel(entry: PooledChannelEntry) {
  if (entry.destroyed) {
    return;
  }

  entry.destroyed = true;
  entry.refCount = 0;
  entry.messageListeners.clear();
  entry.presenceSyncListeners.clear();
  entry.statusListeners.clear();

  if (channelPool.get(entry.channelName) === entry) {
    channelPool.delete(entry.channelName);
  }

  void entry.client.removeChannel(entry.channel);
}

function releasePooledChannel(entry: PooledChannelEntry) {
  if (entry.destroyed) {
    return;
  }

  entry.refCount = Math.max(0, entry.refCount - 1);

  if (entry.refCount === 0) {
    destroyPooledChannel(entry);
  }
}

function getOrCreateChannel(channelName: string): PooledChannelEntry {
  const existingChannel = channelPool.get(channelName);

  if (existingChannel && !existingChannel.destroyed) {
    return existingChannel;
  }

  const client = createClient();
  const channel = client.channel(channelName, {
    config: {
      private: true,
    },
  });

  const entry: PooledChannelEntry = {
    channelName,
    client,
    channel,
    refCount: 0,
    destroyed: false,
    lastStatus: null,
    messageListeners: new Set(),
    presenceSyncListeners: new Set(),
    statusListeners: new Set(),
  };

  channel.on('broadcast', { event: '*' }, ({ payload }) => {
    for (const listener of Array.from(entry.messageListeners)) {
      listener(payload);
    }
  });

  channel.on('presence', { event: 'sync' }, () => {
    const presenceState = channel.presenceState();

    for (const listener of Array.from(entry.presenceSyncListeners)) {
      listener(presenceState);
    }
  });

  channel.subscribe((status) => {
    entry.lastStatus = status;

    for (const listener of Array.from(entry.statusListeners)) {
      listener(status);
    }
  });

  channelPool.set(channelName, entry);

  return entry;
}

export interface UseRealtimeChannelOptions {
  channelName: string;
  onMessage: (payload: unknown) => void;
  onPresenceSync?: (presenceState: RealtimePresenceState) => void;
  onError?: (error: Error) => void;
  autoConnect?: boolean;
}

export interface UseRealtimeChannelReturn {
  connectionState: RealtimeConnectionState;
  lastError: Error | null;
  reconnectAttempt: number;
  connect: () => void;
  disconnect: () => void;
  getChannel: () => RealtimeChannel | null;
}

export function useRealtimeChannel(options: UseRealtimeChannelOptions): UseRealtimeChannelReturn {
  const { channelName, onMessage, onPresenceSync, onError, autoConnect = true } = options;

  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('disconnected');
  const [lastError, setLastError] = useState<Error | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const mountedRef = useRef(false);
  const pooledChannelRef = useRef<PooledChannelEntry | null>(null);
  const messageListenerRef = useRef<((payload: unknown) => void) | null>(null);
  const presenceSyncListenerRef = useRef<((presenceState: RealtimePresenceState) => void) | null>(null);
  const statusListenerRef = useRef<((status: RealtimeChannelStatus) => void) | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(autoConnect);
  const callbacksRef = useRef({ onMessage, onPresenceSync, onError });
  const connectInternalRef = useRef<(resetAttempts: boolean) => void>(() => undefined);

  useEffect(() => {
    callbacksRef.current = { onMessage, onPresenceSync, onError };
  }, [onMessage, onPresenceSync, onError]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const detachCurrentChannel = useCallback(() => {
    const entry = pooledChannelRef.current;
    const messageListener = messageListenerRef.current;
    const presenceSyncListener = presenceSyncListenerRef.current;
    const statusListener = statusListenerRef.current;

    if (!entry) {
      pooledChannelRef.current = null;
      messageListenerRef.current = null;
      presenceSyncListenerRef.current = null;
      statusListenerRef.current = null;
      return;
    }

    if (messageListener) {
      entry.messageListeners.delete(messageListener);
    }

    if (presenceSyncListener) {
      entry.presenceSyncListeners.delete(presenceSyncListener);
    }

    if (statusListener) {
      entry.statusListeners.delete(statusListener);
    }

    releasePooledChannel(entry);

    pooledChannelRef.current = null;
    messageListenerRef.current = null;
    presenceSyncListenerRef.current = null;
    statusListenerRef.current = null;
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current || !shouldReconnectRef.current) {
      return;
    }

    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      return;
    }

    const nextAttempt = reconnectAttemptRef.current + 1;
    const delay = INITIAL_RECONNECT_DELAY_MS * 2 ** (nextAttempt - 1);

    reconnectAttemptRef.current = nextAttempt;
    setReconnectAttempt(nextAttempt);

    clearReconnectTimer();
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;

      if (!mountedRef.current || !shouldReconnectRef.current) {
        return;
      }

      connectInternalRef.current(false);
    }, delay);
  }, [clearReconnectTimer]);

  const connectInternal = useCallback(
    (resetAttempts: boolean) => {
      if (pooledChannelRef.current) {
        return;
      }

      shouldReconnectRef.current = true;
      clearReconnectTimer();

      if (resetAttempts) {
        reconnectAttemptRef.current = 0;
        setReconnectAttempt(0);
      }

      const entry = getOrCreateChannel(channelName);
      const messageListener = (payload: unknown) => {
        callbacksRef.current.onMessage(payload);
      };
      const presenceSyncListener = (presenceState: RealtimePresenceState) => {
        callbacksRef.current.onPresenceSync?.(presenceState);
      };
      const statusListener = (status: RealtimeChannelStatus) => {
        if (!mountedRef.current) {
          return;
        }

        if (status === 'SUBSCRIBED') {
          setConnectionState('connected');
          setLastError(null);
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const error = new Error(
            status === 'TIMED_OUT' ? 'Realtime channel timed out.' : 'Realtime channel error.',
          );

          setConnectionState('error');
          setLastError(error);
          callbacksRef.current.onError?.(error);

          destroyPooledChannel(entry);

          if (pooledChannelRef.current === entry) {
            pooledChannelRef.current = null;
            messageListenerRef.current = null;
            presenceSyncListenerRef.current = null;
            statusListenerRef.current = null;
          }

          scheduleReconnect();
          return;
        }

        setConnectionState('disconnected');
      };

      entry.refCount += 1;
      entry.messageListeners.add(messageListener);
      entry.presenceSyncListeners.add(presenceSyncListener);
      entry.statusListeners.add(statusListener);

      pooledChannelRef.current = entry;
      messageListenerRef.current = messageListener;
      presenceSyncListenerRef.current = presenceSyncListener;
      statusListenerRef.current = statusListener;

      setLastError(null);

      if (entry.lastStatus === 'SUBSCRIBED') {
        setConnectionState('connected');
        return;
      }

      if (entry.lastStatus === 'CHANNEL_ERROR' || entry.lastStatus === 'TIMED_OUT') {
        setConnectionState('error');
        return;
      }

      setConnectionState('connecting');
    },
    [channelName, clearReconnectTimer, scheduleReconnect],
  );

  useEffect(() => {
    connectInternalRef.current = connectInternal;
  }, [connectInternal]);

  const connect = useCallback(() => {
    connectInternal(true);
  }, [connectInternal]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    clearReconnectTimer();
    detachCurrentChannel();
    setConnectionState('disconnected');
  }, [clearReconnectTimer, detachCurrentChannel]);

  const getChannel = useCallback((): RealtimeChannel | null => {
    return pooledChannelRef.current?.channel ?? null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (autoConnect) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      connectInternal(true);
    }

    return () => {
      mountedRef.current = false;
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      detachCurrentChannel();
    };
  }, [autoConnect, clearReconnectTimer, connectInternal, detachCurrentChannel]);

  return {
    connectionState,
    lastError,
    reconnectAttempt,
    connect,
    disconnect,
    getChannel,
  };
}
