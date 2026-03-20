/**
 * useLogSubscription - Supabase Realtime hook for streaming scrape_job_logs
 *
 * Subscribes to INSERT events on the scrape_job_logs table via Postgres Changes.
 * The table is already published to supabase_realtime (see migration 20260110000000).
 */

import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export interface LogEntry {
    id: string;
    job_id: string;
    level: string;
    message: string;
    details?: Record<string, unknown> | null;
    created_at: string;
}

export interface UseLogSubscriptionOptions {
    /** Filter logs to a specific job ID */
    jobId?: string;
    /** Maximum log entries to keep in memory (default: 200) */
    maxEntries?: number;
    /** Whether to auto-connect on mount (default: true) */
    autoConnect?: boolean;
    /** Callback when a new log entry arrives */
    onLog?: (log: LogEntry) => void;
}

export interface UseLogSubscriptionReturn {
    /** All log entries, newest first */
    logs: LogEntry[];
    /** Whether the subscription is connected */
    isConnected: boolean;
    /** Connection error if any */
    error: Error | null;
    /** Connect to the log subscription */
    connect: () => void;
    /** Disconnect from the log subscription */
    disconnect: () => void;
    /** Clear all stored logs */
    clearLogs: () => void;
}

export function useLogSubscription(
    options: UseLogSubscriptionOptions = {}
): UseLogSubscriptionReturn {
    const {
        jobId,
        maxEntries = 200,
        autoConnect = true,
        onLog,
    } = options;

    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const channelRef = useRef<RealtimeChannel | null>(null);
    const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
    const onLogRef = useRef(onLog);
    const mountedRef = useRef(true);

    useEffect(() => {
        onLogRef.current = onLog;
    }, [onLog]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const getSupabase = useCallback(() => {
        if (!supabaseRef.current) {
            supabaseRef.current = createClient();
        }
        return supabaseRef.current;
    }, []);

    const connect = useCallback(() => {
        const supabase = getSupabase();

        try {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }

            const channelName = `scrape-logs-${jobId ?? 'all'}-${Math.random().toString(36).substring(2, 9)}`;
            const channel = supabase.channel(channelName);

            const filter = jobId ? `job_id=eq.${jobId}` : undefined;

            channel.on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'scrape_job_logs',
                    ...(filter ? { filter } : {}),
                },
                (payload) => {
                    const newLog = payload.new as LogEntry;
                    if (!newLog) return;

                    setLogs((prev) => {
                        const updated = [newLog, ...prev];
                        return updated.length > maxEntries
                            ? updated.slice(0, maxEntries)
                            : updated;
                    });

                    onLogRef.current?.(newLog);
                }
            );

            channel.subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    setIsConnected(true);
                    setError(null);
                } else if (status === 'CHANNEL_ERROR') {
                    const channelError = new Error(
                        `Log subscription error: ${err?.message || 'unknown'}`
                    );
                    console.error('[useLogSubscription] Channel error:', channelError);
                    supabase.removeChannel(channel);
                    if (channelRef.current === channel) {
                        channelRef.current = null;
                    }
                    setIsConnected(false);
                    setError(channelError);
                }
            });

            channelRef.current = channel;
        } catch (err) {
            const connectError = err instanceof Error ? err : new Error('Failed to connect');
            console.error('[useLogSubscription] Connection error:', connectError);
            setIsConnected(false);
            setError(connectError);
        }
    }, [getSupabase, jobId, maxEntries]);

    const disconnect = useCallback(() => {
        if (channelRef.current) {
            const supabase = getSupabase();
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }
        setIsConnected(false);
    }, [getSupabase]);

    const clearLogs = useCallback(() => {
        setLogs([]);
    }, []);

    useEffect(() => {
        if (autoConnect) {
            const connectionTimeout = setTimeout(() => {
                if (mountedRef.current) {
                    connect();
                }
            }, 0);

            return () => {
                clearTimeout(connectionTimeout);
                disconnect();
            };
        }
    }, [autoConnect, connect, disconnect]);

    return useMemo(
        () => ({
            logs,
            isConnected,
            error,
            connect,
            disconnect,
            clearLogs,
        }),
        [logs, isConnected, error, connect, disconnect, clearLogs]
    );
}
