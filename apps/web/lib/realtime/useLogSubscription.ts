/**
 * useLogSubscription - Supabase Realtime hook for streaming scrape_job_logs
 *
 * Subscribes to INSERT events on the scrape_job_logs table via Postgres Changes.
 * The table is already published to supabase_realtime (see migration 20260110000000).
 */

import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import type { RealtimeChannel, RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { normalizeScrapeLogEntry, mergeScrapeJobLogs, type ScrapeJobLogEntry } from '@/lib/scraper-logs';

export type LogEntry = ScrapeJobLogEntry;

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

type LogRecord = Record<string, unknown>;
type LogInsertPayload = RealtimePostgresInsertPayload<LogRecord>;
type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED' | 'TIMED_OUT';

interface SharedLogChannelEntry {
    channel: RealtimeChannel;
    listeners: Set<(payload: LogInsertPayload) => void>;
    statusListeners: Set<(status: RealtimeStatus) => void>;
    lastStatus: RealtimeStatus | null;
}

const sharedLogChannels = new Map<string, SharedLogChannelEntry>();

function ensureSharedLogChannel(baseChannelName: string, jobId?: string): SharedLogChannelEntry {
    const pgChannelName = `${baseChannelName}-pg`;
    const existingEntry = sharedLogChannels.get(pgChannelName);

    if (existingEntry) {
        return existingEntry;
    }

    const channel = createClient().channel(pgChannelName);
    const entry: SharedLogChannelEntry = {
        channel,
        listeners: new Set(),
        statusListeners: new Set(),
        lastStatus: null,
    };

    channel.on(
        'postgres_changes',
        {
            event: 'INSERT',
            schema: 'public',
            table: 'scrape_job_logs',
            ...(jobId ? { filter: `job_id=eq.${jobId}` } : {}),
        },
        (payload) => {
            for (const listener of Array.from(entry.listeners)) {
                listener(payload as LogInsertPayload);
            }
        }
    ).subscribe((status) => {
        entry.lastStatus = status;

        for (const listener of Array.from(entry.statusListeners)) {
            listener(status);
        }
    });

    sharedLogChannels.set(pgChannelName, entry);
    return entry;
}

function cleanupSharedLogChannel(baseChannelName: string, entry: SharedLogChannelEntry) {
    const pgChannelName = `${baseChannelName}-pg`;

    if (entry.listeners.size > 0 || entry.statusListeners.size > 0) {
        return;
    }

    if (sharedLogChannels.get(pgChannelName) !== entry) {
        return;
    }

    createClient().removeChannel(entry.channel);
    sharedLogChannels.delete(pgChannelName);
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

    const channelName = useMemo(() => `runner-logs:${jobId ?? 'all'}`, [jobId]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const activeRef = useRef(autoConnect);
    const onLogRef = useRef(onLog);
    const optionsRef = useRef({ jobId, maxEntries });

    useEffect(() => {
        onLogRef.current = onLog;
    }, [onLog]);

    useEffect(() => {
        optionsRef.current = { jobId, maxEntries };
    }, [jobId, maxEntries]);

    useEffect(() => {
        activeRef.current = autoConnect;
    }, [autoConnect]);

    const handleLogMessage = useCallback((payload: LogRecord, persisted: boolean) => {
        if (!activeRef.current) {
            return;
        }

        const { jobId, maxEntries } = optionsRef.current;
        const nextLog = normalizeScrapeLogEntry(payload, { persisted, jobId });
        if (!nextLog) {
            return;
        }

        setLogs((previousLogs) => mergeScrapeJobLogs(previousLogs, [nextLog], maxEntries));
        onLogRef.current?.(nextLog);
    }, []);

    const handlePersistedLog = useCallback(
        (payload: LogInsertPayload) => {
            handleLogMessage(payload.new as LogRecord, true);
        },
        [handleLogMessage]
    );

    const handleStatusChange = useCallback((status: RealtimeStatus) => {
        if (!activeRef.current) {
            return;
        }

        if (status === 'SUBSCRIBED') {
            setIsConnected(true);
            setError(null);
            return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setIsConnected(false);
            setError(
                new Error(
                    status === 'TIMED_OUT'
                        ? 'Log subscription timed out.'
                        : 'Log subscription error.'
                )
            );
            return;
        }

        setIsConnected(false);
    }, []);

    useEffect(() => {
        const sharedChannel = ensureSharedLogChannel(channelName, jobId);
        sharedChannel.listeners.add(handlePersistedLog);
        const statusListener = (status: RealtimeStatus) => {
            handleStatusChange(status);
        };
        sharedChannel.statusListeners.add(statusListener);
        let cancelled = false;

        if (activeRef.current && sharedChannel.lastStatus) {
            queueMicrotask(() => {
                if (!cancelled) {
                    handleStatusChange(sharedChannel.lastStatus as RealtimeStatus);
                }
            });
        }

        return () => {
            cancelled = true;
            sharedChannel.listeners.delete(handlePersistedLog);
            sharedChannel.statusListeners.delete(statusListener);
            cleanupSharedLogChannel(channelName, sharedChannel);
        };
    }, [channelName, jobId, handlePersistedLog, handleStatusChange]);

    const connect = useCallback(() => {
        const sharedChannel = ensureSharedLogChannel(channelName, jobId);
        activeRef.current = true;
        setError(null);

        if (sharedChannel.lastStatus) {
            handleStatusChange(sharedChannel.lastStatus);
        }
    }, [channelName, jobId, handleStatusChange]);

    const disconnect = useCallback(() => {
        activeRef.current = false;
        setIsConnected(false);
    }, []);

    const clearLogs = useCallback(() => {
        setLogs([]);
    }, []);

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
