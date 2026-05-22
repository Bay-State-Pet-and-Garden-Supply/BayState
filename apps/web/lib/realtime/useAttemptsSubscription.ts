/**
 * useAttemptsSubscription - Supabase Postgres Changes hook for subscribing to enrichment_attempts table
 *
 * This hook subscribes to INSERT, UPDATE, and DELETE events on the enrichment_attempts table for a specific jobId.
 * Used for real-time tracking of individual SKU scraping progress within a job.
 */

import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { EnrichmentAttempt } from './types';

interface UseAttemptsSubscriptionOptions {
  /** The enrichment job ID to monitor */
  jobId?: string | null;
  /** Whether to automatically connect on mount/jobId change (default: true) */
  autoConnect?: boolean;
  /** Callback when a new attempt is created */
  onAttemptCreated?: (attempt: EnrichmentAttempt) => void;
  /** Callback when an attempt is updated */
  onAttemptUpdated?: (attempt: EnrichmentAttempt) => void;
}

interface UseAttemptsSubscriptionReturn {
  /** The current list of attempts for the job, sorted by SKU */
  attempts: EnrichmentAttempt[];
  /** Whether the realtime subscription is active */
  isConnected: boolean;
  /** Connection or query error if any */
  error: Error | null;
  /** Connect to the realtime channel */
  connect: () => void;
  /** Disconnect from the realtime channel */
  disconnect: () => void;
  /** Manually refetch attempts from the database */
  refetch: () => Promise<void>;
}

type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED' | 'TIMED_OUT';
type AttemptPayload = RealtimePostgresChangesPayload<EnrichmentAttempt>;

export function useAttemptsSubscription(
  options: UseAttemptsSubscriptionOptions = {}
): UseAttemptsSubscriptionReturn {
  const {
    jobId,
    autoConnect = true,
    onAttemptCreated,
    onAttemptUpdated,
  } = options;

  const [attempts, setAttempts] = useState<EnrichmentAttempt[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const activeRef = useRef(autoConnect);
  const callbacksRef = useRef({ onAttemptCreated, onAttemptUpdated });
  const jobIdRef = useRef(jobId);

  // Sync callbacks
  useEffect(() => {
    callbacksRef.current = { onAttemptCreated, onAttemptUpdated };
  }, [onAttemptCreated, onAttemptUpdated]);

  // Sync jobId and active state
  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  useEffect(() => {
    activeRef.current = autoConnect;
  }, [autoConnect]);

  const supabase = useMemo(() => createClient(), []);

  // Fetch initial attempts
  const refetch = useCallback(async () => {
    const activeJobId = jobIdRef.current;
    if (!activeJobId) {
      setAttempts([]);
      return;
    }

    try {
      const { data, error: dbError } = await supabase
        .from('enrichment_attempts')
        .select('*')
        .eq('job_id', activeJobId)
        .order('upc', { ascending: true });

      if (dbError) throw dbError;

      setAttempts(data as EnrichmentAttempt[] || []);
      setError(null);
    } catch (err) {
      console.error('[useAttemptsSubscription] Failed to fetch attempts:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch attempts'));
    }
  }, [supabase]);

  // Disconnect function
  const disconnect = useCallback(() => {
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setIsConnected(false);
  }, [supabase]);

  // Connect function
  const connect = useCallback(() => {
    const activeJobId = jobIdRef.current;
    if (!activeJobId) {
      disconnect();
      return;
    }

    // Clean up any existing connection first
    disconnect();

    const channelName = `job-attempts:${activeJobId}`;
    const channel = supabase.channel(channelName);

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'enrichment_attempts',
          filter: `job_id=eq.${activeJobId}`,
        },
        (payload: AttemptPayload) => {
          if (!activeRef.current) return;

          const newRecord = payload.new as EnrichmentAttempt | null;
          const oldRecord = payload.old as EnrichmentAttempt | null;
          const { onAttemptCreated, onAttemptUpdated } = callbacksRef.current;

          setAttempts((prevAttempts) => {
            if (payload.eventType === 'INSERT' && newRecord) {
              // Trigger callback
              onAttemptCreated?.(newRecord);
              
              // Insert and keep sorted by SKU
              const next = [...prevAttempts, newRecord];
              return next.sort((a, b) => a.upc.localeCompare(b.upc));
            }

            if (payload.eventType === 'UPDATE' && newRecord) {
              // Trigger callback
              onAttemptUpdated?.(newRecord);

              return prevAttempts.map((item) =>
                item.id === newRecord.id ? newRecord : item
              );
            }

            if (payload.eventType === 'DELETE' && oldRecord) {
              return prevAttempts.filter((item) => item.id !== oldRecord.id);
            }

            return prevAttempts;
          });
        }
      )
      .subscribe((status: RealtimeStatus) => {
        if (!activeRef.current) return;

        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          setError(null);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setIsConnected(false);
          setError(new Error(`Realtime subscription status: ${status}`));
        } else {
          setIsConnected(false);
        }
      });

    channelRef.current = channel;
  }, [supabase, disconnect]);

  // Handle auto-connection and jobId changes
  useEffect(() => {
    if (jobId) {
      void refetch();
      if (autoConnect) {
        connect();
      }
    } else {
      setAttempts([]);
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [jobId, autoConnect, refetch, connect, disconnect]);

  return {
    attempts,
    isConnected,
    error,
    connect,
    disconnect,
    refetch,
  };
}
