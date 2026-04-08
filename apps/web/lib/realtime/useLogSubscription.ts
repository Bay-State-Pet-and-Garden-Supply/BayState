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
import { useRealtimeChannel } from './useRealtimeChannel';

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

interface SharedLogChannelEntry {
    channel: RealtimeChannel;
    listeners: Set<(payload: LogInsertPayload) => void>;
}

const sharedLogChannels = new Map<string, SharedLogChannelEntry>();

function ensureSharedLogChannel(channelName: string, jobId?: string): SharedLogChannelEntry {
    const channel = createClient().channel(channelName);
    const existingEntry = sharedLogChannels.get(channelName);

    if (existingEntry && existingEntry.channel === channel) {
        return existingEntry;
    }

    const entry: SharedLogChannelEntry = {
        channel,
        listeners: existingEntry?.listeners ?? new Set(),
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
    );

    sharedLogChannels.set(channelName, entry);
    return entry;
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

    useEffect(() => {
        const sharedChannel = ensureSharedLogChannel(channelName, jobId);
        sharedChannel.listeners.add(handlePersistedLog);

        return () => {
            sharedChannel.listeners.delete(handlePersistedLog);

            if (sharedChannel.listeners.size === 0 && sharedLogChannels.get(channelName) === sharedChannel) {
                createClient().removeChannel(sharedChannel.channel);
                sharedLogChannels.delete(channelName);
            }
        };
    }, [channelName, jobId, handlePersistedLog]);

    const {
        connectionState,
        lastError,
        connect: connectRealtimeChannel,
        disconnect: disconnectRealtimeChannel,
    } = useRealtimeChannel({
        channelName,
        autoConnect,
        onMessage: (payload) => {
            if (typeof payload === 'object' && payload !== null) {
                handleLogMessage(payload as LogRecord, false);
            }
        },
        onError: () => {
            // Error handling delegated to useRealtimeChannel state
        },
    });

    const connect = useCallback(() => {
        ensureSharedLogChannel(channelName, jobId);
        activeRef.current = true;
        connectRealtimeChannel();
    }, [channelName, jobId, connectRealtimeChannel]);

    const disconnect = useCallback(() => {
        activeRef.current = false;
        disconnectRealtimeChannel();
    }, [disconnectRealtimeChannel]);

    const clearLogs = useCallback(() => {
        setLogs([]);
    }, []);

    const isConnected = connectionState === 'connected';
    const error = lastError;

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
