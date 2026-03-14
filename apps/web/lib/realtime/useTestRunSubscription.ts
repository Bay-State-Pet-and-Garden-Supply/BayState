import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { TestRunStep } from '@/lib/admin/scrapers/types';

export type { TestRunStep };

export interface TestRunSubscriptionState {
  steps: TestRunStep[];
  isConnected: boolean;
  error: Error | null;
}

export interface UseTestRunSubscriptionOptions {
  testRunId: string; // This is the job_id
  initialSteps?: TestRunStep[];
  autoConnect?: boolean;
  debounceMs?: number;
}

const DEFAULT_OPTIONS: Partial<UseTestRunSubscriptionOptions> = {
  autoConnect: true,
  initialSteps: [],
  debounceMs: 100,
};

export function useTestRunSubscription(
  options: UseTestRunSubscriptionOptions
): TestRunSubscriptionState & {
  connect: () => void;
  disconnect: () => void;
} {
  const {
    testRunId,
    initialSteps = [],
    autoConnect = true,
    debounceMs = 100,
  } = { ...DEFAULT_OPTIONS, ...options };

  const [state, setState] = useState<TestRunSubscriptionState>({
    steps: initialSteps,
    isConnected: false,
    error: null,
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);  
  const pendingUpdatesRef = useRef<RealtimePostgresChangesPayload<any>[]>([]);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialStepsRef = useRef(initialSteps);

  useEffect(() => {
    setState(prev => ({
      ...prev,
      steps: initialSteps
    }));
    initialStepsRef.current = initialSteps;
  }, [testRunId, initialSteps]);

  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }
    return supabaseRef.current;
  }, []);

  const processPendingUpdates = useCallback(() => {
    const updates = pendingUpdatesRef.current;
    pendingUpdatesRef.current = [];

    if (updates.length === 0) return;

    setState((prev) => {
      const currentSteps = [...prev.steps];
      const stepMap = new Map(currentSteps.map(s => [s.id, s]));

      updates.forEach((payload) => {
        const { eventType, new: newRecord } = payload;
        
        // In the new architecture, telemetry is on scrape_job_chunks
        // It contains a 'steps' array
        if (newRecord && newRecord.telemetry && Array.isArray(newRecord.telemetry.steps)) {
          const telemetrySteps = newRecord.telemetry.steps as TestRunStep[];
          telemetrySteps.forEach(step => {
            stepMap.set(step.id, step);
          });
        }
      });

      return {
        ...prev,
        steps: Array.from(stepMap.values()).sort((a, b) => a.step_index - b.step_index),
      };
    });
  }, [testRunId]);

  const handleRealtimeUpdate = useCallback((payload: RealtimePostgresChangesPayload<any>) => {
    pendingUpdatesRef.current.push(payload);

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      processPendingUpdates();
    }, debounceMs);
  }, [debounceMs, processPendingUpdates]);

  const connect = useCallback(() => {
    if (!testRunId) return;

    const supabase = getSupabase();

    try {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channelName = `job-chunks-${testRunId}-${Date.now()}`;
      const channel = supabase.channel(channelName);

      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'scrape_job_chunks',
            filter: `job_id=eq.${testRunId}`,
          },
          (payload) => {
            handleRealtimeUpdate(payload);
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            setState((prev) => ({ ...prev, isConnected: true, error: null }));
          } else if (status === 'CHANNEL_ERROR') {
            const error = new Error(`Subscription channel error: ${err?.message || 'unknown'}`);
            setState((prev) => ({ ...prev, error, isConnected: false }));    
          } else {
            setState((prev) => ({ ...prev, isConnected: false }));
          }
        });

      channelRef.current = channel;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to connect');
      setState((prev) => ({ ...prev, error, isConnected: false }));
    }
  }, [testRunId, getSupabase, handleRealtimeUpdate]);

  const disconnect = useCallback(() => {
    if (channelRef.current) {
      const supabase = getSupabase();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }

    processPendingUpdates();

    setState((prev) => ({ ...prev, isConnected: false }));
  }, [getSupabase, processPendingUpdates]);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (autoConnect && testRunId) {
      // Use a small delay or just wait for next tick to avoid sync setState in effect
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
  }, [autoConnect, testRunId, connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
  };
}
