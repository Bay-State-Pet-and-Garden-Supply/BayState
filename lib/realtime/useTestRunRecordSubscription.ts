import { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export type TestRunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'partial' | 'completed';

export interface TestRunRecord {
  id: string;
  status: TestRunStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  results: Array<Record<string, unknown>> | null;
  metadata: Record<string, unknown> | null;
}

interface UseTestRunRecordSubscriptionOptions {
  testRunId: string;
  autoConnect?: boolean;
}

interface UseTestRunRecordSubscriptionState {
  run: TestRunRecord | null;
  isConnected: boolean;
  error: Error | null;
}

export function useTestRunRecordSubscription(
  options: UseTestRunRecordSubscriptionOptions
): UseTestRunRecordSubscriptionState & { connect: () => void; disconnect: () => void } {
  const { testRunId, autoConnect = true } = options;
  const [state, setState] = useState<UseTestRunRecordSubscriptionState>({
    run: null,
    isConnected: false,
    error: null,
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }
    return supabaseRef.current;
  }, []);

  const connect = useCallback(() => {
    if (!testRunId) return;

    const supabase = getSupabase();
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`test-run-record-${testRunId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scraper_test_runs',
          filter: `id=eq.${testRunId}`,
        },
        (payload: RealtimePostgresChangesPayload<TestRunRecord>) => {
          if (payload.eventType === 'DELETE') {
            return;
          }

          const nextRun = payload.new as TestRunRecord;
          setState((prev) => ({ ...prev, run: nextRun }));
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          setState((prev) => ({ ...prev, isConnected: true, error: null }));
        } else if (status === 'CHANNEL_ERROR') {
          const error = new Error(`Test run subscription failed: ${err?.message || 'unknown error'}`);
          setState((prev) => ({ ...prev, isConnected: false, error }));
        } else {
          setState((prev) => ({ ...prev, isConnected: false }));
        }
      });

    channelRef.current = channel;
  }, [getSupabase, testRunId]);

  const disconnect = useCallback(() => {
    if (!channelRef.current) return;
    const supabase = getSupabase();
    supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    setState((prev) => ({ ...prev, isConnected: false }));
  }, [getSupabase]);

  useEffect(() => {
    if (autoConnect && testRunId) {
      connect();
    }

    return () => disconnect();
  }, [autoConnect, connect, disconnect, testRunId]);

  return {
    ...state,
    connect,
    disconnect,
  };
}
